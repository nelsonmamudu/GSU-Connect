-- DRAFT ONLY: not an active migration. Apply only after schema reconciliation,
-- independent security review, retention/incident procedures, and staging E2E.
-- Depends on public.confessions(id,status), public.is_approved(), public.is_admin(),
-- auth.uid(), phase1_private. This protects NEW comments, not legacy post APIs.
-- Pilot enrollment is deliberately private and has no client write endpoint.
begin;
create table phase1_private.anonymous_pilot_members (user_id uuid primary key);
create table phase1_private.anonymous_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.confessions(id) on delete cascade,
  author_id uuid not null,
  body text not null check (char_length(body) between 1 and 500),
  status text not null default 'pending' check (status in ('pending','approved','rejected','removed')),
  created_at timestamptz not null default now()
);
create index anonymous_comments_feed_idx on phase1_private.anonymous_comments(post_id, created_at desc, id desc);
create index anonymous_comments_rate_idx on phase1_private.anonymous_comments(author_id, created_at desc);
create table phase1_private.anonymous_comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references phase1_private.anonymous_comments(id) on delete cascade,
  reporter_id uuid not null,
  reason text not null check (reason in ('harassment','doxxing','threat','other')),
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now(),
  unique(comment_id,reporter_id)
);
create table phase1_private.anonymous_comment_review_log (
  id bigint generated always as identity primary key,
  comment_id uuid not null,
  reviewer_id uuid not null,
  decision text not null check (decision in ('approve','reject','remove','dismiss_reports')),
  created_at timestamptz not null default now()
);
create table phase1_private.anonymous_comment_author_access_log (
  id bigint generated always as identity primary key,
  comment_id uuid not null,
  reviewer_id uuid not null,
  reason text not null check (reason in ('credible_threat','harassment_or_doxxing','minor_safety','other_serious_safety')),
  accessed_at timestamptz not null default now()
);
revoke all on phase1_private.anonymous_pilot_members, phase1_private.anonymous_comments,
  phase1_private.anonymous_comment_reports, phase1_private.anonymous_comment_review_log, phase1_private.anonymous_comment_author_access_log
  from public, anon, authenticated;

create function public.can_use_anonymous_pilot() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_approved(), false) and
    (coalesce(public.is_admin(), false) or exists(select 1 from phase1_private.anonymous_pilot_members m where m.user_id=auth.uid()));
$$;

create function public.list_anonymous_comments(p_post uuid, p_before_time timestamptz default null, p_before_id uuid default null)
returns table(id uuid, body text, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_use_anonymous_pilot() then raise exception 'Pilot access required' using errcode='42501'; end if;
  if (p_before_time is null) <> (p_before_id is null) then raise exception 'Invalid cursor' using errcode='22023'; end if;
  return query select c.id,c.body,c.status,c.created_at from phase1_private.anonymous_comments c
    where c.post_id=p_post and exists(select 1 from public.confessions p where p.id=p_post and p.status='approved')
      and (c.status='approved' or (c.author_id=auth.uid() and c.status in ('pending','rejected')))
      and (p_before_time is null or (c.created_at,c.id)<(p_before_time,p_before_id))
    order by c.created_at desc,c.id desc limit 50;
end;
$$;

create function public.submit_anonymous_comment(p_post uuid, p_body text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare result uuid; clean text;
begin
  if not public.can_use_anonymous_pilot() then raise exception 'Pilot access required' using errcode='42501'; end if;
  clean := trim(p_body);
  if clean is null or char_length(clean) not between 1 and 500 then raise exception 'Comment must be 1 to 500 characters' using errcode='22023'; end if;
  if not exists(select 1 from public.confessions p where p.id=p_post and p.status='approved') then raise exception 'Post unavailable' using errcode='22023'; end if;
  -- Serialize submissions per user so concurrent requests cannot exceed the cap.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('anonymous-comment:' || auth.uid()::text));
  if (select count(*) from phase1_private.anonymous_comments c where c.author_id=auth.uid() and c.created_at > now()-interval '5 minutes') >= 10 then
    raise exception 'Comment rate limit reached' using errcode='P0001';
  end if;
  insert into phase1_private.anonymous_comments(post_id,author_id,body) values(p_post,auth.uid(),clean) returning id into result;
  return result;
end;
$$;

create function public.report_anonymous_comment(p_comment uuid,p_reason text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.can_use_anonymous_pilot() then raise exception 'Pilot access required' using errcode='42501'; end if;
  if p_reason is null or p_reason not in ('harassment','doxxing','threat','other') then raise exception 'Invalid reason' using errcode='22023'; end if;
  if not exists(select 1 from phase1_private.anonymous_comments c join public.confessions p on p.id=c.post_id
    where c.id=p_comment and c.status='approved' and p.status='approved') then raise exception 'Comment unavailable' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('anonymous-report:' || auth.uid()::text));
  if (select count(*) from phase1_private.anonymous_comment_reports r where r.reporter_id=auth.uid() and r.created_at > now()-interval '5 minutes') >= 20 then
    raise exception 'Report rate limit reached' using errcode='P0001';
  end if;
  insert into phase1_private.anonymous_comment_reports(comment_id,reporter_id,reason)
    values(p_comment,auth.uid(),p_reason)
    on conflict(comment_id,reporter_id) do update set reason=excluded.reason,status='open',created_at=now()
      where phase1_private.anonymous_comment_reports.status='resolved';
end;
$$;

create function public.list_anonymous_comment_review(p_post uuid default null)
returns table(id uuid,post_id uuid,body text,status text,created_at timestamptz,open_reports bigint,report_reasons text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Authorized admin required' using errcode='42501'; end if;
  return query select c.id,c.post_id,c.body,c.status,c.created_at,
    (select count(*) from phase1_private.anonymous_comment_reports r where r.comment_id=c.id and r.status='open'),
    (select coalesce(array_agg(distinct r.reason),'{}'::text[]) from phase1_private.anonymous_comment_reports r where r.comment_id=c.id and r.status='open')
    from phase1_private.anonymous_comments c where (p_post is null or c.post_id=p_post) and
      (c.status='pending' or exists(select 1 from phase1_private.anonymous_comment_reports r where r.comment_id=c.id and r.status='open'))
    order by c.created_at,c.id limit 100;
end;
$$;

create function public.review_anonymous_comment(p_comment uuid,p_decision text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare old_status text; parent_id uuid;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Authorized admin required' using errcode='42501'; end if;
  if p_decision is null or p_decision not in ('approve','reject','remove','dismiss_reports') then raise exception 'Invalid decision' using errcode='22023'; end if;
  select c.status,c.post_id into old_status,parent_id from phase1_private.anonymous_comments c where c.id=p_comment for update;
  if not found then raise exception 'Comment unavailable' using errcode='22023'; end if;
  if p_decision='approve' then
    if old_status<>'pending' or not exists(select 1 from public.confessions p where p.id=parent_id and p.status='approved') then raise exception 'Cannot approve comment' using errcode='22023'; end if;
    update phase1_private.anonymous_comments set status='approved' where id=p_comment;
  elsif p_decision='reject' then
    if old_status<>'pending' then raise exception 'Cannot reject comment' using errcode='22023'; end if;
    update phase1_private.anonymous_comments set status='rejected' where id=p_comment;
  elsif p_decision='remove' then
    if old_status<>'approved' then raise exception 'Cannot remove comment' using errcode='22023'; end if;
    update phase1_private.anonymous_comments set status='removed' where id=p_comment;
  end if;
  if p_decision in ('remove','dismiss_reports') then update phase1_private.anonymous_comment_reports set status='resolved' where comment_id=p_comment and status='open'; end if;
  insert into phase1_private.anonymous_comment_review_log(comment_id,reviewer_id,decision) values(p_comment,auth.uid(),p_decision);
end;
$$;

create function public.reveal_anonymous_comment_author(p_comment uuid,p_reason text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare author uuid;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Authorized admin required' using errcode='42501'; end if;
  if p_reason is null or p_reason not in ('credible_threat','harassment_or_doxxing','minor_safety','other_serious_safety') then raise exception 'Select a serious safety reason' using errcode='22023'; end if;
  select c.author_id into author from phase1_private.anonymous_comments c where c.id=p_comment;
  if not found then return null; end if;
  insert into phase1_private.anonymous_comment_author_access_log(comment_id,reviewer_id,reason) values(p_comment,auth.uid(),p_reason);
  return author;
end;
$$;

revoke all on function public.can_use_anonymous_pilot(), public.list_anonymous_comments(uuid,timestamptz,uuid), public.submit_anonymous_comment(uuid,text), public.report_anonymous_comment(uuid,text), public.list_anonymous_comment_review(uuid), public.review_anonymous_comment(uuid,text), public.reveal_anonymous_comment_author(uuid,text) from public,anon,authenticated;
grant execute on function public.can_use_anonymous_pilot(), public.list_anonymous_comments(uuid,timestamptz,uuid), public.submit_anonymous_comment(uuid,text), public.report_anonymous_comment(uuid,text), public.list_anonymous_comment_review(uuid), public.review_anonymous_comment(uuid,text), public.reveal_anonymous_comment_author(uuid,text) to authenticated;
commit;

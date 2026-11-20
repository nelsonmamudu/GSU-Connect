-- STAGED ONLY. Run after entry rollout prerequisites, with the independently verified owner UUID.
begin;
create table phase1_private.app_owner(singleton boolean primary key default true check(singleton), account uuid unique not null references public.profiles(id) on delete restrict references auth.users(id) on delete restrict);
insert into phase1_private.app_owner(account) select p.id from public.profiles p where p.id=nullif(current_setting('gsu.verified_owner_id',true),'')::uuid and p.role='admin' and p.status='approved' and p.expires_at is null and exists(select from auth.mfa_factors f where f.user_id=p.id and f.factor_type='totp' and f.status='verified');
do $$ begin if not exists(select from phase1_private.app_owner) then raise exception 'Verified owner enrollment required';end if;end $$;
revoke all on phase1_private.app_owner from public,anon,authenticated,service_role;
create function phase1_private.immutable_owner() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Protected account binding';end$$;
create trigger immutable_owner before update or delete or truncate on phase1_private.app_owner for each statement execute function phase1_private.immutable_owner();
alter table public.profiles add constraint no_public_owner_role check(lower(role)<>'founder');
create function phase1_private.protect_owner() returns trigger language plpgsql security definer set search_path='' as $$begin
 if exists(select from phase1_private.app_owner where account=old.id) and (new.id<>old.id or new.role is distinct from 'admin' or new.status is distinct from 'approved' or new.expires_at is not null or new.verify_deadline is distinct from old.verify_deadline or (to_jsonb(new)->>'anonymized_at') is distinct from (to_jsonb(old)->>'anonymized_at')) then raise exception 'Protected administrative account'; end if;return new;end$$;
create trigger protect_owner before update on public.profiles for each row execute function phase1_private.protect_owner();
-- The public profile stays admin, so every existing admin control and guard still applies.
create function public.elevated_workspace_access() returns boolean language sql stable security definer set search_path='' as $$select public.is_admin() and exists(select from phase1_private.app_owner where account=auth.uid())$$;
revoke all on function public.elevated_workspace_access() from public,anon;grant execute on function public.elevated_workspace_access() to authenticated;
do $$ declare t text;f record;def text;begin
 foreach t in array array['chats','chat_members','messages','polls','calls','message_reports','confessions','confession_upvotes','events','announcements','lecturer_radars','resources','statuses','marketplace_listings','rides_errands'] loop
 execute format('create policy elevated_management on public.%I for all to authenticated using ((select public.elevated_workspace_access())) with check ((select public.elevated_workspace_access()))',t);
 end loop;
 -- Preserve existing RPC signatures and policies bound to their OIDs.
 for f in select oid,prosrc from pg_proc where pronamespace='public'::regnamespace and proname in ('can_access_chat','can_post_chat','is_chat_member','is_chat_owner','is_privileged') and prorettype='boolean'::regtype loop
 if left(f.prosrc,6)<>'begin ' then raise exception 'Unrecognized access helper; verify Phase 1 baseline';end if;
 def:=pg_get_functiondef(f.oid);execute replace(def,f.prosrc,'begin if public.elevated_workspace_access() then return true; end if; '||substr(f.prosrc,7));end loop;
end $$;
create policy elevated_profile_read on public.profiles for select to authenticated using(public.elevated_workspace_access());
create policy elevated_workspace_files on storage.objects for all to authenticated using(bucket_id in ('chat-files','chat-media','resources','avatars') and public.elevated_workspace_access()) with check(bucket_id in ('chat-files','chat-media','resources','avatars') and public.elevated_workspace_access());

create function phase1_private.staff(p public.profiles) returns boolean language sql immutable as $$select coalesce(p.role in ('staff','lecturer') or lower(p.level)='staff' or nullif(btrim(p.staff_id),'') is not null,false)$$;
create table phase1_private.staff_verified(account uuid primary key references public.profiles on delete cascade, department text not null, method text not null, approved_by uuid not null, vouched_by uuid, verified_at timestamptz not null default now());
create table phase1_private.staff_email(account uuid primary key references public.profiles on delete cascade, address text not null, department text not null, digest text, expires timestamptz not null, confirmed boolean not null default false);
create unique index staff_one_confirmed_address on phase1_private.staff_email(address) where confirmed;
create table phase1_private.staff_mail_limits(account uuid references public.profiles on delete cascade,address text not null,sent timestamptz not null default now());
create index staff_mail_limits_sent on phase1_private.staff_mail_limits(sent);
create table phase1_private.staff_vouches(applicant uuid primary key references public.profiles on delete cascade,request_id uuid unique not null default gen_random_uuid(),witness uuid not null references public.profiles on delete cascade,department text not null,decision text not null default 'requested' check(decision in ('requested','confirmed','declined')),requested_at timestamptz not null default now(),check(applicant<>witness));
create function phase1_private.witness_ok(w uuid,d text) returns boolean language sql stable security definer set search_path='' as $$select exists(select from public.profiles p join phase1_private.staff_verified v on v.account=p.id where p.id=w and phase1_private.staff(p) and p.role not in ('class_rep','dept_helper') and p.status='approved' and (p.expires_at is null or p.expires_at>now()) and lower(trim(p.department))=d and v.department=d)$$;
create function phase1_private.evidence(p public.profiles) returns text language sql stable security definer set search_path='' as $$select case
 when phase1_private.staff(p) and exists(select from phase1_private.staff_email e where e.account=p.id and e.department=lower(trim(p.department)) and e.confirmed) then 'Verified GSU staff email'
 when split_part(p.id_card_path,'/',1)=p.id::text and exists(select from storage.objects o where o.bucket_id='id-cards' and o.name=p.id_card_path and (not phase1_private.staff(p) or (case when o.metadata->>'size' ~ '^[0-9]{1,12}$' then (o.metadata->>'size')::bigint between 1 and 3145728 else false end and o.metadata->>'mimetype' in ('image/jpeg','image/png','image/webp','application/pdf') and (p.id_card_path not like '%\_staff-id.%' or o.metadata->>'mimetype' like 'image/%')))) then case when p.id_card_path like '%\_staff-id.%' then 'Staff ID photo' else 'Uploaded document' end
 when phase1_private.staff(p) and exists(select from phase1_private.staff_vouches v where v.applicant=p.id and v.department=lower(trim(p.department)) and v.decision='confirmed' and phase1_private.witness_ok(v.witness,v.department)) then 'Confirmed departmental vouch' end$$;
create or replace function public.can_review(target uuid) returns boolean language sql stable security definer set search_path='' as $$select public.is_approved() and exists(select from public.profiles p join public.profiles me on me.id=auth.uid() where p.id=target and p.id<>me.id and p.status='pending' and (public.elevated_workspace_access() or phase1_private.evidence(p) is not null) and (public.is_admin() or (not phase1_private.staff(p) and p.role='student' and p.matric_no is not null and nullif(lower(trim(me.department)),'')=lower(trim(p.department)) and (me.role='dept_helper' or (me.role='class_rep' and exists(select from phase1_private.cohorts a join phase1_private.cohorts b on a.department=b.department and a.level=b.level where a.user_id=me.id and b.user_id=p.id and a.department=lower(trim(p.department))))))))$$;
-- Elevated review bypasses cohort confirmation only. Staff evidence remains mandatory, even on direct status writes.
do $$ declare f regprocedure:='public.review_signup(uuid,text,text)'::regprocedure;def text;marker text:='if new_status=''approved'' and old_status=''pending'' and exists';begin def:=pg_get_functiondef(f);if strpos(def,marker)=0 then raise exception 'Unexpected review implementation';end if;execute replace(def,marker,'if new_status=''approved'' and old_status=''pending'' and not public.elevated_workspace_access() and exists');end$$;
create function phase1_private.guard_staff_approval() returns trigger language plpgsql security definer set search_path='' as $$declare m text;begin
 if old.status in ('pending','rejected') and phase1_private.staff(old) and not phase1_private.staff(new) then raise exception 'Staff request cannot be reclassified';end if;
 if new.status='approved' and phase1_private.staff(new) and (old.status<>'approved' or not phase1_private.staff(old)) then
 if not public.is_admin() or old.department is distinct from new.department or old.staff_id is distinct from new.staff_id then raise exception 'Administrative review of current staff identity required';end if;
 m:=phase1_private.evidence(old);
 if old.status='suspended' and m is null then select method into m from phase1_private.staff_verified where account=old.id and department=lower(trim(new.department));end if;
 if m is null or not phase1_private.staff(old) then raise exception 'Proof of Staff Status required';end if;
 insert into phase1_private.staff_verified(account,department,method,approved_by,vouched_by) values(new.id,lower(trim(new.department)),m,auth.uid(),case when m='Confirmed departmental vouch' then (select witness from phase1_private.staff_vouches where applicant=new.id) end) on conflict(account) do update set department=excluded.department,method=excluded.method,approved_by=excluded.approved_by,vouched_by=excluded.vouched_by,verified_at=now();end if;
 return new;end$$;
create function phase1_private.staff_starts_pending() returns trigger language plpgsql security definer set search_path='' as $$begin if phase1_private.staff(new) and new.status='approved' then raise exception 'Staff applications must be reviewed';end if;return new;end$$;
create trigger staff_starts_pending before insert on public.profiles for each row execute function phase1_private.staff_starts_pending();
create trigger staff_approval before update on public.profiles for each row execute function phase1_private.guard_staff_approval();
create function phase1_private.reset_staff() returns trigger language plpgsql security definer set search_path='' as $$begin
 if old.department is distinct from new.department or old.staff_id is distinct from new.staff_id or (new.status='pending' and old.full_name is distinct from new.full_name) or (new.status='rejected' and old.status<>new.status) then
 delete from phase1_private.staff_email where account=new.id;delete from phase1_private.staff_vouches where applicant=new.id;delete from phase1_private.staff_verified where account=new.id;end if;return new;end$$;
create trigger staff_identity_change after update on public.profiles for each row execute function phase1_private.reset_staff();
create or replace function public.check_own_entry() returns jsonb language sql stable security definer set search_path='' as $$select to_jsonb(p)||jsonb_build_object('proof_method',phase1_private.evidence(p),'vouch_state',(select decision from phase1_private.staff_vouches where applicant=p.id),'id_card_path',case when exists(select from storage.objects where bucket_id='id-cards' and name=p.id_card_path and split_part(name,'/',1)=p.id::text) then p.id_card_path end) from public.profiles p where p.id=auth.uid() and public.active_app_session()$$;
create function public.staff_review_method(target uuid) returns text language sql stable security definer set search_path='' as $$select phase1_private.evidence(p) from public.profiles p where id=target and public.can_review(target)$$;
create function public.staff_review_detail(target uuid) returns text language sql stable security definer set search_path='' as $$select case phase1_private.evidence(p)
 when 'Verified GSU staff email' then (select address from phase1_private.staff_email where account=p.id and confirmed)
 when 'Confirmed departmental vouch' then (select witness.full_name from phase1_private.staff_vouches v join public.profiles witness on witness.id=v.witness where v.applicant=p.id and decision='confirmed') end
 from public.profiles p where p.id=target and public.is_admin() and public.can_review(target)$$;
revoke all on function public.staff_review_detail(uuid) from public,anon;grant execute on function public.staff_review_detail(uuid) to authenticated;
-- Only complete cases enter the normal queue. Overrides are an explicit administrative action.
create or replace view public.entry_review_queue with (security_barrier=true) as select p.*,exists(select from phase1_private.entry_referrals r join public.profiles rep on rep.id=r.rep where r.applicant=p.id and r.dept=p.department and rep.role='class_rep' and rep.status='approved' and rep.department=r.dept and (rep.expires_at is null or rep.expires_at>now())) as invited, public.staff_review_method(p.id) as proof_method, public.staff_review_detail(p.id) as proof_detail from public.public_profiles p where p.status='pending' and public.can_review(p.id) and public.staff_review_method(p.id) is not null;

create function phase1_private.staff_applicant(u uuid) returns text language plpgsql security definer set search_path='' as $$declare d text;begin select lower(trim(department)) into d from public.profiles p where id=u and status in ('pending','rejected') and phase1_private.staff(p) for update;if nullif(d,'') is null then raise exception 'Pending staff account required';end if;return d;end$$;
create function public.staff_vouch_candidates() returns table(id uuid,full_name text) language plpgsql security definer set search_path='' as $$declare d text;begin if not public.active_app_session() then raise exception 'Sign in required';end if;d:=phase1_private.staff_applicant(auth.uid());return query select p.id,p.full_name from public.profiles p where p.id<>auth.uid() and phase1_private.witness_ok(p.id,d) order by p.full_name;end$$;
create table phase1_private.vouch_limits(applicant uuid not null,witness uuid not null,sent timestamptz not null default now());
create index vouch_limit_window on phase1_private.vouch_limits(sent);
create function public.request_staff_vouch(w uuid) returns void language plpgsql security definer set search_path='' as $$declare d text;begin if not public.active_app_session() then raise exception 'Sign in required';end if;d:=phase1_private.staff_applicant(auth.uid());if w=auth.uid() or not phase1_private.witness_ok(w,d) then raise exception 'Choose verified staff in your department';end if;
 perform pg_advisory_xact_lock(hashtext(w::text));delete from phase1_private.vouch_limits where sent<now()-interval '1 day';
 if exists(select from phase1_private.vouch_limits where applicant=auth.uid()) or (select count(*) from phase1_private.vouch_limits where witness=w)>=10 then raise exception 'Request limit reached. Try another verification method.';end if;
 insert into phase1_private.vouch_limits(applicant,witness) values(auth.uid(),w);
 insert into phase1_private.staff_vouches(applicant,witness,department) values(auth.uid(),w,d) on conflict(applicant) do update set request_id=gen_random_uuid(),witness=w,department=d,decision='requested',requested_at=now();end$$;
create function public.my_staff_vouches() returns table(request_id uuid,applicant_name text,department text) language sql stable security definer set search_path='' as $$select v.request_id,p.full_name,p.department from phase1_private.staff_vouches v join public.profiles p on p.id=v.applicant where public.is_approved() and v.witness=auth.uid() and v.decision='requested' and p.status in ('pending','rejected') and v.department=lower(trim(p.department)) and phase1_private.witness_ok(auth.uid(),v.department) order by v.requested_at$$;
create function public.answer_staff_vouch(request uuid,confirm boolean) returns void language plpgsql security definer set search_path='' as $$declare u uuid; d text;begin
 if not public.is_approved() or confirm is null then raise exception 'Not authorized';end if;
 select applicant into strict u from phase1_private.staff_vouches where request_id=request and witness=auth.uid();d:=phase1_private.staff_applicant(u);
 update phase1_private.staff_vouches set decision=case when confirm then 'confirmed' else 'declined' end where request_id=request and witness=auth.uid() and decision='requested' and department=d and phase1_private.witness_ok(auth.uid(),d);if not found then raise exception 'Request no longer available';end if;
 if confirm then update public.profiles set status='pending',rejection_reason=null where id=u and status='rejected';end if;
 insert into public.entry_changes values(u,clock_timestamp()) on conflict(user_id) do update set changed_at=excluded.changed_at;end$$;

-- A private file can be inspected for an exceptional review without giving the
-- reviewer a service credential or disabling retention and deletion controls.
create policy elevated_proof_read on storage.objects for select to authenticated using(bucket_id='id-cards' and public.elevated_workspace_access());
alter policy entry_proof_read on storage.objects using(bucket_id<>'id-cards' or public.elevated_workspace_access() or (split_part(name,'/',1)=auth.uid()::text and public.active_app_session() and exists(select from public.profiles where id=auth.uid() and status in ('pending','rejected'))) or case when split_part(name,'/',1) ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then public.review_proof_path(split_part(name,'/',1)::uuid)=name else false end);

-- Server-only capability issuance/consumption. Clients cannot choose the issued digest.
create function public.issue_staff_email(u uuid,mail text,token_hash text) returns void language plpgsql security definer set search_path='' as $$declare d text;begin
 d:=phase1_private.staff_applicant(u);mail:=lower(trim(mail));if mail is null or length(mail)>120 or mail !~ '^[a-z0-9][a-z0-9._+-]*@gsu[.]edu[.]ng$' or token_hash is null or token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid staff address';end if;
 if exists(select from phase1_private.staff_email where account=u and confirmed) then raise exception 'Staff email already confirmed';end if;
 perform pg_advisory_xact_lock(hashtext(mail));delete from phase1_private.staff_mail_limits where sent<now()-interval '1 day';
 if exists(select from phase1_private.staff_mail_limits where (account=u or address=mail) and sent>now()-interval '1 minute') or (select count(*) from phase1_private.staff_mail_limits where account=u)>=4 or (select count(*) from phase1_private.staff_mail_limits where address=mail)>=4 then raise exception 'Email request limit reached';end if;
 insert into phase1_private.staff_mail_limits values(u,mail,now());insert into phase1_private.staff_email values(u,mail,d,token_hash,now()+interval '20 minutes',false) on conflict(account) do update set address=mail,department=d,digest=token_hash,expires=excluded.expires,confirmed=false;end$$;
create function public.consume_staff_email(u uuid,token_hash text) returns void language plpgsql security definer set search_path='' as $$declare d text;begin d:=phase1_private.staff_applicant(u);
 update phase1_private.staff_email set confirmed=true,digest=null where account=u and department=d and digest=token_hash and not confirmed and expires>now();if not found then raise exception 'Link expired or invalid';end if;
 update public.profiles set status='pending',rejection_reason=null where id=u and status='rejected';insert into public.entry_changes values(u,clock_timestamp()) on conflict(user_id) do update set changed_at=excluded.changed_at;end$$;
revoke all on function public.issue_staff_email(uuid,text,text),public.consume_staff_email(uuid,text) from public,anon,authenticated;
grant execute on function public.issue_staff_email(uuid,text,text),public.consume_staff_email(uuid,text) to service_role;
revoke all on function public.staff_vouch_candidates(),public.request_staff_vouch(uuid),public.my_staff_vouches(),public.answer_staff_vouch(uuid,boolean),public.staff_review_method(uuid) from public,anon;
grant execute on function public.staff_vouch_candidates(),public.request_staff_vouch(uuid),public.my_staff_vouches(),public.answer_staff_vouch(uuid,boolean),public.staff_review_method(uuid) to authenticated;
-- Explicit exceptional decisions are accountable. No impersonation or direct service credentials.
create table phase1_private.account_overrides(id bigint generated always as identity primary key,actor uuid not null,target uuid not null,prior text not null,decision text not null,reason text not null,at timestamptz not null default now());
create function public.administrative_decision(target uuid,decision text,reason text) returns void language plpgsql security definer set search_path='' as $$declare p public.profiles;begin
 if not public.elevated_workspace_access() or target=auth.uid() then raise exception 'Not authorized';end if;
 if decision is null or decision not in ('approved','rejected','pending','suspended') or reason is null or length(trim(reason)) not between 1 and 500 then raise exception 'Decision and reason required';end if;
 select * into strict p from public.profiles where id=target for update;
 update public.profiles set status=decision,rejection_reason=case when decision in ('rejected','suspended') then trim(reason) end,assigned_reviewer_id=auth.uid(),updated_at=now() where id=target;
 insert into phase1_private.account_overrides(actor,target,prior,decision,reason) values(auth.uid(),target,p.status,decision,trim(reason));end$$;
revoke all on function public.administrative_decision(uuid,text,text) from public,anon;grant execute on function public.administrative_decision(uuid,text,text) to authenticated;
-- Manage a rep's existing registration context without impersonating their session.
create function public.manage_rep_invite(rep_id uuid) returns uuid language plpgsql security definer set search_path='' as $$declare d text;t uuid:=gen_random_uuid();begin
 if not public.elevated_workspace_access() then raise exception 'Not authorized';end if;
 select department into strict d from public.profiles where id=rep_id and role='class_rep' and status='approved' and (expires_at is null or expires_at>now()) and nullif(trim(department),'') is not null;
 insert into phase1_private.rep_invites values(rep_id,t,d,now()+interval '7 days') on conflict(rep) do update set token=t,dept=d,expires=excluded.expires;
 insert into phase1_private.account_overrides(actor,target,prior,decision,reason) values(auth.uid(),rep_id,'approved','replace_invite','Department invite replaced');return t;end$$;
revoke all on function public.manage_rep_invite(uuid) from public,anon;grant execute on function public.manage_rep_invite(uuid) to authenticated;
notify pgrst,'reload schema';commit;

-- Apply AFTER the owner-gated phase1 migration, on a restored staging copy first.
begin;
-- Preserve the existing signup trigger, including its lookup/recovery writes. Only
-- replace the inspected graduate-year predicate. Fail closed on baseline drift.
do $$ declare def text; old_pred constant text:='v_grad_year < 2005 or v_grad_year >= public.session_end_year()'; begin
 def:=pg_get_functiondef('public.handle_new_user()'::regprocedure);
 if strpos(def,old_pred)=0 then raise exception 'Unexpected signup trigger; review baseline before applying entry migration'; end if;
 execute replace(def,old_pred, 'v_grad_year <> 2026 or v_role <> ''student''');
end $$;
-- Explicit graduate class is not inferred from the dashboard, current session,
-- programme duration or matric. Keep the normal cohort logic for other levels.
do $$ declare def text; marker constant text:='v_dur := public.dept_duration(v_dept);'; begin
 def:=pg_get_functiondef('public.sync_profile_cohort()'::regprocedure);
 if strpos(def,marker)=0 then raise exception 'Unexpected cohort trigger; review baseline';end if;
 execute replace(def,marker, 'if v_level = ''Class of 2026'' then new.grad_year := 2026; return new; end if; '||marker);
end $$;
create or replace function public.confirm_review_level(target uuid, confirmed_level text) returns void language plpgsql security definer set search_path='' as $$
declare t public.profiles; begin
 select * into strict t from public.profiles where id=target for update;
 if target=auth.uid() or confirmed_level is null or confirmed_level not in ('100','200','300','400','500','600','Class of 2026') then raise exception 'Invalid cohort'; end if;
 if (confirmed_level='Class of 2026') <> (t.level='Class of 2026') then raise exception 'Applicant must select their actual graduate status';end if;
 if not (public.is_admin() or (public.can_review(target) and exists(select from public.profiles where id=auth.uid() and role='dept_helper'))) then raise exception 'Not authorized'; end if;
 update public.profiles set level=confirmed_level where id=target;
 insert into phase1_private.cohorts values(target,lower(trim(t.department)),confirmed_level) on conflict(user_id) do update set department=excluded.department,level=excluded.level;
end $$;
update storage.buckets set public=false,file_size_limit=3145728,allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf'] where id='id-cards';
-- Serialize proof insertion with the decision transaction. Otherwise a late upload
-- could arrive after the cleanup inventory was taken. Existing files are immutable.
create function public.entry_can_upload(object_name text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not public.active_app_session() or split_part(object_name,'/',1)<>auth.uid()::text then return false; end if;
 perform 1 from public.profiles where id=auth.uid() and status in ('pending','rejected') for share;
 return found;
end $$;
create policy entry_proof_insert on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'id-cards' or public.entry_can_upload(name));
create policy entry_proof_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'id-cards') with check(bucket_id<>'id-cards');
create policy entry_proof_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'id-cards');
create function public.review_proof_path(target uuid) returns text language sql stable security definer set search_path='' as $$
 select id_card_path from public.profiles where id=target and public.can_review(target)
$$;
create policy entry_proof_read on storage.objects as restrictive for select to authenticated using(bucket_id<>'id-cards' or (split_part(name,'/',1)=auth.uid()::text and public.active_app_session() and exists(select from public.profiles where id=auth.uid() and status in ('pending','rejected'))) or
 case when split_part(name,'/',1) ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then public.review_proof_path(split_part(name,'/',1)::uuid)=name else false end);
create function phase1_private.validate_proof_link() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.id_card_path is distinct from old.id_card_path and new.id_card_path is not null and
 (new.status not in ('pending','rejected') or split_part(new.id_card_path,'/',1)<>new.id::text or not exists(select from storage.objects where bucket_id='id-cards' and name=new.id_card_path)) then raise exception 'Proof not available for this submission'; end if;
 return new;
end $$;
create trigger entry_proof_link before update of id_card_path on public.profiles for each row execute function phase1_private.validate_proof_link();

create or replace function public.update_own_pending_details(p_department text,p_level text) returns void language plpgsql security definer set search_path='' as $$
declare d text:=btrim(p_department); duration integer;
begin
 if not public.active_app_session() or d is null or length(d) not between 2 and 80 or d ~ '[[:cntrl:]]' then raise exception 'Invalid department'; end if;
 -- The picker permits custom departments (four years by default).
 if p_level is distinct from 'Class of 2026' then
 select duration_years into duration from public.departments where lower(btrim(name))=lower(d) limit 1;
 if p_level is null or p_level !~ '^[1-6]00$' then raise exception 'Invalid level'; end if;
 if p_level::int>100*greatest(1,least(6,coalesce(nullif(duration,0),4))) then raise exception 'Level exceeds programme duration'; end if;
 end if;
 update public.profiles set department=d,level=p_level,updated_at=now() where id=auth.uid() and status='pending' and role='student' and nullif(staff_id,'') is null ;
 if not found then raise exception 'Only a pending student can edit these details'; end if;
 -- phase1_invalidate discards prior cohort confirmation on a real change.
end $$;

create function phase1_private.invalidate_identity_confirmation() returns trigger language plpgsql security definer set search_path='' as $$begin
 delete from phase1_private.cohorts where user_id=new.id;return new;
end $$;
create trigger entry_identity_edit after update of full_name,matric_no,staff_id on public.profiles for each row
 when (new.status='pending' and (old.full_name is distinct from new.full_name or old.matric_no is distinct from new.matric_no or old.staff_id is distinct from new.staff_id)) execute function phase1_private.invalidate_identity_confirmation();

-- Network-only status check. A path without an object is incomplete.
create function public.check_own_entry() returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(p)||jsonb_build_object('id_card_path',case when exists(select from storage.objects o where o.bucket_id='id-cards' and o.name=p.id_card_path and split_part(o.name,'/',1)=p.id::text) then p.id_card_path end)
 from public.profiles p where p.id=auth.uid() and public.active_app_session()
$$;
revoke all on function public.check_own_entry() from public,anon;
grant execute on function public.check_own_entry() to authenticated;
-- The realtime channel contains only wake-up signals, never profile details.
create table public.entry_changes(user_id uuid primary key references public.profiles on delete cascade, changed_at timestamptz not null);
alter table public.entry_changes enable row level security;
revoke all on public.entry_changes from public,anon,authenticated;
grant select on public.entry_changes to authenticated;
create policy own_entry_signal on public.entry_changes for select to authenticated using(user_id=auth.uid() and public.active_app_session());
alter publication supabase_realtime add table public.entry_changes;
create table phase1_private.proof_cleanup(path text primary key, queued_at timestamptz not null default now());
create function phase1_private.entry_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.entry_changes values(new.id,clock_timestamp()) on conflict(user_id) do update set changed_at=excluded.changed_at;
 if new.status='approved' and old.status<>'approved' then
 insert into phase1_private.proof_cleanup(path) select name from storage.objects where bucket_id='id-cards' and split_part(name,'/',1)=new.id::text on conflict do nothing;
 end if; return new;
end $$;
create trigger entry_changed after update of status,id_card_path,department,level on public.profiles for each row execute function phase1_private.entry_changed();
create function public.entry_cleanup_batch() returns table(path text) language sql security definer set search_path='' as $$select path from phase1_private.proof_cleanup order by queued_at,path limit 100$$;
create function public.entry_cleanup_ack(paths text[]) returns boolean language plpgsql security definer set search_path='' as $$begin
 delete from phase1_private.proof_cleanup q where q.path=any(paths) and not exists(select from storage.objects where bucket_id='id-cards' and name=q.path);
 return not exists(select from phase1_private.proof_cleanup where path=any(paths));
end $$;
revoke all on function public.entry_cleanup_batch(),public.entry_cleanup_ack(text[]) from public,anon,authenticated;
grant execute on function public.entry_cleanup_batch(),public.entry_cleanup_ack(text[]) to service_role;

-- One expiring department link per rep. Generating a replacement invalidates the old link.
create table phase1_private.rep_invites(rep uuid primary key references public.profiles on delete cascade,token uuid unique not null,dept text not null,expires timestamptz not null);
create table phase1_private.entry_referrals(applicant uuid primary key references public.profiles on delete cascade, rep uuid references public.profiles on delete cascade,dept text not null);
create function public.issue_entry_invite() returns uuid language plpgsql security definer set search_path='' as $$
declare d text;t uuid:=gen_random_uuid();begin
 select department into d from public.profiles where id=auth.uid() and role='class_rep' and public.is_approved();
 if nullif(btrim(d),'') is null then raise exception 'Approved class rep required'; end if;
 insert into phase1_private.rep_invites values(auth.uid(),t,d,now()+interval '7 days') on conflict(rep) do update set token=t,dept=d,expires=excluded.expires;return t;
end $$;
create function public.entry_invite_department(token uuid) returns text language sql stable security definer set search_path='' as $$
 select i.dept from phase1_private.rep_invites i join public.profiles p on p.id=i.rep where i.token=$1 and i.expires>now() and p.status='approved' and p.role='class_rep' and p.department=i.dept and (p.expires_at is null or p.expires_at>now())
$$;
-- Bind once inside account creation. The token is a referral, not a credential:
-- never copy role, level, group membership or approval state from metadata.
create function phase1_private.tag_invited_applicant() returns trigger language plpgsql security definer set search_path='' as $$
declare value text;begin
 if new.status='pending' and new.role='student' and nullif(new.staff_id,'') is null then
 select raw_user_meta_data->>'entry_invite' into value from auth.users where id=new.id;
 if value ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
 insert into phase1_private.entry_referrals select new.id,i.rep,i.dept from phase1_private.rep_invites i where i.token=value::uuid and public.entry_invite_department(i.token)=new.department on conflict(applicant) do nothing;
 end if;end if;return new;
end $$;
create trigger entry_invited after insert on public.profiles for each row execute function phase1_private.tag_invited_applicant();
create function phase1_private.clear_referral() returns trigger language plpgsql security definer set search_path='' as $$begin if old.department is distinct from new.department then delete from phase1_private.entry_referrals where applicant=new.id; end if;return new;end $$;
create trigger entry_dept_changed after update of department on public.profiles for each row execute function phase1_private.clear_referral();
create view public.entry_review_queue with (security_barrier=true) as select p.*,exists(select from phase1_private.entry_referrals r join public.profiles rep on rep.id=r.rep where r.applicant=p.id and r.dept=p.department and rep.role='class_rep' and rep.status='approved' and rep.department=r.dept and (rep.expires_at is null or rep.expires_at>now())) as invited from public.public_profiles p where p.status='pending' and public.can_review(p.id);
revoke all on public.entry_review_queue from public,anon,authenticated;
grant select on public.entry_review_queue to authenticated;
revoke all on function public.entry_can_upload(text), public.review_proof_path(uuid),public.update_own_pending_details(text,text),public.issue_entry_invite(),public.entry_invite_department(uuid) from public,anon;
grant execute on function public.entry_can_upload(text),public.review_proof_path(uuid),public.update_own_pending_details(text,text),public.issue_entry_invite(),public.entry_invite_department(uuid) to authenticated;
grant execute on function public.entry_invite_department(uuid) to anon;
notify pgrst,'reload schema';
commit;

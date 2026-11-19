-- Operator gate: UI FIRST. See docs/phase1-rollout.md. No automatic owner selection.
begin;
do $$ begin
 if not exists(select from public.profiles p join auth.mfa_factors f on f.user_id=p.id
   where p.id=nullif(current_setting('gsu.verified_owner_id',true),'')::uuid and p.role='admin'
   and p.status='approved' and f.factor_type='totp' and f.status='verified') then
   raise exception 'Stop: confirm owner recovery and second-session TOTP before this migration';
 end if;
 if exists(select from public.messages m where nullif(media_url,'') is not null and not exists(select from storage.objects o where o.bucket_id='chat-files' and o.name=m.media_url)) then
   raise exception 'Inventory and back up legacy message attachments before cutover'; end if;
end $$;
alter table public.messages add constraint private_media_path check (media_url is null or (split_part(media_url,'/',1)=chat_id::text and media_url !~ '(^|/)\.\.(/|$)'));
create schema phase1_private;
revoke all on schema phase1_private from public,anon,authenticated;
-- No self-reported level backfill. Bind confirmation to department too.
create table phase1_private.cohorts(user_id uuid primary key references public.profiles(id) on delete cascade, department text not null, level text not null);
-- Remember whether reinstatement can restore workspace access without a fresh review.
create table phase1_private.pre_suspension(user_id uuid primary key references public.profiles(id) on delete cascade, was_approved boolean not null);
create function public.active_app_session() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select from auth.sessions s where s.user_id=auth.uid() and s.id=nullif(auth.jwt()->>'session_id','')::uuid)
$$;
create or replace function public.is_approved() returns boolean language sql stable security definer set search_path='' as $$
 select public.active_app_session() and exists(select from public.profiles where id=auth.uid() and status='approved' and (expires_at is null or expires_at>now()))
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select public.is_approved() and coalesce(auth.jwt()->>'aal','')='aal2'
 and exists(select from jsonb_array_elements(auth.jwt()->'amr') m where m->>'method' in ('totp','mfa/totp')) and exists(select from public.profiles where id=auth.uid() and role='admin')
$$;
create or replace function public.can_review(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_approved() and exists(select from public.profiles me join public.profiles t on t.id=target
 left join phase1_private.cohorts mc on mc.user_id=me.id and mc.department=lower(trim(me.department))
 left join phase1_private.cohorts tc on tc.user_id=t.id and tc.department=lower(trim(t.department))
 where me.id=auth.uid() and me.id<>t.id and t.status='pending'
 and split_part(t.id_card_path,'/',1)=t.id::text and exists(select from storage.objects o where o.bucket_id='id-cards' and o.name=t.id_card_path)
 and (public.is_admin() or (t.role='student' and nullif(trim(t.staff_id),'') is null and t.matric_no is not null
 and nullif(lower(trim(me.department)),'')=lower(trim(t.department)) and (me.role='dept_helper' or (me.role='class_rep' and mc.level=tc.level)))))
$$;
-- Bootstrap rep cohorts by admin confirmation; helpers can confirm complete student submissions only.
create function public.confirm_review_level(target uuid, confirmed_level text) returns void language plpgsql security definer set search_path='' as $$
declare t public.profiles; begin
 select * into strict t from public.profiles where id=target for update;
 if confirmed_level not in ('100','200','300','400','500','600') or confirmed_level is null or target=auth.uid() then raise exception 'Invalid cohort'; end if;
 if not (public.is_admin() or (public.can_review(target) and exists(select from public.profiles where id=auth.uid() and role='dept_helper'))) then raise exception 'Not authorized'; end if;
 update public.profiles set level=confirmed_level where id=target;
 insert into phase1_private.cohorts values(target,lower(trim(t.department)),confirmed_level) on conflict(user_id) do update set department=excluded.department,level=excluded.level;
end $$;
revoke all on function public.confirm_review_level(uuid,text) from public,anon;
grant execute on function public.confirm_review_level(uuid,text) to authenticated;
create function phase1_private.invalidate_confirmation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.department is distinct from old.department or new.level is distinct from old.level
    or (new.status='pending' and (new.id_card_path is distinct from old.id_card_path or old.status<>'pending')) then
   delete from phase1_private.cohorts where user_id=new.id;
 end if; return new;
end $$;
create trigger phase1_invalidate after update of level,department,id_card_path,status on public.profiles
 for each row execute function phase1_private.invalidate_confirmation();
create or replace function public.review_signup(target uuid,new_status text,reason text default null) returns void language plpgsql security definer set search_path='' as $$
declare old_status text;
begin
 select status into strict old_status from public.profiles where id=target for update;
 if new_status='suspended' then
   if not coalesce(public.is_admin(),false) or target=auth.uid() then raise exception 'Admin verification required'; end if;
 elsif old_status='suspended' and new_status='approved' and public.is_admin() and target<>auth.uid() then
   if not exists(select from phase1_private.pre_suspension where user_id=target and was_approved) then new_status:='pending'; end if;
 elsif new_status='pending' and old_status in ('rejected','suspended') and public.is_admin() and target<>auth.uid() then null;
 elsif new_status is null or new_status not in ('approved','rejected') or not public.can_review(target) then raise exception 'Review not permitted'; end if;
 if new_status='approved' and old_status='pending' and exists(select from public.profiles p where p.id=target and p.role='student' and nullif(trim(p.staff_id),'') is null and not exists(select from phase1_private.cohorts c where c.user_id=p.id and c.level=p.level and c.department=lower(trim(p.department)))) then raise exception 'Confirm the student level before approval'; end if;
 if new_status='rejected' and nullif(trim(reason),'') is null then raise exception 'Give the applicant a rejection reason'; end if;
 update public.profiles set status=new_status, rejection_reason=case when new_status in ('rejected','suspended') then left(trim(reason),500) end, assigned_reviewer_id=auth.uid(),updated_at=now() where id=target;
end $$;
create or replace view public.public_profiles with (security_barrier=true) as
select p.id,p.full_name,p.role,p.status,
 case when p.id=auth.uid() or public.can_review(p.id) or public.is_admin() then p.matric_no end as matric_no,
 case when p.id=auth.uid() or public.can_review(p.id) or public.is_admin() then p.staff_id end as staff_id,
 p.department,p.level,p.photo_url,p.avatar_id,p.last_seen,p.study_courses,p.study_bio,p.is_alumni,p.is_exempt,p.verify_deadline,p.alumni_verified_at,p.expires_at,p.created_at
from public.profiles p where (p.id=auth.uid() and public.active_app_session()) or public.can_review(p.id)
 or (public.is_approved() and p.status='approved') or (public.is_admin() and p.status in ('rejected','suspended'));
revoke all on public.public_profiles from public,anon;
grant select on public.public_profiles to authenticated;
create policy current_session_profile on public.profiles as restrictive for all to authenticated using(public.active_app_session()) with check(public.active_app_session());
create function phase1_private.revoke_suspended_sessions() returns trigger language plpgsql security definer set search_path='' as $$
begin if new.status='suspended' and old.status is distinct from new.status then
 insert into phase1_private.pre_suspension values(new.id,old.status='approved') on conflict(user_id) do update set was_approved=excluded.was_approved;
 delete from auth.sessions where user_id=new.id;
 elsif old.status='suspended' and new.status<>'suspended' then delete from phase1_private.pre_suspension where user_id=new.id; end if; return new; end $$;
create trigger phase1_suspend after update of status on public.profiles for each row execute function phase1_private.revoke_suspended_sessions();
-- Restrictive policies combine with (never replace) the existing audience and membership rules.
do $$ declare t text; begin foreach t in array array['chats','chat_members','messages','polls','calls','message_reports','confessions','confession_upvotes','events','announcements','lecturer_radars','resources','statuses','marketplace_listings','rides_errands'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy workspace_gate on public.%I as restrictive for all to public using ((select public.is_approved())) with check ((select public.is_approved()))',t);
 end loop; end $$;
update storage.buckets set public=false where id in ('chat-files','id-cards');
create policy workspace_storage_gate on storage.objects as restrictive for all to public using
 (public.is_approved() or (bucket_id='id-cards' and split_part(name,'/',1)=auth.uid()::text and public.active_app_session() and exists(select from public.profiles where id=auth.uid() and status in ('pending','rejected'))))
 with check (public.is_approved() or (bucket_id='id-cards' and split_part(name,'/',1)=auth.uid()::text and public.active_app_session() and exists(select from public.profiles where id=auth.uid() and status in ('pending','rejected'))));
-- Wrap existing SECURITY DEFINER workspace RPCs (RLS does not constrain their owner).
-- Keep their signatures/defaults/results and public OIDs so policies retain their dependencies.
-- Copy the implementation to a non-exposed schema. Do not leave EXECUTE via PUBLIC.
do $$ declare f record; args text; action text; begin
 for f in select p.*,pg_get_function_arguments(p.oid) decl,pg_get_function_identity_arguments(p.oid) ident,pg_get_function_result(p.oid) result from pg_proc p where pronamespace='public'::regnamespace and proname=any(array['delete_own_account','set_recovery_email','resubmit_signup','update_own_pending_details','verify_alumni_account','admin_expire_user','admin_set_alumni_exempt','admin_set_department','admin_set_session','can_access_chat','can_post_chat','confession_author','delete_message_for_everyone','get_confession_upvote_counts','increment_downloads','is_blocked_between','is_chat_member','is_chat_owner','is_privileged','my_confessions','my_dms','open_view_once_message','search_people','set_role','start_dm','toggle_confession_upvote','toggle_message_reaction','toggle_message_star','vote_on_poll']) loop
 select coalesce(string_agg('$'||i,',' order by i),'') into args from generate_series(1,f.pronargs) i;
 execute replace(pg_get_functiondef(f.oid),format('FUNCTION public.%I(',f.proname),format('FUNCTION phase1_private.%I(',f.proname));
 execute format('revoke all on function phase1_private.%I(%s) from public,anon,authenticated',f.proname,f.ident);
 action:=case when f.proretset then 'return query select * from' when f.result='void' then 'perform' else 'return' end;
 execute format('create or replace function public.%I(%s) returns %s language plpgsql %s security definer set search_path='''' as %L',f.proname,f.decl,f.result,case when f.provolatile='v' then 'volatile' else 'stable' end,
 'begin if not '||case when f.proname in ('delete_own_account','set_recovery_email','resubmit_signup','update_own_pending_details','verify_alumni_account') then 'public.active_app_session()' when f.proname like 'admin_%' or f.proname='set_role' then 'public.is_admin()' else 'public.is_approved()' end||' then '||case when f.result='boolean' then 'return false;' else 'raise exception ''Approved account required'';' end||' end if; '||action||format(' phase1_private.%I(%s); end',f.proname,args));
 execute format('revoke all on function public.%I(%s) from public,anon',f.proname,f.ident);
 execute format('grant execute on function public.%I(%s) to authenticated',f.proname,f.ident);
 end loop; end $$;
revoke all on function public.review_signup(uuid,text,text),public.can_review(uuid) from public,anon;
grant execute on function public.review_signup(uuid,text,text),public.can_review(uuid) to authenticated;
notify pgrst,'reload schema';
commit;

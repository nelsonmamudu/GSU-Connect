begin;
-- Replace only inspected predicates, retaining function OIDs, grants and the rest of each body.
do $patch$
declare r record; def text;
begin
  for r in select * from (values
    ('public.can_review(uuid)'::regprocedure, $old$exists(select from phase1_private.cohorts a join phase1_private.cohorts b on a.department=b.department and a.level=b.level where a.user_id=me.id and b.user_id=p.id and a.department=lower(trim(p.department)))$old$, $new$me.level=p.level and me.level in ('100','200','300','400','500','600','Class of 2026')$new$),
    ('public.confirm_review_level(uuid,text)'::regprocedure, $old$id=auth.uid() and role='dept_helper'$old$, $new$id=auth.uid() and (role='dept_helper' or (role='class_rep' and level=confirmed_level and level=t.level))$new$),
    ('public.update_own_pending_details(text,text)'::regprocedure, $old$id=auth.uid() and status='pending' and role='student'$old$, $new$id=auth.uid() and status in ('pending','rejected') and role='student' and not phase1_private.staff(profiles)$new$),
    ('public.update_own_pending_details(text,text)'::regprocedure, $old$Only a pending student$old$, $new$Only a pending or rejected student$new$)
  ) as edits(fn, old_text, new_text) loop
    def := pg_get_functiondef(r.fn);
    if array_length(string_to_array(def,r.old_text),1) <> 2 then
      raise exception 'Unexpected definition for %', r.fn;
    end if;
    execute replace(def,r.old_text,r.new_text);
  end loop;
end $patch$;
-- Direct client updates may attach a validated proof, but cannot edit other profile fields.
-- The narrow definer RPCs perform the department/level edit and the rejected -> pending transition.
create function phase1_private.guard_rejected_edit() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_user in ('authenticated','anon') and old.status='rejected' and old.role='student' then
    if (to_jsonb(new) - 'id_card_path' - 'updated_at') is distinct from
       (to_jsonb(old) - 'id_card_path' - 'updated_at') then
      raise exception 'Use the resubmission form';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger batch2_rejected_edit before update on public.profiles
for each row execute function phase1_private.guard_rejected_edit();
commit;

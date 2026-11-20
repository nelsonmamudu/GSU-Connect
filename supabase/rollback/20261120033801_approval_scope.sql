begin;
-- Replace only inspected predicates, retaining function OIDs, grants and the rest of each body.
do $patch$
declare r record; def text;
begin
  for r in select * from (values
    ('public.can_review(uuid)'::regprocedure, $old$me.level=p.level and me.level in ('100','200','300','400','500','600','Class of 2026')$old$, $new$exists(select from phase1_private.cohorts a join phase1_private.cohorts b on a.department=b.department and a.level=b.level where a.user_id=me.id and b.user_id=p.id and a.department=lower(trim(p.department)))$new$),
    ('public.confirm_review_level(uuid,text)'::regprocedure, $old$id=auth.uid() and (role='dept_helper' or (role='class_rep' and level=confirmed_level and level=t.level))$old$, $new$id=auth.uid() and role='dept_helper'$new$),
    ('public.update_own_pending_details(text,text)'::regprocedure, $old$id=auth.uid() and status in ('pending','rejected') and role='student' and not phase1_private.staff(profiles)$old$, $new$id=auth.uid() and status='pending' and role='student'$new$),
    ('public.update_own_pending_details(text,text)'::regprocedure, $old$Only a pending or rejected student$old$, $new$Only a pending student$new$)
  ) as edits(fn, old_text, new_text) loop
    def := pg_get_functiondef(r.fn);
    if array_length(string_to_array(def,r.old_text),1) <> 2 then
      raise exception 'Unexpected definition for %', r.fn;
    end if;
    execute replace(def,r.old_text,r.new_text);
  end loop;
end $patch$;
drop trigger batch2_rejected_edit on public.profiles;
drop function phase1_private.guard_rejected_edit();
commit;

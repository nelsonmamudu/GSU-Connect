begin;
-- Reverts 20261128_graduation_class_config.sql. Restores the inspected literals
-- only; function OIDs, grants and all other statements are preserved.
-- public.app_settings is left in place (dropping it would discard an operator's
-- configured cohort). Delete it separately if the deployment never used it.
do $patch$
declare
  def text;
begin
  def := pg_get_functiondef('public.handle_new_user()'::regprocedure);
  if array_length(string_to_array(def, $lit$v_grad_year <> public.graduation_class_year() or v_role <> 'student'$lit$), 1) <> 2 then
    raise exception 'Unexpected signup trigger; cannot roll back graduation config';
  end if;
  execute replace(def, $lit$v_grad_year <> public.graduation_class_year() or v_role <> 'student'$lit$,
                      $lit$v_grad_year <> 2026 or v_role <> 'student'$lit$);

  def := pg_get_functiondef('public.sync_profile_cohort()'::regprocedure);
  if array_length(string_to_array(def, $lit$if v_level = public.graduate_level_label() then new.grad_year := public.graduation_class_year(); return new; end if; $lit$), 1) <> 2 then
    raise exception 'Unexpected cohort trigger; cannot roll back graduation config';
  end if;
  execute replace(def, $lit$if v_level = public.graduate_level_label() then new.grad_year := public.graduation_class_year(); return new; end if; $lit$,
                      $lit$if v_level = 'Class of 2026' then new.grad_year := 2026; return new; end if; $lit$);

  def := pg_get_functiondef('public.confirm_review_level(uuid,text)'::regprocedure);
  if array_length(string_to_array(def, $lit$(confirmed_level <> public.graduate_level_label() and confirmed_level !~ '^[1-6]00$')$lit$), 1) <> 2
     or array_length(string_to_array(def, $lit$(confirmed_level=public.graduate_level_label()) <> (t.level=public.graduate_level_label())$lit$), 1) <> 2 then
    raise exception 'Unexpected confirm_review_level; cannot roll back graduation config';
  end if;
  def := replace(def, $lit$(confirmed_level <> public.graduate_level_label() and confirmed_level !~ '^[1-6]00$')$lit$,
                      $lit$confirmed_level not in ('100','200','300','400','500','600','Class of 2026')$lit$);
  execute replace(def, $lit$(confirmed_level=public.graduate_level_label()) <> (t.level=public.graduate_level_label())$lit$,
                      $lit$(confirmed_level='Class of 2026') <> (t.level='Class of 2026')$lit$);

  def := pg_get_functiondef('public.can_review(uuid)'::regprocedure);
  if array_length(string_to_array(def, $lit$me.level in ('100','200','300','400','500','600') or me.level=public.graduate_level_label()$lit$), 1) <> 2 then
    raise exception 'Unexpected can_review; cannot roll back graduation config';
  end if;
  execute replace(def, $lit$me.level in ('100','200','300','400','500','600') or me.level=public.graduate_level_label()$lit$,
                      $lit$me.level in ('100','200','300','400','500','600','Class of 2026')$lit$);

  def := pg_get_functiondef('public.update_own_pending_details(text,text)'::regprocedure);
  if array_length(string_to_array(def, $lit$if p_level is distinct from public.graduate_level_label() then$lit$), 1) <> 2 then
    raise exception 'Unexpected update_own_pending_details; cannot roll back graduation config';
  end if;
  execute replace(def, $lit$if p_level is distinct from public.graduate_level_label() then$lit$,
                      $lit$if p_level is distinct from 'Class of 2026' then$lit$);
end $patch$;

drop function if exists public.entry_config();
drop function if exists public.graduate_level_label();
drop function if exists public.graduation_class_year();
commit;

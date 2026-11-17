create temp table test_log(step text, outcome text);
grant select, insert on pg_temp.test_log to authenticated;

-- Fixtures as superuser
insert into public.chats (id, name, is_group, group_type, department, created_by, created_at)
values ('11111111-1111-1111-1111-111111111111', 'Test Group', true, 'general', 'Computer Science', 'ab99cd23-6bd2-4106-ba11-0b0d7d189a80', now());

insert into public.messages (id, chat_id, sender_id, content, is_view_once, reactions, starred_by, viewed_by, created_at) values
 ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'ab99cd23-6bd2-4106-ba11-0b0d7d189a80', '{"__gsu":1,"text":"hello world","messageType":"text"}', false, '{}'::jsonb, '{}'::uuid[], '{}'::uuid[], now()),
 ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', '88ecfd48-8328-4dc3-b35e-bc999bad82fc', '{"__gsu":1,"text":"top secret","messageType":"text"}', true, '{}'::jsonb, '{}'::uuid[], '{}'::uuid[], now()),
 ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', '88ecfd48-8328-4dc3-b35e-bc999bad82fc', '{"__gsu":1,"messageType":"poll","text":"Pick one","pollOptions":["Yes","No"],"pollVotes":{}}', false, '{}'::jsonb, '{}'::uuid[], '{}'::uuid[], now());

insert into public.confessions (id, author_id, content, status, created_at)
values ('33333333-3333-3333-3333-333333333333', '88ecfd48-8328-4dc3-b35e-bc999bad82fc', '{"__gsu":1,"category":"Confession","text":"test confession"}', 'approved', now());

-- ===== Student tests =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"ab99cd23-6bd2-4106-ba11-0b0d7d189a80"}';

insert into test_log select 't01 upvote add (expect upvoted=true, count=1)', 'upvoted=' || upvoted || ' count=' || upvote_count from public.toggle_confession_upvote('33333333-3333-3333-3333-333333333333');
insert into test_log select 't02 upvote toggle off (expect false, count=0)', 'upvoted=' || upvoted || ' count=' || upvote_count from public.toggle_confession_upvote('33333333-3333-3333-3333-333333333333');
insert into test_log select 't03 upvote again (expect true, count=1)', 'upvoted=' || upvoted || ' count=' || upvote_count from public.toggle_confession_upvote('33333333-3333-3333-3333-333333333333');
insert into test_log select 't04 counts view (expect 1)', 'count=' || upvote_count from public.confession_upvote_counts where confession_id = '33333333-3333-3333-3333-333333333333';
insert into test_log select 't05 own upvote rows visible (expect 1)', 'rows=' || count(*) from public.confession_upvotes;

do $$
declare n integer;
begin
  begin
    insert into public.confession_upvotes (confession_id, user_id) values ('33333333-3333-3333-3333-333333333333', auth.uid());
    insert into test_log values ('t06 direct upvote table write (expect blocked)', 'NO ERROR RAISED');
  exception when others then
    insert into test_log values ('t06 direct upvote table write (expect blocked)', 'blocked: ' || sqlerrm);
  end;

  update public.confessions set status = 'rejected' where id = '33333333-3333-3333-3333-333333333333';
  get diagnostics n = row_count;
  insert into test_log values ('t07 student direct confession update (expect 0 rows)', 'rows updated=' || n);

  begin
    perform public.toggle_confession_upvote('99999999-9999-9999-9999-999999999999');
    insert into test_log values ('t08 upvote missing confession (expect error)', 'NO ERROR RAISED');
  exception when others then
    insert into test_log values ('t08 upvote missing confession (expect error)', 'blocked: ' || sqlerrm);
  end;

  update public.messages set content = '{"__gsu":1,"text":"edited text","messageType":"text"}', is_edited = true where id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  insert into test_log values ('t09 sender edits own text (expect 1 row)', 'rows updated=' || n);

  begin
    update public.messages set reactions = '{"hack":"\u0001"}' where id = '22222222-2222-2222-2222-222222222222';
    insert into test_log values ('t10 direct reactions write by sender (expect blocked)', 'NO ERROR RAISED');
  exception when others then
    insert into test_log values ('t10 direct reactions write by sender (expect blocked)', 'blocked: ' || sqlerrm);
  end;

  begin
    update public.messages set is_deleted = true where id = '22222222-2222-2222-2222-222222222222';
    insert into test_log values ('t11 direct is_deleted write by sender (expect blocked)', 'NO ERROR RAISED');
  exception when others then
    insert into test_log values ('t11 direct is_deleted write by sender (expect blocked)', 'blocked: ' || sqlerrm);
  end;

  begin
    update public.messages set starred_by = array[auth.uid()] where id = '22222222-2222-2222-2222-222222222222';
    insert into test_log values ('t12 direct starred_by write by sender (expect blocked)', 'NO ERROR RAISED');
  exception when others then
    insert into test_log values ('t12 direct starred_by write by sender (expect blocked)', 'blocked: ' || sqlerrm);
  end;
end $$;

insert into test_log select 't13a reaction add', coalesce(public.toggle_message_reaction('22222222-2222-2222-2222-222222222222', '+1')::text, 'null');
insert into test_log select 't13b reaction toggle same off', coalesce(public.toggle_message_reaction('22222222-2222-2222-2222-222222222222', '+1')::text, 'null');
insert into test_log select 't13c reaction add again', coalesce(public.toggle_message_reaction('22222222-2222-2222-2222-222222222222', '+1')::text, 'null');
insert into test_log select 't14a star on', public.toggle_message_star('22222222-2222-2222-2222-222222222222')::text;
insert into test_log select 't14b star off', public.toggle_message_star('22222222-2222-2222-2222-222222222222')::text;
insert into test_log select 't14c star on again', public.toggle_message_star('22222222-2222-2222-2222-222222222222')::text;

do $$
begin
  begin
    perform public.vote_on_poll('44444444-4444-4444-4444-444444444444', 9);
    insert into test_log values ('t15a poll out-of-range vote (expect error)', 'NO ERROR RAISED');
  exception when others then
    insert into test_log values ('t15a poll out-of-range vote (expect error)', 'blocked: ' || sqlerrm);
  end;
  perform public.vote_on_poll('44444444-4444-4444-4444-444444444444', 1);
  insert into test_log values ('t15b poll valid vote (expect success)', 'ok');

  begin
    perform public.delete_message_for_everyone('55555555-5555-5555-5555-555555555555');
    insert into test_log values ('t16 student deletes lecturer msg (expect blocked)', 'NO ERROR RAISED');
  exception when others then
    insert into test_log values ('t16 student deletes lecturer msg (expect blocked)', 'blocked: ' || sqlerrm);
  end;

  begin
    insert into public.events (title, department, start_time, end_time, created_by)
    values ('Student event', 'Computer Science', now(), now() + interval '1 hour', auth.uid());
    insert into test_log values ('t17 student posts dept event (expect blocked: not privileged)', 'NO ERROR RAISED');
  exception when others then
    insert into test_log values ('t17 student posts dept event (expect blocked: not privileged)', 'blocked: ' || sqlerrm);
  end;

  begin
    insert into public.events (title, department, start_time, end_time, created_by)
    values ('Student schoolwide event', 'All GSU', now(), now() + interval '1 hour', auth.uid());
    insert into test_log values ('t17b student posts school-wide event (expect blocked: not privileged)', 'NO ERROR RAISED');
  exception when others then
    insert into test_log values ('t17b student posts school-wide event (expect blocked: not privileged)', 'blocked: ' || sqlerrm);
  end;
end $$;

-- ===== Lecturer tests =====
set local request.jwt.claims = '{"sub":"88ecfd48-8328-4dc3-b35e-bc999bad82fc"}';

do $$
begin
  begin
    perform public.open_view_once_message('55555555-5555-5555-5555-555555555555');
    insert into test_log values ('t18 sender opens own view-once (expect blocked)', 'NO ERROR RAISED');
  exception when others then
    insert into test_log values ('t18 sender opens own view-once (expect blocked)', 'blocked: ' || sqlerrm);
  end;

  begin
    insert into public.events (title, department, start_time, end_time, created_by)
    values ('Wrong dept event', 'Computer Science', now(), now() + interval '1 hour', auth.uid());
    insert into test_log values ('t19 lecturer posts to other department (expect blocked)', 'NO ERROR RAISED');
  exception when others then
    insert into test_log values ('t19 lecturer posts to other department (expect blocked)', 'blocked: ' || sqlerrm);
  end;

  begin
    insert into public.events (title, department, start_time, end_time, created_by)
    values ('Schoolwide event', 'All GSU', now(), now() + interval '1 hour', auth.uid());
    insert into test_log values ('t19b lecturer posts school-wide All GSU event (expect success)', 'ok');
  exception when others then
    insert into test_log values ('t19b lecturer posts school-wide All GSU event (expect success)', 'blocked: ' || sqlerrm);
  end;

  begin
    insert into public.events (title, department, start_time, end_time, created_by)
    values ('Schoolwide null-dept event', null, now(), now() + interval '1 hour', auth.uid());
    insert into test_log values ('t19c lecturer posts null-department school-wide event (expect success)', 'ok');
  exception when others then
    insert into test_log values ('t19c lecturer posts null-department school-wide event (expect success)', 'blocked: ' || sqlerrm);
  end;

  insert into public.events (title, department, start_time, end_time, created_by)
  values ('Law event', 'Law', now(), now() + interval '1 hour', auth.uid());
  insert into test_log values ('t20 lecturer posts to own department (expect success)', 'ok');

end $$;

-- view-once open by student (recipient)
set local request.jwt.claims = '{"sub":"ab99cd23-6bd2-4106-ba11-0b0d7d189a80"}';
do $$
begin
  begin
    perform public.open_view_once_message('55555555-5555-5555-5555-555555555555');
    insert into test_log values ('t22 student recipient opens view-once (expect success)', 'ok');
  exception when others then
    insert into test_log values ('t22 student recipient opens view-once (expect success)', 'blocked: ' || sqlerrm);
  end;
  begin
    insert into test_log select 't23 view-once stored as Opened', case when content::jsonb ->> 'text' = 'Opened' then 'ok' else 'unexpected: ' || left(content, 80) end from public.messages where id = '55555555-5555-5555-5555-555555555555';
  exception when others then
    insert into test_log values ('t23 view-once stored as Opened', 'blocked: ' || sqlerrm);
  end;
end $$;

-- lecturer moderator deletes student message in group
set local request.jwt.claims = '{"sub":"88ecfd48-8328-4dc3-b35e-bc999bad82fc"}';
do $$
begin
  perform public.delete_message_for_everyone('22222222-2222-2222-2222-222222222222');
  insert into test_log values ('t24 lecturer moderator deletes student message in group (expect success)', 'ok');
exception when others then
  insert into test_log values ('t24 lecturer moderator deletes student message in group (expect success)', 'blocked: ' || sqlerrm);
end $$;

-- ===== Admin tests =====
set local request.jwt.claims = '{"sub":"0daae1aa-7e08-4cd3-89af-d65389a6dbc5"}';
do $$
declare n integer;
begin
  update public.confessions set status = 'rejected' where id = '33333333-3333-3333-3333-333333333333';
  get diagnostics n = row_count;
  insert into test_log values ('t25 admin direct confession update (expect 1 row)', 'rows=' || n);

  begin
    perform public.delete_message_for_everyone('44444444-4444-4444-4444-444444444444');
    insert into test_log values ('t26 admin deletes poll message (expect success)', 'ok');
  exception when others then
    insert into test_log values ('t26 admin deletes poll message (expect success)', 'blocked: ' || sqlerrm);
  end;

  insert into public.events (title, department, start_time, end_time, created_by)
  values ('Admin campus event', 'Computer Science', now(), now() + interval '1 hour', auth.uid());
  insert into test_log values ('t27 admin posts to any department (expect success)', 'ok');
end $$;

do $$
declare r record; v jsonb;
begin
  select id, content, is_deleted into r from public.messages where id = '44444444-4444-4444-4444-444444444444';
  if not found then
    insert into test_log values ('t28 poll votes recorded for student', 'ROW NOT VISIBLE TO ADMIN ROLE');
  else
    begin
      v := r.content::jsonb;
      insert into test_log values ('t28 poll votes recorded for student', coalesce((v -> 'pollVotes' -> 'ab99cd23-6bd2-4106-ba11-0b0d7d189a80')::text, 'missing'));
    exception when others then
      insert into test_log values ('t28 poll votes recorded for student', 'UNPARSABLE content: ' || left(coalesce(r.content, '<null>'), 200));
    end;
  end if;

  select id, content, is_deleted into r from public.messages where id = '22222222-2222-2222-2222-222222222222';
  if not found then
    insert into test_log values ('t29 tombstone for moderated delete', 'ROW NOT VISIBLE TO ADMIN ROLE');
  else
    begin
      v := r.content::jsonb;
      insert into test_log values ('t29 tombstone for moderated delete', 'is_deleted=' || r.is_deleted || ' text=' || coalesce(v ->> 'text', '<null>'));
    exception when others then
      insert into test_log values ('t29 tombstone for moderated delete', 'UNPARSABLE content: ' || left(coalesce(r.content, '<null>'), 200));
    end;
  end if;
end $$;

reset role;
select * from test_log order by step;

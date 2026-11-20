// PGlite scenarios for 20261125_verified_recovery_email.sql.
// Runs inside the shared phase1-access harness (after entry-flow.mjs creates auth.users).
// No network, no Supabase — PostgreSQL semantics only.
//
// Role discipline: direct table reads/writes on phase1_private run as the
// harness superuser (`reset role`). Only the public RPCs run as service_role,
// which is also how the deployed grant model behaves.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export async function testRecoveryEmail(db) {
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const superq = s => db.exec(`reset role;${s}`);
  const serviceq = s => db.exec(`set role service_role;${s}`);
  const val = async q => { await db.exec('reset role'); return Object.values((await db.query(q)).rows[0])[0]; };
  const tok = c => c.repeat(Math.ceil(64 / c.length)).slice(0, 64);

  for (const n of [201, 202, 203, 204, 205, 206, 207, 208, 209]) {
    await superq(`insert into auth.users values('${id(n)}', '{}') on conflict do nothing`);
  }

  const migration = readFileSync(
    new URL('../migrations/20261125_verified_recovery_email.sql', import.meta.url),
    'utf8'
  );
  await superq(migration);

  const cool = async uid =>
    superq(`update phase1_private.recovery_mail_limits set sent_at = now() - interval '2 days' where user_id = '${uid}'`);

  // --- request: normalization happens before any count or comparison ---------
  await serviceq(`select public.request_recovery_email('${id(201)}', '  Mixed.Case@Example.COM ', '${tok('a')}')`);
  assert.equal(await val(`select email from phase1_private.recovery_challenges where user_id = '${id(201)}'`), 'mixed.case@example.com');

  // Per-minute per-account throttle trips on the very next request from the same account.
  await assert.rejects(
    serviceq(`select public.request_recovery_email('${id(201)}', 'second@example.com', '${tok('b')}')`),
    /Email request limit reached/
  );

  // --- per-destination cap (3/day), counted on the normalized address --------
  for (const n of [202, 203, 204]) { // each of these is below the cap of 3 on its own
    await serviceq(`select public.request_recovery_email('${id(n)}', 'shared-dest@example.com', '${tok(String(n))}')`);
  }
  await assert.rejects(
    serviceq(`select public.request_recovery_email('${id(205)}', 'shared-dest@example.com', '${tok('5')}')`),
    /Too many verification requests for this address/
  );

  // Mixed-case duplicates still count toward the same normalized destination ledger.
  await serviceq(`select public.request_recovery_email('${id(206)}', 'Mixed.Case@Example.COM ', '${tok('6')}')`);
  await serviceq(`select public.request_recovery_email('${id(207)}', 'mixed.case@example.com', '${tok('7')}')`);
  await assert.rejects(
    serviceq(`select public.request_recovery_email('${id(208)}', 'MIXED.case@Example.com', '${tok('8')}')`),
    /Too many verification requests for this address/
  );

  // --- global daily cap (100/day) --------------------------------------------
  await superq(`insert into phase1_private.recovery_mail_limits(user_id, destination, sent_at)
                select '${id(209)}', 'bulk' || g || '@example.com', now() from generate_series(1, 150) g`);
  await assert.rejects(
    serviceq(`select public.request_recovery_email('${id(209)}', 'final@example.com', '${tok('9')}')`),
    /Verification mail limit reached/
  );
  await superq(`delete from phase1_private.recovery_mail_limits where destination like 'bulk%@example.com'`);

  // --- per-IP cap (20/day) -----------------------------------------------------
  await superq(`insert into phase1_private.recovery_mail_limits(user_id, destination, ip_hash, sent_at)
                select '${id(209)}', 'network' || g || '@example.com', 'iptest', now() from generate_series(1, 20) g`);
  await assert.rejects(
    serviceq(`select public.request_recovery_email('${id(209)}', 'victim@example.com', '${tok('e1')}', 'iptest')`),
    /network/
  );
  await superq(`delete from phase1_private.recovery_mail_limits where ip_hash = 'iptest'`);

  // --- one active challenge per account: re-issue revokes the previous one -----
  await cool(id(201));
  await serviceq(`select public.request_recovery_email('${id(201)}', 'reissue@example.com', '${tok('c')}')`);
  assert.equal(await val(`select count(*)::int from phase1_private.recovery_challenges where user_id = '${id(201)}' and consumed_at is null`), 1);
  await assert.rejects(
    serviceq(`select public.confirm_recovery_email('${id(201)}', '${tok('a')}')`), // revoked challenge
    /invalid or expired/
  );

  // --- expiry -----------------------------------------------------------------
  await cool(id(201));
  await serviceq(`select public.request_recovery_email('${id(201)}', 'fresh@example.com', '${tok('d')}')`);
  await superq(`update phase1_private.recovery_challenges set expires_at = now() - interval '1 second'
                where user_id = '${id(201)}' and consumed_at is null`);
  await assert.rejects(serviceq(`select public.confirm_recovery_email('${id(201)}', '${tok('d')}')`), /invalid or expired/);

  // --- cross-account and replay ------------------------------------------------
  await cool(id(201));
  await serviceq(`select public.request_recovery_email('${id(201)}', 'live@example.com', '${tok('e')}')`);
  await assert.rejects(
    serviceq(`select public.confirm_recovery_email('${id(202)}', '${tok('e')}')`),
    /invalid or expired/
  );
  const confirmed = await val(`select public.confirm_recovery_email('${id(201)}', '${tok('e')}')`);
  assert.equal(confirmed.current, 'live@example.com');
  assert.equal(confirmed.previous, null);
  await assert.rejects(
    serviceq(`select public.confirm_recovery_email('${id(201)}', '${tok('e')}')`),
    /invalid or expired/
  );

  // --- old inbox stays active until the new one is confirmed -------------------
  await cool(id(201));
  await serviceq(`select public.request_recovery_email('${id(201)}', 'replacement@example.com', '${tok('f')}')`);
  assert.equal(
    await val(`select email from phase1_private.verified_recovery where user_id = '${id(201)}'`),
    'live@example.com',
    'requesting a change must not move the binding'
  );
  const swapped = await val(`select public.confirm_recovery_email('${id(201)}', '${tok('f')}')`);
  assert.deepEqual([swapped.previous, swapped.current], ['live@example.com', 'replacement@example.com']);
  assert.equal(await val(`select email from phase1_private.verified_recovery where user_id = '${id(201)}'`), 'replacement@example.com');

  // --- concurrent claim of one address: first wins, loser fails closed ---------
  await cool(id(202)); await cool(id(203));
  await serviceq(`select public.request_recovery_email('${id(202)}', 'one-owner@example.com', '${tok('2')}')`);
  await serviceq(`select public.request_recovery_email('${id(203)}', 'one-owner@example.com', '${tok('3')}')`);
  await serviceq(`select public.confirm_recovery_email('${id(202)}', '${tok('2')}')`);
  await assert.rejects(
    serviceq(`select public.confirm_recovery_email('${id(203)}', '${tok('3')}')`),
    /already linked to another account/
  );

  // --- 60-minute TTL is what the database enforces ------------------------------
  const ttl = await val(`select round(extract(epoch from (expires_at - created_at)) / 60)::int
                         from phase1_private.recovery_challenges
                         where user_id = '${id(202)}' and email = 'one-owner@example.com'`);
  assert.equal(ttl, 60);

  // --- authorization: service_role only ------------------------------------------
  await assert.rejects(
    db.exec(`set role authenticated; select public.request_recovery_email('${id(202)}', 'x@example.com', '${tok('1')}')`),
    /permission denied/
  );
  await assert.rejects(
    db.exec(`set role authenticated; select public.confirm_recovery_email('${id(202)}', '${tok('2')}')`),
    /permission denied/
  );
  // --- my_recovery_status(): caller-scoped, masked, authenticated-only -------
  const statusMigration = readFileSync(
    new URL('../migrations/20261126_my_recovery_status.sql', import.meta.url),
    'utf8'
  );
  await superq(statusMigration);

  const asUser = async n => db.exec(`reset role;set role authenticated;set request.jwt.claims='${JSON.stringify({ sub: id(n), aal: 'aal1' })}'`);
  const status = async () => {
    const rows = (await db.query('select public.my_recovery_status() as s')).rows;
    return rows[0].s;
  };

  // 201 verified replacement@example.com earlier in this suite.
  await asUser(201);
  const s201 = await status();
  assert.equal(s201.verified, true);
  assert.equal(s201.masked_email, 're***@ex***.com');
  assert.ok(!JSON.stringify(s201).includes('replacement@example.com'), 'never returns the raw address');

  // 203 requested but never confirmed — no verified binding exists for them.
  await asUser(203);
  const s203 = await status();
  assert.deepEqual(s203, { verified: false, masked_email: null });

  // Caller scoping: 203 cannot see 201's status, and there is no uid argument to abuse.
  await assert.rejects(
    db.query(`select public.my_recovery_status('${id(201)}')`),
    /does not exist|too many arguments/i
  );

  // anon cannot execute it.
  await db.exec('reset role; set role anon');
  await assert.rejects(db.query('select public.my_recovery_status()'), /permission denied/i);

  // authenticated CAN execute it (grant intact).
  await asUser(201);
  assert.equal((await status()).verified, true);

  // Helpers are not callable by API roles either.
  await db.exec('reset role; set role authenticated');
  await assert.rejects(
    db.query(`select phase1_private.mask_recovery_email('leak@example.com')`),
    /permission denied/i
  );
  await superq('select 1');

  console.log('Recovery email: normalization-before-count, 60-minute TTL, global/destination/account caps, replay/expiry/cross-account, atomic claim, old-inbox continuity and my_recovery_status passed.');
}

-- Enable ONLY after deploying and authenticating the cleanup endpoint, testing a
-- restored backup, and provisioning these two Vault secrets for THIS environment.
begin;
create extension if not exists pg_net;
do $$ begin
 if not exists(select from vault.decrypted_secrets where name='entry_cleanup_url' and decrypted_secret ~ '^https://[A-Za-z0-9.-]+/api/proof-cleanup$') or not exists(select from vault.decrypted_secrets where name='entry_cleanup_token' and length(decrypted_secret)>=32) then raise exception 'Configure and verify this environment''s cleanup endpoint and bearer first';end if;
end $$;
create function phase1_private.dispatch_proof_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
declare endpoint text; token text;begin
 if exists(select from inserted_jobs) then
 select decrypted_secret into strict endpoint from vault.decrypted_secrets where name='entry_cleanup_url';
 select decrypted_secret into strict token from vault.decrypted_secrets where name='entry_cleanup_token';
 perform net.http_post(url:=endpoint,headers:=jsonb_build_object('Authorization','Bearer '||token),body:='{}'::jsonb);
 end if;return null;
exception when others then
 -- Never roll back the approval or its durable queue if the notifier is down.
 raise warning 'Proof cleanup dispatch failed; retry through scheduled worker';return null;
end $$;
-- One async request per non-empty batch, visible to pg_net only after commit.
create trigger notify_proof_worker after insert on phase1_private.proof_cleanup referencing new table as inserted_jobs for each statement execute function phase1_private.dispatch_proof_cleanup();
commit;

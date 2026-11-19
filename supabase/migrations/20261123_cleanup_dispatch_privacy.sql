-- Hosted pg_net installations can grant PUBLIC access to queued request headers.
begin;
do $$begin
 if has_table_privilege('anon','net.http_request_queue','select') or has_table_privilege('authenticated','net.http_request_queue','select') then
  alter table phase1_private.proof_cleanup disable trigger notify_proof_worker;
  perform vault.update_secret((select id from vault.secrets where name='entry_cleanup_token'),encode(extensions.gen_random_bytes(32),'hex'));
 end if;
end$$;
commit;

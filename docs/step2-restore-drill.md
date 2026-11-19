# Step 2 — encrypted database and proof-file restore drill

Operator runbook, not a record of execution. This is a **post-cutover** snapshot. Step 1 is complete; do not re-enroll the owner. Production operations below are reads. Do not run migrations, approve cases, invoke either worker, enable dispatch, or change production secrets. Do not link a clone to a production worker. Run commands in Bash on a trusted operator machine, not in the repository or CI logs.

## 1. Prepare and identify all four endpoints

- Install PostgreSQL 17 client tools, `rclone`, `age`, GNU `tar`/`sha256sum`, and Python 3. Use an encrypted scratch mount and a separate private durable backup destination outside Git. Verify the mounts are actually mounted and have adequate space; do not silently fall back to a local directory.
- Configure libpq services `gsu_prod_backup` (production direct/session connection, TLS verification, permissions to dump ALL required rows) and `gsu_restore_drill` (private, disposable **empty database**, compatible server, roles, extensions, extension versions and managed dependencies). Use protected passfiles or an operator secret store. Run `psql -X 'service=gsu_prod_backup' -c '\conninfo'` and the corresponding command for `gsu_restore_drill`. Independently compare hosts/project references to your inventory. Do not use a fresh hosted database full of managed tables as an empty restore destination.
- Configure `rclone` S3 remotes `prodstore:` (read-only access to production Storage) and `drillstore:` (separate isolated Storage endpoint and credentials, empty private `id-cards` bucket). Compare the actual endpoints, not just remote aliases. Use a second isolated Storage service for the API readback drill so a metadata restore does not pre-populate the API upload destination. This is artifact recovery verification, not yet the integrated two-file approval test.
- **Before restoring anything**, deny outbound traffic on the database clone, disable scheduler execution at the infrastructure level, and keep Auth, mail, workers, and client traffic off. Restored jobs can run without a user logging in. Do not expose restored sessions or use production signing keys. Plan for roles, extension support, external Vault key recovery and other provider-managed dependencies separately: a single-database `pg_dump` does not contain all of these. If the operator cannot read/restore a required schema or attest to coverage, stop.
- Arrange a quiet window for database/Storage writes affecting proofs. A database dump and an S3 mirror are **not** one atomic snapshot. If writes cannot be excluded or changes are observed, do not certify this capture. Keep all paths, keys, per-file hashes and logs private.

## 2. Capture, reconcile and encrypt

Set `AGE_RECIPIENT` to the custodian's public age recipient. The private identity must be recoverable independently of the archive. Adjust the mount paths first.

```bash
set -euo pipefail
umask 077
: "${AGE_RECIPIENT:?set the backup custodian public recipient}"
SCRATCH=/mnt/encrypted-scratch
DEST=/mnt/private-backups
mountpoint -q "$SCRATCH" && mountpoint -q "$DEST" || { echo 'Check backup mounts'; exit 1; }
REF="gsu-phase1-$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$SCRATCH/$REF"; BACKUP="$DEST/$REF"
mkdir -m 700 "$WORK" "$BACKUP"; mkdir "$WORK/objects"
cd "$WORK"
pg_dump --dbname='service=gsu_prod_backup' --format=custom --file=database.dump
pg_restore --list database.dump > archive.list
# No --no-acl, --no-owner, schema exclusions, or row-security bypass workarounds.
rclone copy 'prodstore:id-cards' objects --log-file="$WORK/copy.log"
rclone check 'prodstore:id-cards' objects --download --log-file="$WORK/check.log"
```

On a case-sensitive filesystem with object names representable losslessly, create a private sorted JSON manifest. The drill fails rather than certifying a mirror that omitted or renamed a file. The `db-files.json` query captures Storage metadata (not object bytes).

```bash
cat > manifest.py <<'PY'
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1]); result = {}
for p in sorted(root.rglob('*')):
    if p.is_symlink(): raise SystemExit('Unexpected symlink')
    if p.is_file():
        h = hashlib.sha256(); n = 0
        with p.open('rb') as f:
            for chunk in iter(lambda: f.read(1024*1024), b''):
                n += len(chunk); h.update(chunk)
        result[p.relative_to(root).as_posix()] = [n, h.hexdigest()]
print(json.dumps(result, sort_keys=True))
PY
python3 manifest.py objects > files.json
cat > inventory.sql <<'SQL'
SELECT coalesce(jsonb_object_agg(name, (metadata->>'size')::bigint), '{}'::jsonb)
FROM storage.objects WHERE bucket_id='id-cards';
SQL
psql -XAtq -v ON_ERROR_STOP=1 'service=gsu_prod_backup' -f inventory.sql > db-files.json
python3 - <<'PY'
import json
f=json.load(open('files.json')); db=json.load(open('db-files.json'))
if {k:v[0] for k,v in f.items()} != db: raise SystemExit('Metadata/bytes differ; investigate privately')
print('captured objects:',len(f),'bytes:',sum(v[0] for v in f.values()))
PY
tar -cf - database.dump archive.list objects files.json db-files.json manifest.py inventory.sql |
  age -r "$AGE_RECIPIENT" -o "$BACKUP/phase1.tar.age"
(cd "$BACKUP" && sha256sum phase1.tar.age > phase1.tar.age.sha256)
```

Retain the encrypted artifact. Record its reference and ciphertext hash independently in the private backup register. Do not archive working credentials, passfiles, or the age identity with it.

## 3. Restore the encrypted artifact, with integrations quarantined

On the isolated machine set `BACKUP` to the private archive directory and `AGE_IDENTITY_FILE` to the protected identity path. Check the checksum against the independent backup register as well as the sidecar. Verify the restore host again before writing.

```bash
set -euo pipefail; umask 077
: "${BACKUP:?set archived backup directory}" "${AGE_IDENTITY_FILE:?set identity path}"
mountpoint -q /mnt/encrypted-scratch || exit 1
RESTORE=$(mktemp -d /mnt/encrypted-scratch/gsu-drill.XXXXXX)
(cd "$BACKUP" && sha256sum -c phase1.tar.age.sha256)
age -d -i "$AGE_IDENTITY_FILE" "$BACKUP/phase1.tar.age" | tar -xf - -C "$RESTORE"
cd "$RESTORE"
psql -X 'service=gsu_restore_drill' -c '\conninfo'
# Only after confirming the disposable host, egress block and empty restore DB:
pg_restore --dbname='service=gsu_restore_drill' --single-transaction \
  --exit-on-error database.dump >restore.log 2>&1
```

Do not use `--clean`, ignore restore failures, or remove grants/owners just to pass. In the clone only, replace the two restored cleanup entries **before starting any integration**. The following uses a deliberately non-routable URL and a new token generated inside the clone: they are safe quarantine values, not working staging credentials. Do not select or print decrypted secrets. Keep any unrelated restored secrets quarantined; replace or remove them before enabling a service that uses them.

```bash
psql -X -v ON_ERROR_STOP=1 'service=gsu_restore_drill' <<'SQL'
BEGIN;
ALTER TABLE phase1_private.proof_cleanup DISABLE TRIGGER notify_proof_worker;
DELETE FROM vault.secrets WHERE name IN ('entry_cleanup_url','entry_cleanup_token');
SELECT vault.create_secret('https://disabled.invalid/api/proof-cleanup','entry_cleanup_url');
SELECT vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'entry_cleanup_token');
COMMIT;
SQL
```

On the staging deployment, **do not copy the production environment**. Leave its cron/worker off for Step 2. Remove any inherited production service key, cleanup bearer, SMTP/Brevo credentials and URLs. In staging-only secret settings, set `VITE_SUPABASE_URL`/public client key to the staging project, `SUPABASE_SERVICE_ROLE_KEY` to staging's own key, and `APP_URL` to the staging origin. For the later worker drill only, provision a fresh staging `CRON_SECRET` and the same token in staging Vault, replace the quarantine URL with the staging worker HTTPS URL, and use a test mail sink. No production value is required. Leave immediate dispatch disabled if untrusted roles can read pg_net headers.

## 4. Verify both artifacts independently

From the extracted archive directory, with `drillstore:` verified as isolated:

```bash
rclone lsf 'drillstore:id-cards' --recursive > before.list
[ ! -s before.list ] || { echo 'Destination is not empty; stop'; exit 1; }
rclone copy objects 'drillstore:id-cards' --log-file="$RESTORE/upload.log"
rclone check objects 'drillstore:id-cards' --download --log-file="$RESTORE/readback.log"
mkdir readback
rclone copy 'drillstore:id-cards' readback --log-file="$RESTORE/download.log"
python3 manifest.py readback > readback.json
cmp files.json readback.json
psql -XAtq -v ON_ERROR_STOP=1 'service=gsu_restore_drill' -f inventory.sql > restored-db-files.json
cmp db-files.json restored-db-files.json
python3 - <<'PY'
import json
f=json.load(open('readback.json')); print('verified objects:',len(f),'verified bytes:',sum(v[0] for v in f.values()))
PY
```

These comparisons require the exact same keys and byte lengths; the API readback additionally requires identical SHA-256 for **every object** and no extras. If there were zero objects, report **0 objects / 0 bytes** and prove nonempty upload/readback separately with a synthetic staging-only file. Do not claim production bytes were exercised in that case.

On the restored DB check Auth users and factors, matching owner binding and profile, row counts, private bucket settings, policies/grants, and trigger/function definitions against the capture inventory/archive. Confirm the isolated Storage API denies anonymous download of a known private object (no signed URL) while an authorized staging client can read it. Verify no outbound job/mail ran. Missing managed objects/keys, changed ACLs, checksum differences, or incomplete proof of coverage must be logged as **FAIL / NOT VERIFIED**, not waived silently. Keep dumps, private manifests, detailed errors and restored personal data access-controlled; dispose of temporary copies under the agreed retention policy.

## 5. Record the result without secrets

Append the following to `docs/phase1-cutover-record.md` **after** the drill. Do not overwrite the historical preflight or deployment result.

```text
Step 2 post-cutover restore drill — <UTC start/end>
Backup reference: <non-secret reference>; operator / reviewer: <initials>
Isolated targets independently checked; outbound jobs/mail disabled: PASS / FAIL
Encrypted archive recovered using independent identity: PASS / FAIL
DB restore incl. Auth, RLS/grants, functions, triggers, Storage metadata: PASS / FAIL
Clone Vault/worker isolated; no production destinations/credentials in active services: PASS / FAIL
id-cards metadata / captured / restored object counts: <n> / <n> / <n>
Captured / restored bytes: <bytes> / <bytes>; all names and SHA-256 match: PASS / FAIL
Isolated Storage private; anonymous read denied / authorized read succeeded: PASS / FAIL
Offline owner recovery custody: CONFIRMED / NOT VERIFIED
Exceptions / evidence reference: <non-secret reference>
Two-file approval + retry drill: NOT RUN by Step 2
Production deletion enablement: NOT AUTHORIZED by Step 2
```

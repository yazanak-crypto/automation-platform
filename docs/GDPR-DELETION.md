# Customer data deletion runbook (GDPR Art. 17 / CCPA)

When a customer requests deletion (via **Settings → Data & danger zone → Request deletion**,
which emails support, or directly to the privacy contact), fulfil it within **30 days** to match
our Privacy Policy. A one-click cascade delete is intentionally NOT exposed in-app yet, because an
incorrect cascade across ~18 tables + external providers is higher risk than a controlled manual
run. This runbook is the controlled process.

## 0. Verify + snapshot
1. Confirm the request comes from the workspace **owner's** account email.
2. Offer the export first (Settings → Data → Download my data), or run `GET /api/settings/export` on their behalf.
3. Note the `workspace_id` (from the export JSON or the `workspaces` table).

## 1. Delete database rows (child → parent order)
Run inside a transaction against the production database. Order matters because of foreign keys.

```sql
BEGIN;
-- set once:
--   \set ws 'THE-WORKSPACE-UUID'

DELETE FROM run_events        WHERE run_id IN (SELECT id FROM runs WHERE workspace_id = :'ws');
DELETE FROM messages          WHERE workspace_id = :'ws';
DELETE FROM runs              WHERE workspace_id = :'ws';
DELETE FROM conversations     WHERE workspace_id = :'ws';
DELETE FROM contacts          WHERE workspace_id = :'ws';
DELETE FROM activations       WHERE workspace_id = :'ws';
DELETE FROM channels          WHERE workspace_id = :'ws';
DELETE FROM connections       WHERE workspace_id = :'ws';
DELETE FROM boundaries        WHERE workspace_id = :'ws';
DELETE FROM knowledge_items   WHERE workspace_id = :'ws';
DELETE FROM brain_change_log  WHERE workspace_id = :'ws';
DELETE FROM business_profiles WHERE workspace_id = :'ws';
DELETE FROM subscriptions     WHERE workspace_id = :'ws';
DELETE FROM ai_calls          WHERE workspace_id = :'ws';
DELETE FROM notifications     WHERE workspace_id = :'ws';
DELETE FROM workspace_invites WHERE workspace_id = :'ws';
DELETE FROM workspace_members WHERE workspace_id = :'ws';
DELETE FROM workspaces        WHERE id = :'ws';

-- Delete users who are now orphaned (no remaining memberships):
DELETE FROM users u
 WHERE NOT EXISTS (SELECT 1 FROM workspace_members m WHERE m.user_id = u.id);

COMMIT;
```
If any `DELETE` errors on a foreign key, a new table was added that references the workspace —
add it to this list (grep `references(() => workspaces.id)` in `packages/db/src/schema.ts`) before
committing.

## 2. Delete data held by external processors
- **Stripe:** in the Stripe Dashboard, delete the customer (`stripe_customer_id` from the exported
  `subscriptions` row) — this cancels subscriptions and removes payment data.
- **Nango:** for each connection, the connection is removed when the workspace disconnects; if any
  remain, delete them in the Nango dashboard (or `DELETE https://api.nango.dev/connection/<id>`).
- **Clerk:** delete each orphaned user in the Clerk Dashboard (removes auth records).
- **Sentry / logs:** error logs auto-expire per retention; no PII should be stored in them.

## 3. Confirm
Email the requester confirming deletion is complete and the date.

## Future automation
When exposing an in-app one-click delete, add `onDelete: "cascade"` to the workspace-owned foreign
keys in `packages/db/src/schema.ts` (generate a migration), wrap the external-provider calls
(Stripe/Nango/Clerk) with retries, and require a typed workspace-name confirmation.

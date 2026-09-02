# Paddle environment variables, by deployment

Two processes talk to Paddle and they have **separate environments**. This is
the whole reason `[billing.reconcile] skipped subscription — unrecognised price`
appears in the worker log while checkout works fine on the web app.

| Variable | Web app (Vercel) | Worker (Railway) | What breaks if unset |
|---|---|---|---|
| `PADDLE_API_KEY` | required | **required** | Worker: reconciliation disables itself (logs "PADDLE_API_KEY not set"). Web: checkout throws. |
| `PADDLE_ENV` | required | **required** | Defaults to **sandbox**. Anything other than the exact string `production` is sandbox. |
| `PADDLE_WEBHOOK_SECRET` | required | not used | Web: every webhook is rejected at the door. |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | required | not used | Checkout overlay will not open. |
| `PADDLE_PRICE_ENTRY` | required | **required** | Worker: Entry subscriptions skipped as "unrecognised price". |
| `PADDLE_PRICE_STARTER` | required | **required** | Worker: Starter subscriptions skipped. **This is the current failure.** |
| `PADDLE_PRICE_GROWTH` | required | **required** | Worker: Growth subscriptions skipped. |
| `PADDLE_PRICE_PRO` | required | **required** | Worker: Premium subscriptions skipped. |
| `PADDLE_PRICE_ENTRY_SETUP` | required | not used | Web: Entry checkout has no month-one item. |

## Why the worker needs the recurring price ids

`planForPaddlePrice` (`packages/core/src/paddleSync.ts`) resolves a
subscription's price id back to a plan by comparing against these env vars. An
**unset variable is indistinguishable from an unknown price** — the comparison
simply never matches, and `listRemoteSubscriptions` pushes the subscription onto
`skipped` with reason `unrecognised price <id>`.

A skip is not destructive: `reconcilePaddleSubscriptions` excludes the row and
writes nothing, so nobody is downgraded. What it does mean is that the
subscription is **outside drift repair**. Reconciliation exists because Paddle
retries a failing webhook only three times over ~2 minutes and then drops the
event permanently; the hourly sweep is what bounds that damage to one hour. Any
plan whose price id is missing from the worker's environment has no safety net,
and the log line looks identical whether it is one stale subscription or your
entire paying base.

Setup prices (`*_SETUP`) are one-time charges and never appear as a subscription
item, so the worker never resolves one. Do not add them to Railway.

## Sandbox vs production

Both `apiHost()` in `paddleSync.ts` and the SDK `Environment` check
`process.env.PADDLE_ENV === "production"` — an exact string match. Unset,
misspelled, or `prod` all mean **sandbox**.

Setting `PADDLE_ENV=production` without also swapping in production price ids
and a production API key makes *every* subscription skip with the same
"unrecognised price" message, because sandbox price ids do not exist in the
production account. Change all three together.

## Retiring the old tiers

The sandbox price objects created for the previous $399 / $599 tiers are listed
(commented out) in the repo-root `.env`. They sell the old amounts and must not
be mapped to the new plan ids — doing so would advertise $99 and charge $399.
Create new Paddle prices for the current `PLANS`, then run:

```bash
pnpm paddle:verify
```

That checks every price id in env against the live Paddle API and against
`PLANS`, including the trial-period rule: plans **with** a setup fee must carry a
30-day trial on the recurring price (or the customer is charged twice on day
one), and plans **without** one must have no trial (or the first month is given
away free).

Existing subscribers on a retired price are a separate migration: their price id
will no longer resolve to a plan, so they will be skipped by reconciliation
until they are moved onto a current price in Paddle.

# Clerk production setup (removes "My Application" / "Development mode")

The auth screens currently show **"My Application"** and a **"Development mode"** badge.
Neither is in our code — both come from the Clerk *instance*. Fixing them is a
Clerk Dashboard + env task, done once before launch.

## 1. Set the application name (fixes "My Application")
Clerk Dashboard → your app → **Customization → Branding** → set **Application name** to `Ovanth`.
Also upload the logo and set brand colors here so the widget matches our pages.
(Our sign-in/sign-up pages already hide Clerk's own header text and show the Ovanth
wordmark, so this is the only remaining place the name leaks.)

## 2. Create a Production instance (fixes "Development mode")
The "Development mode" badge only appears on Clerk *development* instances.
Clerk Dashboard → **switch the instance to Production** (or create a production
instance) and complete DNS verification for your domain.

## 3. Custom domain (REQUIRED for production instances)
A production Clerk instance serves `clerk-js` from `clerk.<your-domain>` (e.g.
`clerk.ovanth.com`) instead of `*.clerk.accounts.dev`. Two things must be true or
auth breaks silently — buttons render, clicking does nothing, no request fires:

**a) DNS.** Add every CNAME Clerk lists under **Domains**: `clerk`, `accounts`,
`clkmail`, `clk._domainkey`, `clk2._domainkey`. On Cloudflare these MUST be
**DNS only (grey cloud)** — proxying breaks Clerk's TLS. Wait for "Verified".
Symptom if missing: `ERR_NAME_NOT_RESOLVED` on `clerk.<your-domain>`.

**b) CSP.** Set in Vercel (Production + Preview):
```
CLERK_FRONTEND_API_DOMAIN=clerk.ovanth.com
```
`apps/web/next.config.ts` injects it into `script-src` / `connect-src` /
`frame-src` automatically — nothing is hardcoded. Leave it unset on a
development instance. Symptom if missing: a CSP violation in the console
("Refused to load the script … violates Content Security Policy").

**Redeploy after changing it** — the CSP is baked into the response headers at
build time, so an env change alone does not take effect.

## 4. Production keys (env)
Replace the dev keys with the production ones from the Clerk Dashboard:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
```
Keep the existing:
```
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

## 5. Redirect URLs
Clerk Dashboard → **Paths** → set after-sign-in and after-sign-up to `/dashboard`
(new users are routed to `/onboarding` by our app layout automatically). Add your
production domain to the list of allowed origins.

## Verify
- Load `/sign-in` on the production domain: no "Development mode" badge, the header
  reads Ovanth (or is hidden), and the Ovanth wordmark shows above the form.
- Sign up → lands in onboarding → dashboard.

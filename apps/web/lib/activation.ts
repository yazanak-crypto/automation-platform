import { NextResponse } from "next/server";
import { requireWorkspace } from "./workspace";

/**
 * Manual account activation (pre-billing). New signups land with
 * `users.is_active = false` and see the /pending holding page until an admin
 * flips them on in /admin.
 *
 * `requireWorkspace()` already returns the user row, so this costs no extra
 * query — it reads the flag that was fetched with the session.
 */
export async function requireActiveWorkspace() {
  const ctx = await requireWorkspace();
  if (!ctx) return { ctx: null, active: false } as const;
  return { ctx, active: ctx.user.isActive === true } as const;
}

/** 403 body for API routes that do real work on behalf of an inactive account. */
export function accountInactive() {
  return NextResponse.json(
    {
      error:
        "Your account is being activated. You'll get access as soon as it's approved.",
      code: "account_inactive",
    },
    { status: 403 },
  );
}

/**
 * Guard for API routes that spend money, send outbound messages, or mutate
 * workspace state. Returns a ready-to-return Response when the caller must be
 * rejected, or the context when the call may proceed.
 */
export async function guardActive() {
  const { ctx, active } = await requireActiveWorkspace();
  if (!ctx) {
    return { ctx: null, deny: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  }
  if (!active) return { ctx: null, deny: accountInactive() } as const;
  return { ctx, deny: null } as const;
}

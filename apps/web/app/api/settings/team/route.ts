import { emailProvider, takeLimit } from "@platform/core";
import { db, users, workspaceInvites, workspaceMembers } from "@platform/db";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

async function roleOf(workspaceId: string, userId: string): Promise<string | null> {
  const r = await db()
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return r[0]?.role ?? null;
}

export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const wsId = ctx.workspace.id;
  const [members, invites, myRole] = await Promise.all([
    db()
      .select({ id: users.id, name: users.name, email: users.email, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, wsId)),
    db()
      .select({ id: workspaceInvites.id, email: workspaceInvites.email, role: workspaceInvites.role, createdAt: workspaceInvites.createdAt })
      .from(workspaceInvites)
      .where(and(eq(workspaceInvites.workspaceId, wsId), eq(workspaceInvites.status, "pending")))
      .orderBy(desc(workspaceInvites.createdAt)),
    roleOf(wsId, ctx.user.id),
  ]);
  return NextResponse.json({ members, invites, myRole, myUserId: ctx.user.id });
}

const inviteSchema = z.object({
  email: z.string().email().max(200),
  role: z.enum(["admin", "member"]).default("member"),
});

export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const wsId = ctx.workspace.id;
  const myRole = await roleOf(wsId, ctx.user.id);
  if (myRole !== "owner" && myRole !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can invite people." }, { status: 403 });
  }
  const parsed = inviteSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  const email = parsed.data.email.toLowerCase();

  // Abuse guard: cap outbound invite emails per workspace per day.
  if (!(await takeLimit(`invite:${wsId}`, 25, 86400))) {
    return NextResponse.json(
      { error: "Daily invite limit reached — try again tomorrow." },
      { status: 429 },
    );
  }

  // Already a member?
  const existing = await db()
    .select({ id: users.id })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, wsId), eq(users.email, email)))
    .limit(1);
  if (existing[0]) return NextResponse.json({ error: "That person is already on your team." }, { status: 409 });

  const token = crypto.randomUUID();
  await db()
    .insert(workspaceInvites)
    .values({
      workspaceId: wsId,
      email,
      role: parsed.data.role,
      token,
      invitedBy: ctx.actor,
      expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
    })
    .onConflictDoUpdate({
      target: [workspaceInvites.workspaceId, workspaceInvites.email],
      set: { role: parsed.data.role, status: "pending", token, expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000) },
    });

  // Email the invite (no-op if the email provider isn't configured yet).
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  let emailed = false;
  if (emailProvider.configured) {
    const r = await emailProvider.send({
      to: email,
      subject: `You're invited to join ${ctx.workspace.name} on Ovanth`,
      text: `You've been invited to join ${ctx.workspace.name} on Ovanth.\n\nAccept by creating your account with this email address:\n${appUrl}/sign-up\n\nThis invite expires in 14 days.`,
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#111">
        <p style="font-size:15px;line-height:1.5">You've been invited to join <strong>${ctx.workspace.name}</strong> on Ovanth.</p>
        <p style="font-size:14px;color:#555">Accept by creating your account with <strong>${email}</strong>:</p>
        <a href="${appUrl}/sign-up" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:11px 22px;border-radius:10px;font-size:14px;font-weight:600;margin-top:8px">Accept invitation</a>
        <p style="font-size:12px;color:#999;margin-top:20px">This invite expires in 14 days.</p>
      </div>`,
    });
    emailed = r.ok;
  }
  return NextResponse.json({ ok: true, emailed });
}

export async function DELETE(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const wsId = ctx.workspace.id;
  const myRole = await roleOf(wsId, ctx.user.id);
  if (myRole !== "owner" && myRole !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can manage the team." }, { status: 403 });
  }
  const url = new URL(req.url);
  const inviteId = url.searchParams.get("inviteId");
  const memberId = url.searchParams.get("memberId");

  if (inviteId) {
    await db()
      .update(workspaceInvites)
      .set({ status: "revoked" })
      .where(and(eq(workspaceInvites.id, inviteId), eq(workspaceInvites.workspaceId, wsId)));
    return NextResponse.json({ ok: true });
  }
  if (memberId) {
    if (memberId === ctx.user.id) {
      return NextResponse.json({ error: "You can't remove yourself." }, { status: 400 });
    }
    const target = await roleOf(wsId, memberId);
    if (target === "owner") {
      return NextResponse.json({ error: "The workspace owner can't be removed." }, { status: 400 });
    }
    await db()
      .delete(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, memberId)));
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Nothing to remove." }, { status: 400 });
}

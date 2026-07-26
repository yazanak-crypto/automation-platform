import { auth } from "@clerk/nextjs/server";

/**
 * Admin access is a single Clerk user id from env. Deliberately NOT tied to the
 * users table or the isActive flag, so the admin can always reach /admin to
 * activate accounts — including their own.
 */
export async function isAdmin(): Promise<boolean> {
  const adminId = process.env.ADMIN_USER_ID;
  if (!adminId) return false; // unset = nobody is admin (fail closed)
  const { userId } = await auth();
  return !!userId && userId === adminId;
}

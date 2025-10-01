import { db } from "@/db/client";
import { users } from "@/db/schema";
import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

export async function ensureUser() {
  const { userId } = await auth();
  if (!userId) return null;

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, userId));
  if (existing) return existing;

  const u = await currentUser();
  const primaryEmail =
    u?.emailAddresses?.[0]?.emailAddress ?? `${userId}@example.local`;
  const name =
    [u?.firstName, u?.lastName].filter(Boolean).join(" ") || "Inspector";

  const [inserted] = await db
    .insert(users)
    .values({ clerkUserId: userId, email: primaryEmail, name })
    .returning();

  return inserted;
}

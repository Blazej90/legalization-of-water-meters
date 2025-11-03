import "dotenv/config";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error(
      "Użycie: pnpm tsx scripts/make-admin.ts blazejbart@gmail.com"
    );
    process.exit(1);
  }
  const res = await db
    .update(users)
    .set({ role: "ADMIN" })
    .where(eq(users.email, email))
    .returning();
  console.log(
    "Ustawiono ADMIN dla:",
    res.map((r) => r.email)
  );
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

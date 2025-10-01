import { auth } from "@clerk/nextjs/server";
import { ensureUser } from "@/lib/provision";
import { db } from "@/db/client";
import { entries, requests, workDays } from "@/db/schema";
import { computeProgress } from "@/lib/progress";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export default async function Dashboard() {
  const { userId } = await auth();
  if (!userId) return redirect("/sign-in");
  const me = await ensureUser();

  const [req] = await db.select().from(requests).limit(1);
  const [wd] = await db.select().from(workDays).limit(1);

  async function addEntry(form: FormData) {
    "use server";
    const count = Number(form.get("count") || 0);
    if (!req || !wd || !me || !Number.isInteger(count) || count <= 0) return;
    await db.insert(entries).values({
      requestId: req.id,
      workDayId: wd.id,
      inspectorId: me.id,
      count,
    });
    revalidatePath("/dashboard");
  }

  const es = req
    ? await db.select().from(entries).where(eq(entries.requestId, req.id))
    : [];
  const prog = req ? computeProgress(req.plannedCount, es) : null;

  return (
    <main className="p-6 space-y-6">
      <h2 className="text-xl font-semibold">Dashboard</h2>

      {!req || !wd ? (
        <p className="text-zinc-600">
          Brak danych startowych. Dodaj wniosek i dzień pracy w panelu admina
          lub poproś o seed.
        </p>
      ) : (
        <>
          <form action={addEntry} className="flex items-end gap-3">
            <div>
              <label className="block text-sm text-zinc-600">
                Ile sztuk po pomiarze
              </label>
              <input
                name="count"
                type="number"
                min={1}
                className="px-3 py-2 border rounded-lg"
                placeholder="np. 5"
                required
              />
            </div>
            <button className="px-4 py-2 rounded-lg bg-zinc-900 text-white">
              Dodaj wpis
            </button>
          </form>

          <div className="p-4 rounded-xl bg-white border">
            <div className="flex justify-between">
              <span>
                {req.applicantName} ({req.month})
              </span>
              <span>{prog?.percent ?? 0}%</span>
            </div>
            <div className="text-sm text-zinc-600">
              Wykonano {prog?.done ?? 0} / {req.plannedCount}
              {prog && prog.overflow > 0 && <> • nadwyżka +{prog.overflow}</>}
            </div>
          </div>
        </>
      )}
    </main>
  );
}

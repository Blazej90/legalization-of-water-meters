import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import AutoRefresh from "@/components/auto-refresh";

import { ensureUser } from "@/lib/provision";
import { computeProgress } from "@/lib/progress";
import { db } from "@/db/client";
import { entries, requests, workDays, users } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";

// ── Walidacja server action ────────────────────────────────────────────────
const EntrySchema = z.object({
  requestId: z.coerce.number().int().positive(),
  workDayId: z.coerce.number().int().positive(),
  count: z.coerce.number().int().positive(),
});

export default async function Dashboard() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // upewnij się, że istniejesz w tabeli users
  const me = await ensureUser();
  if (!me) redirect("/sign-in");

  // listy wyboru
  const reqList = await db.select().from(requests).orderBy(desc(requests.id));
  const dayList = await db.select().from(workDays).orderBy(desc(workDays.date));
  const currentReq = reqList[0] ?? null;

  // agregaty dla bieżącego wniosku
  const doneRow = currentReq
    ? await db
        .select({ done: sql<number>`coalesce(sum(${entries.count}), 0)` })
        .from(entries)
        .where(eq(entries.requestId, currentReq.id))
        .then((r) => r[0])
    : { done: 0 };

  const prog = currentReq
    ? computeProgress(currentReq.plannedCount, [{ count: doneRow.done }])
    : null;

  // ranking per inspektor
  const perInspector = currentReq
    ? await db
        .select({
          inspectorId: users.id,
          name: users.name,
          total: sql<number>`sum(${entries.count})`,
        })
        .from(entries)
        .innerJoin(users, eq(entries.inspectorId, users.id))
        .where(eq(entries.requestId, currentReq.id))
        .groupBy(users.id, users.name)
        .orderBy(desc(sql`sum(${entries.count})`))
    : [];

  // ostatnie wpisy
  const recent = await db
    .select({
      id: entries.id,
      count: entries.count,
      createdAt: entries.createdAt,
      requestId: entries.requestId,
      workDayId: entries.workDayId,
      inspectorName: users.name,
    })
    .from(entries)
    .innerJoin(users, eq(entries.inspectorId, users.id))
    .orderBy(desc(entries.createdAt))
    .limit(12);

  async function addEntry(formData: FormData) {
    "use server";
    const parsed = EntrySchema.safeParse({
      requestId: formData.get("requestId"),
      workDayId: formData.get("workDayId"),
      count: formData.get("count"),
    });
    if (!parsed.success) return;

    const { userId } = await auth();
    if (!userId) return;

    const [meRow] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, userId));
    if (!meRow) return;

    await db.insert(entries).values({
      requestId: parsed.data.requestId,
      workDayId: parsed.data.workDayId,
      inspectorId: meRow.id,
      count: parsed.data.count,
    });

    revalidatePath("/dashboard");
  }

  return (
    <main className="min-h-dvh bg-zinc-950 text-zinc-100">
      <AutoRefresh interval={5000} />
      <div className="mx-auto max-w-5xl p-6 space-y-8">
        <header className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            {me.name ?? "Inspector"}
          </span>
        </header>

        {reqList.length === 0 || dayList.length === 0 || !currentReq ? (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur p-6 shadow-md">
            <p className="text-zinc-200">
              Brak danych startowych. Dodaj przynajmniej jeden <b>wniosek</b> i
              jeden <b>dzień pracy</b> w panelu admina (
              <code className="text-zinc-300">/admin</code>), lub użyj przycisku
              „Dodaj przykładowe dane”.
            </p>
          </section>
        ) : (
          <>
            {/* KPI */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 shadow">
                <div className="text-xs text-zinc-400">Wnioskodawca</div>
                <div className="font-medium text-zinc-100">
                  {currentReq.applicantName}
                </div>
                <div className="text-xs text-zinc-500">{currentReq.month}</div>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 shadow">
                <div className="text-xs text-zinc-400">Plan</div>
                <div className="text-2xl font-semibold text-zinc-100">
                  {currentReq.plannedCount}
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 shadow">
                <div className="text-xs text-zinc-400">Wykonano</div>
                <div className="text-2xl font-semibold text-zinc-100">
                  {prog?.done ?? 0}
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 shadow">
                <div className="text-xs text-zinc-400">Pozostało</div>
                <div className="text-2xl font-semibold text-zinc-100">
                  {prog?.remaining ?? 0}
                </div>
              </div>
            </section>

            {/* Pasek postępu */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 shadow space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-300">Postęp</span>
                <span className="text-zinc-200">{prog?.percent ?? 0}%</span>
              </div>
              <div className="h-2 w-full bg-zinc-800 rounded">
                <div
                  className="h-2 bg-emerald-500 rounded"
                  style={{ width: `${prog?.percent ?? 0}%` }}
                />
              </div>
              {prog && prog.overflow > 0 && (
                <div className="text-xs text-emerald-300">
                  Nadwyżka +{prog.overflow}
                </div>
              )}
            </section>

            {/* Formularz wpisu */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 shadow">
              <form
                action={addEntry}
                className="grid grid-cols-1 md:grid-cols-4 gap-3"
              >
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">
                    Wniosek
                  </label>
                  <select
                    name="requestId"
                    className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 w-full"
                    defaultValue={currentReq.id}
                  >
                    {reqList.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.applicantName} ({r.month}) — plan {r.plannedCount}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-1">
                    Dzień pracy
                  </label>
                  <select
                    name="workDayId"
                    className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 w-full"
                    defaultValue={dayList[0].id}
                  >
                    {dayList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {new Date(d.date as any).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-1">
                    Ile sztuk
                  </label>
                  <input
                    name="count"
                    type="number"
                    min={1}
                    required
                    className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 w-full placeholder-zinc-500"
                    placeholder="np. 5"
                  />
                </div>

                <div className="flex items-end">
                  <button className="px-4 py-2 rounded-xl bg-zinc-100 text-zinc-900 hover:bg-white transition w-full">
                    Dodaj wpis
                  </button>
                </div>
              </form>
            </section>

            {/* Ranking inspektorów */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 shadow">
              <h3 className="font-medium text-zinc-100 mb-3">
                Suma per inspektor
              </h3>
              {perInspector.length === 0 ? (
                <p className="text-sm text-zinc-400">Brak danych.</p>
              ) : (
                <ul className="space-y-2">
                  {perInspector.map((p) => (
                    <li
                      key={p.inspectorId}
                      className="flex justify-between text-sm"
                    >
                      <span className="text-zinc-200">{p.name}</span>
                      <span className="font-medium text-zinc-100">
                        +{p.total}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Ostatnie wpisy */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 shadow">
              <h3 className="font-medium text-zinc-100 mb-3">Ostatnie wpisy</h3>
              {recent.length === 0 ? (
                <p className="text-sm text-zinc-400">Brak wpisów.</p>
              ) : (
                <ul className="space-y-2">
                  {recent.map((e) => (
                    <li key={e.id} className="flex justify-between text-sm">
                      <span className="text-zinc-200">
                        #{e.id} • {e.inspectorName} •{" "}
                        {new Date(e.createdAt as any).toLocaleString()}
                      </span>
                      <span className="font-medium text-zinc-100">
                        +{e.count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

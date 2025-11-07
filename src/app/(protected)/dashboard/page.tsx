import { auth } from "@clerk/nextjs/server";
import { SignOutButton } from "@clerk/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import AutoRefresh from "@/components/auto-refresh";

import { ensureUser } from "@/lib/provision";
import { db } from "@/db/client";
import { entries, requests, workDays, users } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";

const EntrySchema = z.object({
  requestId: z.coerce.number().int().positive(),
  workDayId: z.coerce.number().int().positive(),
  count: z.coerce.number().int().positive(),
  kind: z.enum(["small", "large", "coupled"]),
});

function parsePlanFromNotes(notes?: string | null) {
  if (!notes) return { small: undefined, large: undefined, coupled: undefined };

  const m1 = notes.match(/Małe:\s*(\d+)/i);
  const l1 = notes.match(/Duże:\s*(\d+)/i);
  const c1 = notes.match(/Sprzężone:\s*(\d+)/i);

  const small1 = m1 ? Number(m1[1]) : undefined;
  const large1 = l1 ? Number(l1[1]) : undefined;
  const coupled1 = c1 ? Number(c1[1]) : undefined;

  if (small1 || large1 || coupled1) {
    return { small: small1, large: large1, coupled: coupled1 };
  }

  const m2 = notes.match(/Qn<\s*15\s*:\s*(\d+)/i);
  const l2 = notes.match(/Qn>\s*15\s*:\s*(\d+)/i);
  const c2 = notes.match(/sprzężone\s*:\s*(\d+)/i);

  return {
    small: m2 ? Number(m2[1]) : undefined,
    large: l2 ? Number(l2[1]) : undefined,
    coupled: c2 ? Number(c2[1]) : undefined,
  };
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const me = await ensureUser();
  if (!me) redirect("/sign-in");

  const reqList = await db.select().from(requests).orderBy(desc(requests.id));
  const dayList = await db.select().from(workDays).orderBy(desc(workDays.date));

  const rawReq = searchParams?.req;
  const rawReqStr = Array.isArray(rawReq) ? rawReq[0] : rawReq;
  const selectedReqId = (() => {
    if (!rawReqStr) return undefined;
    const n = Number(rawReqStr);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  })();

  const currentReq =
    (selectedReqId
      ? reqList.find((r) => r.id === selectedReqId)
      : reqList[0]) ?? null;

  if (reqList.length === 0 || dayList.length === 0 || !currentReq) {
    return (
      <main className="min-h-dvh bg-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-5xl p-6 space-y-8">
          <header className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                {me.name ?? "Inspector"}
              </span>
              <SignOutButton redirectUrl="/sign-in">
                <button
                  type="button"
                  className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition"
                >
                  Wyloguj
                </button>
              </SignOutButton>
            </div>
          </header>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur p-6 shadow-md">
            <p className="text-zinc-200">
              Brak danych do pracy. Skontaktuj się z administratorem, aby dodać
              przynajmniej jeden <b>wniosek</b> i <b>dzień pracy</b>.
            </p>
          </section>
        </div>
      </main>
    );
  }

  const {
    small: planSmallRaw,
    large: planLargeRaw,
    coupled: planCoupledRaw,
  } = parsePlanFromNotes(currentReq.notes);

  const planSmall = planSmallRaw;
  const planLarge = planLargeRaw;
  const planCoupled = planCoupledRaw;
  const planTotal =
    (planSmall ?? 0) + (planLarge ?? 0) + (planCoupled ?? 0) ||
    currentReq.plannedCount;

  const doneAggRaw = await db
    .select({
      doneSmall: sql<number>`coalesce(sum(${entries.countSmall}), 0)`,
      doneLarge: sql<number>`coalesce(sum(${entries.countLarge}), 0)`,
      doneCoupled: sql<number>`coalesce(sum(${entries.countCoupled}), 0)`,
    })
    .from(entries)
    .where(eq(entries.requestId, currentReq.id))
    .then((r) => r[0] ?? { doneSmall: 0, doneLarge: 0, doneCoupled: 0 });

  const doneAgg = {
    doneSmall: Number(doneAggRaw.doneSmall ?? 0),
    doneLarge: Number(doneAggRaw.doneLarge ?? 0),
    doneCoupled: Number(doneAggRaw.doneCoupled ?? 0),
  };

  const doneTotal = doneAgg.doneSmall + doneAgg.doneLarge + doneAgg.doneCoupled;

  const planTotalN = Number(planTotal ?? 0);

  const percent =
    planTotalN > 0
      ? Math.min(100, Math.round((doneTotal / planTotalN) * 100))
      : 0;

  const remainingTotal = Math.max(0, planTotalN - doneTotal);
  const overflow = Math.max(0, doneTotal - planTotalN);

  const remainingSmall =
    planSmall !== undefined
      ? Math.max(0, planSmall - (doneAgg.doneSmall ?? 0))
      : undefined;
  const remainingLarge =
    planLarge !== undefined
      ? Math.max(0, planLarge - (doneAgg.doneLarge ?? 0))
      : undefined;
  const remainingCoupled =
    planCoupled !== undefined
      ? Math.max(0, planCoupled - (doneAgg.doneCoupled ?? 0))
      : undefined;

  const perInspector = await db
    .select({
      inspectorId: users.id,
      name: users.name,
      totalSmall: sql<number>`coalesce(sum(${entries.countSmall}), 0)`,
      totalLarge: sql<number>`coalesce(sum(${entries.countLarge}), 0)`,
      totalCoupled: sql<number>`coalesce(sum(${entries.countCoupled}), 0)`,
      totalAll: sql<number>`
        coalesce(sum(${entries.countSmall}), 0)
      + coalesce(sum(${entries.countLarge}), 0)
      + coalesce(sum(${entries.countCoupled}), 0)
      `,
    })
    .from(entries)
    .innerJoin(users, eq(entries.inspectorId, users.id))
    .where(eq(entries.requestId, currentReq.id))
    .groupBy(users.id, users.name)
    .orderBy(
      desc(
        sql`
        coalesce(sum(${entries.countSmall}), 0)
      + coalesce(sum(${entries.countLarge}), 0)
      + coalesce(sum(${entries.countCoupled}), 0)
      `
      )
    );

  const recent = await db
    .select({
      id: entries.id,
      createdAt: entries.createdAt,
      inspectorName: users.name,
      small: entries.countSmall,
      large: entries.countLarge,
      coupled: entries.countCoupled,
      total: sql<number>`
        (${entries.countSmall} + ${entries.countLarge} + ${entries.countCoupled})
      `,
    })
    .from(entries)
    .innerJoin(users, eq(entries.inspectorId, users.id))
    .where(eq(entries.requestId, currentReq.id))
    .orderBy(desc(entries.createdAt))
    .limit(12);

  async function addEntry(formData: FormData) {
    "use server";
    const rawCount = String(formData.get("count") ?? "0");
    const normalized = rawCount.replace(/\s+/g, "").replace(",", ".");
    const countParsed = Math.max(1, Math.floor(Number(normalized)));

    const payload = {
      requestId: formData.get("requestId"),
      workDayId: formData.get("workDayId"),
      count: countParsed,
      kind: formData.get("kind"),
    };

    const parsed = EntrySchema.safeParse(payload);
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
      countSmall: parsed.data.kind === "small" ? parsed.data.count : 0,
      countLarge: parsed.data.kind === "large" ? parsed.data.count : 0,
      countCoupled: parsed.data.kind === "coupled" ? parsed.data.count : 0,
    });

    revalidatePath("/dashboard");
  }

  const showAdmin =
    (me.email?.toLowerCase?.() ?? "") === "blazejbart@gmail.com";

  return (
    <main className="min-h-dvh bg-zinc-950 text-zinc-100">
      <AutoRefresh interval={5000} />
      <div className="mx-auto max-w-5xl p-6 space-y-8">
        <header className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>

          <div className="flex items-center gap-3">
            {showAdmin && (
              <Link
                href="/admin"
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition"
              >
                Panel admina
              </Link>
            )}
            <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              {me.name ?? "Inspector"}
            </span>
            <SignOutButton redirectUrl="/sign-in">
              <button
                type="button"
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition"
              >
                Wyloguj
              </button>
            </SignOutButton>
          </div>
        </header>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 shadow">
          <form method="get" className="flex items-center gap-3 flex-wrap">
            <label htmlFor="req" className="text-sm text-zinc-300">
              Wybierz wniosek:
            </label>
            <select
              id="req"
              name="req"
              defaultValue={currentReq?.id}
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 min-w-[280px]"
            >
              {reqList.map((r) => {
                // 🧩 Wyciągamy dane z notes (tak jak w admin/page.tsx)
                const nrMatch = r.notes?.match(/Nr wniosku:\s*([^;]+)/i);
                const dateMatch = r.notes?.match(
                  /Złożono:\s*(\d{4}-\d{2}-\d{2})/i
                );

                const applicationNumber = nrMatch
                  ? nrMatch[1].trim()
                  : "brak nr";
                const submittedStr = dateMatch ? dateMatch[1] : "";
                const submittedHuman = submittedStr
                  ? new Date(submittedStr + "T00:00:00").toLocaleDateString(
                      "pl-PL",
                      {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      }
                    )
                  : "brak daty";

                return (
                  <option key={r.id} value={r.id}>
                    {r.applicantName} — {applicationNumber} ({submittedHuman})
                  </option>
                );
              })}
            </select>
            <button
              type="submit"
              className="px-3 py-2 rounded-xl bg-zinc-100 text-zinc-900 hover:bg-white transition"
            >
              Pokaż
            </button>
          </form>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 shadow">
            <div className="text-xs text-zinc-400">Wnioskodawca</div>
            <div className="font-medium text-zinc-100">
              {currentReq.applicantName}
            </div>
            <div className="text-xs text-zinc-500">{currentReq.month}</div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 shadow">
            <div className="text-xs text-zinc-400">Plan (łącznie)</div>
            <div className="text-2xl font-semibold text-zinc-100">
              {planTotal}
            </div>
            <div className="mt-2 text-xs text-zinc-400 space-y-0.5">
              <div>
                Małe:{" "}
                <b className="text-zinc-300">
                  {planSmall !== undefined ? planSmall : "—"}
                </b>
              </div>
              <div>
                Duże:{" "}
                <b className="text-zinc-300">
                  {planLarge !== undefined ? planLarge : "—"}
                </b>
              </div>
              <div>
                Sprzężone:{" "}
                <b className="text-zinc-300">
                  {planCoupled !== undefined ? planCoupled : "—"}
                </b>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 shadow">
            <div className="text-xs text-zinc-400">Wykonano</div>
            <div className="text-2xl font-semibold text-zinc-100">
              {doneTotal}
            </div>
            <div className="mt-2 text-xs text-zinc-400 space-y-0.5">
              <div>
                Małe: <b className="text-zinc-300">{doneAgg.doneSmall}</b>
              </div>
              <div>
                Duże: <b className="text-zinc-300">{doneAgg.doneLarge}</b>
              </div>
              <div>
                Sprzężone:{" "}
                <b className="text-zinc-300">{doneAgg.doneCoupled}</b>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 shadow">
            <div className="text-xs text-zinc-400">Pozostało</div>
            <div className="text-2xl font-semibold text-zinc-100">
              {remainingTotal}
            </div>
            <div className="mt-2 text-xs text-zinc-400 space-y-0.5">
              <div>
                Małe:{" "}
                <b className="text-zinc-300">
                  {remainingSmall !== undefined ? remainingSmall : "—"}
                </b>
              </div>
              <div>
                Duże:{" "}
                <b className="text-zinc-300">
                  {remainingLarge !== undefined ? remainingLarge : "—"}
                </b>
              </div>
              <div>
                Sprzężone:{" "}
                <b className="text-zinc-300">
                  {remainingCoupled !== undefined ? remainingCoupled : "—"}
                </b>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 shadow space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-300">Postęp</span>
            <span className="text-zinc-200">{percent}%</span>
          </div>
          <div className="h-2 w-full bg-zinc-800 rounded">
            <div
              className="h-2 bg-emerald-500 rounded"
              style={{ width: `${percent}%` }}
            />
          </div>
          {overflow > 0 && (
            <div className="text-xs text-emerald-300">Nadwyżka +{overflow}</div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 shadow">
          <form
            action={addEntry}
            className="grid grid-cols-1 md:grid-cols-4 gap-3"
          >
            <input type="hidden" name="requestId" value={currentReq!.id} />

            <div>
              <label className="block text-sm text-zinc-400 mb-1">
                Dzień pracy
              </label>
              <select
                name="workDayId"
                className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 w-full"
                defaultValue={dayList[0]?.id}
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
                Typ wodomierza
              </label>
              <select
                name="kind"
                className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 w-full"
                defaultValue="small"
              >
                <option value="small">Mały (Qn ≤ 15 m³/h)</option>
                <option value="large">Duży (Qn &gt; 15 m³/h)</option>
                <option value="coupled">Sprzężony</option>
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
                inputMode="numeric"
                pattern="[0-9]*"
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

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 shadow">
          <h3 className="font-medium text-zinc-100 mb-3">Suma per inspektor</h3>
          {perInspector.length === 0 ? (
            <p className="text-sm text-zinc-400">Brak danych.</p>
          ) : (
            <ul className="space-y-2">
              {perInspector.map((p) => (
                <li key={p.inspectorId} className="text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-200">{p.name}</span>
                    <span className="font-medium text-zinc-100">
                      +{p.totalAll}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500">
                    m:{p.totalSmall} • d:{p.totalLarge} • s:{p.totalCoupled}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

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
                    +{e.total}{" "}
                    <span className="text-xs text-zinc-400">
                      (m:{e.small}, d:{e.large}, s:{e.coupled})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { users, requests, workDays } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { MonthCalendar } from "@/components/month-calendar"; // eksport nazwany

// ── Schematy ───────────────────────────────────────────────────────────────
// RequestSchema – to co zapisujemy w tabeli `requests`
const RequestSchema = z.object({
  applicantName: z.string().min(2),
  month: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
  plannedCount: z.coerce.number().int().nonnegative(),
  notes: z.string().optional().default(""),
});

// Dodatkowe pola formularza do policzenia plannedCount
const PlanBreakdownSchema = z.object({
  smallCount: z.coerce.number().int().min(0).default(0), // Qn ≤ 15 m³/h
  largeCount: z.coerce.number().int().min(0).default(0), // Qn > 15 m³/h
  coupledCount: z.coerce.number().int().min(0).default(0), // sprzężone
});

const WorkDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  isOpen: z.coerce.boolean().optional().default(true),
  notes: z.string().optional().default(""),
});

// ── Widok ──────────────────────────────────────────────────────────────────
export default async function AdminPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // minimalna autoryzacja (bez renderowania diagnostyki)
  const cu = await currentUser();
  const email = cu?.emailAddresses?.[0]?.emailAddress ?? null;
  const [me] = email
    ? await db.select().from(users).where(eq(users.email, email))
    : [];
  if (!me || me.role !== "ADMIN") redirect("/dashboard");

  // ── Akcje formularzy ─────────────────────────────────────────────────────
  async function addRequest(formData: FormData) {
    "use server";

    // 1) odczyt dodatkowych pól formularza
    const applicationNumber = String(
      formData.get("applicationNumber") ?? ""
    ).trim();
    const planParsed = PlanBreakdownSchema.safeParse({
      smallCount: formData.get("smallCount"),
      largeCount: formData.get("largeCount"),
      coupledCount: formData.get("coupledCount"),
    });
    if (!planParsed.success) {
      redirect("/admin?err=plan-validate");
    }

    const { smallCount, largeCount, coupledCount } = planParsed.data;
    const plannedTotal = smallCount + largeCount + coupledCount;

    // 2) standardowe pola requestu
    const reqParsed = RequestSchema.safeParse({
      applicantName: formData.get("applicantName"),
      month: formData.get("month"),
      plannedCount: plannedTotal,
      notes: formData.get("notes") ?? "",
    });
    if (!reqParsed.success) {
      redirect("/admin?err=request-validate");
    }

    // 3) złożenie notes: numer wniosku + rozbicie
    const baseNotes = reqParsed.data.notes?.toString().trim();
    const breakdown = `Qn≤15:${smallCount}, Qn>15:${largeCount}, sprzężone:${coupledCount}`;
    const withNumber = applicationNumber
      ? `Nr wniosku: ${applicationNumber}; ${breakdown}`
      : breakdown;

    const mergedNotes = baseNotes ? `${withNumber}; ${baseNotes}` : withNumber;

    await db.insert(requests).values({
      applicantName: reqParsed.data.applicantName,
      month: reqParsed.data.month,
      plannedCount: reqParsed.data.plannedCount,
      notes: mergedNotes,
    });

    redirect("/admin");
  }

  async function addWorkDay(formData: FormData) {
    "use server";
    const parsed = WorkDaySchema.safeParse({
      date: formData.get("date"),
      isOpen: formData.get("isOpen") === "on",
      notes: formData.get("notes"),
    });
    if (!parsed.success) {
      redirect("/admin?err=workday-validate");
    }
    await db.insert(workDays).values({
      date: parsed.data.date as any,
      isOpen: parsed.data.isOpen,
      notes: parsed.data.notes,
    });
    redirect("/admin");
  }

  // Podglądy list
  const lastRequests = await db
    .select()
    .from(requests)
    .orderBy(desc(requests.id))
    .limit(10);

  const lastDays = await db
    .select()
    .from(workDays)
    .orderBy(desc(workDays.date))
    .limit(10);

  return (
    <main className="min-h-dvh bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl p-6 space-y-8">
        <header className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">
            Panel Admina
          </h2>
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            {me.role}
          </span>
        </header>

        {/* FORM: Dodaj wniosek */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur p-5 space-y-4 shadow-md">
          <h3 className="font-medium text-zinc-100">Dodaj wniosek</h3>
          <form action={addRequest} className="grid md:grid-cols-4 gap-3">
            <input
              name="applicantName"
              placeholder="Wnioskodawca"
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-500 md:col-span-2"
              required
            />

            {/* Numer wniosku */}
            <input
              name="applicationNumber"
              placeholder="Numer wniosku (np. OUM03.WZ7.45.850.2025)"
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-500 md:col-span-2"
            />

            {/* Miesiąc (YYYY-MM) przez MonthCalendar */}
            <div className="md:col-span-2">
              <MonthCalendar name="month" label="Miesiąc" />
            </div>

            {/* Rozbicie planu */}
            <input
              name="smallCount"
              type="number"
              min={0}
              placeholder="Małe (Qn ≤ 15)"
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-500"
              required
            />
            <input
              name="largeCount"
              type="number"
              min={0}
              placeholder="Duże (Qn > 15)"
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-500"
              required
            />
            <input
              name="coupledCount"
              type="number"
              min={0}
              placeholder="Sprzężone"
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-500"
              required
            />

            {/* Dodatkowe uwagi (opcjonalnie) */}
            <input
              name="notes"
              placeholder="Uwagi (opcjonalnie)"
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-500 md:col-span-4"
            />

            <div className="md:col-span-4">
              <button className="px-4 py-2 rounded-xl bg-zinc-100 text-zinc-900 hover:bg-white transition w-full md:w-auto">
                Zapisz wniosek
              </button>
            </div>
          </form>

          <ul className="divide-y divide-zinc-800">
            {lastRequests.map((r) => (
              <li key={r.id} className="py-2 flex justify-between text-sm">
                <span className="text-zinc-200">
                  {r.applicantName} — {r.month}
                </span>
                <span className="text-zinc-300">Plan: {r.plannedCount}</span>
              </li>
            ))}
            {lastRequests.length === 0 && (
              <li className="py-2 text-zinc-400 text-sm">Brak wniosków.</li>
            )}
          </ul>
        </section>

        {/* FORM: Dodaj dzień pracy */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur p-5 space-y-4 shadow-md">
          <h3 className="font-medium text-zinc-100">Dodaj dzień pracy</h3>
          <form action={addWorkDay} className="grid md:grid-cols-4 gap-3">
            <input
              name="date"
              type="date"
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100"
              required
            />
            <label className="flex items-center gap-2 text-zinc-200">
              <input
                type="checkbox"
                name="isOpen"
                defaultChecked
                className="accent-emerald-500"
              />
              <span className="text-sm">Dzień otwarty</span>
            </label>
            <input
              name="notes"
              placeholder="Uwagi (opcjonalnie)"
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-500 md:col-span-2"
            />
            <div className="md:col-span-4">
              <button className="px-4 py-2 rounded-xl bg-zinc-100 text-zinc-900 hover:bg-white transition w-full md:w-auto">
                Zapisz dzień
              </button>
            </div>
          </form>

          <ul className="divide-y divide-zinc-800">
            {lastDays.map((d) => (
              <li key={d.id} className="py-2 flex justify-between text-sm">
                <span className="text-zinc-200">
                  {new Date(d.date as any).toLocaleDateString()}
                </span>
                <span className="text-zinc-300">
                  {d.isOpen ? "otwarty" : "zamknięty"}
                </span>
              </li>
            ))}
            {lastDays.length === 0 && (
              <li className="py-2 text-zinc-400 text-sm">Brak dni pracy.</li>
            )}
          </ul>
        </section>
      </div>
    </main>
  );
}

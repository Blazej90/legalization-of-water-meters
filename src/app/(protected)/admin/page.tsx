import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { users, requests, workDays } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { MonthCalendar } from "@/components/month-calendar"; // ← NOWY IMPORT

// ── Schematy ───────────────────────────────────────────────────────────────
const RequestSchema = z.object({
  applicantName: z.string().min(2),
  month: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
  plannedCount: z.coerce.number().int().positive(),
  notes: z.string().optional().default(""),
});

const WorkDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  isOpen: z.coerce.boolean().optional().default(true),
  notes: z.string().optional().default(""),
});

// ── Akcje naprawcze / seed ────────────────────────────────────────────────
async function makeMeAdmin() {
  "use server";
  const { userId } = await auth();
  if (!userId) return;
  const u = await currentUser();
  const email = u?.emailAddresses?.[0]?.emailAddress;
  if (!email) return;
  await db.update(users).set({ role: "ADMIN" }).where(eq(users.email, email));
  redirect("/admin");
}

async function seedSample() {
  "use server";
  await db.insert(requests).values({
    applicantName: "Wodociągi i Kanalizacja Opole",
    month: new Date().toISOString().slice(0, 7), // YYYY-MM
    plannedCount: 320 + 18 + 2,
    notes: "OUM03.WZ7.45.850.2025; Qn<15:320, Qn>15:18, sprzężone:2",
  });
  await db.insert(workDays).values({
    date: new Date() as any,
    isOpen: true,
    notes: "Start legalizacji (seed)",
  });
  redirect("/admin");
}

// ── Widok ──────────────────────────────────────────────────────────────────
export default async function AdminPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const cu = await currentUser();
  const email = cu?.emailAddresses?.[0]?.emailAddress ?? null;

  const [me] = email
    ? await db.select().from(users).where(eq(users.email, email))
    : [];

  const [{ cntReq }] = await db
    .select({ cntReq: sql<number>`count(*)` })
    .from(requests);
  const [{ cntDay }] = await db
    .select({ cntDay: sql<number>`count(*)` })
    .from(workDays);

  const issues: string[] = [];
  if (!email) issues.push("Brak e-maila z Clerk (currentUser).");
  if (!me) issues.push("Brak rekordu użytkownika w tabeli users.");
  if (me && me.role !== "ADMIN")
    issues.push(`Twoja rola w DB to "${me.role}", oczekiwano "ADMIN".`);
  if (cntReq === 0) issues.push("Brak wniosków (requests).");
  if (cntDay === 0) issues.push("Brak dni pracy (work_days).");

  async function addRequest(formData: FormData) {
    "use server";
    const parsed = RequestSchema.safeParse({
      applicantName: formData.get("applicantName"),
      month: formData.get("month"),
      plannedCount: formData.get("plannedCount"),
      notes: formData.get("notes"),
    });
    if (!parsed.success) redirect("/admin?err=request-validate");
    await db.insert(requests).values(parsed.data);
    redirect("/admin");
  }

  async function addWorkDay(formData: FormData) {
    "use server";
    const parsed = WorkDaySchema.safeParse({
      date: formData.get("date"),
      isOpen: formData.get("isOpen") === "on",
      notes: formData.get("notes"),
    });
    if (!parsed.success) redirect("/admin?err=workday-validate");
    await db.insert(workDays).values({
      date: parsed.data.date as any,
      isOpen: parsed.data.isOpen,
      notes: parsed.data.notes,
    });
    redirect("/admin");
  }

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
            Panel Admina — diagnostyka
          </h2>
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            {me?.role ?? "UNKNOWN"}
          </span>
        </header>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur p-5 space-y-4 shadow-md">
          <h3 className="font-medium text-zinc-100">Dodaj wniosek</h3>
          <form action={addRequest} className="grid md:grid-cols-4 gap-3">
            <input
              name="applicantName"
              placeholder="Wnioskodawca"
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-500"
              required
            />

            <div className="md:col-span-1">
              <MonthCalendar name="month" label="Miesiąc" />

              <input
                name="month"
                type="month"
                defaultValue={new Date().toISOString().slice(0, 7)}
                className="hidden"
                readOnly
              />
            </div>

            <input
              name="plannedCount"
              type="number"
              placeholder="Planowana liczba sztuk"
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-500"
              required
            />
            <input
              name="notes"
              placeholder="Uwagi (opcjonalnie)"
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-500"
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

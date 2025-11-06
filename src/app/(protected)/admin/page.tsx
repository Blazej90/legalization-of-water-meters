import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { users, requests, workDays } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { MonthCalendar } from "@/components/month-calendar";

// ── Schematy ───────────────────────────────────────────────────────────────
// Schema formularza (to, co przychodzi z <form/>)
const RequestFormSchema = z.object({
  applicantName: z.string().min(2),
  applicationNumber: z.string().optional().default(""),
  month: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
  submittedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  plannedSmall: z.coerce.number().int().min(0),
  plannedLarge: z.coerce.number().int().min(0),
  plannedCoupled: z.coerce.number().int().min(0),
  notes: z.string().optional().default(""),
});

// Schema do insertu w DB (zgodne z tabelą `requests`)
const RequestDBSchema = z.object({
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

// ── Widok ──────────────────────────────────────────────────────────────────
export default async function AdminPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const cu = await currentUser();
  const email = cu?.emailAddresses?.[0]?.emailAddress ?? null;

  const [me] = email
    ? await db.select().from(users).where(eq(users.email, email))
    : [];

  // Ostatnie wpisy do list
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

  // ── Server actions ───────────────────────────────────────────────────────
  async function addRequest(formData: FormData) {
    "use server";

    // 1) Parsujemy to, co przyszło z formularza
    const parsedForm = RequestFormSchema.safeParse({
      applicantName: formData.get("applicantName"),
      applicationNumber: formData.get("applicationNumber"),
      month: formData.get("month"),
      submittedAt: formData.get("submittedAt"),
      plannedSmall: formData.get("plannedSmall"),
      plannedLarge: formData.get("plannedLarge"),
      plannedCoupled: formData.get("plannedCoupled"),
      notes: formData.get("notes"),
    });

    if (!parsedForm.success) {
      redirect("/admin?err=request-validate");
    }

    const f = parsedForm.data;
    const plannedCountTotal =
      f.plannedSmall + f.plannedLarge + f.plannedCoupled;

    // 2) Składamy notes tak, aby lista mogła łatwo to zczytać RegExpem
    //    „Nr wniosku: ...; Złożono: YYYY-MM-DD; ...”
    const pieces: string[] = [];
    if (f.applicationNumber) pieces.push(`Nr wniosku: ${f.applicationNumber}`);
    if (f.submittedAt) pieces.push(`Złożono: ${f.submittedAt}`);
    if (f.notes) pieces.push(f.notes);
    const combinedNotes = pieces.join("; ");

    // 3) Tworzymy payload dla DB (zgodny z kolumnami)
    const dbPayload = RequestDBSchema.parse({
      applicantName: f.applicantName,
      month: f.month, // zostaje YYYY-MM (z MonthCalendar)
      plannedCount: plannedCountTotal,
      notes: combinedNotes,
    });

    await db.insert(requests).values(dbPayload);
    revalidatePath("/admin");
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
      date: parsed.data.date as any, // YYYY-MM-DD
      isOpen: parsed.data.isOpen,
      notes: parsed.data.notes,
    });

    // revalidate + redirect
    revalidatePath("/admin");
    redirect("/admin");
  }

  // ── UI ──────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-dvh bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl p-6 space-y-8">
        <header className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">
            Panel Admina
          </h2>
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            {me?.role ?? "UNKNOWN"}
          </span>
        </header>

        {/* FORM: Dodaj wniosek */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur p-5 space-y-4 shadow-md">
          <h3 className="font-medium text-zinc-100">Dodaj wniosek</h3>

          <form action={addRequest} className="grid md:grid-cols-4 gap-3">
            {/* Wnioskodawca (rozwijana, z domyślną wartością) */}
            <select
              name="applicantName"
              defaultValue="Wodociągi i Kanalizacja w Opolu"
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 md:col-span-2"
              required
            >
              <option value="Wodociągi i Kanalizacja w Opolu">
                Wodociągi i Kanalizacja w Opolu
              </option>
            </select>

            {/* Numer wniosku */}
            <input
              name="applicationNumber"
              placeholder="Numer wniosku (np. OUM03.WZ7.45.850.2025)"
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 md:col-span-2"
            />

            {/* Kalendarz: month (YYYY-MM) + submittedAt (YYYY-MM-DD) */}
            <MonthCalendar
              name="month"
              submitDateName="submittedAt"
              label="Data złożenia"
            />

            {/* Plan rozbity na 3 pola → sumowane do plannedCount */}
            <input
              name="plannedSmall"
              type="number"
              min={0}
              placeholder="Małe (Qn ≤ 15)"
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100"
              required
            />
            <input
              name="plannedLarge"
              type="number"
              min={0}
              placeholder="Duże (Qn > 15)"
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100"
              required
            />
            <input
              name="plannedCoupled"
              type="number"
              min={0}
              placeholder="Sprzężone"
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100"
              required
            />

            {/* Uwagi (opcjonalnie) */}
            <input
              name="notes"
              placeholder="Uwagi (opcjonalnie)"
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 md:col-span-4"
            />

            <div className="md:col-span-4">
              <button className="px-4 py-2 rounded-xl bg-zinc-100 text-zinc-900 hover:bg-white transition w-full md:w-auto">
                Zapisz wniosek
              </button>
            </div>
          </form>

          {/* Lista ostatnich wniosków */}
          <ul className="divide-y divide-zinc-800">
            {lastRequests.map((r: any) => {
              // Numer wniosku z notes: „Nr wniosku: ...”
              const nrMatch = r.notes?.match(/Nr wniosku:\s*([^;]+)/i);
              const applicationNumber = nrMatch ? nrMatch[1].trim() : "—";

              // Data złożenia z notes: „Złożono: YYYY-MM-DD”
              const dateMatch = r.notes?.match(
                /Złożono:\s*(\d{4}-\d{2}-\d{2})/i
              );
              const submittedStr = dateMatch ? dateMatch[1] : null;
              const submittedHuman = submittedStr
                ? new Date(submittedStr + "T00:00:00").toLocaleDateString(
                    "pl-PL",
                    {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    }
                  )
                : "—";

              return (
                <li key={r.id} className="py-2 text-sm">
                  <div className="text-zinc-200">{r.applicantName}</div>
                  <div className="text-zinc-400 text-xs">
                    Numer wniosku:{" "}
                    <b className="text-zinc-300">{applicationNumber}</b>
                  </div>
                  <div className="text-zinc-400 text-xs">
                    z dnia: <b className="text-zinc-300">{submittedHuman}</b>
                  </div>
                  <div className="text-zinc-400 text-xs">
                    Plan: <b className="text-zinc-300">{r.plannedCount}</b>
                  </div>
                </li>
              );
            })}
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
            {lastDays.map((d: any) => (
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

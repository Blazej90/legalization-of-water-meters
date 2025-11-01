import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { users, requests, workDays } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";

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
  revalidatePath("/admin");
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
  revalidatePath("/admin");
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
    if (!parsed.success) return;
    await db.insert(requests).values(parsed.data);
    revalidatePath("/admin");
  }

  async function addWorkDay(formData: FormData) {
    "use server";
    const parsed = WorkDaySchema.safeParse({
      date: formData.get("date"),
      isOpen: formData.get("isOpen") === "on",
      notes: formData.get("notes"),
    });
    if (!parsed.success) return;
    await db.insert(workDays).values({
      date: parsed.data.date as any,
      isOpen: parsed.data.isOpen,
      notes: parsed.data.notes,
    });
    revalidatePath("/admin");
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

        {/* DIAGNOSTYKA */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur p-5 space-y-3 shadow-md">
          <div className="text-sm leading-relaxed">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <div>
                <span className="text-zinc-400">Clerk userId:</span>{" "}
                <code className="text-zinc-200">{cu?.id ?? "—"}</code>
              </div>
              <div>
                <span className="text-zinc-400">E-mail (Clerk):</span>{" "}
                <code className="text-zinc-200">{email ?? "—"}</code>
              </div>
              <div>
                <span className="text-zinc-400">Rekord w DB:</span>{" "}
                {me ? (
                  <span className="text-zinc-200">
                    id={me.id}, role=
                    <b className="text-emerald-300">{me.role}</b>
                  </span>
                ) : (
                  <span className="text-amber-300">—</span>
                )}
              </div>
              <div>
                <span className="text-zinc-400">Requests w DB:</span>{" "}
                <b className="text-zinc-200">{cntReq}</b>{" "}
                <span className="text-zinc-400">• Work days:</span>{" "}
                <b className="text-zinc-200">{cntDay}</b>
              </div>
            </div>
          </div>

          {issues.length === 0 ? (
            <div className="text-emerald-300 text-sm">
              ✅ Wszystko wygląda OK — przejdź do dodawania danych poniżej lub
              od razu na <code className="text-emerald-200">/dashboard</code>.
            </div>
          ) : (
            <ul className="list-disc pl-5 text-sm text-amber-300">
              {issues.map((i, idx) => (
                <li key={idx}>{i}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-3 pt-1">
            <form action={makeMeAdmin}>
              <button className="px-4 py-2 rounded-xl bg-zinc-100 text-zinc-900 hover:bg-white transition">
                Nadaj mi rolę ADMIN
              </button>
            </form>
            <form action={seedSample}>
              <button className="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 transition">
                Dodaj przykładowe dane
              </button>
            </form>
          </div>

          <p className="text-xs text-zinc-400">
            Uwaga: jeśli po kliknięciu przycisków nic się nie zmienia, sprawdź
            czy aplikacja i skrypty używają <b>tego samego</b> DATABASE_URL w{" "}
            <code className="text-zinc-300">.env.local</code>.
          </p>
        </section>

        {/* FORM: Dodaj wniosek */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur p-5 space-y-4 shadow-md">
          <h3 className="font-medium text-zinc-100">Dodaj wniosek</h3>
          <form action={addRequest} className="grid md:grid-cols-4 gap-3">
            <input
              name="applicantName"
              placeholder="Wnioskodawca"
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-500"
              required
            />
            <input
              name="month"
              type="month"
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100"
              required
            />
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

import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { users, requests, workDays } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { SignOutButton } from "@clerk/nextjs";
import Link from "next/link";
import { MonthCalendar } from "@/components/month-calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

const RequestSchema = z.object({
  applicantName: z.string().min(2),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  plannedCount: z.coerce.number().int().positive(),
  notes: z.string().optional().default(""),
});

const WorkDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isOpen: z.coerce.boolean().optional().default(true),
  notes: z.string().optional().default(""),
});

export default async function AdminPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const u = await currentUser();
  const emailLower = u?.emailAddresses?.[0]?.emailAddress?.toLowerCase();
  if (emailLower !== "blazejbart@gmail.com") {
    redirect("/dashboard");
  }

  const [me] = emailLower
    ? await db.select().from(users).where(eq(users.email, emailLower))
    : [];

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

  async function addRequest(formData: FormData) {
    "use server";

    const plannedSmall = Number(formData.get("plannedSmall") ?? 0) || 0;
    const plannedLarge = Number(formData.get("plannedLarge") ?? 0) || 0;
    const plannedCoupled = Number(formData.get("plannedCoupled") ?? 0) || 0;
    const plannedCountTotal = plannedSmall + plannedLarge + plannedCoupled;

    const rawMonth = String(formData.get("month") ?? "");
    const month = rawMonth.slice(0, 7);
    const submittedAt = String(formData.get("submittedAt") ?? "");

    const applicationNumber = String(
      formData.get("applicationNumber") ?? ""
    ).trim();
    const extraNotes = String(formData.get("notes") ?? "").trim();

    const pieces = [
      applicationNumber ? `Nr wniosku: ${applicationNumber}` : null,
      submittedAt ? `Złożono: ${submittedAt}` : null,
      extraNotes || null,
    ].filter(Boolean);
    const combinedNotes = pieces.join("; ");

    const payload = {
      applicantName: String(formData.get("applicantName") ?? ""),
      month,
      plannedCount: plannedCountTotal,
      notes: combinedNotes,
    };

    const parsed = RequestSchema.safeParse(payload);
    if (!parsed.success) {
      redirect("/admin?err=request-validate");
    }

    await db.insert(requests).values(parsed.data);
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
      date: parsed.data.date as any,
      isOpen: parsed.data.isOpen,
      notes: parsed.data.notes,
    });

    redirect("/admin");
  }

  async function deleteRequest(formData: FormData) {
    "use server";
    if (formData.get("confirm") !== "on") {
      redirect("/admin?err=confirm-required");
    }

    const id = Number(formData.get("requestId"));
    if (!Number.isFinite(id)) redirect("/admin?err=bad-request-id");

    try {
      await db.delete(requests).where(eq(requests.id, id));
      revalidatePath("/admin");
    } catch {
      redirect("/admin?err=delete-failed");
    }
    redirect("/admin");
  }

  return (
    <main className="min-h-dvh bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl p-6 space-y-8">
        <header className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">
            Panel Admina
          </h2>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs hover:bg-blue-400 transition"
            >
              Przejdź do dashboardu
            </Link>

            <SignOutButton>
              <button className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs hover:bg-red-500 transition">
                Wyloguj
              </button>
            </SignOutButton>
          </div>
        </header>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur p-5 space-y-4 shadow-md">
          <h3 className="font-medium text-zinc-100">Dodaj wniosek</h3>

          <form action={addRequest} className="grid gap-4 md:grid-cols-6">
            <div className="md:col-span-4">
              <label className="text-sm text-zinc-300 mb-1 block">
                Wnioskodawca
              </label>
              <select
                name="applicantName"
                defaultValue="Wodociągi i Kanalizacja w Opolu"
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100"
                required
              >
                <option value="Wodociągi i Kanalizacja w Opolu">
                  Wodociągi i Kanalizacja w Opolu
                </option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-sm text-zinc-300 mb-1 block">
                Numer wniosku
              </label>
              <input
                name="applicationNumber"
                placeholder="np. OUM03.WZ7.45.850.2025"
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100"
              />
            </div>

            <div className="md:col-span-2">
              <MonthCalendar
                name="month"
                submitDateName="submittedAt"
                label="Data złożenia"
              />
            </div>

            <div className="md:col-span-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-sm text-zinc-300 mb-1 block">
                  Małe (<span className="italic">Q</span>
                  <sub>n</sub> ≤ 15&nbsp;m<sup>3</sup>/h)
                </label>
                <input
                  name="plannedSmall"
                  type="number"
                  min={0}
                  className="w-full px-2 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-center"
                  required
                />
              </div>

              <div>
                <label className="text-sm text-zinc-300 mb-1 block">
                  Duże (<span className="italic">Q</span>
                  <sub>n</sub> &gt; 15&nbsp;m<sup>3</sup>/h)
                </label>
                <input
                  name="plannedLarge"
                  type="number"
                  min={0}
                  className="w-full px-2 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-center"
                  required
                />
              </div>

              <div>
                <label className="text-sm text-zinc-300 mb-1 block">
                  Sprzężone
                </label>
                <input
                  name="plannedCoupled"
                  type="number"
                  min={0}
                  className="w-full px-2 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-center"
                  required
                />
              </div>
            </div>

            <div className="md:col-span-6">
              <label className="text-sm text-zinc-300 mb-1 block">
                Uwagi (opcjonalnie)
              </label>
              <Textarea
                name="notes"
                rows={6}
                className="w-full min-h-[140px] max-h-60 bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-500 rounded-xl resize-y"
                placeholder="Dodaj uwagi dotyczące wniosku…"
              />
            </div>

            <div className="md:col-span-6 flex justify-end">
              <button className="px-4 py-2 rounded-xl bg-zinc-100 text-zinc-900 hover:bg-white transition">
                Zapisz wniosek
              </button>
            </div>
          </form>

          <ScrollArea className="h-64 rounded-lg border border-zinc-800">
            <ul className="divide-y divide-zinc-800">
              {lastRequests.map((r: any) => {
                const nrMatch = r.notes?.match(/Nr wniosku:\s*([^;]+)/i);
                const applicationNumber = nrMatch ? nrMatch[1].trim() : "—";

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
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-zinc-200">{r.applicantName}</div>
                        <div className="text-zinc-400 text-xs">
                          Numer wniosku:{" "}
                          <b className="text-zinc-300">{applicationNumber}</b>
                        </div>
                        <div className="text-zinc-400 text-xs">
                          z dnia:{" "}
                          <b className="text-zinc-300">{submittedHuman}</b>
                        </div>
                        <div className="text-zinc-400 text-xs">
                          Plan:{" "}
                          <b className="text-zinc-300">{r.plannedCount}</b>
                        </div>
                      </div>

                      <form
                        action={deleteRequest}
                        className="shrink-0 flex items-center gap-2"
                      >
                        <input type="hidden" name="requestId" value={r.id} />
                        <label className="text-xs text-zinc-400 flex items-center gap-1">
                          <input
                            type="checkbox"
                            name="confirm"
                            required
                            className="align-middle"
                          />
                          potwierdzam
                        </label>
                        <button className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-500 text-xs">
                          Usuń
                        </button>
                      </form>
                    </div>
                  </li>
                );
              })}
              {lastRequests.length === 0 && (
                <li className="py-2 text-zinc-400 text-sm">Brak wniosków.</li>
              )}
            </ul>
          </ScrollArea>
        </section>

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

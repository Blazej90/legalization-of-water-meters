import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

export default async function Dashboard() {
  const { userId } = await auth();
  if (!userId) {
    return (
      <main className="p-6">
        <p>Musisz być zalogowany.</p>
        <Link className="underline" href="/sign-in">
          Przejdź do logowania
        </Link>
      </main>
    );
  }

  return (
    <main className="p-6">
      <h2 className="text-xl font-semibold">Dashboard</h2>
      <p className="text-zinc-600">Tu wyląduje panel postępu legalizacji.</p>
    </main>
  );
}

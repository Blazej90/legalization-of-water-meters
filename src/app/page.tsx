"use client";

import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, useUser } from "@clerk/nextjs";

export default function Home() {
  const { user } = useUser();
  const email =
    user?.primaryEmailAddress?.emailAddress?.toLowerCase() ??
    user?.emailAddresses?.[0]?.emailAddress?.toLowerCase() ??
    "";

  const isAdmin = email === "blazejbart@gmail.com";

  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-2xl font-semibold">Legalizacja Wodomierzy</h1>
        <p className="text-zinc-600">
          Rejestruj liczbę zalegalizowanych sztuk i śledź postęp względem planu.
        </p>

        <SignedOut>
          <SignInButton>
            <button className="px-4 py-2 rounded-lg bg-zinc-900 text-white w-full">
              Zaloguj się
            </button>
          </SignInButton>
        </SignedOut>

        <SignedIn>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/dashboard"
              className="px-4 py-2 rounded-lg bg-zinc-900 text-white inline-block"
            >
              Przejdź do dashboardu
            </Link>

            {isAdmin && (
              <Link
                href="/admin"
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white inline-block hover:bg-emerald-500"
              >
                Panel admina
              </Link>
            )}
          </div>
        </SignedIn>
      </div>
    </main>
  );
}

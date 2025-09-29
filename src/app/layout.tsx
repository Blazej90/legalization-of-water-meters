import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Legalizacja Wodomierzy",
  description: "Panel do ewidencji legalizacji wodomierzy",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="pl">
        <body className="min-h-dvh bg-zinc-50 text-zinc-900">{children}</body>
      </html>
    </ClerkProvider>
  );
}

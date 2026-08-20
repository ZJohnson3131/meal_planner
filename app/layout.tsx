import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meal Planner",
  description: "Plan dinners, track pantry stock, and generate shopping lists.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // A fresh CSP nonce exists only for an incoming request. Keep the root
  // dynamic so Next.js can attach that nonce to framework scripts and styles.
  await connection();

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

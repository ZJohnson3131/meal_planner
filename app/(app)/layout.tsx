import type { ReactNode } from "react";
import { AppNav } from "@/components/app-nav";
import { requireHousehold } from "@/lib/auth/household";

export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireHousehold();

  return (
    <div className="min-h-screen bg-slate-50">
      <AppNav />
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}

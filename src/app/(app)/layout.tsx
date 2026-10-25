import { redirect } from "next/navigation";
import { AppShell } from "@presentation/components/app-shell";
import { getSession } from "@lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  return <AppShell userEmail={session.email} role={session.role}>{children}</AppShell>;
}

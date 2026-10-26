import { redirect } from "next/navigation";
import { AppShell } from "@presentation/components/app-shell";
import { getSession } from "@lib/auth";
import { isEvaluationPreviewEnabled, isEvaluationResetConfigured } from "@lib/evaluation-api";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const showEvaluationReset = isEvaluationPreviewEnabled() && isEvaluationResetConfigured();
  return <AppShell userEmail={session.email} role={session.role} showEvaluationReset={showEvaluationReset}>{children}</AppShell>;
}

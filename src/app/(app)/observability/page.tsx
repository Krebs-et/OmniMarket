import { redirect } from "next/navigation";
import { getApiObservability } from "@application/use-cases/get-api-observability";
import { can } from "@domain/value-objects/role";
import { getSession } from "@lib/auth";
import { ObservabilityView } from "@presentation/components/observability-view";

export const dynamic = "force-dynamic";

export default async function ObservabilityPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "observability:read")) redirect("/");

  const snapshot = await getApiObservability();
  return <ObservabilityView snapshot={snapshot} />;
}

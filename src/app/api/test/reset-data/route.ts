import { resetEvaluationData } from "@application/use-cases/reset-evaluation-data";
import { evaluationResetAuthorizationResponse } from "@lib/evaluation-api";
import { withApiObservability } from "@lib/api-observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function resetEvaluationDataRoute(request: Request) {
  const authorizationResponse = evaluationResetAuthorizationResponse(request);
  if (authorizationResponse) return authorizationResponse;

  return Response.json({
    status: "reset",
    ...(await resetEvaluationData()),
  });
}

export const POST = withApiObservability("POST", "/api/test/reset-data", resetEvaluationDataRoute);

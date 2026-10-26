import { timingSafeEqual } from "node:crypto";

export function isEvaluationApiEnabled() {
  return process.env.APP_ENV === "evaluation"
    && process.env.EVALUATION_API_ENABLED === "true"
    && process.env.VERCEL_ENV !== "production"
    && (process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview");
}

export function isEvaluationPreviewEnabled() {
  return process.env.VERCEL_ENV === "preview" && isEvaluationApiEnabled();
}

export function isEvaluationResetConfigured() {
  const secret = process.env.EVALUATION_RESET_SECRET;
  return Boolean(secret && Buffer.byteLength(secret) >= 32);
}

export function evaluationApiDisabledResponse() {
  return isEvaluationApiEnabled()
    ? null
    : Response.json({ error: "Not found" }, { status: 404 });
}

export function evaluationResetAuthorizationResponse(request: Request) {
  const disabledResponse = evaluationApiDisabledResponse();
  if (disabledResponse) return disabledResponse;

  const expectedToken = process.env.EVALUATION_RESET_SECRET;
  if (!isEvaluationResetConfigured() || !expectedToken) {
    return Response.json({ error: "Evaluation reset is not configured" }, { status: 503 });
  }

  const providedToken = request.headers.get("x-evaluation-reset-secret");
  if (!providedToken) {
    return Response.json({ error: "Evaluation reset authorization required" }, { status: 401 });
  }

  const expected = Buffer.from(expectedToken);
  const provided = Buffer.from(providedToken);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return Response.json({ error: "Evaluation reset authorization failed" }, { status: 401 });
  }

  return null;
}

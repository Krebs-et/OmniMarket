import { afterEach, describe, expect, it, vi } from "vitest";
import {
  evaluationApiDisabledResponse,
  evaluationResetAuthorizationResponse,
  isEvaluationApiEnabled,
} from "../src/lib/evaluation-api";

afterEach(() => vi.unstubAllEnvs());

describe("evaluation API safeguards", () => {
  it("enables evaluation routes only in explicitly enabled non-production deployments", () => {
    vi.stubEnv("APP_ENV", "evaluation");
    vi.stubEnv("EVALUATION_API_ENABLED", "true");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(isEvaluationApiEnabled()).toBe(true);

    vi.stubEnv("APP_ENV", "production");
    expect(evaluationApiDisabledResponse()?.status).toBe(404);
    vi.stubEnv("APP_ENV", "evaluation");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(evaluationApiDisabledResponse()?.status).toBe(404);
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(evaluationApiDisabledResponse()?.status).toBe(404);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("EVALUATION_API_ENABLED", "false");
    expect(evaluationApiDisabledResponse()?.status).toBe(404);
  });

  it("requires a dedicated, sufficiently long reset secret", () => {
    vi.stubEnv("APP_ENV", "evaluation");
    vi.stubEnv("EVALUATION_API_ENABLED", "true");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("EVALUATION_RESET_SECRET", "");
    expect(evaluationResetAuthorizationResponse(new Request("https://example.test/api/test/reset-data"))?.status).toBe(503);

    const secret = "evaluation-reset-secret-with-at-least-32-bytes";
    vi.stubEnv("EVALUATION_RESET_SECRET", secret);
    expect(evaluationResetAuthorizationResponse(new Request("https://example.test/api/test/reset-data"))?.status).toBe(401);
    expect(evaluationResetAuthorizationResponse(new Request("https://example.test/api/test/reset-data", {
      headers: { "x-evaluation-reset-secret": "invalid-token" },
    }))?.status).toBe(401);
    expect(evaluationResetAuthorizationResponse(new Request("https://example.test/api/test/reset-data", {
      headers: { "x-evaluation-reset-secret": secret },
    }))).toBeNull();
  });
});

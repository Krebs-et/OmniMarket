import { describe, expect, it } from "vitest";
import { createOAuthProviders } from "../src/lib/oauth-providers";

describe("OAuth provider configuration", () => {
  it("requires explicit account linking for Google and GitHub", () => {
    const { providers, configuredProviders } = createOAuthProviders({
      AUTH_GOOGLE_ID: "google-client",
      AUTH_GOOGLE_SECRET: "google-secret",
      AUTH_GITHUB_ID: "github-client",
      AUTH_GITHUB_SECRET: "github-secret",
    });

    expect(configuredProviders.map(({ id }) => id)).toEqual(["google", "github"]);
    expect(providers.map(({ id }) => id)).toEqual(["google", "github"]);
    expect(providers.every(({ allowDangerousEmailAccountLinking }) => (
      allowDangerousEmailAccountLinking !== true
    ))).toBe(true);
  });

  it("does not configure a provider unless both credentials are present", () => {
    const { providers, configuredProviders } = createOAuthProviders({
      AUTH_GOOGLE_ID: "google-client",
      AUTH_GITHUB_SECRET: "github-secret",
    });

    expect(providers).toHaveLength(0);
    expect(configuredProviders).toHaveLength(0);
  });
});

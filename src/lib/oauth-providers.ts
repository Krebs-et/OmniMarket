import type { OAuthConfig } from "next-auth/providers";
import Google from "next-auth/providers/google";
import type { GoogleProfile } from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import type { GitHubProfile } from "next-auth/providers/github";

type OAuthEnvironment = Partial<Pick<
  NodeJS.ProcessEnv,
  "AUTH_GOOGLE_ID" | "AUTH_GOOGLE_SECRET" | "AUTH_GITHUB_ID" | "AUTH_GITHUB_SECRET"
>>;

export type ConfiguredOAuthProvider = {
  id: string;
  name: string;
};

export function createOAuthProviders(env: OAuthEnvironment = {
  AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
  AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
  AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
  AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,
}) {
  const providers: (OAuthConfig<GoogleProfile> | OAuthConfig<GitHubProfile>)[] = [];
  const configuredProviders: ConfiguredOAuthProvider[] = [];

  if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) {
    providers.push(Google<GoogleProfile>({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: false,
    }));
    configuredProviders.push({ id: "google", name: "Google" });
  }

  if (env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET) {
    providers.push(GitHub({
      clientId: env.AUTH_GITHUB_ID,
      clientSecret: env.AUTH_GITHUB_SECRET,
      allowDangerousEmailAccountLinking: false,
    }));
    configuredProviders.push({ id: "github", name: "GitHub" });
  }

  return { providers, configuredProviders };
}

import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@infrastructure/db/client";
import { authAccounts, authSessions, authUsers, authVerificationTokens } from "@infrastructure/db/schema";
import { createOAuthProviders } from "@lib/oauth-providers";

const { providers, configuredProviders } = createOAuthProviders();

const adapter = process.env.DATABASE_URL
  ? DrizzleAdapter(getDb(), {
      usersTable: authUsers,
      accountsTable: authAccounts,
      sessionsTable: authSessions,
      verificationTokensTable: authVerificationTokens,
    })
  : undefined;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  providers,
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.userId = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = String(token.userId ?? token.sub ?? "");
      return session;
    },
  },
});

export function getConfiguredOAuthProviders() {
  return configuredProviders;
}

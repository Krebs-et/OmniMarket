import { getConfiguredOAuthProviders } from "../../../auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const demoLoginEnabled = process.env.NODE_ENV !== "production" && process.env.APP_ENV !== "production";
  return <LoginForm providers={getConfiguredOAuthProviders()} demoLoginEnabled={demoLoginEnabled} />;
}

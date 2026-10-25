import { getConfiguredOAuthProviders } from "../../../auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;
  const demoLoginEnabled = process.env.NODE_ENV !== "production" && process.env.APP_ENV !== "production";
  const oauthError = error === "OAuthAccountNotLinked"
    ? "Este correo ya está asociado a otro proveedor. Inicia sesión con el proveedor vinculado; por seguridad, las cuentas no se enlazan automáticamente."
    : "";
  return <LoginForm providers={getConfiguredOAuthProviders()} demoLoginEnabled={demoLoginEnabled} initialError={oauthError} />;
}

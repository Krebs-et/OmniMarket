"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

type OAuthProvider = { id: string; name: string };

function ProviderIcon({ id }: { id: string }) {
  if (id === "github") return <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.15-1.11-1.46-1.11-1.46-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.9.83.09-.64.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" /></svg>;
  if (id === "google") return <svg aria-hidden="true" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h5.9a5.04 5.04 0 0 1-2.19 3.31v2.75h3.54c2.07-1.91 3.25-4.72 3.25-8.3Z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.54-2.75c-.98.66-2.24 1.05-3.74 1.05-2.87 0-5.3-1.94-6.17-4.55H2.18v2.84A11 11 0 0 0 12 23Z" /><path fill="#FBBC05" d="M5.83 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.65-2.84Z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.07.56 4.21 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.65 2.84C6.7 7.32 9.13 5.38 12 5.38Z" /></svg>;
  return null;
}

export function LoginForm({ providers, demoLoginEnabled, initialError }: { providers: OAuthProvider[]; demoLoginEnabled: boolean; initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("demo@omnimarket.local");
  const [password, setPassword] = useState("omnimarket");
  const [error, setError] = useState(initialError ?? "");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "No se pudo iniciar sesión.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servicio de inicio de sesión.");
    } finally {
      setLoading(false);
    }
  }

  async function loginWithProvider(providerId: string) {
    setLoading(true);
    setError("");
    try {
      await signIn(providerId, { redirectTo: "/" });
    } catch {
      setError("No se pudo iniciar el acceso con el proveedor seleccionado.");
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-visual">
        <div className="brand-mark">O</div>
        <p className="eyebrow">OMNIMARKET · OPERATIONS HUB</p>
        <h1>Claridad operativa para cada pedido.</h1>
        <p className="login-description">Conecta tus operaciones, identifica bloqueos y mueve el negocio con una sola vista.</p>
        <ul className="login-points">
          <li>Tablero Kanban con actualización en tiempo real</li>
          <li>Inventario y pedidos con trazabilidad completa</li>
          <li>Indicadores financieros siempre a la vista</li>
        </ul>
      </section>
      <section className="login-panel">
        <div className="login-form-wrap">
          <span className="mobile-brand">OMNIMARKET</span>
          <h2>Bienvenido de nuevo</h2>
          <p>Ingresa a tu centro de operaciones.</p>
          {providers.map((provider) => <button className="oauth-button" key={provider.id} type="button" disabled={loading} onClick={() => void loginWithProvider(provider.id)}><ProviderIcon id={provider.id} />Continuar con {provider.name}</button>)}
          {providers.length > 0 && demoLoginEnabled && <div className="login-divider"><span>o usa acceso local</span></div>}
          {demoLoginEnabled && <form onSubmit={submit}>
            <label htmlFor="email">Correo electrónico</label>
            <input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <label htmlFor="password">Contraseña</label>
            <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="primary-button login-button" disabled={loading}>{loading ? "Ingresando..." : "Entrar al dashboard"}<span aria-hidden="true">→</span></button>
          </form>}
          {!demoLoginEnabled && providers.length === 0 && <div className="form-error" role="alert">El acceso OAuth no está configurado. Contacta al administrador.</div>}
          {demoLoginEnabled && <div className="demo-hint"><span className="hint-dot" /> Demo local · demo@omnimarket.local</div>}
          {error && !demoLoginEnabled && <div className="form-error" role="alert">{error}</div>}
        </div>
        <footer>© 2026 OmniMarket · Operations Hub</footer>
      </section>
    </main>
  );
}

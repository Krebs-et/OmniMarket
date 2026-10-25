"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

type OAuthProvider = { id: string; name: string };

export function LoginForm({ providers, demoLoginEnabled }: { providers: OAuthProvider[]; demoLoginEnabled: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("demo@omnimarket.local");
  const [password, setPassword] = useState("omnimarket");
  const [error, setError] = useState("");
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
        <div className="login-stat"><span>Pedidos procesados hoy</span><strong>1,284</strong><small>↑ 18.4% vs. ayer</small></div>
      </section>
      <section className="login-panel">
        <div className="login-form-wrap">
          <span className="mobile-brand">OMNIMARKET</span>
          <h2>Bienvenido de nuevo</h2>
          <p>Ingresa a tu centro de operaciones.</p>
          {providers.map((provider) => <button className="oauth-button" key={provider.id} type="button" disabled={loading} onClick={() => void loginWithProvider(provider.id)}>Continuar con {provider.name}</button>)}
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

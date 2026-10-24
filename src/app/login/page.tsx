"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("demo@omnimarket.local");
  const [password, setPassword] = useState("omnimarket");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "No se pudo iniciar sesión.");
      setLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
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
          <form onSubmit={submit}>
            <label htmlFor="email">Correo electrónico</label>
            <input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <label htmlFor="password">Contraseña</label>
            <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="primary-button login-button" disabled={loading}>{loading ? "Ingresando..." : "Entrar al dashboard"}<span aria-hidden="true">→</span></button>
          </form>
          <div className="demo-hint"><span className="hint-dot" /> Demo local · demo@omnimarket.local</div>
        </div>
        <footer>© 2026 OmniMarket · MVP local</footer>
      </section>
    </main>
  );
}

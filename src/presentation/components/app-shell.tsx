"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Icon } from "./shared";

const sections: { href: Route; label: string; icon: string }[] = [
  { href: "/", label: "Resumen", icon: "grid" },
  { href: "/orders", label: "Pedidos", icon: "layers" },
  { href: "/analytics", label: "Analítica", icon: "chart" },
];

export function AppShell({ userEmail, children }: { userEmail: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const current = sections.find((section) => section.href === "/" ? pathname === "/" : pathname.startsWith(section.href)) ?? sections[0];

  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="app-shell">
      {menuOpen && <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <aside className={`sidebar ${menuOpen ? "is-open" : ""}`} id="sidebar">
        <div className="brand"><span className="brand-mark small">O</span><span>OMNIMARKET</span></div>
        <nav className="main-nav" aria-label="Navegación principal">
          {sections.map((section) => <Link key={section.href} className={`nav-item ${section === current ? "active" : ""}`} href={section.href} aria-current={section === current ? "page" : undefined}><Icon name={section.icon} />{section.label}</Link>)}
        </nav>
        <div className="sidebar-bottom"><div className="online"><span /> Sistema operativo</div><button className="nav-item logout" onClick={logout}><Icon name="logout" />Cerrar sesión</button></div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <button className="menu-button" type="button" aria-label="Abrir menú" aria-expanded={menuOpen} aria-controls="sidebar" onClick={() => setMenuOpen((open) => !open)}><Icon name="menu" /></button>
          <div className="mobile-brand"><span className="brand-mark small">O</span> OMNIMARKET</div>
          <div className="breadcrumb"><span>Workspace</span><b>/</b><strong>{current.label}</strong></div>
          <div className="topbar-actions"><span className="live-status"><i /> Datos en vivo</span><div className="avatar" title={userEmail} aria-label={`Sesión de ${userEmail}`}>{userEmail.slice(0, 2).toUpperCase()}</div></div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}

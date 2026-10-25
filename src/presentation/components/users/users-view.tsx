"use client";

import { useEffect, useState } from "react";
import type { Role } from "@domain/value-objects/role";
import { Alerts, fetchJson } from "../shared";

type ManagedUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: Role;
  effectiveRole: Role;
  configuredAdmin: boolean;
};
const labels: Record<Role, string> = { admin: "Administrador", operator: "Operador", viewer: "Solo lectura" };

export function UsersView() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    try {
      setUsers(await fetchJson<ManagedUser[]>("/api/users"));
      setError(null);
    } catch {
      setError("No se pudo cargar la lista de usuarios.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadUsers(); }, []);

  async function changeRole(user: ManagedUser, role: Role) {
    setBusyId(user.id);
    setError(null);
    setNotice(null);
    try {
      await fetchJson(`/api/users/${encodeURIComponent(user.id)}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      setNotice(`Rol de ${user.email ?? user.name ?? "usuario"} actualizado a ${labels[role]}.`);
      await loadUsers();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "No se pudo actualizar el rol.");
    } finally {
      setBusyId(null);
    }
  }

  return <>
    <section className="welcome-row">
      <div><p className="eyebrow">Administración</p><h1>Usuarios y roles</h1><p className="subheading">Controla el acceso operativo por usuario.</p></div>
    </section>
    <Alerts error={error} notice={notice} onClearError={() => setError(null)} onClearNotice={() => setNotice(null)} />
    <section className="table-card" aria-label="Usuarios registrados" aria-busy={loading}>
      <div className="table-scroll"><table className="orders-table">
        <thead><tr><th>Usuario</th><th>Correo</th><th>Rol efectivo</th><th>Asignación</th></tr></thead>
        <tbody>
          {users.map((user) => <tr key={user.id}>
            <td>{user.name ?? "—"}</td><td>{user.email ?? "—"}</td>
            <td><span className={`pill ${user.effectiveRole === "admin" ? "pill-ok" : ""}`}>{labels[user.effectiveRole]}</span></td>
            <td>{user.configuredAdmin
              ? <span className="role-managed">Definido por ADMIN_EMAILS</span>
              : <select aria-label={`Rol de ${user.email ?? user.name ?? "usuario"}`} value={user.role} disabled={loading || busyId === user.id} onChange={(event) => void changeRole(user, event.target.value as Role)}>
                  <option value="viewer">Solo lectura</option><option value="operator">Operador</option><option value="admin">Administrador</option>
                </select>}</td>
          </tr>)}
          {!loading && users.length === 0 && <tr><td colSpan={4} className="table-empty">Aún no hay usuarios registrados.</td></tr>}
          {loading && users.length === 0 && <tr><td colSpan={4} className="table-empty">Cargando usuarios…</td></tr>}
        </tbody>
      </table></div>
    </section>
    <p className="users-footnote">Los administradores configurados en ADMIN_EMAILS no se pueden modificar aquí. No se permite cambiar el propio rol ni quitar el último administrador.</p>
  </>;
}

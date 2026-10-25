"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ORDER_STATUSES } from "@domain/value-objects/order-status";
import { CreateOrderModal } from "./orders/create-order-modal";
import { Alerts, Icon, KpiGrid, fetchJson, money, statusColors, statusLabels, statusSingular, useAutoDismiss, type Analytics, type Order, type OrderPage } from "./shared";

export function OverviewView() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [recent, setRecent] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const clearNotice = useCallback(() => setNotice(null), []);
  useAutoDismiss(notice, clearNotice);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stats, page] = await Promise.all([fetchJson<Analytics>("/api/analytics"), fetchJson<OrderPage>("/api/orders?limit=6")]);
      setAnalytics(stats);
      setRecent(page.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setToday(new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()));
    load().catch(() => setError("No se pudieron cargar los datos. Verifica la conexión con PostgreSQL."));
  }, [load]);

  const delivered = analytics?.ordersByStatus.DELIVERED ?? 0;
  const completedPercent = analytics?.totalOrders ? Math.round((delivered / analytics.totalOrders) * 100) : 0;

  return <>
    <section className="welcome-row">
      <div><p className="eyebrow" suppressHydrationWarning>{today || "Hoy"}</p><h1>Centro de operaciones</h1><p className="subheading">Aquí tienes el pulso de tu operación.</p></div>
      <div className="welcome-actions">
        <button className="secondary-button" onClick={() => load().catch(() => setError("No se pudo actualizar la información."))}><Icon name="refresh" />Actualizar</button>
        <button className="primary-button inline" type="button" onClick={() => setModalOpen(true)}><Icon name="plus" />Nuevo pedido</button>
      </div>
    </section>
    <Alerts error={error} notice={notice} onClearError={() => setError(null)} onClearNotice={clearNotice} />
    <KpiGrid analytics={analytics} loading={loading} />
    <div className="overview-grid">
      <section className="panel" aria-label="Estado del flujo">
        <div className="panel-heading"><div><h2>Estado del flujo</h2><p>{completedPercent}% de los pedidos ya fue entregado.</p></div><Link className="text-link" href="/orders">Ver tablero</Link></div>
        <StatusBars counts={analytics?.ordersByStatus ?? {}} total={analytics?.totalOrders ?? 0} />
      </section>
      <section className="panel" aria-label="Pedidos recientes">
        <div className="panel-heading"><div><h2>Pedidos recientes</h2><p>Los últimos movimientos registrados.</p></div><Link className="text-link" href="/orders">Ver todos</Link></div>
        {recent.length === 0 ? <p className="panel-empty">{loading ? "Cargando…" : "Aún no hay pedidos."}</p> : <ul className="recent-list">
          {recent.map((order) => <li key={order.id}><div><strong>{order.customerName}</strong><small>{order.orderNumber}</small></div><span className="status-chip"><i className={`column-dot ${statusColors[order.status]}`} />{statusSingular[order.status]}</span><span className="recent-total">{money.format(Number(order.total))}</span></li>)}
        </ul>}
      </section>
    </div>
    {modalOpen && <CreateOrderModal onClose={() => setModalOpen(false)} onCreated={(order) => {
      setModalOpen(false);
      setNotice(`${order.orderNumber} creado correctamente.`);
      void load().catch(() => setError("El pedido se creó, pero no se pudieron actualizar los datos."));
    }} />}
  </>;
}

export function StatusBars({ counts, total }: { counts: Partial<Record<(typeof ORDER_STATUSES)[number], number>>; total: number }) {
  return <ul className="status-bars">
    {ORDER_STATUSES.map((status) => {
      const count = counts[status] ?? 0;
      return <li key={status}><div className="bar-label"><span><i className={`column-dot ${statusColors[status]}`} />{statusLabels[status]}</span><b>{count.toLocaleString("es-MX")}</b></div><div className="progress-track"><span className={statusColors[status]} style={{ width: `${total ? (count / total) * 100 : 0}%` }} /></div></li>;
    })}
  </ul>;
}

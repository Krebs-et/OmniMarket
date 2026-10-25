"use client";

import { statusColors, statusLabels, useEscape, type Order } from "../shared";
import type { OrderStatus } from "@domain/value-objects/order-status";

export type StatusHistoryEntry = { id: string; previousStatus: OrderStatus; newStatus: OrderStatus; actorEmail: string; changedAt: string };

export function OrderHistoryPanel({ order, entries, loading, error, onClose }: { order: Order; entries: StatusHistoryEntry[]; loading: boolean; error: string | null; onClose: () => void }) {
  useEscape(onClose);
  return <>
    <div className="drawer-scrim" onClick={onClose} aria-hidden="true" />
    <section className="history-panel" aria-label={`Historial de ${order.orderNumber}`}>
      <div className="history-header"><div><span className="eyebrow">ACTIVIDAD DEL PEDIDO</span><h2>{order.orderNumber}</h2><p>{order.customerName}</p></div><button className="icon-button" onClick={onClose} aria-label="Cerrar historial">×</button></div>
      {loading && <p className="history-state">Cargando actividad…</p>}
      {error && <p className="history-state history-error" role="alert">{error}</p>}
      {!loading && !error && entries.length === 0 && <p className="history-state">Este pedido aún no tiene cambios de estado.</p>}
      {!loading && !error && entries.length > 0 && <ol className="history-list">{entries.map((entry) => <li key={entry.id}><span className={`history-dot ${statusColors[entry.newStatus]}`} /><div><strong>{statusLabels[entry.previousStatus]} → {statusLabels[entry.newStatus]}</strong><span>{entry.actorEmail}</span><time dateTime={entry.changedAt}>{new Date(entry.changedAt).toLocaleString("es-MX")}</time></div></li>)}</ol>}
    </section>
  </>;
}

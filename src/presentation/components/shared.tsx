import { useEffect, useRef, useState } from "react";
import type { OrderStatus } from "@domain/value-objects/order-status";

export type Order = {
  id: string;
  orderNumber: string;
  customerName: string;
  status: OrderStatus;
  total: string;
  updatedAt: string;
};
export type OrderPage = { items: Order[]; total: number; page: number; limit: number };
export type Product = { id: string; sku: string; name: string; price: string; stock: number };
export type Analytics = {
  totalOrders: number;
  totalSales: number;
  totalCost: number;
  averageTicket: number;
  margin: number;
  netProfit: number;
  ordersByStatus: Partial<Record<OrderStatus, number>>;
};

export const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
export const statusLabels: Record<OrderStatus, string> = { PENDING: "Pendientes", CONFIRMED: "Confirmados", PROCESSING: "En proceso", SHIPPED: "Enviados", DELIVERED: "Entregados", CANCELLED: "Cancelados" };
export const statusSingular: Record<OrderStatus, string> = { PENDING: "Pendiente", CONFIRMED: "Confirmado", PROCESSING: "En proceso", SHIPPED: "Enviado", DELIVERED: "Entregado", CANCELLED: "Cancelado" };
export const statusColors: Record<OrderStatus, string> = { PENDING: "status-pending", CONFIRMED: "status-confirmed", PROCESSING: "status-processing", SHIPPED: "status-shipped", DELIVERED: "status-delivered", CANCELLED: "status-cancelled" };

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export function useEscape(onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") ref.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useAutoDismiss(value: string | null, clear: () => void, delay = 6000) {
  useEffect(() => {
    if (!value) return;
    const timer = window.setTimeout(clear, delay);
    return () => window.clearTimeout(timer);
  }, [value, clear, delay]);
}

const paths: Record<string, string> = { grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z", layers: "M12 3 3 8l9 5 9-5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5", chart: "M4 19V5m0 14h16M8 16v-5m4 5V7m4 9v-8", wallet: "M4 6h16v13H4zM4 9h16M16 14h2", target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", refresh: "M20 11a8 8 0 1 0 1 5M20 4v7h-7", warning: "m12 4 9 16H3L12 4Zm0 6v4m0 3h.01", check: "m5 12 4 4L19 6", logout: "M10 17l5-5-5-5m5 5H3m9-7V3h8v18h-8v-2", menu: "M4 7h16M4 12h16M4 17h16", plus: "M12 5v14M5 12h14", search: "m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z", box: "M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9ZM3 7.5l9 4.5 9-4.5M12 12v9", users: "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75", trash: "M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" };

export function Icon({ name }: { name: string }) {
  return <svg aria-hidden="true" className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

export function Kpi({ icon, label, value, hint, tone }: { icon: string; label: string; value: string; hint: string; tone: string }) {
  return <article className="kpi"><div className={`kpi-icon ${tone}`}><Icon name={icon} /></div><div className="kpi-copy"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></article>;
}

export function KpiSkeletons() {
  return <>{Array.from({ length: 4 }, (_, index) => <div key={index} className="kpi skeleton-card" aria-hidden="true"><span className="skeleton-block skeleton-icon" /><div className="kpi-copy"><span className="skeleton-block skeleton-label" /><strong className="skeleton-block skeleton-value" /><small className="skeleton-block skeleton-foot" /></div></div>)}</>;
}

export function KpiGrid({ analytics, loading }: { analytics: Analytics | null; loading: boolean }) {
  return <section className="kpis" aria-label="Indicadores">
    {loading && !analytics ? <KpiSkeletons /> : <>
      <Kpi icon="layers" label="Pedidos totales" value={analytics?.totalOrders.toLocaleString("es-MX") ?? "—"} hint="Todos los estados" tone="blue" />
      <Kpi icon="wallet" label="Ventas brutas" value={analytics ? money.format(analytics.totalSales) : "—"} hint={analytics ? `Utilidad neta ${money.format(analytics.netProfit)}` : "Sin datos"} tone="violet" />
      <Kpi icon="target" label="Ticket promedio" value={analytics ? money.format(analytics.averageTicket) : "—"} hint="Por pedido" tone="amber" />
      <Kpi icon="chart" label="Margen operativo" value={analytics ? `${analytics.margin.toFixed(1)}%` : "—"} hint="Sobre ventas brutas" tone="green" />
    </>}
  </section>;
}

export function Alerts({ error, notice, onClearError, onClearNotice }: { error: string | null; notice: string | null; onClearError: () => void; onClearNotice: () => void }) {
  return <>
    {error && <div className="alert error" role="alert"><Icon name="warning" />{error}<button onClick={onClearError} aria-label="Cerrar alerta">×</button></div>}
    {notice && <div className="alert success" role="status"><Icon name="check" />{notice}<button onClick={onClearNotice} aria-label="Cerrar aviso">×</button></div>}
  </>;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, KeyboardSensor, PointerSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ORDER_STATUSES, type OrderStatus } from "@domain/value-objects/order-status";

type Order = {
  id: string;
  orderNumber: string;
  customerName: string;
  status: OrderStatus;
  total: string;
  updatedAt: string;
};

type Analytics = { totalOrders: number; totalSales: number; averageTicket: number; margin: number; netProfit: number };
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const statusLabels: Record<OrderStatus, string> = { PENDING: "Pendientes", CONFIRMED: "Confirmados", PROCESSING: "En proceso", SHIPPED: "Enviados", DELIVERED: "Entregados", CANCELLED: "Cancelados" };
const statusColors: Record<OrderStatus, string> = { PENDING: "status-pending", CONFIRMED: "status-confirmed", PROCESSING: "status-processing", SHIPPED: "status-shipped", DELIVERED: "status-delivered", CANCELLED: "status-cancelled" };

export function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor));

  async function loadData() {
    const [ordersResponse, analyticsResponse] = await Promise.all([fetch("/api/orders"), fetch("/api/analytics")]);
    if (!ordersResponse.ok || !analyticsResponse.ok) throw new Error("No se pudieron cargar los datos.");
    setOrders(await ordersResponse.json());
    setAnalytics(await analyticsResponse.json());
  }

  useEffect(() => { loadData().catch(() => setError("No se pudieron cargar los datos. Verifica la conexión con PostgreSQL.")); }, []);

  async function moveOrder(order: Order, status: OrderStatus) {
    const previous = orders;
    setError(null);
    setNotice(null);
    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status } : item));
    const response = await fetch(`/api/orders/${order.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!response.ok) {
      setOrders(previous);
      setError(`No se pudo mover ${order.orderNumber}. El cambio fue revertido.`);
      return;
    }
    setAnalytics(await fetch("/api/analytics").then((result) => result.json()));
    setNotice(`${order.orderNumber} ahora está ${statusLabels[status].toLowerCase()}.`);
  }

  function handleDragStart({ active }: DragStartEvent) {
    setActiveOrder(orders.find((order) => order.id === active.id) ?? null);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveOrder(null);
    if (!over) return;
    const order = orders.find((item) => item.id === active.id);
    const nextStatus = over.id as OrderStatus;
    if (order && ORDER_STATUSES.includes(nextStatus) && order.status !== nextStatus) void moveOrder(order, nextStatus);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const completedPercent = useMemo(() => analytics && analytics.totalOrders ? Math.round(((orders.filter((order) => order.status === "DELIVERED").length) / analytics.totalOrders) * 100) : 0, [analytics, orders]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark small">O</span><span>OMNIMARKET</span></div>
        <nav className="main-nav" aria-label="Navegación principal">
          <a className="nav-item active" href="#overview"><Icon name="grid" />Resumen</a>
          <a className="nav-item" href="#orders"><Icon name="layers" />Pedidos <span className="nav-count">{orders.length}</span></a>
          <a className="nav-item" href="#analytics"><Icon name="chart" />Analítica</a>
        </nav>
        <div className="sidebar-bottom"><div className="online"><span /> Sistema operativo</div><button className="nav-item logout" onClick={logout}><Icon name="logout" />Cerrar sesión</button></div>
      </aside>

      <main className="workspace" id="overview">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark small">O</span> OMNIMARKET</div>
          <div className="breadcrumb"><span>Workspace</span><b>/</b><strong>Resumen</strong></div>
          <div className="topbar-actions"><span className="live-status"><i /> Datos en vivo</span><div className="avatar">DK</div></div>
        </header>
        <div className="content">
          <section className="welcome-row">
            <div><p className="eyebrow">SÁBADO, 24 DE OCTUBRE DE 2026</p><h1>Buenos días, equipo <span aria-hidden="true">✦</span></h1><p className="subheading">Aquí tienes el pulso de tu operación.</p></div>
            <button className="secondary-button" onClick={() => loadData().catch(() => setError("No se pudo actualizar la información."))}><Icon name="refresh" />Actualizar</button>
          </section>
          {error && <div className="alert error" role="alert"><Icon name="warning" />{error}<button onClick={() => setError(null)} aria-label="Cerrar alerta">×</button></div>}
          {notice && <div className="alert success" role="status"><Icon name="check" />{notice}</div>}
          <section className="kpis" id="analytics">
            <Kpi icon="layers" label="Pedidos totales" value={analytics?.totalOrders.toString() ?? "—"} trend="12.8%" tone="blue" />
            <Kpi icon="wallet" label="Ventas brutas" value={analytics ? money.format(analytics.totalSales) : "—"} trend="8.2%" tone="violet" />
            <Kpi icon="target" label="Ticket promedio" value={analytics ? money.format(analytics.averageTicket) : "—"} trend="4.6%" tone="amber" />
            <Kpi icon="chart" label="Margen operativo" value={analytics ? `${analytics.margin.toFixed(1)}%` : "—"} trend="2.1%" tone="green" />
          </section>
          <section className="section-heading" id="orders"><div><h2>Flujo de pedidos</h2><p>Arrastra una tarjeta para actualizar su estado.</p></div><div className="completion"><div className="progress-track"><span style={{ width: `${completedPercent}%` }} /></div><strong>{completedPercent}%</strong><span>completados</span></div></section>
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveOrder(null)}>
            <section className="board" aria-label="Tablero Kanban de pedidos">
              {ORDER_STATUSES.map((status) => <KanbanColumn key={status} status={status} orders={orders.filter((order) => order.status === status)} />)}
            </section>
            <DragOverlay>{activeOrder ? <OrderCard order={activeOrder} dragging /> : null}</DragOverlay>
          </DndContext>
        </div>
      </main>
    </div>
  );
}

function KanbanColumn({ status, orders }: { status: OrderStatus; orders: Order[] }) {
  const { isOver, setNodeRef } = useDroppable({ id: status });
  return <div ref={setNodeRef} className={`kanban-column ${isOver ? "is-over" : ""}`}><div className="column-heading"><span className={`column-dot ${statusColors[status]}`} /><h3>{statusLabels[status]}</h3><b>{orders.length}</b></div><div className="column-cards">{orders.map((order) => <OrderCard key={order.id} order={order} />)}{orders.length === 0 && <div className="empty-column">Suelta aquí tus pedidos</div>}</div></div>;
}

function OrderCard({ order, dragging = false }: { order: Order; dragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: order.id, data: { status: order.status } });
  return <article ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform) }} className={`order-card ${isDragging || dragging ? "is-dragging" : ""}`} {...listeners} {...attributes}><div className="order-card-header"><span className="order-number">{order.orderNumber}</span><span className={`priority-dot ${statusColors[order.status]}`} /></div><strong className="customer">{order.customerName}</strong><div className="order-card-footer"><span>{money.format(Number(order.total))}</span><span className="drag-hint" aria-label="Arrastrar pedido">⋮⋮</span></div></article>;
}

function Kpi({ icon, label, value, trend, tone }: { icon: string; label: string; value: string; trend: string; tone: string }) {
  return <article className="kpi"><div className={`kpi-icon ${tone}`}><Icon name={icon} /></div><div className="kpi-copy"><span>{label}</span><strong>{value}</strong><small><em>↑ {trend}</em> vs. periodo anterior</small></div></article>;
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = { grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z", layers: "M12 3 3 8l9 5 9-5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5", chart: "M4 19V5m0 14h16M8 16v-5m4 5V7m4 9v-8", wallet: "M4 6h16v13H4zM4 9h16M16 14h2", target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", refresh: "M20 11a8 8 0 1 0 1 5M20 4v7h-7", warning: "m12 4 9 16H3L12 4Zm0 6v4m0 3h.01", check: "m5 12 4 4L19 6", logout: "M10 17l5-5-5-5m5 5H3m9-7V3h8v18h-8v-2" };
  return <svg aria-hidden="true" className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

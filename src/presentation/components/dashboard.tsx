"use client";

import { useEffect, useMemo, useState } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, KeyboardSensor, PointerSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { signOut } from "next-auth/react";
import { ORDER_STATUSES, type OrderStatus } from "@domain/value-objects/order-status";

type Order = {
  id: string;
  orderNumber: string;
  customerName: string;
  status: OrderStatus;
  total: string;
  updatedAt: string;
};
type Product = { id: string; name: string; price: string; stock: number };
type StatusHistoryEntry = {
  id: string;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
  actorEmail: string;
  changedAt: string;
};

type Analytics = { totalOrders: number; totalSales: number; averageTicket: number; margin: number; netProfit: number };
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const statusLabels: Record<OrderStatus, string> = { PENDING: "Pendientes", CONFIRMED: "Confirmados", PROCESSING: "En proceso", SHIPPED: "Enviados", DELIVERED: "Entregados", CANCELLED: "Cancelados" };
const statusColors: Record<OrderStatus, string> = { PENDING: "status-pending", CONFIRMED: "status-confirmed", PROCESSING: "status-processing", SHIPPED: "status-shipped", DELIVERED: "status-delivered", CANCELLED: "status-cancelled" };

export function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(() => new Set());
  const [bulkStatus, setBulkStatus] = useState<OrderStatus | "">("");
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor));

  async function loadData() {
    setIsLoading(true);
    try {
      const [ordersResponse, analyticsResponse, productsResponse] = await Promise.all([fetch("/api/orders"), fetch("/api/analytics"), fetch("/api/products")]);
      if (!ordersResponse.ok || !analyticsResponse.ok || !productsResponse.ok) throw new Error("No se pudieron cargar los datos.");
      setOrders(await ordersResponse.json());
      setAnalytics(await analyticsResponse.json());
      setProducts(await productsResponse.json());
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { loadData().catch(() => setError("No se pudieron cargar los datos. Verifica la conexión con PostgreSQL.")); }, []);

  async function showHistory(order: Order) {
    setSelectedOrder(order);
    setHistory([]);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/orders/${order.id}/history`);
      if (!response.ok) throw new Error("No se pudo cargar el historial.");
      setHistory(await response.json());
    } catch (historyLoadError) {
      setHistoryError(historyLoadError instanceof Error ? historyLoadError.message : "No se pudo cargar el historial.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function moveOrder(order: Order, status: OrderStatus) {
    const previous = orders;
    setError(null);
    setNotice(null);
    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status } : item));
    let response: Response;
    try {
      response = await fetch(`/api/orders/${order.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    } catch {
      try {
        await loadData();
      } catch {
        setOrders(previous);
      }
      setError(`No se pudo confirmar el cambio de ${order.orderNumber}. Actualiza los datos antes de volver a intentarlo.`);
      return;
    }
    if (!response.ok) {
      setOrders(previous);
      setError(`No se pudo mover ${order.orderNumber}. El cambio fue revertido.`);
      return;
    }
    try {
      const analyticsResponse = await fetch("/api/analytics");
      if (!analyticsResponse.ok) throw new Error("Analytics request failed");
      setAnalytics(await analyticsResponse.json());
    } catch {
      setError(`${order.orderNumber} se actualizó, pero no se pudieron refrescar los indicadores.`);
    }
    setNotice(`${order.orderNumber} ahora está ${statusLabels[status].toLowerCase()}.`);
  }

  function toggleOrderSelection(orderId: string, selected: boolean) {
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      if (selected) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
  }

  async function applyBulkStatus() {
    if (!bulkStatus || selectedOrderIds.size === 0) return;
    setBulkUpdating(true);
    setError(null);
    setNotice(null);
    const selectedOrders = orders.filter((order) => selectedOrderIds.has(order.id));
    const failedOrderNumbers: string[] = [];
    let updatedCount = 0;

    for (const order of selectedOrders) {
      try {
        const response = await fetch(`/api/orders/${order.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: bulkStatus }),
        });
        if (!response.ok) {
          failedOrderNumbers.push(order.orderNumber);
          continue;
        }
        updatedCount += 1;
      } catch {
        failedOrderNumbers.push(order.orderNumber);
      }
    }

    setSelectedOrderIds(new Set());
    setBulkUpdating(false);
    setBulkStatus("");
    try {
      await loadData();
    } catch {
      setError("No se pudo actualizar la vista después de aplicar los cambios.");
    }
    if (failedOrderNumbers.length > 0) {
      setError(`${updatedCount} de ${selectedOrders.length} pedidos actualizados. No se pudieron cambiar: ${failedOrderNumbers.join(", ")}.`);
    } else {
      setNotice(`${updatedCount} pedidos actualizados correctamente.`);
    }
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
    await signOut({ redirectTo: "/login" });
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
            {isLoading && !analytics ? <KpiSkeletons /> : <>
              <Kpi icon="layers" label="Pedidos totales" value={analytics?.totalOrders.toString() ?? "—"} trend="12.8%" tone="blue" />
              <Kpi icon="wallet" label="Ventas brutas" value={analytics ? money.format(analytics.totalSales) : "—"} trend="8.2%" tone="violet" />
              <Kpi icon="target" label="Ticket promedio" value={analytics ? money.format(analytics.averageTicket) : "—"} trend="4.6%" tone="amber" />
              <Kpi icon="chart" label="Margen operativo" value={analytics ? `${analytics.margin.toFixed(1)}%` : "—"} trend="2.1%" tone="green" />
            </>}
          </section>
          <section className="section-heading" id="orders"><div><h2>Flujo de pedidos</h2><p>Arrastra una tarjeta para actualizar su estado.</p></div><div className="completion"><div className="progress-track"><span style={{ width: `${completedPercent}%` }} /></div><strong>{completedPercent}%</strong><span>completados</span></div></section>
          <CreateOrderForm products={products} onCreated={(order) => {
            setOrders((current) => [order, ...current]);
            void loadData().catch(() => setError("El pedido se creó, pero no se pudieron actualizar los datos."));
            setNotice(`${order.orderNumber} creado correctamente.`);
          }} onError={setError} />
          {selectedOrderIds.size > 0 && <div className="bulk-toolbar" aria-label="Edición en lote">
            <strong>{selectedOrderIds.size} pedidos seleccionados</strong>
            <label>Nuevo estado<select aria-label="Nuevo estado para selección" value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as OrderStatus | "")}>
              <option value="">Selecciona un estado</option>
              {ORDER_STATUSES.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
            </select></label>
            <button className="primary-button" type="button" disabled={!bulkStatus || bulkUpdating} onClick={() => void applyBulkStatus()}>{bulkUpdating ? "Actualizando…" : "Aplicar a selección"}</button>
            <button className="secondary-button" type="button" disabled={bulkUpdating} onClick={() => setSelectedOrderIds(new Set())}>Limpiar selección</button>
          </div>}
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveOrder(null)}>
            <section className="board" aria-label="Tablero Kanban de pedidos" aria-busy={isLoading}>
              {isLoading && orders.length === 0
                ? <BoardSkeleton />
                : ORDER_STATUSES.map((status) => <KanbanColumn key={status} status={status} orders={orders.filter((order) => order.status === status)} onSelect={showHistory} selectedOrderIds={selectedOrderIds} onToggleSelection={toggleOrderSelection} />)}
            </section>
            <DragOverlay>{activeOrder ? <OrderCard order={activeOrder} dragging /> : null}</DragOverlay>
          </DndContext>
          {selectedOrder && <OrderHistoryPanel order={selectedOrder} entries={history} loading={historyLoading} error={historyError} onClose={() => setSelectedOrder(null)} />}
        </div>
      </main>
    </div>
  );
}

function CreateOrderForm({ products, onCreated, onError }: { products: Product[]; onCreated: (order: Order) => void; onError: (message: string) => void }) {
  const [customerName, setCustomerName] = useState("");
  const [items, setItems] = useState([{ productId: "", quantity: "1" }]);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    onError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName, items: items.map((item) => ({ productId: item.productId, quantity: Number(item.quantity) })) }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo crear el pedido.");
      }
      onCreated(await response.json());
      setCustomerName("");
      setItems([{ productId: "", quantity: "1" }]);
    } catch (error) {
      onError(error instanceof Error ? error.message : "No se pudo crear el pedido.");
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="create-order-form" onSubmit={submit}>
    <div><h2>Nuevo pedido</h2><p>Registra un pedido con uno o más productos.</p></div>
    <label>Cliente<input required minLength={2} maxLength={120} value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Nombre del cliente" /></label>
    <div className="order-lines">{items.map((item, index) => <div className="order-line" key={index}>
      <label>Producto<select required aria-label={`Producto ${index + 1}`} value={item.productId} onChange={(event) => setItems((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, productId: event.target.value } : line))}><option value="">Selecciona un producto</option>{products.filter((product) => !items.some((line, lineIndex) => lineIndex !== index && line.productId === product.id)).map((product) => <option key={product.id} value={product.id}>{product.name} · {money.format(Number(product.price))} · stock {product.stock}</option>)}</select></label>
      <label>Cantidad<input required aria-label={`Cantidad ${index + 1}`} type="number" min="1" max="1000" value={item.quantity} onChange={(event) => setItems((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: event.target.value } : line))} /></label>
      {items.length > 1 && <button className="remove-line" type="button" aria-label={`Eliminar producto ${index + 1}`} onClick={() => setItems((current) => current.filter((_, lineIndex) => lineIndex !== index))}>×</button>}
    </div>)}</div>
    <button className="secondary-button add-line" type="button" disabled={items.length >= products.length} onClick={() => setItems((current) => [...current, { productId: "", quantity: "1" }])}>+ Producto</button>
    <button className="primary-button" type="submit" disabled={submitting || products.length === 0}>{submitting ? "Guardando…" : "Crear pedido"}</button>
  </form>;
}

function KanbanColumn({ status, orders, onSelect, selectedOrderIds, onToggleSelection }: { status: OrderStatus; orders: Order[]; onSelect: (order: Order) => void; selectedOrderIds: Set<string>; onToggleSelection: (orderId: string, selected: boolean) => void }) {
  const { isOver, setNodeRef } = useDroppable({ id: status });
  return <div ref={setNodeRef} className={`kanban-column ${isOver ? "is-over" : ""}`}><div className="column-heading"><span className={`column-dot ${statusColors[status]}`} /><h3>{statusLabels[status]}</h3><b>{orders.length}</b></div><div className="column-cards">{orders.map((order) => <OrderCard key={order.id} order={order} onSelect={onSelect} selected={selectedOrderIds.has(order.id)} onToggleSelection={onToggleSelection} />)}{orders.length === 0 && <div className="empty-column">Suelta aquí tus pedidos</div>}</div></div>;
}

function OrderCard({ order, dragging = false, onSelect, selected = false, onToggleSelection }: { order: Order; dragging?: boolean; onSelect?: (order: Order) => void; selected?: boolean; onToggleSelection?: (orderId: string, selected: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: order.id, data: { status: order.status } });
  return <article ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform) }} className={`order-card ${isDragging || dragging ? "is-dragging" : ""}`} onClick={() => onSelect?.(order)} {...listeners} {...attributes} aria-label={`Ver historial de ${order.orderNumber}`}>
    {onToggleSelection && <input className="order-select" type="checkbox" aria-label={`Seleccionar ${order.orderNumber}`} checked={selected} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onChange={(event) => onToggleSelection(order.id, event.target.checked)} />}
    <div className="order-card-header"><span className="order-number">{order.orderNumber}</span><span className={`priority-dot ${statusColors[order.status]}`} /></div><strong className="customer">{order.customerName}</strong><div className="order-card-footer"><span>{money.format(Number(order.total))}</span><span className="drag-hint" aria-label="Arrastrar pedido">⋮⋮</span></div></article>;
}

function KpiSkeletons() {
  return <>{Array.from({ length: 4 }, (_, index) => <div key={index} className="kpi skeleton-card" aria-hidden="true"><span className="skeleton-block skeleton-icon" /><div className="kpi-copy"><span className="skeleton-block skeleton-label" /><strong className="skeleton-block skeleton-value" /><small className="skeleton-block skeleton-foot" /></div></div>)}</>;
}

function BoardSkeleton() {
  return <>{ORDER_STATUSES.map((status) => <div key={status} className="kanban-column skeleton-column" aria-hidden="true"><span className="skeleton-block skeleton-column-title" /><span className="skeleton-block skeleton-order-card" /><span className="skeleton-block skeleton-order-card" /></div>)}</>;
}

function OrderHistoryPanel({ order, entries, loading, error, onClose }: { order: Order; entries: StatusHistoryEntry[]; loading: boolean; error: string | null; onClose: () => void }) {
  return <section className="history-panel" aria-label={`Historial de ${order.orderNumber}`}>
    <div className="history-header"><div><span className="eyebrow">ACTIVIDAD DEL PEDIDO</span><h2>{order.orderNumber}</h2><p>{order.customerName}</p></div><button className="secondary-button" onClick={onClose} aria-label="Cerrar historial">Cerrar</button></div>
    {loading && <p className="history-state">Cargando actividad…</p>}
    {error && <p className="history-state history-error" role="alert">{error}</p>}
    {!loading && !error && entries.length === 0 && <p className="history-state">Este pedido aún no tiene cambios de estado.</p>}
    {!loading && !error && entries.length > 0 && <ol className="history-list">{entries.map((entry) => <li key={entry.id}><span className={`history-dot ${statusColors[entry.newStatus]}`} /><div><strong>{statusLabels[entry.previousStatus]} → {statusLabels[entry.newStatus]}</strong><span>{entry.actorEmail}</span><time dateTime={entry.changedAt}>{new Date(entry.changedAt).toLocaleString("es-MX")}</time></div></li>)}</ol>}
  </section>;
}

function Kpi({ icon, label, value, trend, tone }: { icon: string; label: string; value: string; trend: string; tone: string }) {
  return <article className="kpi"><div className={`kpi-icon ${tone}`}><Icon name={icon} /></div><div className="kpi-copy"><span>{label}</span><strong>{value}</strong><small><em>↑ {trend}</em> vs. periodo anterior</small></div></article>;
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = { grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z", layers: "M12 3 3 8l9 5 9-5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5", chart: "M4 19V5m0 14h16M8 16v-5m4 5V7m4 9v-8", wallet: "M4 6h16v13H4zM4 9h16M16 14h2", target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", refresh: "M20 11a8 8 0 1 0 1 5M20 4v7h-7", warning: "m12 4 9 16H3L12 4Zm0 6v4m0 3h.01", check: "m5 12 4 4L19 6", logout: "M10 17l5-5-5-5m5 5H3m9-7V3h8v18h-8v-2" };
  return <svg aria-hidden="true" className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

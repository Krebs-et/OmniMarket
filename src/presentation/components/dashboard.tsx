"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, KeyboardSensor, MouseSensor, TouchSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
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

export function Dashboard({ userEmail }: { userEmail: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [today, setToday] = useState("");
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
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    setToday(new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()));
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

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

  const initials = userEmail.slice(0, 2).toUpperCase();
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="app-shell">
      {menuOpen && <div className="sidebar-scrim" onClick={closeMenu} aria-hidden="true" />}
      <aside className={`sidebar ${menuOpen ? "is-open" : ""}`} id="sidebar">
        <div className="brand"><span className="brand-mark small">O</span><span>OMNIMARKET</span></div>
        <nav className="main-nav" aria-label="Navegación principal">
          <a className="nav-item active" href="#overview" onClick={closeMenu}><Icon name="grid" />Resumen</a>
          <a className="nav-item" href="#orders" onClick={closeMenu}><Icon name="layers" />Pedidos <span className="nav-count">{orders.length}</span></a>
          <a className="nav-item" href="#analytics" onClick={closeMenu}><Icon name="chart" />Analítica</a>
        </nav>
        <div className="sidebar-bottom"><div className="online"><span /> Sistema operativo</div><button className="nav-item logout" onClick={logout}><Icon name="logout" />Cerrar sesión</button></div>
      </aside>

      <main className="workspace" id="overview">
        <header className="topbar">
          <button className="menu-button" type="button" aria-label="Abrir menú" aria-expanded={menuOpen} aria-controls="sidebar" onClick={() => setMenuOpen((open) => !open)}><Icon name="menu" /></button>
          <div className="mobile-brand"><span className="brand-mark small">O</span> OMNIMARKET</div>
          <div className="breadcrumb"><span>Workspace</span><b>/</b><strong>Resumen</strong></div>
          <div className="topbar-actions"><span className="live-status"><i /> Datos en vivo</span><div className="avatar" title={userEmail} aria-label={`Sesión de ${userEmail}`}>{initials}</div></div>
        </header>
        <div className="content">
          <section className="welcome-row">
            <div><p className="eyebrow" suppressHydrationWarning>{today || "Hoy"}</p><h1>Centro de operaciones</h1><p className="subheading">Aquí tienes el pulso de tu operación.</p></div>
            <div className="welcome-actions">
              <button className="secondary-button" onClick={() => loadData().catch(() => setError("No se pudo actualizar la información."))}><Icon name="refresh" />Actualizar</button>
              <button className="primary-button inline" type="button" onClick={() => setOrderModalOpen(true)}><Icon name="plus" />Nuevo pedido</button>
            </div>
          </section>
          {error && <div className="alert error" role="alert"><Icon name="warning" />{error}<button onClick={() => setError(null)} aria-label="Cerrar alerta">×</button></div>}
          {notice && <div className="alert success" role="status"><Icon name="check" />{notice}<button onClick={() => setNotice(null)} aria-label="Cerrar aviso">×</button></div>}
          <section className="kpis" id="analytics">
            {isLoading && !analytics ? <KpiSkeletons /> : <>
              <Kpi icon="layers" label="Pedidos totales" value={analytics?.totalOrders.toString() ?? "—"} hint="Todos los estados" tone="blue" />
              <Kpi icon="wallet" label="Ventas brutas" value={analytics ? money.format(analytics.totalSales) : "—"} hint={analytics ? `Utilidad neta ${money.format(analytics.netProfit)}` : "Sin datos"} tone="violet" />
              <Kpi icon="target" label="Ticket promedio" value={analytics ? money.format(analytics.averageTicket) : "—"} hint="Por pedido" tone="amber" />
              <Kpi icon="chart" label="Margen operativo" value={analytics ? `${analytics.margin.toFixed(1)}%` : "—"} hint="Sobre ventas brutas" tone="green" />
            </>}
          </section>
          <section className="section-heading" id="orders"><div><h2>Flujo de pedidos</h2><p>Arrastra una tarjeta para actualizar su estado; toca una para ver su actividad.</p></div><div className="completion"><div className="progress-track"><span style={{ width: `${completedPercent}%` }} /></div><strong>{completedPercent}%</strong><span>completados</span></div></section>
          {orderModalOpen && <CreateOrderModal products={products} onClose={() => setOrderModalOpen(false)} onCreated={(order) => {
            setOrderModalOpen(false);
            setOrders((current) => [order, ...current]);
            void loadData().catch(() => setError("El pedido se creó, pero no se pudieron actualizar los datos."));
            setNotice(`${order.orderNumber} creado correctamente.`);
          }} />}
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

function useEscape(onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") ref.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function CreateOrderModal({ products, onCreated, onClose }: { products: Product[]; onCreated: (order: Order) => void; onClose: () => void }) {
  const [customerName, setCustomerName] = useState("");
  const [items, setItems] = useState([{ productId: "", quantity: "1" }]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  useEscape(onClose);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError("");
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
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo crear el pedido.");
      setSubmitting(false);
    }
  }

  return <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="new-order-title">
      <div className="modal-header"><div><h2 id="new-order-title">Nuevo pedido</h2><p>Registra un pedido con uno o más productos.</p></div><button className="icon-button" type="button" aria-label="Cerrar formulario" onClick={onClose}>×</button></div>
      <form className="create-order-form" onSubmit={submit}>
        <label className="field">Cliente<input autoFocus required minLength={2} maxLength={120} value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Nombre del cliente" /></label>
        <div className="order-lines">{items.map((item, index) => <div className="order-line" key={index}>
          <label className="field">Producto<select required aria-label={`Producto ${index + 1}`} value={item.productId} onChange={(event) => setItems((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, productId: event.target.value } : line))}><option value="">Selecciona un producto</option>{products.filter((product) => !items.some((line, lineIndex) => lineIndex !== index && line.productId === product.id)).map((product) => <option key={product.id} value={product.id}>{product.name} · {money.format(Number(product.price))} · stock {product.stock}</option>)}</select></label>
          <label className="field">Cantidad<input required aria-label={`Cantidad ${index + 1}`} type="number" min="1" max="1000" value={item.quantity} onChange={(event) => setItems((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: event.target.value } : line))} /></label>
          {items.length > 1 ? <button className="remove-line" type="button" aria-label={`Eliminar producto ${index + 1}`} onClick={() => setItems((current) => current.filter((_, lineIndex) => lineIndex !== index))}>×</button> : <span />}
        </div>)}</div>
        {formError && <div className="form-error" role="alert">{formError}</div>}
        <div className="form-actions">
          <button className="secondary-button add-line" type="button" disabled={items.length >= products.length} onClick={() => setItems((current) => [...current, { productId: "", quantity: "1" }])}>+ Producto</button>
          <button className="primary-button inline" type="submit" disabled={submitting || products.length === 0}>{submitting ? "Guardando…" : "Crear pedido"}</button>
        </div>
      </form>
    </div>
  </div>;
}

function KanbanColumn({ status, orders, onSelect, selectedOrderIds, onToggleSelection }: { status: OrderStatus; orders: Order[]; onSelect: (order: Order) => void; selectedOrderIds: Set<string>; onToggleSelection: (orderId: string, selected: boolean) => void }) {
  const { isOver, setNodeRef } = useDroppable({ id: status });
  return <div ref={setNodeRef} className={`kanban-column ${isOver ? "is-over" : ""}`}><div className="column-heading"><span className={`column-dot ${statusColors[status]}`} /><h3>{statusLabels[status]}</h3><b>{orders.length}</b></div><div className="column-cards">{orders.map((order) => <OrderCard key={order.id} order={order} onSelect={onSelect} selected={selectedOrderIds.has(order.id)} onToggleSelection={onToggleSelection} />)}{orders.length === 0 && <div className="empty-column">Suelta aquí tus pedidos</div>}</div></div>;
}

function OrderCard({ order, dragging = false, onSelect, selected = false, onToggleSelection }: { order: Order; dragging?: boolean; onSelect?: (order: Order) => void; selected?: boolean; onToggleSelection?: (orderId: string, selected: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: order.id, data: { status: order.status } });
  return <article ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform) }} className={`order-card ${isDragging || dragging ? "is-dragging" : ""} ${selected ? "is-selected" : ""}`} onClick={() => onSelect?.(order)} {...listeners} {...attributes} aria-label={`Ver historial de ${order.orderNumber}`}>
    <div className="order-card-header"><div className="order-card-id">{onToggleSelection && <input className="order-select" type="checkbox" aria-label={`Seleccionar ${order.orderNumber}`} checked={selected} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onTouchStart={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onChange={(event) => onToggleSelection(order.id, event.target.checked)} />}<span className="order-number">{order.orderNumber}</span></div><span className={`priority-dot ${statusColors[order.status]}`} /></div><strong className="customer">{order.customerName}</strong><div className="order-card-footer"><span>{money.format(Number(order.total))}</span><span className="drag-hint" aria-label="Arrastrar pedido">⋮⋮</span></div></article>;
}

function KpiSkeletons() {
  return <>{Array.from({ length: 4 }, (_, index) => <div key={index} className="kpi skeleton-card" aria-hidden="true"><span className="skeleton-block skeleton-icon" /><div className="kpi-copy"><span className="skeleton-block skeleton-label" /><strong className="skeleton-block skeleton-value" /><small className="skeleton-block skeleton-foot" /></div></div>)}</>;
}

function BoardSkeleton() {
  return <>{ORDER_STATUSES.map((status) => <div key={status} className="kanban-column skeleton-column" aria-hidden="true"><span className="skeleton-block skeleton-column-title" /><span className="skeleton-block skeleton-order-card" /><span className="skeleton-block skeleton-order-card" /></div>)}</>;
}

function OrderHistoryPanel({ order, entries, loading, error, onClose }: { order: Order; entries: StatusHistoryEntry[]; loading: boolean; error: string | null; onClose: () => void }) {
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

function Kpi({ icon, label, value, hint, tone }: { icon: string; label: string; value: string; hint: string; tone: string }) {
  return <article className="kpi"><div className={`kpi-icon ${tone}`}><Icon name={icon} /></div><div className="kpi-copy"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></article>;
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = { grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z", layers: "M12 3 3 8l9 5 9-5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5", chart: "M4 19V5m0 14h16M8 16v-5m4 5V7m4 9v-8", wallet: "M4 6h16v13H4zM4 9h16M16 14h2", target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", refresh: "M20 11a8 8 0 1 0 1 5M20 4v7h-7", warning: "m12 4 9 16H3L12 4Zm0 6v4m0 3h.01", check: "m5 12 4 4L19 6", logout: "M10 17l5-5-5-5m5 5H3m9-7V3h8v18h-8v-2", menu: "M4 7h16M4 12h16M4 17h16", plus: "M12 5v14M5 12h14" };
  return <svg aria-hidden="true" className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

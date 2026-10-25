"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, KeyboardSensor, MouseSensor, TouchSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ORDER_STATUSES, type OrderStatus } from "@domain/value-objects/order-status";
import { Alerts, Icon, fetchJson, money, statusColors, statusLabels, statusSingular, useAutoDismiss, useDebounced, type Order, type OrderPage } from "../shared";
import { CreateOrderModal } from "./create-order-modal";
import { OrderHistoryPanel, type StatusHistoryEntry } from "./order-history-panel";

const COLUMN_PAGE = 20;
const TABLE_PAGE = 20;
type Column = { items: Order[]; total: number; loading: boolean };
type Columns = Record<OrderStatus, Column>;
type SortKey = "created" | "total" | "customer";
type BulkResult = { updated: string[]; failed: { id: string; message: string }[] };

const emptyColumns = (): Columns => Object.fromEntries(ORDER_STATUSES.map((status) => [status, { items: [], total: 0, loading: true }])) as unknown as Columns;
const buildQuery = (params: Record<string, string | number | undefined>) => new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== "").map(([key, value]) => [key, String(value)])).toString();

export function OrdersView() {
  const [view, setView] = useState<"board" | "table">("board");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const [columns, setColumns] = useState<Columns>(emptyColumns);
  const [table, setTable] = useState<OrderPage | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [tablePage, setTablePage] = useState(1);
  const [tableStatus, setTableStatus] = useState<OrderStatus | "">("");
  const [sort, setSort] = useState<SortKey>("created");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkStatus, setBulkStatus] = useState<OrderStatus | "">("");
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const clearNotice = useCallback(() => setNotice(null), []);
  useAutoDismiss(notice, clearNotice);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => { setTablePage(1); }, [q, tableStatus, sort, dir]);

  useEffect(() => {
    if (view !== "board") return;
    const controller = new AbortController();
    setColumns((current) => Object.fromEntries(ORDER_STATUSES.map((status) => [status, { ...current[status], loading: true }])) as unknown as Columns);
    Promise.all(ORDER_STATUSES.map(async (status) => {
      const page = await fetchJson<OrderPage>(`/api/orders?${buildQuery({ status, q, limit: COLUMN_PAGE })}`, { signal: controller.signal });
      setColumns((current) => ({ ...current, [status]: { items: page.items, total: page.total, loading: false } }));
    })).catch((loadError) => {
      if (loadError?.name !== "AbortError") setError("No se pudieron cargar los pedidos. Verifica la conexión con PostgreSQL.");
    });
    return () => controller.abort();
  }, [view, q, reloadToken]);

  useEffect(() => {
    if (view !== "table") return;
    const controller = new AbortController();
    setTableLoading(true);
    fetchJson<OrderPage>(`/api/orders?${buildQuery({ status: tableStatus, q, sort, dir, page: tablePage, limit: TABLE_PAGE })}`, { signal: controller.signal })
      .then((page) => { setTable(page); setTableLoading(false); })
      .catch((loadError) => {
        if (loadError?.name === "AbortError") return;
        setTableLoading(false);
        setError("No se pudieron cargar los pedidos.");
      });
    return () => controller.abort();
  }, [view, q, tableStatus, sort, dir, tablePage, reloadToken]);

  async function loadMore(status: OrderStatus) {
    const column = columnsRef.current[status];
    if (column.loading) return;
    setColumns((current) => ({ ...current, [status]: { ...current[status], loading: true } }));
    try {
      const page = await fetchJson<OrderPage>(`/api/orders?${buildQuery({ status, q, limit: COLUMN_PAGE, page: Math.floor(column.items.length / COLUMN_PAGE) + 1 })}`);
      setColumns((current) => {
        const known = new Set(current[status].items.map((order) => order.id));
        return { ...current, [status]: { items: [...current[status].items, ...page.items.filter((order) => !known.has(order.id))], total: page.total, loading: false } };
      });
    } catch {
      setColumns((current) => ({ ...current, [status]: { ...current[status], loading: false } }));
      setError("No se pudieron cargar más pedidos.");
    }
  }

  async function showHistory(order: Order) {
    setSelectedOrder(order);
    setHistory([]);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      setHistory(await fetchJson<StatusHistoryEntry[]>(`/api/orders/${order.id}/history`));
    } catch {
      setHistoryError("No se pudo cargar el historial.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function moveOrder(order: Order, status: OrderStatus) {
    setError(null);
    setNotice(null);
    const source = order.status;
    setColumns((current) => ({
      ...current,
      [source]: { ...current[source], items: current[source].items.filter((item) => item.id !== order.id), total: Math.max(0, current[source].total - 1) },
      [status]: { ...current[status], items: [{ ...order, status }, ...current[status].items], total: current[status].total + 1 },
    }));
    try {
      const response = await fetch(`/api/orders/${order.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!response.ok) throw new Error("rejected");
      setNotice(`${order.orderNumber} ahora está ${statusLabels[status].toLowerCase()}.`);
    } catch {
      reload();
      setError(`No se pudo confirmar el cambio de ${order.orderNumber}. Se restauró el estado real del tablero.`);
    }
  }

  function toggleSelection(ids: string[], selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  async function applyBulkStatus() {
    if (!bulkStatus || selectedIds.size === 0) return;
    setBulkUpdating(true);
    setError(null);
    setNotice(null);
    const ids = Array.from(selectedIds);
    try {
      const result = await fetchJson<BulkResult>("/api/orders/status", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, status: bulkStatus }) });
      if (result.failed.length > 0) setError(`${result.updated.length} de ${ids.length} pedidos actualizados. ${result.failed.length} no se pudieron cambiar: ${result.failed[0].message}.`);
      else setNotice(`${result.updated.length} pedidos actualizados correctamente.`);
    } catch {
      setError("No se pudo aplicar el cambio en lote. Revisa los pedidos antes de reintentar.");
    } finally {
      setSelectedIds(new Set());
      setBulkStatus("");
      setBulkUpdating(false);
      reload();
    }
  }

  function handleDragStart({ active }: DragStartEvent) {
    setActiveOrder(Object.values(columnsRef.current).flatMap((column) => column.items).find((order) => order.id === active.id) ?? null);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveOrder(null);
    if (!over || ORDER_STATUSES.some((status) => columnsRef.current[status].loading)) return;
    const order = Object.values(columnsRef.current).flatMap((column) => column.items).find((item) => item.id === active.id);
    const nextStatus = over.id as OrderStatus;
    if (order && ORDER_STATUSES.includes(nextStatus) && order.status !== nextStatus) void moveOrder(order, nextStatus);
  }

  function changeSort(key: SortKey) {
    if (sort === key) setDir((current) => current === "asc" ? "desc" : "asc");
    else { setSort(key); setDir(key === "customer" ? "asc" : "desc"); }
  }

  const anyColumnLoading = ORDER_STATUSES.some((status) => columns[status].loading);
  const boardLoading = anyColumnLoading && ORDER_STATUSES.every((status) => columns[status].items.length === 0);
  const totalOrders = ORDER_STATUSES.reduce((sum, status) => sum + columns[status].total, 0);

  return <>
    <section className="welcome-row">
      <div><p className="eyebrow">Operación</p><h1>Pedidos</h1><p className="subheading">{view === "board" ? "Arrastra una tarjeta para cambiar su estado; toca una para ver su actividad." : "Ordena, filtra y revisa todos los pedidos por página."}</p></div>
      <div className="welcome-actions">
        <button className="secondary-button" onClick={reload}><Icon name="refresh" />Actualizar</button>
        <button className="primary-button inline" type="button" onClick={() => setModalOpen(true)}><Icon name="plus" />Nuevo pedido</button>
      </div>
    </section>
    <Alerts error={error} notice={notice} onClearError={() => setError(null)} onClearNotice={clearNotice} />
    <div className="orders-toolbar">
      <div className="view-tabs" role="tablist" aria-label="Vista de pedidos">
        <button role="tab" type="button" aria-selected={view === "board"} className={view === "board" ? "active" : ""} onClick={() => setView("board")}>Tablero</button>
        <button role="tab" type="button" aria-selected={view === "table"} className={view === "table" ? "active" : ""} onClick={() => setView("table")}>Tabla</button>
      </div>
      <label className="search-input toolbar-search"><Icon name="search" /><input type="search" aria-label="Buscar pedidos" placeholder="Buscar por cliente o número" value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} /></label>
      {view === "table" && <label className="toolbar-filter">Estado<select aria-label="Filtrar por estado" value={tableStatus} onChange={(event) => setTableStatus(event.target.value as OrderStatus | "")}><option value="">Todos</option>{ORDER_STATUSES.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>}
      {view === "board" && <span className="toolbar-count">{totalOrders.toLocaleString("es-MX")} pedidos{q ? " coinciden" : ""}</span>}
    </div>
    {selectedIds.size > 0 && <div className="bulk-toolbar" aria-label="Edición en lote">
      <strong>{selectedIds.size} pedidos seleccionados</strong>
      <label>Nuevo estado<select aria-label="Nuevo estado para selección" value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as OrderStatus | "")}>
        <option value="">Selecciona un estado</option>
        {ORDER_STATUSES.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
      </select></label>
      <button className="primary-button" type="button" disabled={!bulkStatus || bulkUpdating} onClick={() => void applyBulkStatus()}>{bulkUpdating ? "Actualizando…" : "Aplicar a selección"}</button>
      <button className="secondary-button" type="button" disabled={bulkUpdating} onClick={() => setSelectedIds(new Set())}>Limpiar selección</button>
    </div>}

    {view === "board" ? <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveOrder(null)}>
      <section className="board" aria-label="Tablero Kanban de pedidos" aria-busy={anyColumnLoading}>
        {boardLoading ? <BoardSkeleton /> : ORDER_STATUSES.map((status) => <KanbanColumn key={status} status={status} column={columns[status]} onSelect={showHistory} selectedIds={selectedIds} onToggle={toggleSelection} onLoadMore={() => void loadMore(status)} />)}
      </section>
      <DragOverlay>{activeOrder ? <OrderCard order={activeOrder} dragging /> : null}</DragOverlay>
    </DndContext> : <OrdersTable page={table} loading={tableLoading} sort={sort} dir={dir} onSort={changeSort} selectedIds={selectedIds} onToggle={toggleSelection} onSelect={showHistory} onPage={setTablePage} />}

    {selectedOrder && <OrderHistoryPanel order={selectedOrder} entries={history} loading={historyLoading} error={historyError} onClose={() => setSelectedOrder(null)} />}
    {modalOpen && <CreateOrderModal onClose={() => setModalOpen(false)} onCreated={(order) => {
      setModalOpen(false);
      setNotice(`${order.orderNumber} creado correctamente.`);
      setSearch("");
      reload();
    }} />}
  </>;
}

function KanbanColumn({ status, column, onSelect, selectedIds, onToggle, onLoadMore }: { status: OrderStatus; column: Column; onSelect: (order: Order) => void; selectedIds: Set<string>; onToggle: (ids: string[], selected: boolean) => void; onLoadMore: () => void }) {
  const { isOver, setNodeRef } = useDroppable({ id: status });
  const ids = column.items.map((order) => order.id);
  const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
  const remaining = column.total - column.items.length;
  return <div ref={setNodeRef} className={`kanban-column ${isOver ? "is-over" : ""}`}>
    <div className="column-heading">
      <span className={`column-dot ${statusColors[status]}`} /><h3>{statusLabels[status]}</h3><b title={`${column.total} pedidos`}>{column.total.toLocaleString("es-MX")}</b>
      <input className="column-select" type="checkbox" aria-label={`Seleccionar columna ${statusLabels[status]}`} disabled={ids.length === 0} checked={allSelected} onChange={(event) => onToggle(ids, event.target.checked)} />
    </div>
    <div className="column-cards">
      {column.items.map((order) => <OrderCard key={order.id} order={order} onSelect={onSelect} selected={selectedIds.has(order.id)} onToggle={onToggle} />)}
      {column.items.length === 0 && !column.loading && <div className="empty-column">Suelta aquí tus pedidos</div>}
      {remaining > 0 && <button className="load-more" type="button" disabled={column.loading} onClick={onLoadMore}>{column.loading ? "Cargando…" : `Cargar más (${remaining.toLocaleString("es-MX")})`}</button>}
    </div>
  </div>;
}

function OrderCard({ order, dragging = false, onSelect, selected = false, onToggle }: { order: Order; dragging?: boolean; onSelect?: (order: Order) => void; selected?: boolean; onToggle?: (ids: string[], selected: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: order.id, data: { status: order.status } });
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  return <article ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform) }} className={`order-card ${isDragging || dragging ? "is-dragging" : ""} ${selected ? "is-selected" : ""}`} onClick={() => onSelect?.(order)} {...listeners} {...attributes} aria-label={`Ver historial de ${order.orderNumber}`}>
    <div className="order-card-header"><div className="order-card-id">{onToggle && <input className="order-select" type="checkbox" aria-label={`Seleccionar ${order.orderNumber}`} checked={selected} onPointerDown={stop} onMouseDown={stop} onTouchStart={stop} onClick={stop} onChange={(event) => onToggle([order.id], event.target.checked)} />}<span className="order-number">{order.orderNumber}</span></div><span className={`priority-dot ${statusColors[order.status]}`} /></div><strong className="customer">{order.customerName}</strong><div className="order-card-footer"><span>{money.format(Number(order.total))}</span><span className="drag-hint" aria-label="Arrastrar pedido">⋮⋮</span></div></article>;
}

function BoardSkeleton() {
  return <>{ORDER_STATUSES.map((status) => <div key={status} className="kanban-column skeleton-column" aria-hidden="true"><span className="skeleton-block skeleton-column-title" /><span className="skeleton-block skeleton-order-card" /><span className="skeleton-block skeleton-order-card" /></div>)}</>;
}

function OrdersTable({ page, loading, sort, dir, onSort, selectedIds, onToggle, onSelect, onPage }: { page: OrderPage | null; loading: boolean; sort: SortKey; dir: "asc" | "desc"; onSort: (key: SortKey) => void; selectedIds: Set<string>; onToggle: (ids: string[], selected: boolean) => void; onSelect: (order: Order) => void; onPage: (page: number) => void }) {
  const items = page?.items ?? [];
  const ids = items.map((order) => order.id);
  const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
  const pages = page ? Math.max(1, Math.ceil(page.total / page.limit)) : 1;
  const sortHeader = (key: SortKey, label: string) => <th aria-sort={sort === key ? (dir === "asc" ? "ascending" : "descending") : "none"}><button type="button" className="sort-button" onClick={() => onSort(key)}>{label}{sort === key ? (dir === "asc" ? " ↑" : " ↓") : ""}</button></th>;
  return <section className="table-card" aria-label="Tabla de pedidos" aria-busy={loading}>
    <div className="table-scroll"><table className="orders-table">
      <thead><tr>
        <th className="col-check"><input type="checkbox" aria-label="Seleccionar página" disabled={ids.length === 0} checked={allSelected} onChange={(event) => onToggle(ids, event.target.checked)} /></th>
        <th>Pedido</th>{sortHeader("customer", "Cliente")}<th>Estado</th>{sortHeader("total", "Total")}{sortHeader("created", "Creado")}
      </tr></thead>
      <tbody>
        {items.map((order) => <tr key={order.id} className={selectedIds.has(order.id) ? "is-selected" : ""} onClick={() => onSelect(order)}>
          <td className="col-check" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Seleccionar ${order.orderNumber}`} checked={selectedIds.has(order.id)} onChange={(event) => onToggle([order.id], event.target.checked)} /></td>
          <td><button type="button" className="row-link" onClick={(event) => { event.stopPropagation(); onSelect(order); }}>{order.orderNumber}</button></td>
          <td>{order.customerName}</td>
          <td><span className="status-chip"><i className={`column-dot ${statusColors[order.status]}`} />{statusSingular[order.status]}</span></td>
          <td className="num">{money.format(Number(order.total))}</td>
          <td>{new Date(order.updatedAt).toLocaleDateString("es-MX")}</td>
        </tr>)}
        {items.length === 0 && <tr><td colSpan={6} className="table-empty">{loading ? "Cargando pedidos…" : "No hay pedidos que coincidan."}</td></tr>}
      </tbody>
    </table></div>
    <div className="pagination">
      <span>{page ? `${page.total.toLocaleString("es-MX")} pedidos · página ${page.page} de ${pages}` : ""}</span>
      <div><button className="secondary-button" type="button" disabled={!page || page.page <= 1 || loading} onClick={() => onPage(page!.page - 1)}>Anterior</button><button className="secondary-button" type="button" disabled={!page || page.page >= pages || loading} onClick={() => onPage(page!.page + 1)}>Siguiente</button></div>
    </div>
  </section>;
}

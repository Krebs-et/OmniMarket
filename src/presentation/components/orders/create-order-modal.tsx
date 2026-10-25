"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon, money, useDebounced, useEscape, type Order, type Product } from "../shared";

const MAX_LINES = 50;
const MAX_QUANTITY = 1000;
type Line = { product: Product; quantity: number };

export function CreateOrderModal({ onCreated, onClose, order }: { onCreated: (order: Order) => void; onClose: () => void; order?: Order }) {
  const [customerName, setCustomerName] = useState(order?.customerName ?? "");
  const [lines, setLines] = useState<Line[]>([]);
  const [loadingOrder, setLoadingOrder] = useState(Boolean(order));
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const debouncedQuery = useDebounced(query, 250);
  useEscape(onClose);

  useEffect(() => {
    if (!searchOpen) return;
    const controller = new AbortController();
    setSearching(true);
    fetch(`/api/products?limit=8&q=${encodeURIComponent(debouncedQuery)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("search failed")))
      .then((data: { items: Product[] }) => { setResults(data.items); setSearching(false); })
      .catch((error) => { if (error.name !== "AbortError") { setResults([]); setSearching(false); } });
    return () => controller.abort();
  }, [debouncedQuery, searchOpen]);

  useEffect(() => {
    if (!order) return;
    const controller = new AbortController();
    fetch(`/api/orders/${order.id}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("No se pudieron cargar las líneas del pedido.")))
      .then((detail: { items: { productId: string; name: string; sku: string; unitPrice: string; quantity: number; stock: number }[] }) => {
        setLines(detail.items.map((item) => ({
          product: { id: item.productId, name: item.name, sku: item.sku, price: item.unitPrice, stock: item.stock + item.quantity },
          quantity: item.quantity,
        })));
        setLoadingOrder(false);
      })
      .catch((error) => {
        if (error.name !== "AbortError") { setFormError("No se pudieron cargar las líneas del pedido."); setLoadingOrder(false); }
      });
    return () => controller.abort();
  }, [order]);

  const total = useMemo(() => lines.reduce((sum, line) => sum + Number(line.product.price) * line.quantity, 0), [lines]);
  const overStock = lines.filter((line) => line.quantity > line.product.stock);
  const full = lines.length >= MAX_LINES;

  function addProduct(product: Product) {
    setLines((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) return current.map((line) => line === existing ? { ...line, quantity: Math.min(MAX_QUANTITY, line.quantity + 1) } : line);
      return current.length >= MAX_LINES ? current : [...current, { product, quantity: 1 }];
    });
    setQuery("");
    setSearchOpen(false);
  }

  function setQuantity(productId: string, value: string) {
    const quantity = Math.max(1, Math.min(MAX_QUANTITY, Math.floor(Number(value)) || 1));
    setLines((current) => current.map((line) => line.product.id === productId ? { ...line, quantity } : line));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lines.length === 0) { setFormError("Agrega al menos un producto."); return; }
    setSubmitting(true);
    setFormError("");
    try {
      const response = await fetch(order ? `/api/orders/${order.id}` : "/api/orders", {
        method: order ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName, items: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })) }),
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
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="new-order-title" aria-busy={loadingOrder}>
      <div className="modal-header"><div><h2 id="new-order-title">{order ? `Editar ${order.orderNumber}` : "Nuevo pedido"}</h2><p>{order ? "Solo se editan pedidos pendientes. Los precios existentes se conservan." : `Busca productos y ajusta cantidades. Hasta ${MAX_LINES} líneas por pedido.`}</p></div><button className="icon-button" type="button" aria-label="Cerrar formulario" onClick={onClose}>×</button></div>
      <form className="create-order-form" onSubmit={submit}>
        <label className="field">Cliente<input autoFocus required minLength={2} maxLength={120} value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Nombre del cliente" /></label>
        <div className="product-search">
          <label className="field">Agregar producto
            <span className="search-input"><Icon name="search" /><input role="combobox" aria-expanded={searchOpen} aria-controls="product-results" aria-autocomplete="list" disabled={full} value={query} placeholder={full ? "Límite de líneas alcanzado" : "Busca por nombre o SKU"} onFocus={() => setSearchOpen(true)} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape" && searchOpen) { event.stopPropagation(); setSearchOpen(false); } }} /></span>
          </label>
          {searchOpen && <ul className="product-results" id="product-results" role="listbox" aria-label="Resultados de productos">
            {searching && results.length === 0 && <li className="result-state">Buscando…</li>}
            {!searching && results.length === 0 && <li className="result-state">Sin resultados</li>}
            {results.map((product) => <li key={product.id} role="option" aria-selected={lines.some((line) => line.product.id === product.id)}><button type="button" disabled={product.stock === 0} onClick={() => addProduct(product)}><span><strong>{product.name}</strong><small>{product.sku}</small></span><span className="result-meta">{money.format(Number(product.price))}<small>{product.stock === 0 ? "Sin stock" : `stock ${product.stock}`}</small></span></button></li>)}
          </ul>}
        </div>
        <div className="order-lines" aria-label="Productos del pedido">
          {loadingOrder && <p className="lines-empty">Cargando productos del pedido…</p>}
          {!loadingOrder && lines.length === 0 && <p className="lines-empty">Aún no hay productos en el pedido.</p>}
          {lines.map((line, index) => <div className="order-line" key={line.product.id}>
            <div className="line-product"><strong>{line.product.name}</strong><small>{money.format(Number(line.product.price))} · stock {line.product.stock}</small>{line.quantity > line.product.stock && <small className="line-warning">Excede el stock disponible</small>}</div>
            <input className="line-qty" required aria-label={`Cantidad ${index + 1}`} type="number" min="1" max={MAX_QUANTITY} value={line.quantity} onChange={(event) => setQuantity(line.product.id, event.target.value)} />
            <span className="line-subtotal">{money.format(Number(line.product.price) * line.quantity)}</span>
            <button className="remove-line" type="button" aria-label={`Eliminar producto ${index + 1}`} onClick={() => setLines((current) => current.filter((item) => item !== line))}>×</button>
          </div>)}
        </div>
        <div className="order-summary"><span>{lines.length} {lines.length === 1 ? "línea" : "líneas"} · {lines.reduce((sum, line) => sum + line.quantity, 0)} unidades</span><strong aria-label="Total del pedido">{money.format(total)}</strong></div>
        {overStock.length > 0 && <div className="form-error" role="alert">{overStock.length === 1 ? "Una línea excede" : `${overStock.length} líneas exceden`} el stock disponible; el pedido será rechazado.</div>}
        {formError && <div className="form-error" role="alert">{formError}</div>}
        <div className="form-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Cancelar</button>
          <button className="primary-button inline" type="submit" disabled={submitting || loadingOrder || lines.length === 0}>{submitting ? "Guardando…" : order ? "Guardar cambios" : "Crear pedido"}</button>
        </div>
      </form>
    </div>
  </div>;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Alerts, Icon, fetchJson, money, useAutoDismiss, useDebounced, useEscape } from "../shared";
import { useCan } from "../role-context";

type CatalogProduct = { id: string; sku: string; name: string; price: string; cost: string; stock: number; lowStockThreshold: number; active: boolean };
type ProductPage = { items: CatalogProduct[]; total: number; page: number; limit: number; lowStockTotal: number };
type Editor = { mode: "create" } | { mode: "edit"; product: CatalogProduct } | { mode: "stock"; product: CatalogProduct };

const PAGE_SIZE = 20;

export function ProductsView() {
  const canWrite = useCan("catalog:write");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const [includeInactive, setIncludeInactive] = useState(false);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ProductPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const clearNotice = useCallback(() => setNotice(null), []);
  useAutoDismiss(notice, clearNotice);

  useEffect(() => { setPage(1); }, [q, includeInactive, lowStockOnly]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page), includeInactive: String(canWrite && includeInactive), lowStockOnly: String(lowStockOnly) });
    if (q) params.set("q", q);
    fetchJson<ProductPage>(`/api/products?${params}`, { signal: controller.signal })
      .then((result) => { setData(result); setLoading(false); })
      .catch((err) => { if (err.name !== "AbortError") { setError("No se pudo cargar el catálogo."); setLoading(false); } });
    return () => controller.abort();
  }, [q, page, includeInactive, lowStockOnly, canWrite, reloadToken]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const items = data?.items ?? [];

  async function toggleActive(product: CatalogProduct) {
    try {
      await fetchJson(`/api/products/${product.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !product.active }) });
      setNotice(`${product.name} ${product.active ? "desactivado" : "reactivado"}.`);
      setReloadToken((token) => token + 1);
    } catch {
      setError("No se pudo actualizar el producto.");
    }
  }

  return <>
    <section className="welcome-row">
      <div><p className="eyebrow">Catálogo</p><h1>Productos</h1><p className="subheading">{canWrite ? "Gestiona precios, estado e inventario con trazabilidad." : "Consulta el catálogo y el inventario disponible."}</p></div>
      <div className="welcome-actions">
        <a className="secondary-button" href="/api/exports/products">Exportar CSV</a>
        {canWrite && <button className="primary-button inline" type="button" onClick={() => setEditor({ mode: "create" })}><Icon name="plus" />Nuevo producto</button>}
      </div>
    </section>
    <Alerts error={error} notice={notice} onClearError={() => setError(null)} onClearNotice={clearNotice} />
    {Boolean(data?.lowStockTotal) && <div className="alert low-stock-alert" role="status">
      <Icon name="warning" />
      <span>{data?.lowStockTotal} {data?.lowStockTotal === 1 ? "producto requiere" : "productos requieren"} reposición por estar en su umbral de bajo stock.</span>
      <button className="secondary-button" type="button" onClick={() => setLowStockOnly((value) => !value)}>{lowStockOnly ? "Ver todos" : "Revisar stock bajo"}</button>
    </div>}
    <div className="toolbar">
      <span className="search-input"><Icon name="search" /><input aria-label="Buscar productos" placeholder="Busca por nombre o SKU" value={search} onChange={(event) => setSearch(event.target.value)} /></span>
      {canWrite && <label className="inline-check"><input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />Mostrar inactivos</label>}
      <label className="inline-check"><input type="checkbox" checked={lowStockOnly} onChange={(event) => setLowStockOnly(event.target.checked)} />Solo stock bajo</label>
    </div>
    <section className="table-card" aria-label="Tabla de productos" aria-busy={loading}>
      <div className="table-scroll"><table className="orders-table products-table">
        <thead><tr><th>SKU</th><th>Producto</th><th className="num">Precio</th>{canWrite && <th className="num">Costo</th>}<th className="num">Stock</th><th>Estado</th>{canWrite && <th>Acciones</th>}</tr></thead>
        <tbody>
          {items.map((product) => <tr key={product.id} className={product.active ? "" : "is-inactive"}>
            <td>{product.sku}</td><td>{product.name}</td>
            <td className="num">{money.format(Number(product.price))}</td>
            {canWrite && <td className="num">{money.format(Number(product.cost))}</td>}
            <td className="num">{product.stock.toLocaleString("es-MX")}<small className="stock-threshold">Umbral {product.lowStockThreshold}</small></td>
            <td><span className={`pill ${product.active ? "pill-ok" : "pill-off"}`}>{product.active ? "Activo" : "Inactivo"}</span></td>
            {canWrite && <td><div className="row-actions">
              <button className="secondary-button" type="button" aria-label={`Editar ${product.name}`} onClick={() => setEditor({ mode: "edit", product })}>Editar</button>
              <button className="secondary-button" type="button" aria-label={`Ajustar stock de ${product.name}`} onClick={() => setEditor({ mode: "stock", product })}>Stock</button>
              <button className="secondary-button" type="button" aria-label={`${product.active ? "Desactivar" : "Reactivar"} ${product.name}`} onClick={() => void toggleActive(product)}>{product.active ? "Desactivar" : "Reactivar"}</button>
            </div></td>}
          </tr>)}
          {items.length === 0 && <tr><td colSpan={canWrite ? 7 : 5} className="table-empty">{loading ? "Cargando productos…" : "No hay productos que coincidan."}</td></tr>}
        </tbody>
      </table></div>
      <div className="pagination">
        <span>{data ? `${data.total.toLocaleString("es-MX")} productos · página ${data.page} de ${pages}` : ""}</span>
        <div><button className="secondary-button" type="button" disabled={!data || data.page <= 1 || loading} onClick={() => setPage(page - 1)}>Anterior</button><button className="secondary-button" type="button" disabled={!data || data.page >= pages || loading} onClick={() => setPage(page + 1)}>Siguiente</button></div>
      </div>
    </section>
    {editor && <ProductDialog editor={editor} onClose={() => setEditor(null)} onDone={(message) => { setEditor(null); setNotice(message); setReloadToken((token) => token + 1); }} />}
  </>;
}

function ProductDialog({ editor, onClose, onDone }: { editor: Editor; onClose: () => void; onDone: (message: string) => void }) {
  useEscape(onClose);
  const product = editor.mode === "create" ? null : editor.product;
  const [sku, setSku] = useState("");
  const [name, setName] = useState(product?.name ?? "");
  const [price, setPrice] = useState(product?.price ?? "");
  const [cost, setCost] = useState(product?.cost ?? "");
  const [stock, setStock] = useState("0");
  const [lowStockThreshold, setLowStockThreshold] = useState(String(product?.lowStockThreshold ?? 5));
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const titles = { create: "Nuevo producto", edit: "Editar producto", stock: "Ajustar stock" } as const;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError("");
    const request = editor.mode === "create"
      ? { url: "/api/products", method: "POST", body: { sku, name, price, cost, stock: Number(stock), lowStockThreshold: Number(lowStockThreshold) }, done: "Producto creado." }
      : editor.mode === "edit"
        ? { url: `/api/products/${editor.product.id}`, method: "PATCH", body: { name, price, cost, lowStockThreshold: Number(lowStockThreshold) }, done: "Producto actualizado." }
        : { url: `/api/products/${editor.product.id}/stock`, method: "POST", body: { delta: Number(delta), note: note || undefined }, done: "Stock ajustado." };
    try {
      const response = await fetch(request.url, { method: request.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(request.body) });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo guardar.");
      }
      onDone(request.done);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo guardar.");
      setSubmitting(false);
    }
  }

  return <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="product-dialog-title">
      <div className="modal-header"><div><h2 id="product-dialog-title">{titles[editor.mode]}</h2>{product && <p>{product.sku} · stock actual {product.stock}</p>}</div><button className="icon-button" type="button" aria-label="Cerrar formulario" onClick={onClose}>×</button></div>
      <form className="create-order-form" onSubmit={submit}>
        {editor.mode === "create" && <label className="field">SKU<input autoFocus required minLength={2} maxLength={40} pattern="[A-Za-z0-9._\-]+" value={sku} onChange={(event) => setSku(event.target.value)} /></label>}
        {editor.mode !== "stock" && <>
          <label className="field">Nombre<input required minLength={2} maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="field">Precio<input required type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
          <label className="field">Costo<input required type="number" min="0" step="0.01" value={cost} onChange={(event) => setCost(event.target.value)} /></label>
        </>}
        {editor.mode === "create" && <label className="field">Stock inicial<input required type="number" min="0" step="1" value={stock} onChange={(event) => setStock(event.target.value)} /></label>}
        {editor.mode !== "stock" && <label className="field">Umbral de bajo stock<input required type="number" min="0" max="1000000" step="1" value={lowStockThreshold} onChange={(event) => setLowStockThreshold(event.target.value)} /><small>Se alertará cuando el inventario sea igual o menor a este valor.</small></label>}
        {editor.mode === "stock" && <>
          <label className="field">Cantidad a sumar o restar<input autoFocus required type="number" step="1" value={delta} onChange={(event) => setDelta(event.target.value)} placeholder="Ej. 10 o -3" /></label>
          <label className="field">Motivo (opcional)<input maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} /></label>
        </>}
        {formError && <div className="form-error" role="alert">{formError}</div>}
        <div className="form-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Cancelar</button>
          <button className="primary-button inline" type="submit" disabled={submitting}>{submitting ? "Guardando…" : "Guardar"}</button>
        </div>
      </form>
    </div>
  </div>;
}

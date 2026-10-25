"use client";

import { useCallback, useEffect, useState } from "react";
import { Alerts, Icon, KpiGrid, fetchJson, money, type Analytics } from "./shared";
import { StatusBars } from "./overview-view";

export function AnalyticsView() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setAnalytics(await fetchJson<Analytics>("/api/analytics")); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load().catch(() => setError("No se pudo cargar la analítica.")); }, [load]);

  const cancelled = analytics?.ordersByStatus.CANCELLED ?? 0;
  const cancelRate = analytics?.totalOrders ? (cancelled / analytics.totalOrders) * 100 : 0;

  return <>
    <section className="welcome-row">
      <div><p className="eyebrow">Rendimiento</p><h1>Analítica</h1><p className="subheading">Indicadores financieros y distribución de pedidos.</p></div>
      <div className="welcome-actions"><button className="secondary-button" onClick={() => load().catch(() => setError("No se pudo actualizar la información."))}><Icon name="refresh" />Actualizar</button></div>
    </section>
    <Alerts error={error} notice={null} onClearError={() => setError(null)} onClearNotice={() => undefined} />
    <KpiGrid analytics={analytics} loading={loading} />
    <div className="overview-grid">
      <section className="panel" aria-label="Distribución por estado">
        <div className="panel-heading"><div><h2>Distribución por estado</h2><p>{cancelRate.toFixed(1)}% de los pedidos fue cancelado.</p></div></div>
        <StatusBars counts={analytics?.ordersByStatus ?? {}} total={analytics?.totalOrders ?? 0} />
      </section>
      <section className="panel" aria-label="Resumen financiero">
        <div className="panel-heading"><div><h2>Resumen financiero</h2><p>Acumulado de todos los pedidos.</p></div></div>
        <dl className="finance-list">
          <div><dt>Ventas brutas</dt><dd>{analytics ? money.format(analytics.totalSales) : "—"}</dd></div>
          <div><dt>Costo de ventas</dt><dd>{analytics ? money.format(analytics.totalCost) : "—"}</dd></div>
          <div className="finance-total"><dt>Utilidad neta</dt><dd>{analytics ? money.format(analytics.netProfit) : "—"}</dd></div>
        </dl>
      </section>
    </div>
  </>;
}

import type { ApiRouteMetricSummary } from "@application/use-cases/get-api-observability";

type ObservabilitySnapshot = Awaited<ReturnType<typeof import("@application/use-cases/get-api-observability").getApiObservability>>;

function formatPercentile(value: ApiRouteMetricSummary["p95"]) {
  if (!value) return "Sin datos";
  return value.exceedsRange ? "> 5 s" : `≤ ${value.upperBoundMs.toLocaleString("es-MX")} ms`;
}

function formatPercent(rate: number) {
  return `${rate.toLocaleString("es-MX", { maximumFractionDigits: 1 })}%`;
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function ObservabilityKpi({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: string }) {
  return <article className="kpi">
    <div className={`kpi-icon ${tone}`} aria-hidden="true"><span className="observability-kpi-mark" /></div>
    <div className="kpi-copy"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>
  </article>;
}

export function ObservabilityView({ snapshot }: { snapshot: ObservabilitySnapshot }) {
  return <>
    <section className="welcome-row">
      <div>
        <p className="eyebrow">Operación</p>
        <h1>Observabilidad</h1>
        <p className="subheading">Solicitudes API agregadas por ruta, sin datos personales.</p>
      </div>
    </section>

    <section className="kpis" aria-label="Indicadores API de las últimas 24 horas">
      <ObservabilityKpi label="Solicitudes" value={snapshot.summary.requestCount.toLocaleString("es-MX")} hint="Últimas 24 horas" tone="blue" />
      <ObservabilityKpi label="Errores 5xx" value={snapshot.summary.serverErrorCount.toLocaleString("es-MX")} hint={`${formatPercent(snapshot.summary.errorRate)} de las solicitudes`} tone="amber" />
      <ObservabilityKpi label="Latencia p95" value={formatPercentile(snapshot.summary.p95)} hint="Estimación por intervalos" tone="violet" />
      <ObservabilityKpi label="Solicitudes lentas" value={snapshot.summary.slowRequestCount.toLocaleString("es-MX")} hint="Duración igual o mayor a 1 s" tone="green" />
    </section>

    <section className="panel observability-alerts" aria-labelledby="observability-alerts-title">
      <div className="panel-heading">
        <div>
          <h2 id="observability-alerts-title">Alertas recientes</h2>
          <p>Ventana de 5 minutos; tasa de error &gt; 5% o p95 &gt; 1 s.</p>
        </div>
        <span className="status-chip">{formatTime(snapshot.alertWindowStart)}–{formatTime(snapshot.generatedAt)}</span>
      </div>
      {snapshot.alerts.length
        ? <ul className="observability-alert-list">{snapshot.alerts.map((alert, index) => <li key={`${alert.method}-${alert.route}-${alert.message}-${index}`} role="alert">
          <span className="observability-alert-mark" aria-hidden="true">!</span>
          <div><strong>{alert.message}</strong><span>{alert.method} {alert.route}</span></div>
        </li>)}</ul>
        : <p className="panel-empty" role="status">Sin alertas en esta ventana.</p>}
    </section>

    <section className="table-card observability-table-card" aria-labelledby="observability-routes-title">
      <div className="section-heading">
        <div>
          <h2 id="observability-routes-title">Rutas API</h2>
          <p>Ventana móvil de 24 horas. Los percentiles son aproximados.</p>
        </div>
      </div>
      <div className="table-scroll">
        <table className="orders-table observability-table">
          <thead><tr>
            <th scope="col">Ruta</th><th scope="col">Solicitudes</th><th scope="col">Errores 4xx / 5xx</th>
            <th scope="col">Lentas</th><th scope="col">p50</th><th scope="col">p95</th><th scope="col">p99</th>
          </tr></thead>
          <tbody>
            {snapshot.routes.length
              ? snapshot.routes.map((route) => <tr key={`${route.method}-${route.route}`}>
                <td><span className="observability-route-method">{route.method}</span> {route.route}</td>
                <td className="num">{route.requestCount.toLocaleString("es-MX")}</td>
                <td className="num">{route.clientErrorCount} / {route.serverErrorCount} <span className="observability-muted">({formatPercent(route.errorRate)} 5xx)</span></td>
                <td className="num">{route.slowRequestCount}</td>
                <td>{formatPercentile(route.p50)}</td><td>{formatPercentile(route.p95)}</td><td>{formatPercentile(route.p99)}</td>
              </tr>)
              : <tr><td className="table-empty" colSpan={7}>Todavía no hay solicitudes registradas en las últimas 24 horas.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
    <p className="observability-footnote">Los datos se agrupan en intervalos de 5 minutos y se conservan hasta 30 días. Los percentiles se estiman con límites de latencia; no representan un SLA.</p>
  </>;
}

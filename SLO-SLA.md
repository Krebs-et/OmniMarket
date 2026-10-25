# SLO/SLA readiness

## Status

This is a proposed internal SLO baseline, not a contractual SLA. Vercel, PostgreSQL/RDS, and OAuth availability have not been measured over a complete 30-day production window. Do not publish these targets as a guarantee until the evidence and operational prerequisites below are met and the terms have been reviewed.

## Proposed service objectives

| Indicator | Proposed target | Measurement |
|---|---:|---|
| Application availability | 99.5% per calendar month | External synthetic `GET /api/health` every 5 minutes. A successful check requires HTTP 200 and `database: "ok"`. Confirm a failed check with a retry before counting downtime. |
| API latency | p95 ≤ 1,000 ms per calendar month | Production handler duration for documented core API routes, grouped by method and route template; report p50/p95/p99, request count, error rate, sample window, and exclusions. |
| API server errors | < 1% per calendar month | HTTP 5xx responses divided by all measured requests for the same route set and period. 4xx responses are reported separately, not counted as server failures. |

At 99.5% availability, a 30-day month permits at most 3 hours 36 minutes of unavailability. This is an error-budget calculation, not observed downtime.

## Current evidence and gaps

- API durations and five-minute PostgreSQL aggregates are available in the admin-only `/observability` panel. Histograms use fixed latency bounds, so percentiles are approximate.
- The panel currently summarizes the last 24 hours and produces in-product warnings for a recent 5-minute window. It does not provide a 30-day availability calculation, external notifications, or an independent uptime source.
- The health endpoint can check PostgreSQL, but probing it only from the application or the same deployment would not independently prove customer reachability.
- The local benchmark measures application use cases against local PostgreSQL; it is not evidence of Vercel-to-RDS production latency.
- Development OAuth credentials are configured locally. Google sign-in completed a real development callback; a GitHub sign-in using the same email was rejected with `OAuthAccountNotLinked`, confirming automatic account linking remains disabled. Production OAuth credentials and user callbacks were not exercised; the production smoke test only verifies GitHub OAuth initiation.
- The latest committed revision passed CI, database migration and the production smoke workflow. This verifies the configured production endpoints and smoke checks, not a 30-day availability or latency objective.

## Readiness work required before declaring an SLA

1. Configure an external uptime monitor for the production health URL with five-minute checks, retries, a separate alert channel, and retained timestamped results; the current deploy smoke test is not continuous monitoring.
2. Define the production domain, regions, supported routes, traffic window, latency sample minimum, and handling of low-volume routes. Do not report a percentile as passing when the minimum sample count is not met.
3. Capture at least 30 consecutive days of production measurements. Record the deployment version, probe history, route/method, sample count, and database/region context with each report.
4. Verify alert delivery, incident ownership, on-call coverage, escalation and customer communication. Establish database backup/restore evidence and recovery objectives (RTO/RPO).
5. Agree with stakeholders and legal counsel on exclusions, planned maintenance notice, third-party dependencies, measurement source, service credits, claim process, and effective dates before converting the SLO into contract language.

No external monitor, notification integration, RTO/RPO commitment, or service-credit policy is provisioned by this repository.

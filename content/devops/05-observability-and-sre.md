# 5. Observability, SRE & Production Operations

---

## 5.1 Monitoring vs observability

**Monitoring** answers questions you knew to ask ("is CPU high?"). **Observability** is the property that lets you answer questions you *didn't* anticipate ("why are checkouts failing only for users in Chittagong on Android?"). The practical difference is high-cardinality, high-dimensional data: metrics with useful labels, structured logs, and traces you can slice arbitrarily.

**The three pillars, plus correlation:**

| Signal | Strength | Weakness | Cost |
|---|---|---|---|
| **Metrics** | Cheap, aggregatable, alertable, long retention | No per-request detail; cardinality explodes | Low |
| **Logs** | Full detail per event | Expensive at volume; hard to aggregate | High |
| **Traces** | Causality across services; where time went | Sampling means you may miss the one you want | Medium |

The glue is a **trace id** propagated in the W3C `traceparent` header and stamped on every log line and metric exemplar. Without it you have three disconnected datasets.

> **Asked as:** "Monitoring vs observability." · "Metrics, logs, or traces — which do you reach for and when?"

---

## 5.2 Metrics that matter

**RED for services** (request-driven): **R**ate, **E**rrors, **D**uration.
**USE for resources** (machines, pools): **U**tilisation, **S**aturation, **E**rrors.
**Four Golden Signals** (Google SRE): latency, traffic, errors, saturation.

```python
from prometheus_client import Counter, Histogram, Gauge

REQUESTS = Counter("http_requests_total", "HTTP requests",
                   ["method", "route", "status"])            # route TEMPLATE, not the raw path
LATENCY  = Histogram("http_request_duration_seconds", "Latency",
                     ["method", "route"],
                     buckets=(.005,.01,.025,.05,.1,.25,.5,1,2.5,5,10))
QUEUE    = Gauge("job_queue_depth", "Pending jobs", ["queue"])
```

**Cardinality is the trap.** A label containing a user id, an order id, or a raw URL path creates one time series per value — millions of series, and your Prometheus falls over. Use `route="/orders/:id"`, never `route="/orders/8f2c…"`. Put high-cardinality detail in logs and traces, where it belongs.

**Histograms over averages.** An average latency of 120 ms can hide 5% of users at 4 s. Record a histogram and alert on `histogram_quantile(0.99, ...)`.

```promql
# p99 latency by route over 5 minutes
histogram_quantile(0.99,
  sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))

# Error ratio
sum(rate(http_requests_total{status=~"5.."}[5m]))
  / sum(rate(http_requests_total[5m]))

# Saturation: how close to the connection pool ceiling
max_over_time(db_pool_in_use[5m]) / db_pool_size
```

> **Asked as:** "What metrics would you expose for a service?" · "Why is average latency misleading?" · "What is metric cardinality and why does it matter?"

---

## 5.3 Logging that's actually useful

```python
import structlog
log = structlog.get_logger()

log.info("appointment.booked",
         appointment_id=str(appt.id),
         clinic_id=clinic_id,
         doctor_id=doctor_id,
         duration_ms=round(elapsed * 1000, 1),
         trace_id=current_trace_id())
```

Rules:

1. **Structured JSON, one event per line.** Grep works on strings; queries work on fields.
2. **Include the trace id, tenant id, and user id** on every line — that's what makes correlation possible.
3. **Never log secrets, tokens, card numbers, passwords, or health data.** Redact at the logger, not by remembering. Assume everything in logs is readable by anyone with dashboard access.
4. **Levels mean something**: ERROR = a human should look; WARN = degraded but handled; INFO = business events; DEBUG = off in production (and expensive if left on).
5. **Log the decision, not the traffic.** "Rejected booking: slot taken" is useful; logging every successful request duplicates metrics at 100× the cost.
6. **Sample high-volume logs** and set retention by value — 7 days hot, 90 days cold, then delete.

> **Asked as:** "What should and shouldn't be logged?" · "How do you find one user's failing request across ten services?" · "How do you control log costs?"

---

## 5.4 Tracing

```java
@WithSpan("bookAppointment")
public Appointment book(@SpanAttribute("doctor.id") String doctorId, Instant slot) {
    Span.current().setAttribute("clinic.id", tenant.id());
    // child spans are created automatically for JDBC, HTTP client, Kafka by the agent
    return repository.save(...);
}
```

**OpenTelemetry** is the standard: one SDK/agent, vendor-neutral, exports to Jaeger, Tempo, Datadog, Honeycomb, whatever. Auto-instrumentation covers HTTP servers/clients, database drivers, and message brokers without code changes — add manual spans only for meaningful business operations.

**Sampling:** head sampling (decide at the start — cheap, may miss the interesting trace) vs **tail sampling** (decide after the trace completes — keep all errors and slow traces, sample the boring ones). Tail sampling is what you want; it costs a collector tier.

A trace answers "where did the 800 ms go?" in seconds — the flame graph shows a 600 ms span on a downstream call, or twelve sequential 50 ms database spans that should have been one query.

> **Asked as:** "How would you find the cause of a latency spike?" · "Head vs tail sampling." · "What does OpenTelemetry standardise?"

---

## 5.5 SLIs, SLOs, and error budgets

```
SLI  (indicator): proportion of HTTP requests served successfully in < 300 ms
SLO  (objective): 99.9% over a rolling 28 days
Error budget:     0.1% × ~2.4M requests ≈ 2 400 failed requests per 28 days
```

The error budget converts reliability from an argument into arithmetic:

- Budget remaining → ship features, take risks, deploy often.
- Budget burning fast → freeze risky changes, spend the sprint on reliability.

**Burn-rate alerting** beats threshold alerting. Alert when you're consuming the budget fast enough to exhaust it early:

```promql
# 14.4× burn over 1h = the whole 28-day budget gone in ~2 days → page
(1 - (sum(rate(http_requests_total{status!~"5.."}[1h])) / sum(rate(http_requests_total[1h])))) > 14.4 * 0.001
```

Pair a fast-burn alert (1h window, page) with a slow-burn alert (6h window, ticket) to catch both outages and slow degradations without noise.

**Choose SLIs from the user's perspective.** "Database CPU < 80%" is not an SLI; "checkout completes in under 2 s" is. 100% is never the right SLO — it's unachievable and it prices out every change.

> **Asked as:** "SLI vs SLO vs SLA." · "What is an error budget and how do you use it?" · "Why not target 100% uptime?"

---

## 5.6 Alerting that doesn't burn people out

**Every page must be urgent, actionable, and about user impact.** If the responder's only action is to acknowledge and go back to sleep, it should not have been a page.

| Alert on | Not on |
|---|---|
| Error rate / SLO burn | CPU > 80% |
| p99 latency breaching the budget | Individual pod restarts |
| Queue lag growing without bound | Disk 70% full (that's a ticket) |
| Certificate expiring in 14 days | Every deploy |
| Payment success rate dropping | A single 500 |

Each alert should carry: what's broken (in user terms), the current value vs the threshold, a link to the dashboard, and a **runbook link** with the first three things to check.

**Symptom-based alerting** means you don't need an alert for every possible cause. One "checkout error rate high" alert catches a database outage, a bad deploy, a third-party failure, and causes nobody predicted.

**Alert fatigue kills reliability.** Track pages per on-call shift; more than a couple per night means the alerts, not the humans, need fixing. Auto-resolve, group related alerts, and delete alerts that have never once led to action.

> **Asked as:** "What would you page someone for?" · "How do you reduce alert fatigue?" · "What goes in a runbook?"

---

## 5.7 On-call and incident response

**During an incident:**

1. **Declare early.** A false alarm costs 10 minutes; a late declaration costs an hour.
2. **Roles:** Incident Commander (coordinates, decides — does *not* debug), Ops lead (hands on keyboard), Comms (updates stakeholders/status page).
3. **Mitigate before diagnosing.** Roll back, flip the flag, shed load, fail over. Understanding can wait; the outage cannot.
4. **One channel, timestamped.** The channel becomes the postmortem timeline for free.
5. **Status page updates** on a cadence, even when the update is "still investigating".

**Blameless postmortem** within a few days:

- Timeline (detection → mitigation → resolution), with the actual times.
- Impact in user terms and duration.
- Contributing factors — plural, and systemic. "Human error" is never a root cause; the question is why the system allowed it.
- What went well (this matters — it's how good practices spread).
- **Action items with owners and dates**, tracked like any other work. A postmortem with no shipped follow-ups is theatre.

**Practices that reduce incidents:** small frequent deploys, canaries with automated rollback, chaos/game days, load testing before launches, capacity planning against real growth, and dependency reviews (what happens when *that* third party is down?).

> **Asked as:** "Describe an outage you were part of." · "Why blameless?" · "What do you do first when paged?"

---

## 5.8 Rapid-fire answers

| Question | Answer |
|---|---|
| MTTR / MTBF / MTTD | Mean time to restore / between failures / to detect — optimise MTTR hardest |
| Synthetic monitoring | Scripted probes from outside; catches "up but broken" and DNS/TLS/CDN issues |
| RUM | Real User Monitoring — actual field performance (Core Web Vitals), not lab numbers |
| Profiling in prod | Continuous profilers (Pyroscope, async-profiler) — CPU/memory flame graphs at low overhead |
| Feature-flag observability | Tag metrics by flag variant so you can see a bad rollout in the graphs |
| Log vs metric for the same thing | Metric for "how often/how fast", log for "what exactly happened" |
| Prometheus limits | Pull-based, single-node scaling, no long retention — pair with Thanos/Mimir/Cortex |
| OTel Collector | Receive → process (batch, redact, tail-sample) → export; keeps vendor choice reversible |
| Dashboard design | One screen answering "is it healthy?"; drill-downs below; USE/RED layout |
| Capacity planning | Track growth against headroom; load test to find the knee; know your scaling lead time |

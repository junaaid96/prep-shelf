# 2. Monolith, Modular Monolith & Microservices — Choosing Boundaries

---

## 2.1 The honest comparison

| | Monolith | Modular monolith | Microservices |
|---|---|---|---|
| Deploy | One artifact | One artifact | N pipelines |
| Local dev | Trivial | Trivial | Docker-compose zoo or shared envs |
| Refactoring across boundaries | Easy (compiler helps) | Easy | Hard (versioned contracts) |
| Transactions | ACID across the whole domain | ACID | Sagas, eventual consistency |
| Scaling | Whole app together | Whole app together | Per-service |
| Team independence | Low | Medium | High |
| Failure isolation | Low | Low | High (if done right) |
| Debugging | Stack trace | Stack trace | Distributed tracing, correlation ids |
| Operational cost | Low | Low | High: service mesh, registry, per-service CI/CD, observability |

**The 2026 consensus:** start with a **modular monolith** and extract services when you have a specific, named reason — a component with a genuinely different scaling profile, a team that needs an independent release cadence, or a compliance boundary. "We might need to scale someday" is not a reason. Several high-profile companies have publicly moved back from microservices to modular monoliths and cut cost and latency doing it.

**The prerequisite most teams lack:** microservices require CI/CD, automated testing, centralised logging, distributed tracing, service discovery, and on-call rotations. Without those, you've turned local method calls into unreliable network calls and gained nothing.

> **Asked as:** "Monolith or microservices for a new product?" · "When would you split a service out?" · "What are the hidden costs of microservices?"

---

## 2.2 Where to draw boundaries: DDD in practice

Boundaries should follow the **business**, not the technical layers. A "UserService, OrderService, EmailService" split by noun often produces services that must all change together — the worst of both worlds (a distributed monolith).

**Domain-Driven Design vocabulary you'll be asked about:**

- **Ubiquitous language** — the domain experts' words used verbatim in code. If the business says "encounter", don't call it `Visit`.
- **Bounded context** — a boundary within which a term has one meaning. "Customer" in Billing (payment method, tax id) is a *different model* from "Customer" in Support (tickets, sentiment). Forcing one shared `Customer` class is the classic mistake.
- **Aggregate** — a cluster of objects with one **aggregate root** as the only entry point, and a consistency boundary. `Order` is the root; `OrderLine` is only reachable through it. **One transaction should modify one aggregate.**
- **Entity vs value object** — identity that persists (`Patient`) vs defined entirely by its attributes and immutable (`Money`, `DateRange`, `Address`).
- **Domain event** — a fact that happened, named in the past tense (`AppointmentBooked`).
- **Repository** — collection-like persistence for an aggregate root.
- **Anti-corruption layer (ACL)** — a translation layer at the edge of your context so a legacy or third-party model doesn't leak in.

```java
// Aggregate root enforcing its own invariants — no anaemic setters
public class Order {
    private final OrderId id;
    private final List<OrderLine> lines = new ArrayList<>();
    private OrderStatus status = OrderStatus.DRAFT;

    public void addLine(ProductId product, int qty, Money unitPrice) {
        if (status != OrderStatus.DRAFT) throw new OrderAlreadySubmitted(id);
        if (qty <= 0) throw new IllegalArgumentException("qty must be positive");
        lines.add(new OrderLine(product, qty, unitPrice));
    }

    public void submit() {
        if (lines.isEmpty()) throw new EmptyOrder(id);
        status = OrderStatus.SUBMITTED;
        register(new OrderSubmitted(id, total(), Instant.now()));   // domain event
    }

    public Money total() {
        return lines.stream().map(OrderLine::subtotal).reduce(Money.ZERO, Money::add);
    }
}
```

**Boundary heuristics that work:**

1. Draw the boundary where **data changes together** — anything needing one ACID transaction belongs in one service.
2. Draw it where **teams own it** (Conway's Law: your architecture will mirror your org chart whether you plan for it or not).
3. Draw it where the **rate of change** differs — a stable catalogue and a fast-moving pricing engine can split cleanly.
4. If two services always deploy together, they're one service.
5. If a service is mostly CRUD-forwarding calls to another, delete it.

> **Asked as:** "What's a bounded context?" · "How do you decide service boundaries?" · "What is an aggregate and why does it matter for transactions?" · "What is a distributed monolith?"

---

## 2.3 Layering: hexagonal / clean architecture

```
        ┌──────────────────── Adapters (in) ────────────────────┐
        │ REST controller · GraphQL · CLI · Kafka consumer      │
        └────────────────────────┬──────────────────────────────┘
                                 ▼  (ports = interfaces)
        ┌──────────── Application (use cases, orchestration) ───┐
        │        BookAppointment · CancelAppointment            │
        └────────────────────────┬──────────────────────────────┘
                                 ▼
        ┌──────────── Domain (entities, value objects, rules) ──┐
        │            Pure. No framework. No SQL. No HTTP.       │
        └────────────────────────┬──────────────────────────────┘
                                 ▼  (ports = interfaces)
        ┌──────────────────── Adapters (out) ───────────────────┐
        │ JPA repository · S3 client · payment gateway · SMTP   │
        └───────────────────────────────────────────────────────┘
```

**The dependency rule:** dependencies point inward. The domain knows nothing about Spring, Django, PostgreSQL, or HTTP. That's what makes it testable without a container and portable across infrastructure changes.

```java
// Domain defines the port it needs
public interface AppointmentRepository {
    Optional<Appointment> findById(AppointmentId id);
    void save(Appointment appointment);
}

// Application orchestrates — one use case, one transaction
@Service
@RequiredArgsConstructor
public class BookAppointmentUseCase {
    private final AppointmentRepository appointments;
    private final DoctorAvailability availability;      // another port
    private final DomainEventPublisher events;

    @Transactional
    public AppointmentId handle(BookAppointmentCommand cmd) {
        if (!availability.isFree(cmd.doctorId(), cmd.slot()))
            throw new SlotUnavailable(cmd.doctorId(), cmd.slot());

        var appointment = Appointment.book(cmd.patientId(), cmd.doctorId(), cmd.slot(), cmd.fee());
        appointments.save(appointment);
        events.publishAll(appointment.pullDomainEvents());   // relayed after commit
        return appointment.id();
    }
}

// Infrastructure implements the port — the only place JPA appears
@Repository
class JpaAppointmentRepository implements AppointmentRepository { ... }
```

**The cost is indirection.** For a CRUD admin panel this is over-engineering. Apply it where the business rules are genuinely complex; keep the simple parts simple.

> **Asked as:** "Explain hexagonal/clean architecture." · "What is the dependency inversion principle in practice?" · "Where does business logic go?" · "When is clean architecture over-engineering?"

---

## 2.4 Communication between services

**Synchronous (REST/gRPC):** simple, immediate consistency, easy to debug — but it creates temporal coupling (the callee must be up) and latency adds up across the chain.

**Asynchronous (events/messages):** decoupled, buffers bursts, natural retry — but eventual consistency, harder debugging, and ordering/duplicate handling become your problem.

| Style | Use when |
|---|---|
| REST/JSON | Public APIs, browser clients, simple internal calls |
| gRPC/protobuf | Internal service-to-service; strong contracts, streaming, ~5–10× smaller payloads |
| GraphQL | Aggregating for varied clients; over-fetching is the problem you're solving |
| Message queue (SQS/RabbitMQ) | Work distribution, retries, buffering |
| Event log (Kafka) | Event streaming, replay, multiple independent consumers |
| Webhook | Notifying external parties; needs signing, retries, and an idempotent receiver |

**Anti-pattern: the chatty chain.** `A → B → C → D` synchronously means D's p99 is A's p99, and D's downtime is A's downtime. Fan out in parallel, cache, or restructure with events.

**Shared database between services is the number-one microservices anti-pattern.** It couples deployments through the schema and destroys the independence you paid for. Each service owns its data; others get it via API or events.

> **Asked as:** "REST vs gRPC vs messaging." · "Why can't two services share a database?" · "How do you handle a service that's down?"

---

## 2.5 Cross-cutting concerns in a distributed system

- **Service discovery** — Kubernetes DNS/Services, or Consul/Eureka outside k8s.
- **API gateway** — one entry point for auth, rate limiting, routing, and request aggregation.
- **Distributed tracing** — OpenTelemetry, W3C `traceparent` propagated across every hop. Without it, debugging is guesswork.
- **Correlation id** on every log line, generated at the gateway and passed through.
- **Config and secrets** — externalised (ConfigMap/Secret, Vault, Parameter Store), never baked into images.
- **Contract testing** — Pact or Spring Cloud Contract, so a provider can't break a consumer without CI failing.
- **Service mesh** (Istio/Linkerd) — mTLS, retries, circuit breaking, traffic shifting at the infrastructure layer. Powerful, and a real operational commitment; don't adopt one for five services.

> **Asked as:** "How do you trace a request across ten services?" · "How do you stop a provider breaking its consumers?" · "Do you need a service mesh?"

---

## 2.6 Migration: strangler fig

You rarely get to rewrite. You strangle the old system incrementally:

```
        ┌──── /orders/*  ──────► New Order Service
Client ─┤ (facade/proxy routes by path or feature flag)
        └──── everything else ──► Legacy monolith
```

1. Put a **facade** (gateway/reverse proxy) in front of the monolith — no behaviour change.
2. Pick the **first slice**: high business value, low coupling, clear data boundary.
3. Build the new service; **dual-write or use CDC** to keep data in sync during the transition.
4. **Shadow traffic** — send real requests to both, compare results, don't serve the new one yet.
5. **Route a percentage** through the new service behind a flag; watch error rates and latency.
6. **Cut over**, then delete the old code path — the step teams skip, leaving two systems forever.

**Branch by abstraction** is the in-process equivalent: introduce an interface, add the new implementation behind a flag, migrate callers, delete the old one.

> **Asked as:** "How do you migrate a monolith to services without a big-bang rewrite?" · "What is the strangler fig pattern?" · "How do you keep two systems' data in sync during migration?"

---

## 2.7 Rapid-fire answers

| Question | Answer |
|---|---|
| Conway's Law | Systems mirror the communication structure of the org that builds them |
| Distributed monolith | Services that must be deployed together — all the cost, none of the benefit |
| Database per service | Each service owns its schema; others access via API/events |
| Backend for Frontend (BFF) | A per-client aggregation layer (web, mobile) so clients aren't chatty |
| Sidecar | A helper container alongside the app (proxy, log shipper, secrets agent) |
| API versioning between services | Additive changes only; deprecate with a schedule; consumer-driven contract tests |
| Orchestration vs choreography | Central coordinator vs services reacting to events; orchestration is clearer past ~3 steps |
| Idempotent consumer | Dedupe on event id (inbox table with a unique constraint) |
| Service granularity | "As small as possible, as large as necessary" — a team should own several, not fractions of one |
| Serverless fit | Spiky, event-driven, stateless workloads; watch cold starts, vendor lock-in, and per-invocation cost |

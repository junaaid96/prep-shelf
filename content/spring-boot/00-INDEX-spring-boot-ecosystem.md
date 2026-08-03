# The Spring Boot Ecosystem — Full Reference Series (2026)

Based on the "iceberg" post: Spring Boot looks like `@RestController` + `@Service` + `@Autowired`, but production systems run on 8 layers underneath. This series covers every layer with explanations, runnable-style examples, and what's actually current in mid-2026 — not 2022 tutorial content.

## How to use this series

Each file is self-contained. Read them in order if you want the full picture, or jump straight to the layer you need. Every section ends with **Go Deeper** links to the specific next thing worth learning.

| # | File | Covers |
|---|------|--------|
| 1 | `01-core-framework.md` | Spring Core, IoC/DI, Bean Lifecycle, Spring MVC, Auto-configuration, ApplicationEvents |
| 2 | `02-data-layer.md` | Hibernate ORM, Spring Data JPA, PostgreSQL, HikariCP, Flyway/Liquibase, JDBC Template, MongoDB, H2 |
| 3 | `03-web-and-apis.md` | REST APIs, WebFlux, gRPC, OpenAPI/Swagger, Jackson, Project Reactor, RestClient |
| 4 | `04-security.md` | Spring Security, JWT/OAuth2.1, Keycloak, RBAC/ABAC, CSRF, TLS, Spring Authorization Server, Passkeys |
| 5 | `05-messaging-and-async.md` | Kafka, RabbitMQ, @Async/@Scheduled, Outbox Pattern, Saga |
| 6 | `06-caching-and-storage.md` | Redis, MongoDB, AWS SQS/SNS, Cassandra, Ehcache, caching strategy |
| 7 | `07-cloud-and-devops.md` | Docker, Kubernetes, Spring Cloud, Config Server, Gateway, Helm, Ingress/Gateway API, CI/CD, Terraform |
| 8 | `08-monitoring-and-testing.md` | Actuator, Prometheus, Grafana, Resilience4j, Micrometer, OpenTelemetry/Zipkin/Jaeger, Testcontainers |

## Where this series fits your current stack

You're running Java + Spring Boot + Angular + PostgreSQL microservices at eGeneration, and you've already gone deep on distributed systems patterns (Saga, Outbox, Strangler Fig, idempotency, Consistent Hashing) and picked Resilience4j over Hystrix, Kubernetes-native discovery over Eureka. This series doesn't re-teach those patterns from scratch — instead, each relevant file shows **where in the Spring Boot stack that pattern actually gets implemented** (e.g., Outbox → `05-messaging-and-async.md`, retry/circuit breaking → `08-monitoring-and-testing.md`).

## The single biggest thing that changed in 2026: Spring Boot 4 / Spring Framework 7

If you last touched Spring seriously during the 3.x/Framework 6 era, this is the update that matters most, and it touches almost every file in this series:

- **Released:** Spring Framework 7.0 and Spring Boot 4.0 shipped November 2025; <cite index="8-1">the current stable version as of mid-2026 is Spring 7.0.8 and Spring Boot 4.1.0</cite>.
- **Baseline:** <cite index="7-1">Java 17 remains the minimum, but Java 21 and Java 25 are strongly recommended</cite> to get virtual threads. <cite index="2-1">Spring Framework 7 keeps the JDK 17 baseline while embracing JDK 25, and adopts Jakarta EE 11 and Kotlin 2.2 as new baselines</cite>.
- **Resilience is now built into the framework itself** — <cite index="2-1">Spring Boot 4 introduces built-in resilience features including retry and concurrency throttling</cite>, not just via Resilience4j add-ons.
- **JSON:** <cite index="2-1">Spring Boot 4 migrates to Jackson 3 for JSON processing</cite>, and <cite index="2-1">the monolithic autoconfigure JAR is split into modules</cite> so you're not scanning configuration for tech you don't use.
- **API versioning is first-class**, with <cite index="9-1">four supported strategies out of the box: path, header, query parameter, and media type parameter</cite> — Spring doesn't pick one for you.
- **RestTemplate is on its way out:** <cite index="9-1">Spring Framework 7.1 (expected November 2026) will deprecate RestTemplate in favor of RestClient, and Spring Framework 8 will remove it entirely</cite>.
- Because of the Jakarta Servlet 6.1 jump, <cite index="9-1">Spring Boot 4 currently does not support the Undertow web server</cite> — worth checking if any of your services use it.

Every file below flags where a specific technology intersects with this Boot 4 shift.

## Suggested reading order given where you are

1. `01-core-framework.md` and `02-data-layer.md` — quick refresh, since these underpin everything else in your day job.
2. `04-security.md` — flagged as your highest-leverage track (Application Security); OAuth 2.1 and passkey support are genuinely new since you last looked.
3. `03-web-and-apis.md` — REST versioning and RestClient migration affect code you write weekly.
4. `05-messaging-and-async.md` and `06-caching-and-storage.md` — lighter touch, since you've already internalized Outbox/Saga/idempotency; this fills in the Spring-specific plumbing.
5. `07-cloud-and-devops.md` — your other flagged high-leverage track (Cloud Security); Gateway API replacing Ingress is the big 2026 shift here.
6. `08-monitoring-and-testing.md` — closes the loop on how you'd actually know if any of the above is working in production.

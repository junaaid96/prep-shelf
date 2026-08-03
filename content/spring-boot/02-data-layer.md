# 2. Data Layer — Hibernate, Spring Data JPA, PostgreSQL, HikariCP, Migrations

## 2.1 Spring Data JPA + Hibernate ORM

Hibernate is the ORM implementation; Spring Data JPA is a layer on top that eliminates boilerplate DAO code by generating implementations from interface method names or `@Query` annotations.

```java
public interface OrderRepository extends JpaRepository<Order, UUID> {
    // Method name → SQL, generated at startup
    List<Order> findByCustomerIdAndStatus(UUID customerId, OrderStatus status);

    // Escape hatch when method-name derivation gets unreadable
    @Query("select o from Order o where o.total > :minTotal and o.createdAt >= :since")
    List<Order> findHighValueOrdersSince(@Param("minTotal") BigDecimal minTotal,
                                          @Param("since") Instant since);

    // Bypasses the persistence context entirely — needed for bulk operations
    @Modifying
    @Query("update Order o set o.status = :status where o.id in :ids")
    int bulkUpdateStatus(@Param("ids") List<UUID> ids, @Param("status") OrderStatus status);
}
```

**The N+1 query problem** — the single most common Spring Data JPA performance bug. Fetching a list of `Order`, then accessing `order.getLineItems()` in a loop triggers one query per order.

```java
// BAD: 1 query for orders + N queries for line items
List<Order> orders = orderRepository.findAll();
orders.forEach(o -> o.getLineItems().size()); // N+1

// GOOD: single query with JOIN FETCH
@Query("select distinct o from Order o left join fetch o.lineItems where o.status = :status")
List<Order> findWithLineItemsByStatus(@Param("status") OrderStatus status);

// GOOD alternative: @EntityGraph, keeps the repository method name-derived
@EntityGraph(attributePaths = {"lineItems", "lineItems.product"})
List<Order> findByStatus(OrderStatus status);
```

**What's new in 2026 — Hibernate ORM 7.1 (ships with Spring Boot 4 / Jakarta Persistence 3.2):** <cite index="9-1">Hibernate ORM 7.1 no longer allows a detached entity to be reassociated with a persistence context</cite>. If any of your code does `session.update(detachedEntity)` or relies on implicit reattachment, that pattern breaks — you now need `merge()` explicitly, which is the safer, more predictable behavior anyway (it copies detached state into a managed instance instead of silently attaching the detached one).

## 2.2 PostgreSQL + HikariCP

HikariCP is Spring Boot's default connection pool — fast, minimal, and the pool sizing is the thing people get wrong most.

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/orders_db
    hikari:
      maximum-pool-size: 10       # NOT "as high as possible" — see below
      minimum-idle: 10
      connection-timeout: 30000
      idle-timeout: 600000
      max-lifetime: 1800000
```

**Pool sizing rule of thumb (from HikariCP's own formula):** `connections = ((core_count * 2) + effective_spindle_count)`. For a typical cloud DB on SSD, that's roughly `(CPU cores * 2) + 1`. Bigger is *not* better — PostgreSQL handles a moderate number of connections efficiently but each one is a full backend process with its own memory; too many idle connections just wastes DB-side RAM and can cause more contention, not less. This is the exact interaction flagged in the previous file: enabling virtual threads means your app can *issue* far more concurrent DB calls, so you'll want PgBouncer (transaction-mode pooling) in front of Postgres for high-fan-out services rather than just cranking `maximum-pool-size`.

## 2.3 Database Migrations — Flyway vs Liquibase

Never let Hibernate's `ddl-auto: update` touch a production schema. Use a migration tool that gives you a reviewable, versioned history.

```
src/main/resources/db/migration/
  V1__create_orders_table.sql
  V2__add_status_index.sql
  V3__add_customer_email_column.sql
```

```yaml
spring:
  jpa:
    hibernate:
      ddl-auto: validate   # Hibernate checks schema matches entities, never writes DDL
  flyway:
    enabled: true
    locations: classpath:db/migration
```

Flyway (plain SQL, simpler mental model) vs Liquibase (XML/YAML/JSON changesets, supports rollback definitions and is more DB-agnostic) — for a Postgres-only microservices shop like yours, Flyway's plain-SQL approach is usually the lower-friction choice since you're not trying to abstract across multiple DB vendors.

## 2.4 JdbcTemplate — when you skip the ORM entirely

For reporting queries, bulk operations, or anywhere object-relational mapping overhead isn't worth it:

```java
@Repository
public class OrderReportDao {
    private final JdbcTemplate jdbc;

    public List<RevenueByDay> revenueByDay(LocalDate from, LocalDate to) {
        return jdbc.query(
            "select created_at::date as day, sum(total) as revenue " +
            "from orders where created_at between ? and ? group by 1 order by 1",
            (rs, rowNum) -> new RevenueByDay(rs.getDate("day").toLocalDate(), rs.getBigDecimal("revenue")),
            from, to
        );
    }
}
```

## 2.5 MongoDB (polyglot persistence) and H2 (testing)

`Spring Data MongoDB` mirrors the JPA repository pattern (`MongoRepository<T, ID>`), useful for document-shaped data (catalogs, event logs, audit trails) sitting alongside your relational core data. H2 is an in-memory DB used almost exclusively for fast integration tests — but note the field below: **Testcontainers with real PostgreSQL has mostly replaced H2-for-tests** as the recommended practice, because H2's SQL dialect quietly diverges from Postgres in ways that hide real bugs (see `08-monitoring-and-testing.md`).

## Go Deeper
- Second-level cache (Hibernate + Redis/Ehcache) — only worth it for read-heavy, rarely-changing reference data; easy to introduce stale-data bugs otherwise
- Optimistic locking with `@Version` for concurrent update conflicts — directly relevant to your idempotency/Saga work
- `@Transactional` propagation levels (`REQUIRED` vs `REQUIRES_NEW` vs `NESTED`) — required reading before you touch the Outbox Pattern implementation in the next file
- Database-per-Service pattern (which you've already studied) is exactly why this file doesn't cover cross-service joins — that's what the Saga/CQRS patterns in your architecture notes solve

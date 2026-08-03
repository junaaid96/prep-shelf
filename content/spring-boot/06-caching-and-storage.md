# 6. Caching & Storage — Redis, MongoDB, SQS/SNS, Cassandra

## 6.1 Redis + Spring's `@Cacheable` abstraction

```java
@Configuration
@EnableCaching
public class CacheConfig {
    @Bean
    RedisCacheManager cacheManager(RedisConnectionFactory factory) {
        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(10))
            .disableCachingNullValues();
        return RedisCacheManager.builder(factory).cacheDefaults(config).build();
    }
}

@Service
public class ProductService {
    @Cacheable(value = "products", key = "#sku")
    public Product findBySku(String sku) {
        return productRepository.findBySku(sku).orElseThrow();
    }

    @CacheEvict(value = "products", key = "#product.sku")
    public void updatePrice(Product product) {
        productRepository.save(product);
    }
}
```

**The three things people get wrong with `@Cacheable`:**
1. **Self-invocation doesn't trigger the cache.** Calling `this.findBySku(x)` from another method in the same class bypasses the Spring AOP proxy entirely — the annotation is silently ignored. Only external calls through the bean go through the proxy.
2. **Cache stampede** — if a hot key expires and 500 concurrent requests all miss simultaneously, they all hit the DB at once. Redis's `SET key value NX EX ttl` pattern (or a short-lived lock) prevents this; Spring's default `@Cacheable` doesn't handle it for you.
3. **Serialization mismatches** — if you change a DTO's fields, old cached entries deserialize incorrectly or throw. Configure explicit `RedisSerializer` (e.g., `GenericJackson2JsonRedisSerializer`) rather than relying on Java serialization defaults, and version your cache keys (`products:v2:{sku}`) when you make breaking DTO changes.

## 6.2 Cache-aside vs write-through vs write-behind

| Strategy | Read path | Write path | Tradeoff |
|---|---|---|---|
| Cache-aside (most common, shown above) | App checks cache, falls back to DB, populates cache | App writes DB, then evicts/updates cache | Simple; brief staleness window is possible |
| Write-through | Cache always fresh | App writes to cache, cache writes through to DB | Every write pays cache latency too |
| Write-behind | Cache always fresh | App writes to cache; cache asynchronously flushes to DB | Fastest writes; risk of data loss if cache crashes before flush |

For a healthcare records system, cache-aside with short TTLs and explicit eviction on write (as shown above) is almost always the right default — write-behind's data-loss risk is rarely worth it outside high-throughput analytics/metrics use cases.

## 6.3 Distributed locking with Redis (relevant to your Saga/idempotency work)

```java
public boolean acquireLock(String orderId, Duration ttl) {
    Boolean acquired = redisTemplate.opsForValue()
        .setIfAbsent("lock:order:" + orderId, "locked", ttl);
    return Boolean.TRUE.equals(acquired);
}
```

Useful for preventing two saga steps or two scheduled-poller instances (across multiple app replicas) from processing the same outbox row simultaneously. For anything more critical than "avoid duplicate work" — i.e., actual correctness guarantees — reach for the Redlock algorithm or, better, push the guarantee down to the database with `SELECT ... FOR UPDATE SKIP LOCKED`, which is often simpler and more reliable than distributed locking for this exact "claim a row to process" pattern.

## 6.4 AWS SQS / SNS — the managed alternative to Kafka/RabbitMQ

SQS is a managed queue (competing consumers, at-least-once, no ordering guarantee unless you use FIFO queues); SNS is pub/sub fan-out (one message → many subscribers, often SQS queues or Lambda functions). The common pattern is **SNS → fan-out → multiple SQS queues**, giving you Kafka-topic-like fan-out without operating Kafka yourself.

```java
@Bean
SqsTemplate sqsTemplate(SqsAsyncClient client) {
    return SqsTemplate.builder().sqsAsyncClient(client).build();
}

@SqsListener("order-processing-queue")
public void processOrder(OrderMessage message) { ... }
```

Reach for SQS/SNS over self-managed Kafka/RabbitMQ when you're already AWS-native and don't want to operate broker infrastructure yourself — the tradeoff is less throughput ceiling and no replay-from-offset semantics compared to Kafka.

## 6.5 MongoDB as a caching/read-model store (ties to CQRS)

Beyond being a general document DB (file 2), MongoDB is a common choice for the **read side of CQRS** — you write to Postgres (source of truth, strong consistency) and project a denormalized, query-optimized read model into MongoDB via the same event stream discussed in the messaging file. This avoids expensive joins on the read path entirely.

## 6.6 Cassandra — when eventual consistency at massive write scale is the requirement

Cassandra trades strong consistency for linear write scalability across many nodes with no single point of failure — the classic fit is time-series/event data at very high write volume (IoT sensor data, audit logs at scale, message history) where you mostly append and query by a known partition key, and eventual consistency across replicas is acceptable. Not a typical fit for transactional order/patient data — that stays in PostgreSQL.

## 6.7 Ehcache — the local, no-network alternative to Redis

When cache data is small, per-instance staleness is tolerable, and you want to avoid a network hop entirely, Ehcache (in-process JVM cache) is lower latency than Redis at the cost of no sharing across service instances — each replica has its own cache, which can be exactly right (e.g., caching parsed config/reference data) or exactly wrong (e.g., caching something that must be consistent across replicas) depending on the data.

## Go Deeper
- Redis Cluster vs Redis Sentinel for HA — different failover models, worth knowing before choosing one for a production deployment
- CQRS read-model rebuild strategy — what happens when your MongoDB projection falls out of sync with Postgres and needs to be replayed from scratch
- `SELECT FOR UPDATE SKIP LOCKED` as a simpler alternative to Redis distributed locks for job-claiming patterns
- Next file: `07-cloud-and-devops.md` — where all of the above (Redis, Kafka, Postgres) actually gets deployed and kept running

# 7. Cloud & DevOps — Docker, Kubernetes, Spring Cloud, CI/CD, Terraform

You flagged Cloud Security as one of your two highest-leverage tracks — the Gateway API section below is the biggest concrete 2026 change in this space.

## 7.1 Docker — packaging a Spring Boot app correctly

```dockerfile
# Multi-stage build — don't ship your build tools in the runtime image
FROM eclipse-temurin:25-jdk AS build
WORKDIR /app
COPY . .
RUN ./gradlew bootJar --no-daemon

FROM eclipse-temurin:25-jre-alpine
WORKDIR /app
COPY --from=build /app/build/libs/*.jar app.jar
# Layered jars let Docker cache dependency layers separately from your code
ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-jar", "app.jar"]
```

Spring Boot's built-in **buildpacks** support (`./gradlew bootBuildImage`) is worth knowing as an alternative — it produces optimized, layered OCI images without you hand-writing a Dockerfile, and automatically splits your app into layers (dependencies, resources, application classes) so redeploys after a code-only change only push the small changed layer.

**Container-aware JVM settings matter more than people realize.** `-XX:+UseContainerSupport` (default since Java 11) makes the JVM respect the container's memory/CPU limits (from cgroups) rather than the host machine's — without it, the JVM can miscalculate heap sizing and get OOM-killed unpredictably under Kubernetes memory limits.

## 7.2 Kubernetes essentials for a Spring Boot service

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: order-service
          image: registry.example.com/order-service:1.4.2
          resources:
            requests: { cpu: "250m", memory: "512Mi" }
            limits: { memory: "768Mi" }   # no CPU limit — avoid CPU throttling surprises
          readinessProbe:
            httpGet: { path: /actuator/health/readiness, port: 8080 }
            initialDelaySeconds: 10
          livenessProbe:
            httpGet: { path: /actuator/health/liveness, port: 8080 }
            initialDelaySeconds: 30
```

Readiness vs liveness is the distinction that trips people up: **liveness** failing → Kubernetes restarts the pod (use for "this process is deadlocked/corrupted"). **Readiness** failing → Kubernetes stops routing traffic to it but doesn't restart it (use for "temporarily can't serve traffic," e.g., DB connection pool exhausted, still recovering from startup). Spring Boot Actuator exposes both groups automatically once you enable `management.endpoint.health.probes.enabled: true`.

## 7.3 Service discovery: you already made the right call

Your existing preference for Kubernetes-native service discovery over Eureka holds up well in 2026 — when you're already running on Kubernetes, its built-in Service + DNS-based discovery (`order-service.default.svc.cluster.local`) does the same job Eureka was built for, without running a separate Spring Cloud component to keep alive and consistent with the actual cluster state. Eureka still earns its place in non-Kubernetes deployments (VMs, bare Spring Cloud stacks) — it's specifically redundant once Kubernetes itself is doing service registration and health-checked routing for you.

## 7.4 Spring Cloud Config Server vs Kubernetes ConfigMaps/Secrets

Same logic applies here. Config Server was built for pre-Kubernetes deployments to centralize `application.yml` across services with dynamic refresh (`@RefreshScope`). On Kubernetes, ConfigMaps and Secrets (mounted as env vars or files, or synced from a vault via External Secrets Operator) cover most of the same need with less infrastructure. Config Server still has a place when you specifically want live config refresh without a pod restart, or you're managing config across a mixed Kubernetes/non-Kubernetes fleet.

```yaml
# ConfigMap-backed config, the Kubernetes-native equivalent
env:
  - name: SPRING_DATASOURCE_URL
    valueFrom:
      configMapKeyRef: { name: order-service-config, key: db-url }
  - name: SPRING_DATASOURCE_PASSWORD
    valueFrom:
      secretKeyRef: { name: order-service-secrets, key: db-password }
```

## 7.5 Ingress → Gateway API: the concrete 2026 migration

This is the single most important networking change to know about. <cite index="27-1">As of 2026, the Kubernetes Gateway API has reached General Availability and is production-ready</cite>, positioned as the successor to Ingress. <cite index="29-1">Core Gateway API resources — GatewayClass, Gateway, HTTPRoute, GRPCRoute, TLSRoute, and ReferenceGrant — have reached GA</cite>.

Why it exists: <cite index="29-1">classic Ingress has annotation overload (advanced features require controller-specific, non-portable annotations) and no role separation between infrastructure config and application routing</cite>. Gateway API fixes both with a **role-oriented model**:

```yaml
# Platform team owns this (infrastructure concern)
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata: { name: prod-gateway, namespace: infra }
spec:
  gatewayClassName: nginx
  listeners:
    - name: https
      protocol: HTTPS
      port: 443
      tls: { certificateRefs: [{ name: wildcard-tls }] }

---
# Application team owns this (routing concern) — clean separation
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata: { name: order-service-route, namespace: default }
spec:
  parentRefs: [{ name: prod-gateway, namespace: infra }]
  hostnames: ["orders.example.com"]
  rules:
    - matches: [{ path: { type: PathPrefix, value: /api/orders } }]
      backendRefs: [{ name: order-service, port: 8080 }]
```

**Is this urgent for you specifically?** <cite index="30-1">If you're using the Ingress-NGINX Controller specifically, it's scheduled for end-of-life March 31, 2026 — after that, no security patches, bug fixes, or compatibility guarantees with newer Kubernetes releases</cite>. If that's your current controller, migration planning is not optional. <cite index="32-1">Ingress itself as an API is not being removed and will remain supported indefinitely</cite> — but <cite index="32-1">all new features go into Gateway API, not Ingress</cite>, and <cite index="32-1">both can coexist on the same cluster during an incremental migration</cite>, so there's no need for a risky big-bang cutover.

## 7.6 Helm — templating Kubernetes manifests

```yaml
# values.yaml
replicaCount: 3
image:
  repository: registry.example.com/order-service
  tag: "1.4.2"
resources:
  requests: { cpu: "250m", memory: "512Mi" }
```

```bash
helm upgrade --install order-service ./chart -f values-production.yaml
```

Helm's real value is templating the *differences* between environments (dev/staging/prod) out of otherwise-identical manifests, plus versioned, rollback-able releases (`helm rollback order-service 1`).

## 7.7 CI/CD — the shape of a typical pipeline for this stack

```
1. Push to main → GitHub Actions / GitLab CI triggers
2. Build + unit test + Testcontainers integration test (see file 8)
3. Build container image, tag with git SHA, push to registry
4. Update Helm values (image tag) → commit to a GitOps repo (Argo CD / Flux watches it)
5. Argo CD/Flux syncs the change to the cluster → rolling deployment
6. Readiness probes gate traffic cutover; automatic rollback on probe failure
```

The GitOps step (5) is the modern default over CI directly running `kubectl apply` — it gives you an auditable, git-based history of exactly what's deployed, and the cluster continuously reconciles to match the repo rather than drifting from ad-hoc `kubectl` commands.

## 7.8 Terraform — provisioning the infrastructure itself

```hcl
resource "aws_eks_cluster" "main" {
  name     = "egeneration-prod"
  role_arn = aws_iam_role.eks_cluster.arn
  vpc_config { subnet_ids = var.private_subnet_ids }
}

resource "aws_rds_cluster" "postgres" {
  engine         = "aurora-postgresql"
  engine_version = "16.4"
  database_name  = "orders"
}
```

Terraform manages the *cluster and cloud resources themselves* (VPC, EKS/GKE cluster, RDS instance, IAM roles) — a different layer from Helm, which manages *what runs inside* an already-provisioned cluster. Both are declarative and both maintain state, but conflating "infra provisioning" with "app deployment" in one tool is a common early mistake — keeping Terraform for cluster/cloud-resource lifecycle and Helm/GitOps for application lifecycle keeps blast radius contained.

## Go Deeper
- Service mesh (Istio/Linkerd) for mTLS + east-west traffic policy — <cite index="34-1">the Gateway API's GAMMA initiative extends the same API to also model this east-west, pod-to-pod traffic, blurring the historical line between "ingress controller" and "service mesh"</cite>
- Horizontal Pod Autoscaler tied to custom Prometheus metrics (not just CPU) — connects directly to the next file
- Blue/green vs canary deployment strategies on top of the CI/CD pipeline above
- Next file: `08-monitoring-and-testing.md` — how you'd actually know any of this is healthy in production

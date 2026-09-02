# 3. Kubernetes & Deployment Strategies

**Current state (Sept 2026):** Kubernetes **1.37** is the newest release (1.35–1.37 are supported). Gateway API has replaced Ingress for new setups, sidecar containers are stable, and in-place pod resource resize has landed. Docker as a runtime is long gone — containerd is standard.

---

## 3.1 The objects you actually use

```
Deployment → ReplicaSet → Pods      (stateless apps, rolling updates)
StatefulSet → Pods with stable identity + PVCs   (databases, Kafka)
DaemonSet   → one pod per node      (log shippers, node exporters)
Job / CronJob → run to completion   (migrations, batch)
Service     → stable virtual IP + DNS + load balancing across pods
Ingress / Gateway API → HTTP routing from outside the cluster
ConfigMap / Secret → configuration and credentials
PVC / PV / StorageClass → persistent storage
HPA / VPA / KEDA → autoscaling
```

**The reconciliation loop is the core idea:** you declare desired state, controllers continuously work to make actual state match. Everything else follows from that — self-healing, rolling updates, and why `kubectl apply` is not `kubectl run`.

> **Asked as:** "Deployment vs StatefulSet vs DaemonSet." · "What is a controller/reconciliation loop?" · "What happens when you `kubectl apply` a new image tag?"

---

## 3.2 A Deployment worth copying

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders-api
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }   # never drop below capacity
  selector:
    matchLabels: { app: orders-api }
  template:
    metadata:
      labels: { app: orders-api }
    spec:
      terminationGracePeriodSeconds: 45      # must exceed your longest request
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        fsGroup: 10001
        seccompProfile: { type: RuntimeDefault }
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: DoNotSchedule
          labelSelector: { matchLabels: { app: orders-api } }
      containers:
        - name: app
          image: registry.example.com/orders-api@sha256:9f2c…   # digest, not a tag
          ports: [{ containerPort: 8080 }]
          envFrom:
            - configMapRef: { name: orders-config }
            - secretRef:    { name: orders-secrets }
          resources:
            requests: { cpu: "250m", memory: "512Mi" }   # what the scheduler reserves
            limits:   { memory: "1Gi" }                  # hard cap; NO cpu limit (see below)
          startupProbe:                                   # protects slow starts
            httpGet: { path: /healthz, port: 8080 }
            failureThreshold: 30
            periodSeconds: 2
          livenessProbe:                                  # restart if wedged
            httpGet: { path: /healthz, port: 8080 }       # must NOT check the database
            periodSeconds: 10
            failureThreshold: 3
          readinessProbe:                                 # remove from Service if not ready
            httpGet: { path: /readyz, port: 8080 }        # MAY check dependencies
            periodSeconds: 5
          lifecycle:
            preStop:
              exec: { command: ["sleep", "5"] }           # let endpoints propagate before exiting
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: ["ALL"] }
```

Four details that separate a working config from a good one:

1. **`maxUnavailable: 0`** keeps full capacity through a rollout.
2. **Liveness must not depend on the database.** If it does, a database blip restarts every pod simultaneously and turns a small outage into a big one.
3. **Memory limit yes, CPU limit usually no.** Memory is incompressible — hitting the limit means OOMKill (exit 137). CPU limits cause **throttling** (CFS quota), which shows up as mysterious p99 latency; requests alone give you a fair share.
4. **`preStop` sleep + grace period.** Pod deletion removes the endpoint and sends SIGTERM *concurrently*; without the sleep, the load balancer can still send you traffic after you've started shutting down. This is the classic source of 502s during deploys.

**PodDisruptionBudget** protects you during voluntary disruptions (node drains, cluster upgrades):

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
spec:
  minAvailable: 2
  selector: { matchLabels: { app: orders-api } }
```

> **Asked as:** "Liveness vs readiness vs startup probe." · "Requests vs limits." · "Why do we get 502s during deploys?" · "Why avoid CPU limits?"

---

## 3.3 Services, Ingress, and Gateway API

| Service type | What it gives |
|---|---|
| `ClusterIP` | Internal virtual IP + DNS (`orders-api.default.svc.cluster.local`) |
| `NodePort` | A port on every node — mostly a building block |
| `LoadBalancer` | A cloud LB per service — expensive if you have many |
| `ExternalName` | A DNS CNAME to something outside |
| Headless (`clusterIP: None`) | DNS returns pod IPs — for StatefulSets and client-side LB |

```yaml
# Gateway API — the successor to Ingress
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata: { name: orders }
spec:
  parentRefs: [{ name: public-gateway }]
  hostnames: ["api.example.com"]
  rules:
    - matches: [{ path: { type: PathPrefix, value: /orders } }]
      backendRefs:
        - { name: orders-api, port: 80, weight: 90 }
        - { name: orders-api-canary, port: 80, weight: 10 }   # traffic splitting, built in
```

Gateway API separates roles (platform team owns `Gateway`, app teams own `HTTPRoute`), and does traffic splitting, header matching, and cross-namespace routing without vendor-specific annotations.

**NetworkPolicy** — by default every pod can talk to every pod. Default-deny and allow explicitly:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: default-deny-ingress }
spec:
  podSelector: {}
  policyTypes: [Ingress]
```

> **Asked as:** "How does a Service route to pods?" (kube-proxy/iptables/IPVS or eBPF, via endpoints selected by labels) · "Ingress vs Gateway API." · "How do you restrict pod-to-pod traffic?"

---

## 3.4 Config, secrets, and storage

```yaml
# Secrets are base64, NOT encrypted by default — enable encryption at rest
# and prefer an external store synced in:
apiVersion: external-secrets.io/v1
kind: ExternalSecret
spec:
  secretStoreRef: { name: vault-backend, kind: ClusterSecretStore }
  target: { name: orders-secrets }
  data:
    - secretKey: DATABASE_URL
      remoteRef: { key: prod/orders, property: database_url }
```

Options: External Secrets Operator (Vault/AWS/GCP), Sealed Secrets (encrypted in Git), or SOPS. **Never commit a plain `Secret` manifest.**

A config change doesn't restart pods by itself. Either mount the ConfigMap as a volume and reload, or annotate the pod template with a checksum so a change rolls the deployment:

```yaml
annotations:
  checksum/config: "{{ include (print $.Template.BasePath \"/configmap.yaml\") . | sha256sum }}"
```

**StatefulSet + PVC** for stateful workloads: stable network identity (`db-0`, `db-1`), stable storage that survives rescheduling, ordered rollout. Serious question first, though: do you want to run your own database in Kubernetes, or use a managed one? For most teams, managed wins.

> **Asked as:** "Are Kubernetes Secrets secure?" · "How do you roll pods when config changes?" · "Would you run Postgres in Kubernetes?"

---

## 3.5 Autoscaling

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: orders-api }
  minReplicas: 3
  maxReplicas: 30
  metrics:
    - type: Resource
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 65 } }
    - type: Pods
      pods:
        metric: { name: http_requests_per_second }
        target: { type: AverageValue, averageValue: "150" }
  behavior:
    scaleDown: { stabilizationWindowSeconds: 300 }   # don't flap
```

- **HPA** scales pod count (the usual one). **VPA** adjusts requests/limits (don't run both on CPU for the same workload). **Cluster Autoscaler / Karpenter** adds nodes.
- **KEDA** scales on external signals — Kafka consumer lag, SQS depth, cron. For queue workers this is far better than CPU.
- HPA is only as good as your requests: if requests are wildly wrong, utilisation percentages are meaningless.

> **Asked as:** "How does HPA decide?" · "How would you autoscale a queue consumer?" · "What's the risk of scaling on CPU alone?"

---

## 3.6 Deployment strategies

| Strategy | Mechanism | Rollback | Cost | Use |
|---|---|---|---|---|
| **Rolling** | Replace pods gradually | Roll forward/undo | Low | Default |
| **Blue-green** | Two full environments, switch traffic | Instant (switch back) | 2× infra | Risky releases, DB-compatible changes |
| **Canary** | 1% → 5% → 25% → 100% with metric gates | Fast, small blast radius | Low | The best default for critical services |
| **A/B** | Route by user attribute | N/A (an experiment) | Low | Product experiments, not safety |
| **Shadow** | Mirror real traffic to the new version, discard responses | N/A | Extra capacity | Validating a rewrite |
| **Feature flag** | Deploy dark, enable per-cohort | Instant (flip the flag) | Low | Decouples deploy from release |

```bash
kubectl rollout status  deploy/orders-api --timeout=180s
kubectl rollout history deploy/orders-api
kubectl rollout undo    deploy/orders-api --to-revision=7
```

**Automated canary** (Argo Rollouts / Flagger) promotes only if error rate and latency stay within thresholds, and rolls back automatically otherwise — this is what makes frequent deploys safe.

**Database migrations are the hard part of any strategy.** Rule: **expand → migrate → contract.**
1. Deploy a schema change that's backward compatible (add a nullable column).
2. Deploy code that writes both old and new, reads old.
3. Backfill.
4. Deploy code that reads new.
5. Later, drop the old column.

Never deploy a schema change and the code that requires it in the same release — during a rolling update, both versions run at once.

> **Asked as:** "Blue-green vs canary." · "How do you roll back?" · "How do you deploy a breaking schema change with zero downtime?"

---

## 3.7 Debugging a cluster

```bash
kubectl get pods -o wide --sort-by=.status.startTime
kubectl describe pod <pod>            # Events at the bottom answer most questions
kubectl logs <pod> -c app --previous  # logs from the CRASHED instance
kubectl top pods
kubectl get events --sort-by=.lastTimestamp | tail -30
kubectl debug -it <pod> --image=nicolaka/netshoot --target=app   # ephemeral debug container
kubectl auth can-i create deployments --as=system:serviceaccount:prod:ci
```

| Pod state | Meaning / first check |
|---|---|
| `Pending` | Unschedulable — insufficient CPU/memory, node selector/taint mismatch, no PV available (`describe` says which) |
| `ImagePullBackOff` | Wrong tag, private registry without `imagePullSecrets`, rate limit |
| `CrashLoopBackOff` | App exits on start — `logs --previous`; usually config/env or a failing dependency |
| `OOMKilled` (137) | Memory limit hit |
| `CreateContainerConfigError` | Missing ConfigMap/Secret key |
| `Terminating` forever | Finalizer stuck, or the process ignores SIGTERM |
| `Running` but no traffic | Readiness failing, or Service selector doesn't match pod labels |

**The label-selector mismatch** is the most common "everything looks fine but nothing works" bug: `kubectl get endpoints <service>` returning empty means the Service selector doesn't match any ready pod.

> **Asked as:** "A pod is in CrashLoopBackOff — walk me through it." · "Pod is Running but the Service returns nothing." · "How do you get logs from a container that already crashed?"

---

## 3.8 Rapid-fire answers

| Question | Answer |
|---|---|
| Pod | Smallest deployable unit; one or more containers sharing network namespace and volumes |
| Sidecar | A helper container in the pod (proxy, log shipper); native `initContainers` with `restartPolicy: Always` since 1.29 |
| Init container | Runs to completion before app containers — migrations, waiting on a dependency |
| Namespace | Logical partition for names, quotas, RBAC — not a security boundary by itself |
| RBAC | Role/ClusterRole + binding to a ServiceAccount; least privilege, no cluster-admin for apps |
| Taint / toleration | Node repels pods unless they tolerate it; pair with node affinity for placement |
| QoS classes | Guaranteed (requests == limits) > Burstable > BestEffort — decides eviction order |
| Helm vs Kustomize | Templated packages with values vs declarative overlays on plain YAML; both are fine, pick one |
| GitOps | Git is the source of truth; Argo CD/Flux reconcile the cluster to it — auditable, revertible |
| Operator / CRD | Extend the API with your own resource + a controller that manages it (databases, certs) |
| Service mesh | mTLS, retries, traffic shifting, telemetry at the infra layer — real value, real complexity |
| When NOT to use k8s | A handful of services and a small team — Cloud Run / ECS / Fly / a VM with compose is less to operate |

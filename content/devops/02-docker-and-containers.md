# 2. Docker & Containers

---

## 2.1 What a container actually is

Not a VM. A container is **a Linux process** with restricted visibility and resources:

- **Namespaces** — what it can see: PID, network, mount, UTS, IPC, user, cgroup.
- **cgroups** — what it can use: CPU, memory, IO, PIDs.
- **Union filesystem** (overlayfs) — layered image, copy-on-write writable layer on top.

It shares the host kernel. That's why containers start in milliseconds instead of seconds, and also why "isolation" is weaker than a VM's — a kernel exploit escapes the container. (gVisor, Kata Containers, and Firecracker microVMs exist for when you need stronger boundaries, e.g. running untrusted code.)

**Image vs container:** an image is the immutable, layered filesystem + metadata. A container is a running instance with a thin writable layer. Delete the container and that layer goes with it — this is why state belongs in volumes or an external store.

> **Asked as:** "Container vs VM." · "What are namespaces and cgroups?" · "Why do containers start faster than VMs?" · "Where does a container's data go when it stops?"

---

## 2.2 A production Dockerfile, annotated

```dockerfile
# syntax=docker/dockerfile:1.7

# ---- build stage ----
FROM node:24-alpine AS build
WORKDIR /app
# Copy manifests FIRST — this layer is cached until dependencies change
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime stage ----
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S app && adduser -S -G app app      # never run as root
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/package.json ./

USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# exec form (no shell) so the process is PID 1 and receives SIGTERM directly
ENTRYPOINT ["node", "dist/server.js"]
```

Every line here is an interview answer:

1. **Multi-stage build** — build tools stay out of the runtime image. 1.2 GB → 180 MB.
2. **Layer ordering** — copy dependency manifests before source, so a code change doesn't invalidate the `npm ci` layer. This is the single biggest build-speed win.
3. **Cache mounts** (`--mount=type=cache`) — keep the package cache between builds without baking it into a layer.
4. **Non-root user** — a container escape as root is much worse than as `app`.
5. **Exec form ENTRYPOINT** — shell form (`CMD node server.js`) makes `/bin/sh` PID 1, which doesn't forward `SIGTERM`, so your graceful shutdown never runs and orchestrators wait for the kill timeout on every deploy.
6. **HEALTHCHECK** — so the platform knows when the app is genuinely serving.
7. **`.dockerignore`** (below) — matters as much as the Dockerfile.

```
# .dockerignore
.git
node_modules
.env*
**/*.test.js
dist
coverage
```

**`CMD` vs `ENTRYPOINT`:** `ENTRYPOINT` is the executable; `CMD` supplies default arguments that a `docker run` argument overrides. Use `ENTRYPOINT ["app"]` + `CMD ["--config", "/etc/app.yml"]`.

**Distroless / slim / alpine:** distroless (`gcr.io/distroless/nodejs24`) has no shell or package manager — smallest attack surface, hardest to debug. Alpine is small but uses musl libc (occasional native-module and DNS surprises). `-slim` Debian images are the balanced default.

> **Asked as:** "How do you reduce image size?" · "Why does my container ignore SIGTERM?" · "What does layer caching depend on?" · "Why not run as root?"

---

## 2.3 Networking, volumes, and compose

```bash
docker network create app-net          # bridge; containers resolve each other by name
docker volume create pgdata            # managed, survives container removal

docker run -d --name db --network app-net \
  -e POSTGRES_PASSWORD_FILE=/run/secrets/pg \
  -v pgdata:/var/lib/postgresql/data \
  --memory=2g --cpus=1.5 \
  postgres:18-alpine
```

| Network mode | Behaviour |
|---|---|
| `bridge` (default) | Private network + NAT; publish ports with `-p` |
| `host` | Shares the host stack — fastest, no isolation, Linux only |
| `none` | No networking |
| user-defined bridge | Like bridge **plus DNS by container name** — what compose creates |

| Storage | Behaviour |
|---|---|
| **Volume** | Docker-managed, portable, best for databases |
| **Bind mount** | Host path — great for dev hot-reload, host-coupled |
| **tmpfs** | In memory, never on disk — for secrets and scratch |

```yaml
# compose.yaml — the local dev environment
services:
  api:
    build: { context: ., target: build }
    command: npm run dev
    volumes: [".:/app", "/app/node_modules"]     # bind source, keep container's node_modules
    ports: ["3000:3000"]
    environment: { DATABASE_URL: postgres://app:app@db:5432/app }
    depends_on:
      db: { condition: service_healthy }          # wait for READY, not just "started"

  db:
    image: postgres:18-alpine
    environment: { POSTGRES_USER: app, POSTGRES_PASSWORD: app, POSTGRES_DB: app }
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      retries: 10

volumes: { pgdata: }
```

`depends_on` alone only waits for the container to *start*. Use `condition: service_healthy`, or make your app retry its database connection (which it should do anyway in production).

> **Asked as:** "Volume vs bind mount." · "How do containers find each other?" · "Why does my app start before the database is ready?"

---

## 2.4 Container security

```bash
# Scan every image in CI and fail the build on high/critical
trivy image --severity HIGH,CRITICAL --exit-code 1 myapp:1.4.2
docker scout cves myapp:1.4.2

# Runtime hardening
docker run --read-only --tmpfs /tmp \
  --cap-drop=ALL --cap-add=NET_BIND_SERVICE \
  --security-opt=no-new-privileges \
  --user 10001:10001 \
  --memory=512m --cpus=1 --pids-limit=200 \
  myapp:1.4.2
```

Checklist:

- **Pin base images by digest** (`node:24-alpine@sha256:…`), not a floating tag — `latest` makes builds non-reproducible.
- **Rebuild regularly** — most CVEs in your image are in the base OS, and only a rebuild picks up the fix.
- **Never bake secrets into images.** `ENV API_KEY=...` is visible in `docker history` forever. Use BuildKit secret mounts at build time, and env/mounted secrets at runtime.
- **Read-only root filesystem** + tmpfs for scratch.
- **Drop all capabilities**, add back only what's needed.
- **Sign images** (Cosign/Sigstore) and verify signatures at admission.
- **Generate an SBOM** (`syft`) and store it with the release so you can answer "are we affected by CVE-X?" in minutes.

> **Asked as:** "How do you secure a container image?" · "Why is `ENV SECRET=...` bad?" · "What is an SBOM and why do you need one?"

---

## 2.5 Debugging containers

```bash
docker logs -f --tail 200 api
docker exec -it api sh                     # shell in (won't work on distroless)
docker debug api                           # or: attach a debug sidecar with tools
docker inspect api | jq '.[0].State'
docker stats                               # live CPU/mem/IO per container
docker run --rm -it --pid=container:api --network=container:api nicolaka/netshoot
```

Common failures and their causes:

| Symptom | Usual cause |
|---|---|
| Exit code 137 | **OOMKilled** — the memory limit was hit. Raise the limit or fix the leak; for JVM/Node set heap limits inside the container |
| Exit code 143 | SIGTERM — normal shutdown |
| Exit code 1 immediately | App crashed at startup; read the logs, check env vars |
| "Permission denied" on a volume | UID mismatch between the container user and the host directory |
| Container ignores Ctrl-C / slow deploys | Shell-form ENTRYPOINT, no signal forwarding — use exec form or `tini` |
| Works locally, fails in CI | Different architecture (`--platform linux/amd64`), cached layers, or a missing `.dockerignore` entry |

**Logs go to stdout/stderr.** Don't write log files inside a container — the platform collects the streams.

> **Asked as:** "What does exit code 137 mean?" · "How do you debug a container that won't start?" · "Where should container logs go?"

---

## 2.6 Rapid-fire answers

| Question | Answer |
|---|---|
| `docker run` vs `docker start` | Create + start a new container vs restart an existing stopped one |
| `COPY` vs `ADD` | `COPY` is literal; `ADD` also fetches URLs and auto-extracts tars — prefer `COPY` |
| `ARG` vs `ENV` | Build-time only vs persisted in the image and runtime environment |
| Layer count | Each `RUN`/`COPY` adds a layer; chain related `RUN`s with `&&` and clean caches in the same layer |
| Deleting a file in a later layer | Doesn't shrink the image — the data is still in the earlier layer. Use multi-stage |
| Multi-arch builds | `docker buildx build --platform linux/amd64,linux/arm64 --push` |
| OCI | The open image/runtime spec — Docker, containerd, Podman, and Kubernetes all speak it |
| Rootless containers | Podman/rootless Docker run the daemon and containers as a normal user |
| Container registry | Docker Hub, ECR, GHCR, Artifactory; tag with an immutable version, never rely on `latest` |
| 12-factor config | Config from the environment, logs to stdout, stateless processes, disposability |

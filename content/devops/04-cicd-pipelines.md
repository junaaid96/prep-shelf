# 4. CI/CD Pipelines

---

## 4.1 CI vs CD vs CD

- **Continuous Integration** — every push is merged to trunk and verified by an automated build + test suite. The point is *fast feedback on integration*, not "we have a Jenkins".
- **Continuous Delivery** — every green build produces a deployable artifact and can be released with one button press.
- **Continuous Deployment** — every green build goes to production automatically.

The four DORA metrics are the standard scorecard: **deployment frequency**, **lead time for change**, **change failure rate**, **time to restore**. Elite teams deploy on demand, with lead times under a day and restore times under an hour. Those numbers come from small batches and automation, not from heroics.

> **Asked as:** "What's the difference between continuous delivery and deployment?" · "How do you measure whether your pipeline is good?"

---

## 4.2 Pipeline stages, and what belongs where

```
 push / PR
    │
    ├─► Fast gate (< 3 min)      lint · format · typecheck · unit tests · secret scan
    ├─► Build                    compile · build image · generate SBOM · sign
    ├─► Deeper tests             integration (Testcontainers) · contract · migration check
    ├─► Security                 SAST · dependency audit · image scan · IaC scan
    ├─► Publish                  push image by digest to the registry
    │
 merge to main
    ├─► Deploy staging           smoke tests · E2E on critical journeys
    ├─► Deploy production        canary → metric gates → promote or auto-rollback
    └─► Post-deploy              synthetic checks · alert on error-budget burn
```

**Fail fast, cheapest first.** Nobody should wait 20 minutes to be told about a lint error. Run the fast gate on every push; run the expensive suite once, in parallel, after it passes.

**Build once, promote the same artifact.** The image tested in staging must be the *identical digest* deployed to production. Rebuilding per environment means you deployed something you never tested. Environment differences belong in config, not in the build.

> **Asked as:** "What stages does your pipeline have?" · "Why build the artifact only once?" · "How do you keep CI fast?"

---

## 4.3 A real GitHub Actions workflow

```yaml
name: ci

on:
  pull_request:
  push: { branches: [main] }

concurrency:                                   # cancel superseded runs on the same ref
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read
  id-token: write            # OIDC → cloud auth with NO long-lived secrets
  packages: write

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run lint && npm run typecheck
      - run: npm test -- --coverage
      - uses: gitleaks/gitleaks-action@v2

  integration:
    needs: verify
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:18-alpine
        env: { POSTGRES_PASSWORD: test }
        options: >-
          --health-cmd="pg_isready -U postgres" --health-interval=5s --health-retries=10
        ports: ["5432:5432"]
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run test:integration
        env: { DATABASE_URL: "postgres://postgres:test@localhost:5432/postgres" }

  build:
    needs: [verify, integration]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    outputs: { digest: ${{ steps.push.outputs.digest }} }
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      - id: push
        uses: docker/build-push-action@v6
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          provenance: true                       # SLSA build provenance attestation
      - uses: aquasecurity/trivy-action@0.24.0
        with:
          image-ref: ghcr.io/${{ github.repository }}@${{ steps.push.outputs.digest }}
          severity: HIGH,CRITICAL
          exit-code: "1"
      - uses: sigstore/cosign-installer@v3
      - run: cosign sign --yes ghcr.io/${{ github.repository }}@${{ steps.push.outputs.digest }}

  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    environment: staging                          # approvals + environment secrets
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with: { role-to-assume: ${{ vars.DEPLOY_ROLE }}, aws-region: ap-southeast-1 }
      - run: ./deploy.sh staging "${{ needs.build.outputs.digest }}"
      - run: ./smoke-test.sh https://staging.example.com

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: production                       # required reviewers gate here
    steps:
      - run: ./deploy.sh production "${{ needs.build.outputs.digest }}"
```

Details worth calling out in an interview:

- **`concurrency` with `cancel-in-progress`** stops five queued runs on the same branch burning minutes.
- **OIDC (`id-token: write`)** replaces stored cloud keys — short-lived, scoped credentials per run. This is the modern answer to "how do you handle CI secrets?"
- **Least-privilege `permissions`** — the default token is too powerful.
- **Deploy by digest**, not tag.
- **Pin third-party actions to a SHA** in security-sensitive repos — tags are mutable and have been hijacked.
- **`environment:`** gives you approval gates and per-environment secrets.

> **Asked as:** "How do you authenticate CI to your cloud without storing keys?" · "How do you keep the pipeline from being a supply-chain risk?" · "Where do approvals go?"

---

## 4.4 Testing strategy inside the pipeline

| Layer | Tool | Runs | Target |
|---|---|---|---|
| Unit | Jest/Vitest, pytest, JUnit | Every push | Seconds; the bulk of your tests |
| Integration | Testcontainers | Every push | Real DB/broker, no mocks of your own infrastructure |
| Contract | Pact, Spring Cloud Contract | Every push | Provider can't break a consumer silently |
| E2E | Playwright, Cypress | Pre-deploy | 5–20 critical journeys, not everything |
| Smoke | curl/synthetic | Post-deploy | "Is it actually alive?" |
| Load | k6, Gatling | Scheduled/pre-release | Regression against a latency budget |

**Flaky tests are a pipeline emergency, not an annoyance.** Once people learn to re-run red builds, the suite has stopped being a signal. Quarantine flakes into a separate job, file them, and fix or delete them on a deadline.

**Coverage** is a diagnostic, not a target. 90% coverage of getters proves nothing; 60% coverage over the business rules and error paths is worth far more. Gate on *not decreasing* rather than an absolute number.

```yaml
- run: npx playwright test --shard=${{ matrix.shard }}/4    # parallelise the slow suite
  strategy: { matrix: { shard: [1,2,3,4] } }
```

> **Asked as:** "What do you test at each level?" · "How do you handle flaky tests?" · "Is 100% coverage a good goal?"

---

## 4.5 Infrastructure as Code

```hcl
# Terraform: everything reviewable, versioned, and reproducible
terraform {
  required_version = "~> 1.9"
  backend "s3" {
    bucket         = "acme-tfstate"
    key            = "prod/orders/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "tf-locks"          # state locking — prevents concurrent applies
    encrypt        = true
  }
}

module "orders_db" {
  source  = "terraform-aws-modules/rds/aws"
  version = "~> 6.10"                     # PIN module versions

  identifier            = "orders-${var.env}"
  engine                = "postgres"
  engine_version        = "18.6"
  instance_class        = var.env == "prod" ? "db.r6g.xlarge" : "db.t4g.medium"
  multi_az              = var.env == "prod"
  backup_retention_period = var.env == "prod" ? 30 : 7
  deletion_protection   = var.env == "prod"
  storage_encrypted     = true
}
```

Practices that matter:

- **Remote state with locking.** Local state means two engineers can destroy each other's infrastructure.
- **`terraform plan` in the PR** as a comment; `apply` only after merge and approval (Atlantis, Spacelift, or a gated job).
- **Separate state per environment** — a `prod` blast radius should never include `dev`.
- **Never edit infrastructure by hand.** Console changes cause drift; run drift detection on a schedule.
- **Policy as code** — `tfsec`/`checkov`/OPA in CI to block public S3 buckets and open security groups before they exist.
- **Secrets never in `.tf` or state** — reference a secret manager; note that Terraform state can contain sensitive values, so encrypt and restrict it.

**Terraform vs Pulumi vs CDK:** declarative HCL with a huge provider ecosystem vs real programming languages (types, loops, tests) — both converge on the same state model. Ansible is configuration management (mutable, procedural), a different job from provisioning.

**GitOps for Kubernetes:** Argo CD/Flux watch a Git repo and reconcile the cluster to it. The deploy step in CI becomes "commit the new digest to the config repo"; the cluster pulls. You get audit, drift correction, and `git revert` as rollback.

> **Asked as:** "Why remote state?" · "How do you review infrastructure changes?" · "Terraform vs Ansible." · "What is GitOps and what does it give you?"

---

## 4.6 Rollback, incidents, and safety nets

**Everything must be revertible.** Before you make a change deployable, know the undo:

| Change | Rollback |
|---|---|
| Code | Redeploy the previous digest (keep the last N) |
| Config | Revert the commit; GitOps reconciles |
| Feature | Flip the flag — seconds, no deploy |
| Schema (expand phase) | Nothing to undo — that's why expand/contract exists |
| Schema (destructive) | Restore from backup — which is why you never do this in one step |

**Post-deploy verification** is part of the deploy, not an afterthought: smoke tests, then watch error rate, latency, and saturation for the bake period. Automate the rollback trigger — a human noticing a graph is too slow.

**Incident basics:** declare early, one incident commander, communicate in one channel, mitigate before diagnosing (roll back first, understand later), then write a **blameless postmortem** with a timeline, contributing factors, and *specific* action items with owners. The output of an incident is a change to the system, not a change to how careful people promise to be.

> **Asked as:** "How do you roll back?" · "Walk me through an incident you handled." · "What makes a postmortem useful?"

---

## 4.7 Rapid-fire answers

| Question | Answer |
|---|---|
| Artifact repository | Registry for images/packages (ECR, GHCR, Artifactory, npm/PyPI proxies) with retention policies |
| Semantic versioning | MAJOR.MINOR.PATCH — breaking / feature / fix; derive it from Conventional Commits |
| Monorepo CI | Only build what changed — Nx/Turborepo affected graphs, or `paths:` filters |
| Caching in CI | Dependency caches keyed on the lockfile hash; Docker layer cache via `type=gha`/registry |
| Self-hosted runners | Needed for private networks or big machines; isolate them — untrusted PR code must never run there |
| Ephemeral environments | A preview env per PR; enormous review value, needs teardown automation and cost caps |
| Secrets in CI | OIDC federation > stored secrets; mask in logs; scope per environment; rotate |
| Pipeline as code | The workflow lives in the repo, reviewed like code — not clicked into a UI |
| Deployment window | Elite teams don't have one; small, reversible changes any time beats a Friday freeze |
| Change failure rate | % of deploys causing a rollback/incident — drive it down with canaries and small batches |

# 3. Application, Network & Supply-Chain Security

---

## 3.1 Secure SDLC — where security actually happens

```
Design      → threat model, abuse cases, data classification
Code        → secure defaults, code review with a security lens, secret scanning pre-commit
Build       → SAST, dependency audit (SCA), IaC scan, SBOM, signing
Test        → DAST on a running instance, authz test suite, fuzzing
Deploy      → image scan + signature verification, admission policy, least-privilege runtime
Operate     → logging & alerting, patching cadence, pentest, bug bounty, incident response
```

| Tool class | What it does | Examples |
|---|---|---|
| **SAST** | Analyses source for vulnerable patterns | Semgrep, CodeQL, SonarQube, Bandit |
| **SCA** | Finds known-vulnerable dependencies | Dependabot, Snyk, `pip-audit`, `npm audit`, Trivy |
| **DAST** | Attacks a running app | OWASP ZAP, Burp |
| **IAST/RASP** | Instruments the running app | Contrast, Sqreen-style agents |
| **Secret scanning** | Finds committed credentials | gitleaks, trufflehog, GitHub secret scanning |
| **IaC scanning** | Misconfigured cloud resources | tfsec, checkov, KICS |
| **Container scanning** | OS/library CVEs in images | Trivy, Grype, Docker Scout |

**Shift left, but don't shift *only* left.** Static tools miss logic flaws; a pentest and a bug bounty find what scanners can't. Both are needed.

**Triage matters more than tool count.** A thousand unreviewed findings is the same as none. Suppress with justification, fix by severity × exploitability × exposure, and track mean-time-to-remediate.

> **Asked as:** "SAST vs DAST vs SCA." · "How do you integrate security into CI without slowing the team down?" · "How do you handle a thousand scanner findings?"

---

## 3.2 Input validation and output encoding

Two different jobs, both required:

- **Validate on input** — allow-list by type, length, format, and range, as close to the boundary as possible. Reject, don't sanitise, when the value is simply invalid.
- **Encode on output** — contextually. The *same* string is safe in HTML text, dangerous in a `<script>`, and different again inside a URL, an HTML attribute, or CSS.

```python
from pydantic import BaseModel, Field, EmailStr, field_validator

class CreatePatient(BaseModel):
    mrn: str = Field(pattern=r"^[A-Z]{2}\d{8}$")       # allow-list format
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    dob: date

    @field_validator("dob")
    @classmethod
    def not_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("date of birth cannot be in the future")
        return v
```

**File uploads** are their own attack surface:

```python
MAX = 10 * 1024 * 1024
ALLOWED = {"image/jpeg": ".jpg", "image/png": ".png", "application/pdf": ".pdf"}

def store(upload):
    if upload.size > MAX: raise ValidationError("too large")
    kind = magic.from_buffer(upload.read(2048), mime=True)   # sniff CONTENT, not the extension
    upload.seek(0)
    if kind not in ALLOWED: raise ValidationError("unsupported type")
    name = f"{uuid7()}{ALLOWED[kind]}"                        # never trust the client filename
    s3.upload_fileobj(upload, BUCKET, f"uploads/{name}",
                      ExtraArgs={"ContentType": kind, "ContentDisposition": "attachment"})
    return name
```

Serve user files from a **separate origin** (so a stored HTML/SVG can't run in your app's origin), with `Content-Disposition: attachment` and a strict `Content-Type`, via short-lived signed URLs. Scan with an AV/YARA pipeline if users share files with each other.

> **Asked as:** "How do you handle file uploads safely?" · "Why is checking the file extension not enough?" · "Validation vs encoding — what's the difference?"

---

## 3.3 Network and transport security

**TLS 1.3** everywhere, including service-to-service inside the cluster. Automate certificates (Let's Encrypt + cert-manager) and alert 21 days before expiry — expired certs remain a top cause of self-inflicted outages.

```nginx
ssl_protocols TLSv1.3 TLSv1.2;
ssl_prefer_server_ciphers off;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-CHACHA20-POLY1305;
ssl_stapling on;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
```

**Network segmentation:**

```
Internet → WAF/CDN → Load balancer (public subnet)
                          ↓
                  App tier (private subnet, no public IP)
                          ↓
                  Data tier (isolated subnet, security group allows ONLY the app tier)
```

- Databases never get a public IP or a `0.0.0.0/0` security-group rule.
- Egress is filtered too — a compromised app that can reach anything on the internet is an exfiltration channel.
- In Kubernetes: default-deny `NetworkPolicy`, then allow explicitly.
- Admin access via SSM/IAP/bastion with MFA and session recording — not a permanently open SSH port.

**SSRF** deserves special attention because cloud metadata makes it devastating:

```python
BLOCKED = [ipaddress.ip_network(n) for n in
           ("127.0.0.0/8","10.0.0.0/8","172.16.0.0/12","192.168.0.0/16",
            "169.254.0.0/16","::1/128","fc00::/7")]

def safe_fetch(url: str):
    u = urlparse(url)
    if u.scheme not in ("http", "https"): raise ValueError("scheme")
    if u.hostname not in ALLOWED_HOSTS: raise ValueError("host not allowed")   # allow-list wins
    ip = ipaddress.ip_address(socket.gethostbyname(u.hostname))
    if any(ip in net for net in BLOCKED): raise ValueError("private address")
    return requests.get(url, timeout=5, allow_redirects=False)   # redirects can re-point to metadata
```

Also enforce IMDSv2 on AWS, and prefer an egress proxy with an allow-list over per-call checks (DNS rebinding defeats naive checks).

**DDoS/abuse:** CDN + WAF at the edge, rate limits per key/IP/route, request size caps, timeouts, autoscaling with a ceiling, and a cached static fallback page.

> **Asked as:** "How do you prevent SSRF?" · "Why can't the database have a public IP?" · "How do you manage TLS certificates?" · "What does a WAF actually do?"

---

## 3.4 Secrets management

**Rules:**

1. Secrets never in code, images, logs, error messages, URLs, or Git — including history.
2. Store in a purpose-built system: Vault, AWS Secrets Manager, GCP Secret Manager, Azure Key Vault, Kubernetes + External Secrets Operator.
3. **Short-lived and dynamic where possible** — Vault-issued database credentials that expire in an hour beat a static password forever.
4. **Rotate on a schedule and on staff departure**, with a two-valid-credentials overlap so rotation is zero-downtime.
5. **Least privilege per environment** — production secrets must be unreachable from dev/CI-for-forks.
6. **Audit access** — who read which secret, when.
7. **Detect leaks**: pre-commit hooks plus repository scanning. When a secret leaks, **rotate first, purge history second** — the moment it was pushed, assume it's known.

```bash
# Injected at runtime, never baked in
export DATABASE_URL="$(vault kv get -field=url secret/prod/orders)"
```

> **Asked as:** "How do you manage secrets?" · "A secret was committed — what do you do, in order?" · "What are dynamic secrets?"

---

## 3.5 Privacy and data protection

- **Classify data** (public / internal / confidential / regulated) and let the class drive controls. You cannot protect what you haven't inventoried.
- **Data minimisation** — don't collect what you don't need; it can't leak if you don't have it.
- **Encryption at rest and in transit**, plus column-level encryption for regulated fields.
- **Retention and deletion**: automatic expiry, and a working "delete my account" path that also clears backups within the documented window, logs, analytics, and third parties.
- **Access control on data, not just endpoints** — audit who read which record. In healthcare this is a legal requirement.
- **Pseudonymise in non-production**: never restore a production dump into staging unmasked.
- **Regulatory shape**: GDPR (lawful basis, DSARs, 72-hour breach notification, data residency), HIPAA (PHI, BAAs, audit trails), PCI-DSS (never store CVV; tokenise PANs — use a payment provider so the card data never touches your servers).

> **Asked as:** "How do you handle PII?" · "What happens when a user asks for deletion?" · "Can you use production data in staging?" · "How do you handle card data?" (you don't — tokenise via a provider)

---

## 3.6 A pre-launch security checklist

**Authentication & access**
- [ ] MFA available; enforced for admin roles
- [ ] Password hashing with Argon2id/bcrypt; breach-list check
- [ ] Sessions: `HttpOnly`, `Secure`, `SameSite`, rotation on login, logout everywhere
- [ ] Rate limiting on login, reset, OTP, and expensive endpoints
- [ ] Authorisation tested per endpoint: user B cannot reach user A's data

**Application**
- [ ] All queries parameterised; no string-built SQL
- [ ] Output encoded per context; CSP with nonces; no `innerHTML` on user data
- [ ] File uploads: type sniffed, size capped, served from a separate origin
- [ ] SSRF allow-list on any outbound fetch of user-supplied URLs
- [ ] Errors generic to clients, detailed in logs, fail-closed on security decisions

**Infrastructure**
- [ ] TLS 1.3, HSTS, security headers, certificate auto-renewal + expiry alerts
- [ ] Database private; least-privilege IAM; no wildcard policies
- [ ] Secrets in a manager; nothing in Git; rotation documented
- [ ] Containers: non-root, read-only FS, dropped capabilities, scanned and signed

**Process**
- [ ] SAST + SCA + secret scanning + IaC scan in CI, gating merges
- [ ] SBOM per release; dependency updates automated
- [ ] Security events logged and alerted; logs tamper-evident
- [ ] Backups encrypted **and restores tested**
- [ ] Incident response plan with an on-call rota and a contact list
- [ ] Pentest before launch for anything handling money or health data

> **Asked as:** "You're launching next month — what's your security checklist?" This list is the answer.

---

## 3.7 Rapid-fire answers

| Question | Answer |
|---|---|
| WAF | Filters HTTP traffic on rules/signatures — useful defence in depth, trivially bypassed alone |
| Bug bounty vs pentest | Continuous crowd-sourced vs time-boxed expert engagement; do both when mature |
| CVE / CVSS / KEV | Identifier / severity score / CISA's list of *actively exploited* CVEs — patch KEV first |
| Zero-day | No patch exists — rely on defence in depth, WAF virtual patching, and fast detection |
| Threat model | Assets, entry points, threats (STRIDE), mitigations — 30 minutes at design time |
| Blast radius | What one compromised credential/service can reach — shrink with segmentation and least privilege |
| Honeytoken | A fake credential/record that alerts when used — cheap, high-signal intrusion detection |
| Security champion | An engineer in each team who owns the security conversation — scales security beyond one team |
| Compliance ≠ security | SOC 2/ISO 27001 prove process exists; they don't prove you can't be breached |
| Responsible disclosure | `security.txt`, a monitored address, an SLA, and no legal threats against good-faith reporters |

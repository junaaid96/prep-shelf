# 2. Authentication & Authorization

**Authentication** = who are you. **Authorization** = what may you do. They fail differently and are fixed differently — never conflate them in a design discussion.

---

## 2.1 Sessions vs tokens

| | Server session + cookie | JWT (stateless) |
|---|---|---|
| State | Session store (Redis/DB) | None — the token carries claims |
| Revocation | Instant: delete the session | Hard: short TTL + refresh rotation + denylist |
| Size | Small cookie (an id) | 200–1000 bytes on every request |
| XSS exposure | `HttpOnly` cookie is unreadable by JS | Unsafe in `localStorage`; safe in an `HttpOnly` cookie |
| CSRF exposure | Yes — needs `SameSite` + token | Only if stored in a cookie |
| Scaling | Needs a shared store | Nothing shared |
| Best for | First-party web apps | Mobile, service-to-service, federated multi-service |

**The default recommendation for a browser app is a server session in an `HttpOnly` cookie.** It's simpler, revocable, and immune to token theft via XSS. Reach for JWTs when statelessness genuinely buys you something.

```python
# Cookie flags that matter
response.set_cookie(
    "sessionid", value,
    httponly=True,       # JS cannot read it → XSS can't steal it
    secure=True,         # HTTPS only
    samesite="Lax",      # blocks cross-site POST → CSRF mitigation
    max_age=60 * 60 * 8,
    domain=None,         # don't widen to the parent domain unless you must
    path="/",
)
```

> **Asked as:** "JWT vs session — which and why?" · "Where do you store a token in a browser?" · "How do you log a user out of every device?"

---

## 2.2 JWT, precisely

```
header.payload.signature
{"alg":"RS256","typ":"JWT","kid":"2026-08"}
{"sub":"user_123","iss":"https://auth.example.com","aud":"orders-api",
 "exp":1756800000,"iat":1756799100,"jti":"a1b2","scope":"orders:read orders:write"}
```

**A JWT is signed, not encrypted.** Anyone can read the payload — never put secrets in it. (JWE encrypts, and is rarely worth the complexity.)

**Validation checklist — every one of these is a real CVE class:**

1. **Verify the signature** with the expected key.
2. **Pin the algorithm.** Reject `alg: none`, and never let the token's own header choose between HMAC and RSA — the classic attack signs an HS256 token using the public RSA key as the HMAC secret.
3. **Check `exp`** (and `nbf`), with minimal clock skew tolerance.
4. **Check `iss` and `aud`** — a valid token for a *different* service is not valid for yours.
5. **Fetch keys from JWKS by `kid`**, cache them, and support rotation.

```python
import jwt
claims = jwt.decode(
    token,
    key=jwks_client.get_signing_key_from_jwt(token).key,
    algorithms=["RS256"],                  # explicit allow-list, NOT from the header
    audience="orders-api",
    issuer="https://auth.example.com",
    options={"require": ["exp", "iat", "iss", "aud", "sub"]},
)
```

**Token lifetimes:** access token 5–15 minutes; refresh token days–weeks, **rotating** (each use issues a new one and invalidates the old). Detect **refresh-token reuse** — if an already-used refresh token appears, the token family is compromised: revoke the whole family and force re-authentication.

**Revocation** options for access tokens: keep them short (the simplest answer), maintain a `jti` denylist in Redis until `exp`, or use a `token_version` claim checked against the user record.

> **Asked as:** "Is a JWT encrypted?" · "What is the `alg: none` attack?" · "How do you revoke a JWT?" · "What is refresh token rotation and reuse detection?"

---

## 2.3 OAuth 2.1 and OpenID Connect

**OAuth 2.0/2.1 is authorisation** (delegated access to an API). **OIDC** is the authentication layer on top (it adds the `id_token`, which tells you *who* the user is). Using a plain OAuth access token as proof of identity is a well-known mistake.

**OAuth 2.1** consolidates today's best practice: **PKCE required for all clients**, the implicit and password grants **removed**, exact redirect-URI matching, and refresh-token rotation for public clients.

**Authorization Code + PKCE — the only flow you need for user-facing apps:**

```
1. App generates:  code_verifier (random 43–128 chars)
                   code_challenge = BASE64URL(SHA256(code_verifier))
2. Browser → /authorize?response_type=code&client_id=…&redirect_uri=…
             &scope=openid profile orders:read&state=<csrf>&code_challenge=…&code_challenge_method=S256
3. User authenticates and consents
4. Redirect back with ?code=…&state=…   → app verifies `state` matches
5. App → POST /token  {code, code_verifier, client_id}     (back channel)
6. Auth server verifies SHA256(code_verifier) == code_challenge → returns
   access_token, id_token, refresh_token
```

PKCE stops an attacker who intercepts the authorization code from exchanging it, because they don't have the verifier. `state` prevents CSRF on the callback. `nonce` (in the id_token) prevents replay.

| Grant | Use |
|---|---|
| **Authorization Code + PKCE** | Web apps, SPAs, mobile — everything user-facing |
| **Client Credentials** | Service-to-service, no user involved |
| **Device Code** | TVs, CLIs, input-constrained devices |
| ~~Implicit~~ | Removed — tokens in the URL fragment leak |
| ~~Password (ROPC)~~ | Removed — the app should never see the password |

**Scopes vs claims:** scopes limit what the token may do; claims describe the subject. Keep scopes coarse and enforce fine-grained authorisation in your service — the token says "may touch orders", your code decides "may touch *this* order".

> **Asked as:** "Explain the authorization code flow." · "What problem does PKCE solve?" · "OAuth vs OIDC." · "Why was the implicit flow removed?" · "Which grant for a backend job?"

---

## 2.4 Authorization models

| Model | Rule | Fits |
|---|---|---|
| **RBAC** | Permissions attach to roles; users get roles | Most apps; simple and auditable |
| **ABAC** | Decide from attributes (user, resource, environment) | Context-dependent rules ("own department, during shift hours") |
| **ReBAC** | Decide from relationships in a graph (Google Zanzibar, OpenFGA, SpiceDB) | Sharing/hierarchies — docs, folders, orgs |
| **PBAC / policy engines** | Externalised policy (OPA/Rego, Cedar) | Many services needing one consistent policy |

```python
# RBAC with permissions (not role-name checks scattered through the code)
ROLE_PERMISSIONS = {
    "receptionist": {"appointment:read", "appointment:create", "patient:read"},
    "doctor":       {"appointment:read", "appointment:update", "patient:read", "record:write"},
    "admin":        {"*"},
}

def require(permission: str):
    def decorator(view):
        @wraps(view)
        def wrapper(request, *a, **kw):
            perms = ROLE_PERMISSIONS.get(request.user.role, set())
            if "*" not in perms and permission not in perms:
                logger.warning("authz.denied", extra={"user": request.user.id, "perm": permission})
                raise PermissionDenied
            return view(request, *a, **kw)
        return wrapper
    return decorator

@require("appointment:create")
def create_appointment(request): ...
```

**Check permissions, not role names.** `if user.role == "admin"` is scattered everywhere and impossible to change; `if user.can("invoice:refund")` moves the policy to one place.

**Object-level authorisation is separate from route-level.** Being allowed to call `GET /invoices/{id}` doesn't mean being allowed to see *that* invoice. Scope in the query.

```rego
# OPA/Rego — externalised policy, testable, shared across services
package authz

default allow := false

allow if {
    input.action == "read"
    input.resource.type == "appointment"
    input.resource.clinic_id == input.subject.clinic_id
}

allow if {
    input.action == "update"
    input.resource.doctor_id == input.subject.id
}
```

> **Asked as:** "RBAC vs ABAC." · "How would you model 'a doctor can only see their own patients'?" · "Where do you enforce authorisation in a microservices system?" (at each service — the gateway authenticates, services authorise)

---

## 2.5 Service-to-service and machine identity

- **mTLS** — both sides present certificates. Standard inside a service mesh; identity is the certificate, rotated automatically (SPIFFE/SPIRE, Istio).
- **Client credentials OAuth** — each service has its own client id/secret and gets a short-lived token with scopes.
- **Signed requests** (HMAC over method + path + body + timestamp) for webhooks and partner APIs. Include a timestamp and reject old requests to prevent replay.

```python
# Verifying an inbound webhook — the pattern to memorise
def verify(request, secret: bytes) -> bool:
    ts = request.headers.get("X-Timestamp", "")
    sig = request.headers.get("X-Signature", "")
    if abs(time.time() - int(ts)) > 300:            # replay window
        return False
    expected = hmac.new(secret, f"{ts}.".encode() + request.body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)       # constant-time — NOT ==
```

**API keys** are still fine for simple server-to-server access, if you: store only a hash, prefix them for scanning (`sk_live_…`), scope them, rate-limit per key, support rotation with an overlap window, and log usage.

**Never** put long-lived cloud credentials in CI or in an image — use OIDC federation (GitHub Actions → AWS/GCP role) and workload identity.

> **Asked as:** "How do services authenticate to each other?" · "How do you verify a webhook?" · "Why constant-time comparison?" · "How do you rotate an API key without downtime?"

---

## 2.6 Practical hardening for the auth surface

- **MFA**, with passkeys/WebAuthn where you can — it's the only phishing-resistant option.
- **Breached-password check** at registration and password change (HIBP k-anonymity: send the first 5 hex chars of the SHA-1, compare the rest locally).
- **Rate limit and progressively delay** login, reset, OTP verify — per account and per IP.
- **Session regeneration** on privilege change (login, role change, MFA enrolment).
- **Re-authentication** for sensitive actions: changing email/password, adding a payout account, deleting data.
- **Account-recovery flows are the weakest link** — they're often the path around MFA. Rate limit them, notify the user on every recovery attempt, and never reveal whether an account exists.
- **Notify on security events**: new device login, password change, MFA change, new API key.
- **Enumeration**: uniform responses and timings on login, registration, and reset.

> **Asked as:** "How would you design a secure login system end to end?" · "What's the weakest part of most auth systems?" · "How do you prevent user enumeration?"

---

## 2.7 Rapid-fire answers

| Question | Answer |
|---|---|
| SSO | One identity provider for many apps — SAML (enterprise) or OIDC (modern) |
| SAML vs OIDC | XML/browser-POST, enterprise legacy vs JSON/JWT, mobile & API friendly |
| Access vs refresh token | Short-lived, sent to APIs vs long-lived, only sent to the token endpoint |
| `state` parameter | CSRF protection on the OAuth callback |
| `nonce` | Replay protection for the id_token |
| Token binding / DPoP | Ties a token to a client key so a stolen token can't be replayed elsewhere |
| Impersonation | Admin acting as a user — audit it loudly and time-box it |
| Zero trust | No implicit trust from network location; authenticate and authorise every request |
| Just-in-time access | Grant elevated privileges temporarily with approval and expiry |
| Secrets rotation | Automate it; support two valid credentials during the overlap so rotation is zero-downtime |

# 4. Engineering Workflow, Code Review & Working in the AI Era

---

## 4.1 Code review that improves code and people

**What review is for:** catching defects, spreading knowledge, keeping the codebase coherent, and giving the author a second brain. It is not for demonstrating seniority.

**As a reviewer, in priority order:**

1. **Correctness** — does it do what it claims? Edge cases: empty, null, zero, negative, huge, concurrent, duplicate.
2. **Security** — authz on every path, injection, secrets, unvalidated input, error messages leaking internals.
3. **Design** — is this the right place for this logic? Will the next feature fit? Are the boundaries sensible?
4. **Tests** — do they test behaviour? Would they fail if the code were wrong?
5. **Readability** — will someone understand this in six months?
6. **Consistency** — does it match how this codebase does things?
7. **Style** — should be automated (formatter + linter). If you're commenting on formatting, fix the tooling instead.

**How to phrase it:**

```
✗ "This is wrong."
✓ "If `items` is empty this will raise on line 42 — should it return 0 instead?"

✗ "Why didn't you use a map?"
✓ "A dict keyed by id would make this O(n) instead of O(n²). Worth it here, or is the list always small?"

✗ "Nit: rename this." (buried among 20 comments with no priority signal)
✓ "nit: `data` → `pending_invoices` would read better. Non-blocking."
```

Label severity so the author knows what's required: **blocking** / **suggestion** / **nit** / **question** / **praise**. And do give praise — pointing out a genuinely nice solution costs nothing and shapes the codebase more than criticism does.

**As an author:** keep PRs small (under ~400 lines changed; review effectiveness drops sharply past that), write a description that explains *why* and how to verify it, self-review before requesting a reviewer, respond to every comment (even with "good catch, fixed"), and don't take it personally — the review is of the code.

**Escalate disagreements early.** Two rounds of back-and-forth in comments means a five-minute call is overdue.

> **Asked as:** "What do you look for in a code review?" · "How do you give difficult feedback?" · "How do you handle a reviewer you disagree with?" · "How big should a PR be?"

---

## 4.2 Documentation that survives

| Doc | Audience | Lives |
|---|---|---|
| **README** | Anyone new | Repo root: what it is, how to run it, how to test it, how to deploy it |
| **ADR** (Architecture Decision Record) | Future engineers | `docs/adr/NNNN-title.md` |
| **Runbook** | On-call | Linked from every alert |
| **API docs** | Consumers | Generated from code (OpenAPI) so it can't drift |
| **Code comments** | The next reader | Why, not what |
| **Postmortem** | Everyone | Incident repository |

```markdown
# ADR 0007: Use the Outbox pattern for appointment events

## Status
Accepted — 2026-08-14

## Context
Booking must both persist the appointment and publish `AppointmentBooked` to Kafka.
Publishing after commit can lose events on a crash; publishing inside the transaction
can emit events for a transaction that later rolls back. We have no distributed transactions.

## Decision
Write the event to an `outbox` table in the same local transaction as the appointment.
A relay process polls unsent rows with `FOR UPDATE SKIP LOCKED` and publishes to Kafka.

## Consequences
+ Atomic; no lost or phantom events.
+ Survives broker downtime — events accumulate and drain.
− Adds ~1s publish latency and a table to prune.
− Consumers must be idempotent (at-least-once delivery).

## Alternatives considered
- CDC via Debezium: lower latency, but another system to operate. Revisit at higher volume.
- Two-phase commit: rejected — coupling and coordinator failure modes.
```

ADRs are the highest-value documentation per minute spent. They answer "why on earth is it like this?" — the question that otherwise costs a new engineer a week and often leads to an accidental revert of a deliberate decision.

> **Asked as:** "How do you document architectural decisions?" · "What goes in a README?" · "How do you keep docs from going stale?" (generate what you can, and put the rest next to the code)

---

## 4.3 Estimation and planning

**Why estimates are wrong:** the work you can see is not the work that exists. Unknown unknowns, integration friction, review latency, and environment problems dominate.

Techniques that help:

- **Break down until each piece is ≤ 1 day.** Anything estimated at "a week" is really "I don't know yet" — decompose it or spike it.
- **Estimate in relative points**, not hours, and let velocity convert. Humans compare well and absolute-estimate badly.
- **Give ranges with confidence**: "3–5 days, 80% confident" is honest and actionable; "4 days" is false precision.
- **Timebox spikes.** "Two days to find out if this library works, then we re-estimate."
- **Track actuals** and recalibrate. Most teams are consistently optimistic by a stable factor — measure yours.
- **Say what's excluded**: "this doesn't include the data migration or the admin UI."

**When you're going to miss a deadline, say so as soon as you know**, with options: cut scope, add time, or reduce quality (and be explicit that the third has a cost that arrives later). Surprise is worse than delay.

> **Asked as:** "How do you estimate?" · "What do you do when you'll miss a deadline?" · "Tell me about a project that went off track."

---

## 4.4 Working with AI coding tools (2026 reality)

AI assistants are standard in professional workflows now, and interviewers increasingly ask how you use them. The good answer is neither "I don't" nor "it writes everything".

**Where they help most:** boilerplate and scaffolding, test generation from a clear spec, translating between languages/frameworks, explaining unfamiliar code, generating regexes/SQL/config, first-draft documentation, and reviewing your own diff before a human sees it.

**Where they hurt:** anything requiring context they don't have (your domain rules, your team's conventions, why the last three attempts failed), security-sensitive code, subtle concurrency, and performance work — where a plausible-looking answer is more dangerous than an obviously wrong one.

**The professional discipline:**

1. **You own every line you commit.** "The AI wrote it" is not a defect explanation; it's an admission you shipped code you didn't understand.
2. **Read and understand before merging.** If you can't explain it in review, don't submit it.
3. **Verify against real sources** — hallucinated APIs, deprecated flags, and plausible-but-wrong library behaviour are the common failure mode. Check the docs.
4. **Never paste secrets, customer data, or proprietary code** into a tool without an approved data agreement.
5. **Watch for licence contamination** on large generated blocks resembling known projects.
6. **Tests are the safety net** — AI-generated code with AI-generated tests that both share the same misunderstanding will pass and be wrong. Write at least the key assertions yourself.
7. **Keep your fundamentals sharp.** The skill that's now scarce isn't producing code — it's judging it: knowing what to build, spotting the subtly wrong answer, and designing systems that hold up.

**Prompting that actually works for code:** give the constraints (language version, framework, style guide), the surrounding code, and the failure you're seeing; ask for the reasoning when the answer matters; and iterate in small steps rather than requesting a whole feature at once.

> **Asked as:** "How do you use AI tools in your workflow?" · "What are the risks?" · "How do you review AI-generated code?"

---

## 4.5 Debugging methodically

The difference between a junior and a senior debugger is process, not intuition.

1. **Reproduce it.** A bug you can't reproduce, you can't verify fixed. Nail the exact input, user, environment, and timing.
2. **Read the actual error.** The whole stack trace, bottom to top, including the `Caused by`. Most "mystery" bugs are stated plainly in a message someone skimmed.
3. **Bisect the problem space.** Which layer? Frontend or backend? Add a log/breakpoint at the midpoint and halve it. `git bisect` does this across time.
4. **Form one hypothesis and test it.** "I think the cache is returning a stale tenant" → design the smallest experiment that proves or disproves it. Changing three things at once tells you nothing.
5. **Question your assumptions explicitly.** "The config is loaded" — is it? Print it. The bug is almost always in the thing you were sure about.
6. **Fix the cause, not the symptom.** A `try/except` around the error is not a fix.
7. **Add a regression test** so it never comes back.
8. **Write it down** — a one-paragraph note in the ticket saves the next person the same day.

**Tools per class of bug:** debugger with conditional breakpoints for logic; profiler/flame graph for CPU; heap dump for memory; `tcpdump`/browser network panel for protocol; distributed trace for latency across services; `strace`/`dtrace` for syscalls; ThreadSanitizer/`-race` for concurrency.

**"It works on my machine"** is a checklist, not a joke: versions, environment variables, data, feature flags, timezone, locale, architecture (ARM vs x86), file-system case sensitivity, and network policy.

> **Asked as:** "Walk me through debugging a production issue you've had." · "A user reports something you can't reproduce — what now?"

---

## 4.6 Growing as an engineer

**Seniority is not years or syntax knowledge.** It's judgement under uncertainty, and impact beyond your own keyboard:

| Level | Scope |
|---|---|
| Junior | Completes well-defined tasks with review |
| Mid | Owns features end to end; makes sound local design decisions; debugs independently |
| Senior | Owns systems; makes trade-offs explicit; prevents problems; multiplies the team |
| Staff+ | Owns cross-team technical direction; changes what the org can build |

**What actually moves you up:**

- **Depth in something.** Being the person who genuinely understands the database, or the deployment pipeline, or the domain.
- **Breadth around it.** Enough of everything else to see where your part fits and to talk to the people who own the rest.
- **Writing.** Design docs, ADRs, postmortems. Ideas that aren't written down don't scale beyond the room.
- **Communication.** Explaining a trade-off to a product manager is a technical skill.
- **Finishing things.** Shipped, monitored, documented, and handed over beats three impressive prototypes.
- **Reducing risk for others** — reviews, tests, tooling, mentoring, runbooks.

**Keeping current without drowning:** read source code of the tools you use, read incident writeups from big companies, build something small end to end each quarter, and go deep on fundamentals (networks, databases, concurrency, distributed systems) — those don't churn, and they're what makes learning the next framework take a weekend instead of a month.

> **Asked as:** "What separates a senior engineer from a mid-level one?" · "How do you keep your skills current?" · "Tell me about a time you influenced a technical decision."

---

## 4.7 Rapid-fire answers

| Question | Answer |
|---|---|
| Definition of done | Merged, tested, documented, observable, deployed, verified |
| Pair programming | Two on one problem — best for hard problems, onboarding, and knowledge transfer; not for everything |
| Agile in practice | Short cycles, working software, feedback, adaptation — the ceremonies are means, not ends |
| Story points | Relative size, not hours — velocity converts them |
| Retrospective | What worked, what didn't, one or two concrete changes with owners |
| Blameless culture | Systems fail, not people — psychological safety is what surfaces the real causes |
| On-call | Sustainable rotation, actionable alerts, runbooks, compensation, and time to fix what paged you |
| Mentoring | Ask questions rather than give answers; review to teach; hand over real ownership |
| Saying no | Offer the trade-off, not a refusal: "yes, and it means X slips — which do you want?" |
| Bus factor | How many people can maintain this? Below two is a risk you should be naming |

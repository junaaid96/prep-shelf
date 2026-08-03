# 📙 CS Fundamentals — MCQ Test Preparation Guide
### *(Guide 3 of 4 — based on your "MCQ Test Preparation Guideline" image: CS Fundamentals card)*

**Covers:** Database · Networking · Operating Systems · Security · API/HTTP · General Knowledge

> Companion files: `01-Programming.md` · `02-Data-Structures-Algorithms.md` · `04-Logical-Reasoning.md`
> This is the **theory-deep** counterpart to the applied Database/Networking sections in Guide 1 — this is where MCQs test definitions, internals, and "why," not code.

---

## Table of Contents
1. [Database Management Systems (DBMS)](#1-database-management-systems-dbms)
2. [Computer Networking](#2-computer-networking)
3. [Operating Systems](#3-operating-systems)
4. [Security](#4-security)
5. [API / HTTP Deep Dive](#5-api--http-deep-dive)
6. [General Knowledge](#6-general-knowledge)
7. [Most Asked Interview Questions](#7-most-asked-interview-questions)
8. [Most Used in Real Software Engineering](#8-most-used-in-real-software-engineering)
9. [Learn More](#9-learn-more-links)

---

## 1. Database Management Systems (DBMS)

### 1.1 DBMS vs RDBMS
A **DBMS** manages data generally (may or may not enforce relational structure). An **RDBMS** (Relational DBMS) specifically organizes data into tables with rows/columns and enforces relationships via keys — PostgreSQL, MySQL, Oracle are all RDBMSs.

### 1.2 Keys (a guaranteed MCQ set)

| Key Type | Meaning |
|---|---|
| **Primary Key** | Uniquely identifies each row; cannot be NULL |
| **Foreign Key** | References a primary key in another table; enforces referential integrity |
| **Candidate Key** | Any column (or set) that could qualify as a primary key |
| **Super Key** | Any set of columns that uniquely identifies a row (candidate keys are minimal super keys) |
| **Composite Key** | A primary key made of 2+ columns together |
| **Unique Key** | Enforces uniqueness but allows one NULL (unlike primary key) |

### 1.3 Normalization (extremely high-frequency MCQ topic)
Normalization organizes tables to **reduce redundancy** and prevent **anomalies** (insertion, update, deletion anomalies) by decomposing tables based on functional dependencies.

| Normal Form | Rule |
|---|---|
| **1NF** | Each column holds atomic (indivisible) values; no repeating groups |
| **2NF** | 1NF + no **partial dependency** (non-key attributes depend on the *entire* composite primary key, not part of it) |
| **3NF** | 2NF + no **transitive dependency** (non-key attributes depend only on the primary key, not on other non-key attributes) |
| **BCNF** | Stricter 3NF — every determinant must be a candidate key |

**Worked example:**
```
Unnormalized: Orders(OrderID, CustomerName, CustomerAddress, ProductID, ProductName, Qty)
Problem: CustomerAddress repeats for every order; ProductName repeats for every order line.

3NF result:
Customers(CustomerID, CustomerName, CustomerAddress)
Products(ProductID, ProductName)
Orders(OrderID, CustomerID, ProductID, Qty)
```
- **Denormalization** is the deliberate reverse — introducing redundancy for read performance (common in reporting/analytics/OLAP systems, caching layers).

### 1.4 ACID Properties (must be able to explain each with an example)

| Property | Meaning | Example |
|---|---|---|
| **Atomicity** | Transaction is all-or-nothing | Money transfer: both debit and credit succeed, or neither does |
| **Consistency** | Transaction moves DB from one valid state to another, respecting constraints | Account balance can never go negative if a constraint forbids it |
| **Isolation** | Concurrent transactions don't interfere with each other | Two people booking the last seat simultaneously — only one should succeed |
| **Durability** | Once committed, changes survive crashes | Committed data is written to persistent storage (WAL — Write-Ahead Log) |

### 1.5 Transaction Isolation Levels (advanced, frequently tested for backend roles)

| Level | Dirty Read | Non-repeatable Read | Phantom Read |
|---|---|---|---|
| Read Uncommitted | ❌ Possible | ❌ Possible | ❌ Possible |
| Read Committed | ✅ Prevented | ❌ Possible | ❌ Possible |
| Repeatable Read | ✅ Prevented | ✅ Prevented | ❌ Possible |
| Serializable | ✅ Prevented | ✅ Prevented | ✅ Prevented |

- **Dirty read:** reading uncommitted changes from another transaction.
- **Non-repeatable read:** re-reading a row within the same transaction gives a different value (another transaction updated it in between).
- **Phantom read:** a query run twice within the same transaction returns a different *set of rows* (another transaction inserted/deleted matching rows).
- PostgreSQL's default is **Read Committed**; MySQL's (InnoDB) default is **Repeatable Read**.

### 1.6 Indexing
An index is an auxiliary data structure (typically a **B-Tree** or **B+ Tree**) that speeds up lookups at the cost of extra storage and slower writes (every insert/update/delete must also update the index).

| Type | Notes |
|---|---|
| **Clustered Index** | Determines the physical storage order of table rows; only **one** per table (usually the primary key) |
| **Non-Clustered (Secondary) Index** | Separate structure pointing back to the actual row; a table can have **many** |
| **Composite Index** | Index on multiple columns — order matters (leftmost-prefix rule) |
| **Unique Index** | Enforces uniqueness in addition to speeding up lookups |
| **Full-text Index** | Optimized for text search |

> ⚠️ Why B+ Trees specifically (not binary search trees) for database indexes: B+ Trees have a **high branching factor**, keeping tree height very small even for millions of rows — this minimizes **disk I/O**, which is the real bottleneck (each tree level ≈ one disk page read).

### 1.7 SQL Query Execution Order (a favorite trick MCQ — the order you WRITE differs from the order it EXECUTES)
```
Write order:   SELECT → FROM → WHERE → GROUP BY → HAVING → ORDER BY → LIMIT
Execute order: FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT
```
This is why you **can't** reference a `SELECT` column alias inside a `WHERE` clause (WHERE executes before SELECT), but you **can** in `ORDER BY` (which executes after).

### 1.8 SQL vs NoSQL & CAP Theorem
- **CAP Theorem:** A distributed data store can only guarantee **2 of 3** simultaneously: **C**onsistency, **A**vailability, **P**artition tolerance. Since network partitions are unavoidable in distributed systems, the real-world choice is between **CP** (consistent but may reject requests during a partition — e.g., traditional RDBMS clusters, MongoDB in certain configs) and **AP** (always available but may return stale data — e.g., Cassandra, DynamoDB).
- **BASE** (NoSQL alternative to ACID): **B**asically **A**vailable, **S**oft state, **E**ventual consistency.

### 1.9 Replication & Sharding (scaling, relevant to your microservices work)
- **Replication:** copying data across multiple nodes (Master-Slave / Primary-Replica) for read scaling and fault tolerance.
- **Sharding (horizontal partitioning):** splitting a large table across multiple databases/servers by a shard key, so no single node holds all the data — enables horizontal scaling.
- **Database-per-Service pattern** (you've studied this): each microservice owns its own database schema — prevents tight coupling at the data layer.

### 🔗 Learn More — Database
- [Use The Index, Luke! (indexing deep dive)](https://use-the-index-luke.com/)
- [PostgreSQL Docs: Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)

---

## 2. Computer Networking

### 2.1 The OSI Model (7 layers — a near-certain MCQ, memorize top-to-bottom and bottom-to-top)

| Layer | Name | Function | Example protocols/devices |
|---|---|---|---|
| 7 | **Application** | End-user facing services | HTTP, FTP, DNS, SMTP |
| 6 | **Presentation** | Data formatting, encryption, compression | SSL/TLS, JPEG, ASCII |
| 5 | **Session** | Manages sessions/connections between apps | NetBIOS, RPC |
| 4 | **Transport** | End-to-end delivery, reliability | TCP, UDP |
| 3 | **Network** | Logical addressing, routing | IP, ICMP, routers |
| 2 | **Data Link** | Framing, MAC addressing, error detection | Ethernet, switches, ARP |
| 1 | **Physical** | Raw bit transmission over the medium | Cables, hubs, radio signals |

**Mnemonic (top→bottom):** "**A**ll **P**eople **S**eem **T**o **N**eed **D**ata **P**rocessing"

### 2.2 TCP/IP Model (4 layers — the practical model the internet actually runs on)

| TCP/IP Layer | Roughly maps to OSI |
|---|---|
| Application | Application + Presentation + Session |
| Transport | Transport |
| Internet | Network |
| Network Access (Link) | Data Link + Physical |

### 2.3 TCP vs UDP (guaranteed MCQ comparison)

| | TCP | UDP |
|---|---|---|
| Connection | Connection-oriented (3-way handshake) | Connectionless |
| Reliability | Guaranteed delivery, ordered, retransmits lost packets | No guarantee — "fire and forget" |
| Speed | Slower (overhead of acknowledgments) | Faster |
| Use cases | HTTP/HTTPS, email, file transfer | DNS, VoIP, video streaming, gaming |
| Header size | 20 bytes | 8 bytes |

**TCP 3-way handshake:** `SYN → SYN-ACK → ACK` (connection established). Termination uses a 4-way handshake (`FIN → ACK → FIN → ACK`).

### 2.4 IP Addressing & Subnetting
- **IPv4:** 32-bit address (e.g., `192.168.1.1`), ~4.3 billion addresses (exhausted, hence NAT and IPv6).
- **IPv6:** 128-bit address, vastly larger space, designed to eventually replace IPv4.
- **Subnet mask / CIDR notation:** `192.168.1.0/24` — the `/24` means the first 24 bits are the network portion, leaving 8 bits (256 addresses, 254 usable) for hosts.
- **Private IP ranges (memorize):** `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`.
- **NAT (Network Address Translation):** allows many private-IP devices to share one public IP.

### 2.5 DNS (Domain Name System)
Translates human-readable domain names into IP addresses. **Resolution order:** Browser cache → OS cache → Resolver (ISP) → Root nameserver → TLD nameserver (e.g., `.com`) → Authoritative nameserver → IP returned.

**Common DNS record types:**

| Record | Purpose |
|---|---|
| A | Domain → IPv4 address |
| AAAA | Domain → IPv6 address |
| CNAME | Alias to another domain |
| MX | Mail server |
| TXT | Arbitrary text (often for verification, SPF/DKIM) |
| NS | Nameserver delegation |

### 2.6 Key Network Devices

| Device | OSI Layer | Function |
|---|---|---|
| Hub | Physical (1) | Broadcasts to all ports (dumb, obsolete) |
| Switch | Data Link (2) | Forwards frames based on MAC address, per-port |
| Router | Network (3) | Routes packets between different networks based on IP |
| Load Balancer | Transport/Application (4/7) | Distributes traffic across multiple servers |
| Firewall | Varies | Filters traffic based on rules |

### 2.7 Routing Protocols (part of your networking roadmap)
- **OSPF (Open Shortest Path First):** interior gateway protocol, link-state, uses Dijkstra's algorithm internally.
- **BGP (Border Gateway Protocol):** the protocol that routes traffic between autonomous systems — literally "the protocol that runs the internet."

### 2.8 Application Layer Protocols Cheat Sheet

| Protocol | Port | Purpose |
|---|---|---|
| HTTP | 80 | Web traffic (unencrypted) |
| HTTPS | 443 | Web traffic (encrypted via TLS) |
| FTP | 20/21 | File transfer |
| SSH | 22 | Secure remote shell access |
| SMTP | 25 | Sending email |
| DNS | 53 | Domain resolution (TCP & UDP) |
| DHCP | 67/68 | Automatic IP address assignment |

### 2.9 Load Balancing Algorithms
Round Robin, Weighted Round Robin, Least Connections, IP Hash, Least Response Time — relevant to distributing traffic across your microservice instances.

### 🔗 Learn More — Networking
- [Cloudflare Learning Center](https://www.cloudflare.com/learning/)
- [Computer Networking: A Top-Down Approach (Kurose & Ross) — the standard textbook](https://gaia.cs.umass.edu/kurose_ross/index.php)

---

## 3. Operating Systems

### 3.1 Process vs Thread (the #1 most-asked OS question)

| | Process | Thread |
|---|---|---|
| Definition | An independent program in execution, with its own memory space | A lightweight unit of execution within a process, sharing the process's memory |
| Memory | Separate address space | Shares heap/data with sibling threads; own stack |
| Communication | IPC needed (pipes, sockets, shared memory) — slower | Shared memory — faster, but needs synchronization |
| Creation cost | Expensive | Cheap |
| Crash impact | One process crashing doesn't affect others | One thread crashing can bring down the whole process |

**Process memory layout:** Stack (local vars, return addresses) → Heap (dynamic allocation) → Data (global/static vars) → Text/Code (compiled instructions).

### 3.2 Process States
`New → Ready → Running → Waiting/Blocked → Terminated` (with Ready ↔ Running transitions managed by the scheduler).

### 3.3 CPU Scheduling Algorithms

| Algorithm | Description | Trade-off |
|---|---|---|
| **FCFS** (First Come First Serve) | Non-preemptive, execute in arrival order | Simple but causes "convoy effect" |
| **SJF** (Shortest Job First) | Runs the shortest job next | Optimal average wait time, but needs to know burst time in advance |
| **SRTF** (Shortest Remaining Time First) | Preemptive version of SJF | Can starve long jobs |
| **Priority Scheduling** | Runs highest-priority job first | Can cause starvation (mitigated by **aging** — gradually increasing priority of waiting processes) |
| **Round Robin** | Each process gets a fixed time quantum, cycles through | Fair, good for time-sharing systems; quantum size is a key tuning parameter |

### 3.4 Concurrency & Synchronization

- **Race condition:** Two threads access shared data concurrently and the outcome depends on timing — a bug class, not a feature.
- **Critical section:** the part of code accessing shared resources that must be executed by only one thread at a time.
- **Mutex (Mutual Exclusion Lock):** ensures exclusive access; has an *owner* that must release it.
- **Semaphore:** a counter-based synchronization tool — a **binary semaphore** behaves like a mutex; a **counting semaphore** allows N concurrent accessors (e.g., limiting a connection pool to N connections).
- **Monitor:** combines mutual exclusion + condition variables — Java's `synchronized` + `wait()`/`notify()` implements the monitor pattern directly.

```java
// Classic mutual exclusion in Java
synchronized void withdraw(double amount) {
    if (balance >= amount) balance -= amount;
}
```

> 💡 Directly relevant to your concurrency study: `ReentrantLock`, `ExecutorService`, and **Virtual Threads (Project Loom, Java 21)** are all modern tools for managing exactly these OS-level concurrency primitives at a higher level of abstraction.

### 3.5 Deadlock (must know the 4 Coffman conditions)
A deadlock occurs when a set of processes are each waiting for a resource held by another, forming a cycle with no progress possible.

**4 necessary conditions (ALL must hold for deadlock):**
1. **Mutual Exclusion** — resource can't be shared.
2. **Hold and Wait** — a process holds a resource while waiting for another.
3. **No Preemption** — resources can't be forcibly taken away.
4. **Circular Wait** — a cycle of processes each waiting on the next.

**Handling strategies:**
- **Prevention:** break one of the 4 conditions (e.g., enforce a global lock-acquisition order to prevent circular wait).
- **Avoidance:** Banker's Algorithm — simulate resource allocation before granting it, only proceed if the resulting state is "safe."
- **Detection & Recovery:** allow deadlocks to occur, detect via resource-allocation graph cycles, then kill/rollback a process.

### 3.6 Memory Management

- **Paging:** divides logical memory into fixed-size **pages**, physical memory into equal-size **frames**; a page table maps pages → frames. Enables non-contiguous allocation and virtual memory.
- **Segmentation:** divides memory into variable-size logical segments (code, stack, heap) — matches how programs think about memory, but can cause external fragmentation.
- **Virtual Memory:** gives each process the illusion of a large, contiguous address space, backed by RAM + disk (swap space).
- **Thrashing:** system spends more time swapping pages in/out than doing actual work — happens when there's insufficient RAM for the working set of active processes.
- **Page Replacement Algorithms:** FIFO, LRU (Least Recently Used), Optimal (theoretical benchmark).
- **Belady's Anomaly:** a counter-intuitive case (specific to FIFO) where *increasing* the number of page frames *increases* the number of page faults.

### 3.7 Fragmentation
- **Internal fragmentation:** wasted space *within* an allocated block (e.g., a fixed-size page mostly unused).
- **External fragmentation:** wasted space *between* allocated blocks — free memory exists but isn't contiguous enough to satisfy a request.

### 3.8 Multithreading Models & Modern Java Concurrency (directly tied to your Virtual Threads study)
- **1:1 (Platform threads):** each Java thread maps to one OS thread — the traditional model, expensive to create thousands of.
- **M:N (Virtual Threads, Java 21/Project Loom):** many lightweight virtual threads are multiplexed onto a small number of OS "carrier" threads — dramatically cheaper, enabling thread-per-request style code at massive scale without the old thread-pool tuning complexity.

### 🔗 Learn More — OS
- [OSTEP: Operating Systems: Three Easy Pieces (free textbook)](https://pages.cs.wisc.edu/~remzi/OSTEP/)
- [Baeldung: Java Concurrency](https://www.baeldung.com/java-concurrency)

---

## 4. Security

### 4.1 Authentication vs Authorization (the #1 most-confused pair — always tested)
- **Authentication (AuthN):** *"Who are you?"* — verifying identity (login, password, biometrics, MFA).
- **Authorization (AuthZ):** *"What are you allowed to do?"* — verifying permissions (RBAC roles, ACLs) *after* identity is confirmed.

### 4.2 OWASP Top 10 (2025 edition — the current official list, verified against owasp.org)

| # | Category | What it means |
|---|---|---|
| A01 | **Broken Access Control** | Users acting outside their intended permissions (still #1; now explicitly includes BOLA/BFLA — broken object/function-level authorization in APIs) |
| A02 | **Security Misconfiguration** | Default credentials, exposed debug endpoints, open cloud storage, insecure headers (jumped from #5 to #2, driven by cloud/IaC/container sprawl) |
| A03 | **Software Supply Chain Failures** | *New category.* Compromised dependencies, build pipelines, or third-party packages |
| A04 | **Cryptographic Failures** | Weak/missing encryption, exposed sensitive data in transit or at rest |
| A05 | **Injection** | SQL/NoSQL/OS/LDAP injection — untrusted input executed as code |
| A06 | **Insecure Design** | Flaws in architecture/logic itself (missing threat modeling), not just implementation bugs |
| A07 | **Authentication Failures** | Weak login flows, credential stuffing, session fixation |
| A08 | **Software or Data Integrity Failures** | Trusting unsigned/unverified updates, code, or CI/CD pipelines |
| A09 | **Security Logging and Alerting Failures** | Insufficient logging/alerting to detect and respond to breaches in time |
| A10 | **Mishandling of Exceptional Conditions** | *New category.* Improper error handling, "fail open" logic, unhandled edge cases |

*(Source: verified live against the official OWASP Top 10:2025 release, owasp.org/Top10/2025/)*

> 💡 This directly matches what you flagged as a highest-leverage track — Application Security is exactly where this list applies.

### 4.3 Common Attacks Explained

| Attack | How it works | Defense |
|---|---|---|
| **SQL Injection** | Malicious SQL inserted via unsanitized input (e.g., `' OR '1'='1`) | Parameterized queries / prepared statements (never string-concatenate SQL) |
| **XSS (Cross-Site Scripting)** | Malicious script injected into a page viewed by other users | Output encoding, Content Security Policy (CSP), sanitizing input |
| **CSRF (Cross-Site Request Forgery)** | Tricks an authenticated user's browser into making an unwanted request | Anti-CSRF tokens, `SameSite` cookies |
| **Man-in-the-Middle (MITM)** | Attacker intercepts communication between two parties | TLS/HTTPS everywhere, certificate pinning |
| **DDoS** | Overwhelms a service with traffic from many sources | Rate limiting, WAFs, CDN absorption |
| **Session Hijacking** | Stealing a valid session token to impersonate a user | Secure/HttpOnly cookies, short session expiry, token rotation |
| **Brute Force** | Repeatedly guessing credentials | Account lockout, rate limiting, CAPTCHA, MFA |

```java
// SQL Injection — vulnerable vs safe
// VULNERABLE:
String query = "SELECT * FROM users WHERE email = '" + userInput + "'";

// SAFE — parameterized query
PreparedStatement stmt = conn.prepareStatement("SELECT * FROM users WHERE email = ?");
stmt.setString(1, userInput);
```

### 4.4 Encryption Fundamentals
- **Symmetric encryption:** same key encrypts and decrypts (fast; e.g., AES). Key distribution is the challenge.
- **Asymmetric encryption:** public key encrypts, private key decrypts (or vice versa for signing) (e.g., RSA, ECC). Slower, but solves key distribution — used to establish TLS sessions and for digital signatures.
- **Hashing (not encryption — one-way):** SHA-256 et al. — used for password storage (always **salted + hashed**, e.g., bcrypt/Argon2, never plain SHA for passwords since those are fast and brute-forceable) and data integrity checks.
- **HTTPS/TLS handshake (simplified):** client and server use asymmetric crypto to agree on a shared symmetric session key, then switch to fast symmetric encryption for the actual data.

### 4.5 OAuth 2.0 / 2.1 & JWT (you've already studied this — key MCQ points)
- **OAuth is about authorization, not authentication** (OpenID Connect layers authentication on top of OAuth).
- **OAuth 2.1** consolidates best practices from 2.0: mandates **PKCE** (Proof Key for Code Exchange) even for confidential clients, removes the implicit grant flow (deemed insecure), and removes password grant.
- **JWT structure:** `Header.Payload.Signature`, Base64Url-encoded, **not encrypted** by default (just signed) — never put secrets in a JWT payload.

### 4.6 Zero Trust Architecture (NIST SP 800-207 — part of your roadmap)
Core principle: **"never trust, always verify"** — no implicit trust based on network location; every request is authenticated and authorized regardless of whether it originates inside or outside the traditional network perimeter.

### 4.7 Security Testing & Tools (mentioned in your roadmap)
- **TryHackMe / HackTheBox:** hands-on penetration testing practice platforms.
- **Static Application Security Testing (SAST)** vs **Dynamic (DAST):** SAST scans source code without executing it; DAST tests a running application from the outside.

### 🔗 Learn More — Security
- [OWASP Top 10:2025 (official)](https://owasp.org/Top10/2025/)
- [OWASP API Security Top 10](https://owasp.org/API-Security/editions/2023/en/0x00-header/)
- [NIST SP 800-207: Zero Trust Architecture](https://csrc.nist.gov/publications/detail/sp/800-207/final)

---

## 5. API / HTTP Deep Dive

> Applied/code-level API content lives in `01-Programming.md` Section 4. This section covers additional theory frequently tested under "CS Fundamentals."

### 5.1 Statelessness — Why It Matters
Because REST servers keep no client session state, **any server instance can handle any request** — this is precisely why REST APIs scale horizontally so easily behind a load balancer, and why session data must instead live in a token (JWT) or shared store (Redis) rather than server memory.

### 5.2 Caching Headers
- `Cache-Control: max-age=3600` — how long a response can be cached.
- `ETag` — a hash/version identifier for a resource; client sends `If-None-Match` on the next request; server responds `304 Not Modified` if unchanged, saving bandwidth.
- `Last-Modified` / `If-Modified-Since` — timestamp-based alternative to ETag.

### 5.3 HTTP/1.1 vs HTTP/2 vs HTTP/3
| | HTTP/1.1 | HTTP/2 | HTTP/3 |
|---|---|---|---|
| Connections | One request per connection (or pipelining issues) | **Multiplexing** — many requests over one connection | Multiplexing over **QUIC** (UDP-based) |
| Head-of-line blocking | Yes | Reduced (but still at TCP level) | Solved (QUIC avoids TCP-level blocking) |
| Header compression | No | Yes (HPACK) | Yes (QPACK) |

### 5.4 Statelessness vs Sessions in Practice
Even "stateless" REST APIs often need some notion of session — solved via **stateless tokens** (JWT carried in headers) rather than server-side session storage, or via a shared distributed cache (Redis) if session data must be centrally stored across service instances.

### 🔗 Learn More
- [web.dev: HTTP/2 and HTTP/3](https://web.dev/articles/performance-http2)

---

## 6. General Knowledge

### 6.1 Software Development Lifecycle (SDLC)
Requirements → Design → Implementation → Testing → Deployment → Maintenance. Models: **Waterfall** (sequential, rigid) vs **Agile** (iterative, adaptive — Scrum/Kanban being the most common frameworks).

### 6.2 Agile / Scrum Basics
- **Sprint:** a fixed time-box (commonly 1–4 weeks) to deliver a working increment.
- **Roles:** Product Owner (defines priorities), Scrum Master (facilitates process), Development Team.
- **Ceremonies:** Sprint Planning, Daily Standup, Sprint Review, Retrospective.
- **Kanban vs Scrum:** Kanban is continuous flow with WIP limits (no fixed sprints); Scrum is time-boxed iterations.

### 6.3 Version Control (see also `01-Programming.md` Section 10 for commands)
Distributed (Git) vs Centralized (older SVN) version control — Git gives every developer a full local repo copy, enabling offline work and fast branching.

### 6.4 CI/CD
- **Continuous Integration:** automatically build/test code on every commit — catches integration issues early.
- **Continuous Delivery:** code is always in a deployable state, deployment is a manual trigger.
- **Continuous Deployment:** every passing change is automatically deployed to production, no manual step.

### 6.5 Containers & Cloud Basics
- **Docker:** packages an application with its dependencies into a portable, isolated **container** (lighter weight than a full VM since containers share the host OS kernel).
- **Kubernetes:** orchestrates containers at scale — handles deployment, scaling, self-healing, and **service discovery** (relevant to your noted preference for Kubernetes-native discovery over Eureka).
- **VM vs Container:** VMs virtualize hardware (each has its own full OS — heavier); containers virtualize the OS (share the kernel — much lighter, faster startup).

### 6.6 Cloud Service Models
- **IaaS** (Infrastructure as a Service): raw compute/storage/network (e.g., AWS EC2).
- **PaaS** (Platform as a Service): managed runtime, you deploy code (e.g., Heroku, Render).
- **SaaS** (Software as a Service): fully managed application (e.g., Gmail).

### 6.7 Compiler vs Interpreter
- **Compiler:** translates entire source code to machine code *before* execution (C, C++). Errors caught upfront; typically faster runtime.
- **Interpreter:** executes code line-by-line at runtime (Python, JS — though modern JS engines JIT-compile). Slower but more flexible (dynamic typing, REPL).
- **Java's hybrid model:** compiles to platform-independent **bytecode** (`.class` files), which the JVM then interprets and **JIT-compiles** hot code paths to native machine code at runtime — the best of both worlds, and something you've already studied at the bytecode/JVM level.

### 6.8 CPU, GPU, TPU (you've studied this — quick recap)
- **CPU:** few powerful cores, optimized for sequential/general-purpose tasks and complex branching logic.
- **GPU:** thousands of simpler cores, optimized for massively parallel tasks (originally graphics, now dominant for ML training).
- **TPU:** Google's custom ASIC, purpose-built for tensor/matrix operations in ML workloads — even more specialized than a GPU.

### 🔗 Learn More — General Knowledge
- [Atlassian Agile Coach](https://www.atlassian.com/agile)
- [Docker Docs: Get Started](https://docs.docker.com/get-started/)
- [Kubernetes Docs: Concepts](https://kubernetes.io/docs/concepts/)

---

## 7. Most Asked Interview Questions

1. Explain ACID properties with a real transaction example.
2. What's the difference between a clustered and non-clustered index?
3. Walk through what happens when you type a URL into a browser and press Enter (a classic "explain everything you know" question spanning DNS → TCP handshake → TLS → HTTP request → rendering).
4. Explain the OSI model layers and give a protocol example for each.
5. TCP vs UDP — when would you choose each?
6. What is a deadlock? Explain the 4 necessary conditions and how to prevent one.
7. Difference between a process and a thread, and why is inter-thread communication faster?
8. What is virtual memory and why do we need it?
9. Explain authentication vs authorization with a concrete example.
10. What's in the current OWASP Top 10, and how would you defend against SQL injection?
11. Explain how HTTPS/TLS establishes a secure connection.
12. What is CAP theorem, and where does your database/system land on the C-A-P triangle?
13. What is database normalization? Walk through normalizing a sample table to 3NF.
14. Explain the difference between symmetric and asymmetric encryption.
15. What is a race condition, and how do mutexes/semaphores prevent it?
16. Explain paging vs segmentation in memory management.
17. What's the difference between horizontal and vertical scaling?
18. Explain the difference between Docker containers and virtual machines.
19. What is JWT, and why shouldn't sensitive data be stored in its payload?
20. Explain CI/CD and the difference between continuous delivery and continuous deployment.

---

## 8. Most Used in Real Software Engineering

- **Database fundamentals (indexing, normalization, transactions)** — used every time you design a schema or debug a slow query; directly maps to your PostgreSQL work.
- **Networking basics (HTTP, DNS, TLS)** — needed for virtually every debugging session involving service-to-service or client-server issues.
- **OS concurrency concepts** — underpin every multi-threaded Spring Boot service and your Virtual Threads study.
- **Security fundamentals (OWASP, auth)** — non-negotiable for anything handling healthcare data (Popular Diagnostic Center, eG-Health) or payments (bKash/SSL Wireless).
- **CAP theorem & distributed systems trade-offs** — directly informs your Saga/Event-Driven/Database-per-Service architecture study.
- **Docker/Kubernetes/CI-CD** — the deployment reality of virtually every modern backend team.
- **Agile/Scrum vocabulary** — needed to function in almost any professional engineering team.

### 🔗 Learn More — General
- [High Scalability (real-world system design case studies)](http://highscalability.com/)
- [The Twelve-Factor App (methodology for cloud-native apps)](https://12factor.net/)

---

**Next:** `04-Logical-Reasoning.md` →

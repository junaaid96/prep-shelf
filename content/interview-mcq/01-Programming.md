# 📘 Programming — MCQ Test Preparation Guide
### *(Guide 1 of 4 — based on your "MCQ Test Preparation Guideline" image: Programming card)*

**Covers:** OOP · Design Patterns · API · Database · Networking · HTML/CSS · Programming Fundamentals

> Companion files: `02-Data-Structures-Algorithms.md` · `03-CS-Fundamentals.md` · `04-Logical-Reasoning.md`
> Examples use **Java** (your primary stack) with notes on Python/JS/C++ differences where they commonly appear in MCQs.

---

## Table of Contents
1. [Object-Oriented Programming (OOP)](#1-object-oriented-programming-oop)
2. [SOLID Principles](#2-solid-principles)
3. [Design Patterns](#3-design-patterns)
4. [API Concepts](#4-api-concepts)
5. [Database (Applied/Programming View)](#5-database-appliedprogramming-view)
6. [Networking (Applied/Programming View)](#6-networking-appliedprogramming-view)
7. [HTML/CSS](#7-htmlcss)
8. [Programming Fundamentals](#8-programming-fundamentals)
9. [Most Asked Interview Questions](#9-most-asked-interview-questions)
10. [Most Used Topics in Real Software Engineering](#10-most-used-topics-in-real-software-engineering)
11. [Learn More](#11-learn-more-links)

---

## 1. Object-Oriented Programming (OOP)

### 1.1 What is OOP? (Basic)
OOP is a programming paradigm that organizes software around **objects** (instances of **classes**) rather than functions and logic. A class is a blueprint; an object is a concrete instance of that blueprint holding state (fields) and behavior (methods).

```java
class Car {
    private String model;   // state
    private int speed;

    public Car(String model) {   // constructor
        this.model = model;
        this.speed = 0;
    }

    public void accelerate(int amount) {  // behavior
        this.speed += amount;
    }
}

Car myCar = new Car("Civic");  // object (instance)
myCar.accelerate(20);
```

### 1.2 The Four Pillars (MOST asked OOP topic — know each with a one-line definition + example)

| Pillar | One-line definition | Java example |
|---|---|---|
| **Encapsulation** | Bundling data and methods together, hiding internal state behind access modifiers | `private` fields + public getters/setters |
| **Abstraction** | Exposing only essential behavior, hiding implementation complexity | `interface`, `abstract class` |
| **Inheritance** | A class acquires fields/methods of another class | `class Dog extends Animal` |
| **Polymorphism** | Same interface, different underlying behavior | Method overloading (compile-time) & overriding (runtime) |

**Encapsulation example:**
```java
class BankAccount {
    private double balance;   // hidden from outside

    public double getBalance() { return balance; }
    public void deposit(double amt) {
        if (amt > 0) balance += amt;   // controlled access
    }
}
```

**Abstraction example:**
```java
interface Shape {
    double area();   // WHAT, not HOW
}
class Circle implements Shape {
    double radius;
    public double area() { return Math.PI * radius * radius; }  // HOW
}
```

**Inheritance example:**
```java
class Animal {
    void eat() { System.out.println("eating"); }
}
class Dog extends Animal {
    void bark() { System.out.println("barking"); }
}
```

**Polymorphism example (both types):**
```java
// Compile-time (overloading)
class Calculator {
    int add(int a, int b) { return a + b; }
    double add(double a, double b) { return a + b; }
}

// Runtime (overriding)
class Animal { void sound() { System.out.println("..."); } }
class Cat extends Animal { void sound() { System.out.println("Meow"); } }

Animal a = new Cat();
a.sound();  // "Meow" — resolved at runtime (dynamic dispatch)
```

> ⚠️ **Frequently confused MCQ trap:** Overloading = same method name, different parameter list, resolved at **compile time**. Overriding = subclass redefines a superclass method with the **same signature**, resolved at **runtime** via dynamic dispatch (vtable lookup).

### 1.3 Class vs Object vs Interface vs Abstract Class

| | Class | Interface | Abstract Class |
|---|---|---|---|
| Instantiable? | Yes | No | No |
| Fields | Yes | Only `public static final` (constants) | Yes (any modifier) |
| Method bodies | Yes | Default/static methods allowed (Java 8+), rest abstract | Mix of abstract + concrete |
| Multiple inheritance | No (single class extends) | Yes (`implements` many) | No |
| Constructors | Yes | No | Yes |
| Use when | Concrete implementation | Defining a **contract**/capability | Sharing **partial** implementation across related classes |

> **Most frequently asked comparison question in OOP interviews.** Rule of thumb: use an interface for "can-do" capabilities (`Flyable`, `Comparable`); use an abstract class for "is-a" relationships that share common code.

### 1.4 Advanced OOP Concepts

- **Composition over Inheritance:** Prefer "has-a" relationships (a `Car` *has an* `Engine`) over deep inheritance chains — more flexible, avoids the fragile base class problem.
- **Diamond Problem:** In multiple inheritance, if class B and C both inherit from A and D inherits from both B & C, which version of A's method does D get? Java avoids this for classes (single inheritance) but interfaces with default methods can hit it — resolved by explicit override.
- **Method Hiding vs Overriding:** `static` methods are hidden, not overridden — resolved at compile time based on reference type, not object type.
- **Covariant return types:** An overriding method can return a subtype of the original return type.
- **`this` vs `super`:** `this` refers to current object; `super` refers to the immediate parent class.
- **Constructor chaining:** `this(...)` and `super(...)` calls chain constructors; `super()` is called implicitly if not written.
- **Object cloning:** Shallow copy (`Object.clone()`) vs deep copy (manually copying nested mutable objects).
- **Association, Aggregation, Composition:**
  - *Association* — general relationship (Teacher ↔ Student)
  - *Aggregation* — "has-a", weak ownership; parts can outlive the whole (Department has Professors)
  - *Composition* — "has-a", strong ownership; parts die with the whole (House has Rooms)

### 1.5 OOP in Other Languages (MCQ differences)
- **Python:** Everything is an object (even classes, which are instances of `type`). No true `private` — convention-based (`_protected`, `__name_mangled`). Supports multiple inheritance directly.
- **C++:** Supports true multiple inheritance (and the diamond problem is real — solved via `virtual` inheritance). Has both stack and heap objects; manual memory management.
- **JavaScript:** Prototype-based OOP; `class` syntax (ES6+) is syntactic sugar over prototypes.

### 🔗 Learn More — OOP
- MDN: [Object-oriented programming](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Objects/Object-oriented_programming)
- Oracle Java Tutorials: [OOP Concepts](https://docs.oracle.com/javase/tutorial/java/concepts/)

---

## 2. SOLID Principles

SOLID is one of the **highest-value topics for advanced/scenario-based OOP MCQs and interviews** — it tests real design judgment, not just definitions.

| Letter | Principle | Meaning | Violation smell |
|---|---|---|---|
| **S** | Single Responsibility | A class should have only **one reason to change** | A `UserService` that also sends emails and generates PDF reports |
| **O** | Open/Closed | Open for extension, closed for modification | Adding a new payment type requires editing an existing `if-else` chain instead of adding a new class |
| **L** | Liskov Substitution | Subtypes must be substitutable for their base types without breaking correctness | A `Square extends Rectangle` that overrides `setWidth` in a way that breaks `Rectangle` behavior |
| **I** | Interface Segregation | Prefer many small, specific interfaces over one fat interface | A `Worker` interface forcing `RobotWorker` to implement `eat()` |
| **D** | Dependency Inversion | Depend on abstractions, not concrete implementations | A `UserService` that directly `new`s a `MySQLDatabase()` instead of depending on a `Database` interface |

**Code example (Dependency Inversion — very commonly tested with Spring Boot devs):**
```java
// BAD — tightly coupled
class UserService {
    private MySQLDatabase db = new MySQLDatabase();
}

// GOOD — depends on abstraction, injected (this is literally what @Autowired does)
interface Database { void save(User u); }

class UserService {
    private final Database db;
    public UserService(Database db) { this.db = db; }  // constructor injection
}
```

> 💡 Since you work daily with Spring Boot: `@Autowired`/constructor injection is **Dependency Inversion in practice** — Spring's IoC container supplies the abstraction's concrete implementation for you.

### 🔗 Learn More — SOLID
- [DigitalOcean: SOLID Principles](https://www.digitalocean.com/community/conceptual-articles/s-o-l-i-d-the-first-five-principles-of-object-oriented-design)

---

## 3. Design Patterns

Design patterns are reusable, proven **solutions to recurring design problems** — not finished code, but templates. Popularized by the "Gang of Four" (GoF) book (1994): Gamma, Helm, Johnson, Vlissides. There are **23 classic GoF patterns**, grouped into 3 categories.

> 🧠 **MCQ tip:** Questions usually ask you to (a) name the category, (b) match a real-world scenario to the correct pattern, or (c) spot the pattern in a code snippet.

### 3.1 Creational Patterns (object *creation*)

| Pattern | Purpose | Real-world example |
|---|---|---|
| **Singleton** | Ensure only one instance exists globally | `Runtime.getRuntime()`, a config manager, a connection pool |
| **Factory Method** | Delegate object creation to subclasses | `Calendar.getInstance()` |
| **Abstract Factory** | Create families of related objects without specifying concrete classes | UI toolkit that creates matching `Button`/`Checkbox` for Windows vs Mac |
| **Builder** | Construct complex objects step-by-step | `StringBuilder`, Lombok `@Builder`, constructing an HTTP request |
| **Prototype** | Create new objects by cloning an existing instance | `Object.clone()` |

**Singleton (thread-safe, most commonly asked implementation):**
```java
public class ConfigManager {
    private static volatile ConfigManager instance;
    private ConfigManager() {}  // private constructor

    public static ConfigManager getInstance() {
        if (instance == null) {
            synchronized (ConfigManager.class) {
                if (instance == null) {
                    instance = new ConfigManager();
                }
            }
        }
        return instance;
    }
}
```
> This is the classic **double-checked locking** singleton — a very common "write this pattern" interview task. Modern alternative: `enum Singleton { INSTANCE }` (thread-safe by JVM guarantee, handles serialization automatically).

**Builder pattern:**
```java
public class Pizza {
    private final String size;
    private final boolean cheese;

    public static class Builder {
        private String size;
        private boolean cheese;
        public Builder size(String s) { this.size = s; return this; }
        public Builder cheese(boolean c) { this.cheese = c; return this; }
        public Pizza build() { return new Pizza(this); }
    }
    private Pizza(Builder b) { this.size = b.size; this.cheese = b.cheese; }
}

Pizza p = new Pizza.Builder().size("Large").cheese(true).build();
```

### 3.2 Structural Patterns (how objects *fit together*)

| Pattern | Purpose | Real-world example |
|---|---|---|
| **Adapter** | Convert one interface into another the client expects | `Arrays.asList()`, plugging a US device into an EU socket via an adapter |
| **Bridge** | Decouple abstraction from implementation so both vary independently | Remote control (abstraction) working with different TV brands (implementation) |
| **Composite** | Treat individual objects and compositions uniformly (tree structures) | File system: files and folders both implement `FileSystemNode` |
| **Decorator** | Attach new behavior to an object dynamically without altering its class | Java I/O streams: `new BufferedReader(new FileReader(...))` |
| **Facade** | Provide a simplified interface to a complex subsystem | `javax.faces.context.FacesContext`, a `checkout()` method hiding payment+inventory+shipping subsystems |
| **Flyweight** | Share common state across many objects to save memory | Character glyphs in a text editor, Java's `Integer` cache (-128 to 127) |
| **Proxy** | Provide a placeholder/surrogate that controls access to another object | Spring AOP proxies, Hibernate lazy-loading proxies, `HttpURLConnection` |

**Decorator (used constantly in real Java code):**
```java
InputStream is = new BufferedInputStream(new FileInputStream("file.txt"));
// FileInputStream = core object
// BufferedInputStream = decorator adding buffering behavior
```

**Adapter:**
```java
interface MediaPlayer { void play(String fileName); }

class LegacyPlayer { void playOldFormat(String file) { /* ... */ } }

class MediaAdapter implements MediaPlayer {
    private LegacyPlayer legacy = new LegacyPlayer();
    public void play(String fileName) { legacy.playOldFormat(fileName); }
}
```

### 3.3 Behavioral Patterns (how objects *interact/communicate*)

| Pattern | Purpose | Real-world example |
|---|---|---|
| **Observer** | One-to-many dependency; observers auto-notified of state change | Event listeners, Spring's `ApplicationEvent`, pub/sub systems |
| **Strategy** | Encapsulate interchangeable algorithms behind a common interface | Payment methods (`CardPayment`, `bKashPayment`), `Comparator` |
| **Command** | Encapsulate a request as an object (supports undo/redo/queuing) | Menu actions, job queues, transaction logs |
| **State** | Object changes behavior when its internal state changes | Order status: `Pending → Shipped → Delivered` (matches the FSM you built for Ikbal Textile) |
| **Chain of Responsibility** | Pass a request along a chain of handlers until one handles it | Servlet filters, middleware chains, exception handling chains |
| **Template Method** | Define the skeleton of an algorithm, let subclasses override specific steps | `JdbcTemplate` in Spring, abstract test setup/teardown |
| **Iterator** | Sequentially access elements without exposing underlying structure | Java's `Iterator`/`for-each` |
| **Mediator** | Centralize complex communications between related objects | Chat room server routing messages between users |
| **Memento** | Capture and restore an object's internal state (undo functionality) | Ctrl+Z in text editors |
| **Visitor** | Add new operations to a class hierarchy without modifying it | Compilers walking an AST |
| **Interpreter** | Define a grammar and interpret sentences in that language | Regex engines, SQL parsers |

**Strategy pattern (directly relevant to your payment integrations — bKash, SSL Wireless):**
```java
interface PaymentStrategy { void pay(double amount); }

class BkashPayment implements PaymentStrategy {
    public void pay(double amount) { System.out.println("Paid via bKash: " + amount); }
}
class CardPayment implements PaymentStrategy {
    public void pay(double amount) { System.out.println("Paid via Card: " + amount); }
}

class Checkout {
    private PaymentStrategy strategy;
    public Checkout(PaymentStrategy s) { this.strategy = s; }
    public void process(double amt) { strategy.pay(amt); }
}
```

**Observer pattern:**
```java
interface Observer { void update(String event); }

class Logger implements Observer {
    public void update(String event) { System.out.println("Logged: " + event); }
}

class EventBus {
    private List<Observer> observers = new ArrayList<>();
    public void subscribe(Observer o) { observers.add(o); }
    public void publish(String event) {
        for (Observer o : observers) o.update(event);
    }
}
```

### 3.4 Architectural Patterns (often lumped into "design patterns" MCQs)
- **MVC (Model-View-Controller):** Separates data (Model), UI (View), and control logic (Controller) — the classic Spring MVC / Angular structure.
- **MVP / MVVM:** Variants of MVC used in Android/desktop and modern frontend frameworks (MVVM = Angular's two-way data binding model).
- **Layered (N-tier) Architecture:** Presentation → Business → Data Access layers — the shape of most Spring Boot apps.
- **Microservices vs Monolith:** Independently deployable services vs one deployable unit (you already work extensively with microservices at eGeneration).
- **Repository Pattern:** Abstracts data access logic — Spring Data JPA's `JpaRepository` is a direct implementation of this.

### 3.5 When NOT to use patterns (common "gotcha" MCQ)
Overusing patterns causes **over-engineering**. A pattern should solve a problem you actually have, not be applied because it's "best practice." Interviewers often present a simple scenario and expect you to say *"plain code is fine here — a pattern would add unnecessary complexity."*

### 🔗 Learn More — Design Patterns
- [Refactoring.Guru — Design Patterns (best visual explanations)](https://refactoring.guru/design-patterns)
- [SourceMaking — Design Patterns](https://sourcemaking.com/design_patterns)

---

## 4. API Concepts

### 4.1 What is an API? (Basic)
An Application Programming Interface defines how software components communicate — a contract of available operations, inputs, and outputs, without exposing internal implementation.

### 4.2 REST API Fundamentals
REST (**RE**presentational **S**tate **T**ransfer) is an architectural style (not a protocol) introduced by Roy Fielding, built on HTTP.

**Core REST constraints (frequently asked):**
1. **Client-server** separation
2. **Statelessness** — each request contains all info needed; server stores no client session state
3. **Cacheability** — responses must define themselves as cacheable or not
4. **Uniform interface** — consistent resource naming, standard HTTP verbs
5. **Layered system** — client can't tell if it's talking directly to the server or through an intermediary (load balancer, gateway)
6. **Code on demand** (optional) — server can send executable code (e.g., JS) to the client

**HTTP Methods and their properties (a top MCQ table — memorize this exactly):**

| Method | Purpose | Safe? | Idempotent? | Has body? |
|---|---|---|---|---|
| GET | Retrieve resource | ✅ | ✅ | No |
| POST | Create resource | ❌ | ❌ | Yes |
| PUT | Replace entire resource | ❌ | ✅ | Yes |
| PATCH | Partially update resource | ❌ | ❌ (usually) | Yes |
| DELETE | Remove resource | ❌ | ✅ | Optional |
| HEAD | Like GET but headers only | ✅ | ✅ | No |
| OPTIONS | Discover allowed methods | ✅ | ✅ | No |

> **"Safe"** = does not change server state. **"Idempotent"** = calling it N times has the same effect as calling it once (crucial for retry-safety over unreliable networks — this directly connects to the **idempotency** concept you flagged as your top study priority for Saga/Event-Driven patterns).

**HTTP Status Codes (memorize by category first digit):**

| Range | Meaning | Common codes |
|---|---|---|
| 1xx | Informational | 100 Continue |
| 2xx | Success | 200 OK, 201 Created, 202 Accepted, 204 No Content |
| 3xx | Redirection | 301 Moved Permanently, 304 Not Modified |
| 4xx | Client error | 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 422 Unprocessable Entity, 429 Too Many Requests |
| 5xx | Server error | 500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable |

> ⚠️ **Classic MCQ trap:** **401 Unauthorized** actually means *unauthenticated* (no/invalid credentials). **403 Forbidden** means authenticated but *not permitted*. Interviewers love this distinction.

### 4.3 REST vs SOAP vs GraphQL vs gRPC

| | REST | SOAP | GraphQL | gRPC |
|---|---|---|---|---|
| Format | JSON (usually) | XML only | JSON (query language) | Protobuf (binary) |
| Protocol | HTTP | HTTP/SMTP/etc | HTTP (single endpoint) | HTTP/2 |
| Contract | Loose (OpenAPI optional) | Strict (WSDL) | Strict (Schema) | Strict (.proto) |
| Over/under-fetching | Common problem | N/A | Solved (client specifies fields) | N/A |
| Best for | Public web APIs, CRUD | Enterprise/banking (legacy, strict security) | Complex nested data, mobile clients | Microservice-to-microservice, low-latency |
| Streaming | No (native) | No | Subscriptions | Native bidirectional streaming |

### 4.4 API Versioning Strategies
- **URI versioning:** `/api/v1/users` (most common, most visible)
- **Query parameter:** `/api/users?version=1`
- **Header versioning:** `Accept: application/vnd.company.v1+json`
- **Content negotiation:** via `Accept` header media types

### 4.5 Authentication & Authorization for APIs
- **API Keys:** Simple, static secret sent per request — weak, no expiry by default.
- **Basic Auth:** Base64-encoded username:password in header — not encrypted, must be used over HTTPS.
- **OAuth 2.0 / 2.1:** Delegated authorization — client gets an access token without handling user credentials directly. Grant types: Authorization Code (with PKCE — required in OAuth 2.1), Client Credentials, Refresh Token. *(You've already studied this for your security roadmap.)*
- **JWT (JSON Web Token):** Self-contained token (Header.Payload.Signature) — server verifies signature without a DB lookup, enabling stateless auth. Watch for: token expiry, secure storage (avoid `localStorage` for sensitive apps — prefer `httpOnly` cookies), signature algorithm confusion attacks (`alg: none`).

### 4.6 Idempotency in API Design (critical — connects directly to your backend-architecture study)
An idempotent API guarantees that repeating the same request (e.g., due to a client retry after a timeout) doesn't cause duplicate side effects.

**How it's implemented in practice:**
```
POST /payments
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```
The server stores the key with the result; if the same key arrives again, it returns the cached result instead of re-processing the payment. This is exactly the mechanism behind Stripe's and most payment gateways' idempotency systems — directly relevant to your bKash/SSL Wireless payment integration work.

### 4.7 Rate Limiting & Pagination
- **Rate limiting algorithms:** Token Bucket, Leaky Bucket, Fixed Window, Sliding Window Log/Counter.
- **Pagination styles:** Offset-based (`?page=2&limit=20` — simple but slow/inconsistent on large offsets), Cursor-based (`?after=xyz` — stable, scalable, used by most modern APIs like Twitter/GitHub).

### 🔗 Learn More — APIs
- [MDN: HTTP overview](https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview)
- [Roy Fielding's REST dissertation (Chapter 5)](https://ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm)
- [Stripe: Idempotent Requests](https://stripe.com/docs/api/idempotent_requests)

---

## 5. Database (Applied/Programming View)

> Deep DBMS theory (normalization, ACID internals, indexing internals, CAP theorem) is covered in **`03-CS-Fundamentals.md`**. This section covers what you'll actually *write code against* — highly likely on programming-track MCQs.

### 5.1 SQL Basics
```sql
-- CRUD
SELECT * FROM users WHERE age > 18;
INSERT INTO users (name, email) VALUES ('Junaid', 'j@example.com');
UPDATE users SET age = 25 WHERE id = 1;
DELETE FROM users WHERE id = 1;

-- Joins
SELECT o.id, u.name FROM orders o
INNER JOIN users u ON o.user_id = u.id;

-- Aggregation
SELECT department, COUNT(*), AVG(salary)
FROM employees
GROUP BY department
HAVING COUNT(*) > 5;
```

### 5.2 Join Types (a favorite MCQ diagram question)

| Join | Returns |
|---|---|
| INNER JOIN | Only matching rows in both tables |
| LEFT (OUTER) JOIN | All rows from left + matched rows from right (NULL if no match) |
| RIGHT (OUTER) JOIN | All rows from right + matched rows from left |
| FULL OUTER JOIN | All rows from both, matched where possible |
| SELF JOIN | Table joined with itself (e.g., employee-manager hierarchy) |
| CROSS JOIN | Cartesian product (every row × every row) |

### 5.3 ORMs & Data Access in Java (your daily stack)
```java
// Spring Data JPA — Repository pattern in action
public interface UserRepository extends JpaRepository<User, Long> {
    List<User> findByAgeGreaterThan(int age);        // derived query
    @Query("SELECT u FROM User u WHERE u.email = ?1") // JPQL
    User findByEmail(String email);
}
```
- **N+1 query problem:** Lazy-loading a collection inside a loop triggers one query per iteration instead of a single JOIN — a classic Hibernate/JPA interview gotcha. Fix with `JOIN FETCH` or `@EntityGraph`.
- **Connection pooling:** HikariCP (Spring Boot default) reuses DB connections instead of opening/closing per request — essential for performance under load.

### 5.4 Transactions in Code
```java
@Transactional
public void transferMoney(Long fromId, Long toId, double amount) {
    accountRepo.debit(fromId, amount);
    accountRepo.credit(toId, amount);
    // if any exception is thrown, the whole method rolls back — atomicity in practice
}
```

### 5.5 SQL vs NoSQL (frequent MCQ)

| | SQL (Relational) | NoSQL |
|---|---|---|
| Schema | Fixed, predefined | Flexible/dynamic |
| Scaling | Vertical (traditionally) | Horizontal (built for it) |
| Consistency | Strong (ACID) | Often eventual (BASE) |
| Examples | PostgreSQL, MySQL, Oracle | MongoDB (document), Redis (key-value), Cassandra (wide-column), Neo4j (graph) |
| Best for | Complex relationships, transactions | High-volume, flexible/unstructured data, horizontal scale |

### 🔗 Learn More — Database (applied)
- [PostgreSQL Official Docs](https://www.postgresql.org/docs/)
- [Baeldung: Spring Data JPA](https://www.baeldung.com/spring-data-jpa-query)

---

## 6. Networking (Applied/Programming View)

> Deep networking theory (OSI/TCP-IP layers, subnetting, routing protocols) is covered in **`03-CS-Fundamentals.md`**. This section is what shows up in "programming" MCQs.

### 6.1 Client-Server Communication in Code
```java
// Simple socket server (low-level TCP)
ServerSocket server = new ServerSocket(8080);
Socket client = server.accept();
BufferedReader in = new BufferedReader(new InputStreamReader(client.getInputStream()));
```

### 6.2 Making HTTP Calls (what you actually do daily)
```java
// Java 11+ HttpClient
HttpClient client = HttpClient.newHttpClient();
HttpRequest request = HttpRequest.newBuilder()
        .uri(URI.create("https://api.example.com/users"))
        .header("Authorization", "Bearer " + token)
        .GET()
        .build();
HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
```

### 6.3 Key Concepts for Programming MCQs
- **DNS resolution:** domain name → IP address, happens before every web request.
- **TLS/SSL handshake:** establishes an encrypted channel (HTTPS = HTTP + TLS).
- **CORS (Cross-Origin Resource Sharing):** browser security mechanism that blocks cross-origin requests unless the server explicitly allows them via `Access-Control-Allow-Origin` headers — a near-universal frontend/backend integration gotcha.
- **WebSockets:** full-duplex persistent connection (vs HTTP's request-response) — used for chat apps, live notifications.
- **Load Balancing:** distributing requests across multiple server instances (Round Robin, Least Connections, IP Hash) — relevant to your microservices work.

### 🔗 Learn More — Networking (applied)
- [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [High Scalability blog](http://highscalability.com/)

---

## 7. HTML/CSS

### 7.1 HTML Fundamentals
- **Semantic HTML:** Use tags that convey meaning (`<header>`, `<nav>`, `<article>`, `<section>`, `<footer>`) instead of generic `<div>` soup — improves accessibility and SEO.
- **Common form elements:** `<input>`, `<select>`, `<textarea>`, `<form>` with `action`/`method`.
- **`<div>` vs `<span>`:** `<div>` is block-level (own line, full width); `<span>` is inline (flows with text).

### 7.2 CSS Box Model (near-guaranteed MCQ diagram)
```
┌─────────────────────────────┐
│           Margin             │
│  ┌─────────────────────────┐ │
│  │         Border           │ │
│  │  ┌─────────────────────┐ │ │
│  │  │       Padding         │ │ │
│  │  │  ┌─────────────────┐ │ │ │
│  │  │  │     Content      │ │ │ │
│  │  │  └─────────────────┘ │ │ │
│  │  └─────────────────────┘ │ │
│  └─────────────────────────┘ │
└─────────────────────────────┘
```
- `box-sizing: content-box` (default) — width/height apply to content only; padding/border add on top.
- `box-sizing: border-box` — width/height include padding and border (most modern CSS resets use this).

### 7.3 Flexbox vs Grid

| | Flexbox | Grid |
|---|---|---|
| Dimension | 1D (row OR column) | 2D (rows AND columns) |
| Best for | Navbars, aligning items in a line | Full page layouts, complex grids |
| Key properties | `justify-content`, `align-items`, `flex-direction` | `grid-template-columns`, `grid-template-rows`, `gap` |

```css
.flex-container { display: flex; justify-content: space-between; align-items: center; }
.grid-container { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
```

### 7.4 CSS Specificity (commonly tested — "which style wins?")
Specificity order (lowest → highest): `element selector` < `class/attribute/pseudo-class` < `ID` < `inline style` < `!important`.
```css
p { color: blue; }              /* specificity: 0-0-1 */
.text { color: green; }         /* specificity: 0-1-0 — wins over element */
#main { color: red; }           /* specificity: 1-0-0 — wins over class */
```

### 7.5 Positioning
- `static` (default, normal flow), `relative` (offset from normal position, keeps space), `absolute` (removed from flow, positioned relative to nearest positioned ancestor), `fixed` (relative to viewport), `sticky` (hybrid — relative until scroll threshold, then fixed).

### 7.6 Responsive Design
```css
@media (max-width: 768px) {
    .container { flex-direction: column; }
}
```
Mobile-first approach: write base styles for mobile, then add `min-width` media queries for larger screens.

### 🔗 Learn More — HTML/CSS
- [MDN: CSS Box Model](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_box_model)
- [CSS-Tricks: A Complete Guide to Flexbox](https://css-tricks.com/snippets/css/a-guide-to-flexbox/)
- [CSS-Tricks: A Complete Guide to Grid](https://css-tricks.com/snippets/css/complete-guide-grid/)

---

## 8. Programming Fundamentals

### 8.1 Variables, Data Types, and Memory
- **Primitive vs Reference types (Java):** primitives (`int`, `double`, `boolean`, `char`...) store the value directly on the stack; reference types (objects, arrays) store a reference on the stack pointing to data on the heap.
- **Stack vs Heap:**

| | Stack | Heap |
|---|---|---|
| Stores | Method calls, local variables, primitives | Objects, instance variables |
| Lifetime | Until method returns | Until garbage collected |
| Speed | Faster | Slower |
| Size | Smaller, fixed | Larger, dynamic |
| Thread-safety | Each thread has its own stack | Shared across threads (needs sync) |

### 8.2 Pass by Value vs Pass by Reference (a classic trap question)
**Java is always pass-by-value** — but for objects, the *value being passed is the reference (memory address)*, which is why mutating an object's fields inside a method affects the caller's object, while reassigning the parameter itself does not.
```java
void modify(int x) { x = 100; }             // caller's int is unaffected
void modify(List<Integer> list) { list.add(1); }  // caller's list IS affected (same object)
void reassign(List<Integer> list) { list = new ArrayList<>(); } // caller's reference is unaffected
```

### 8.3 Control Structures
```java
// if/else, switch, loops — the basics; MCQs test edge cases:
for (int i = 0; i < 5; i++) { if (i == 3) continue; System.out.println(i); }  // skips 3
// switch fallthrough (a classic gotcha)
switch (2) {
    case 1: System.out.println("one");
    case 2: System.out.println("two");   // no break — falls through
    case 3: System.out.println("three"); // this prints too!
}
```

### 8.4 Functions/Methods
- **Parameter passing, return types, overloading** (see OOP section 1.2).
- **Recursion basics** are covered in `02-Data-Structures-Algorithms.md` — heavily tested together with functions.
- **Pure functions:** No side effects, same input → same output always (functional programming concept, increasingly tested given trends toward functional-style Java streams).

### 8.5 Java Streams & Functional-Style Code (increasingly common in modern MCQs)
```java
List<String> names = List.of("Junaid", "Karim", "Alina");
List<String> result = names.stream()
        .filter(n -> n.length() > 5)
        .map(String::toUpperCase)
        .sorted()
        .collect(Collectors.toList());
```

### 8.6 Exception Handling
```java
try {
    riskyOperation();
} catch (IOException e) {
    // handle checked exception
} catch (RuntimeException e) {
    // handle unchecked exception
} finally {
    cleanup();  // always runs
}
```
- **Checked vs Unchecked exceptions:** Checked (`IOException`, `SQLException`) must be declared/caught at compile time. Unchecked (`RuntimeException` and subclasses like `NullPointerException`) are not enforced by the compiler.
- **Custom exceptions:** `class InsufficientFundsException extends RuntimeException { ... }`

### 8.7 Static vs Instance
- `static` members belong to the **class**, shared across all instances. Instance members belong to each **object** separately.
```java
class Counter {
    static int totalCount = 0;   // shared
    int id;                      // per-instance
    Counter() { id = ++totalCount; }
}
```

### 8.8 Memory Management & Garbage Collection
- Java uses **automatic garbage collection** — objects with no reachable references are eventually reclaimed. Generational GC (Young/Old generation), common collectors: G1GC (default since Java 9), ZGC (low-latency, for large heaps).
- `finalize()` is deprecated; prefer `try-with-resources` / `AutoCloseable` for deterministic cleanup.

### 8.9 String Handling (extremely common MCQ area)
- Java Strings are **immutable**. `String` literals live in the **String Pool** (interned) for reuse; `new String("x")` forces heap allocation outside the pool.
```java
String a = "hello";
String b = "hello";
System.out.println(a == b);          // true — same pool reference
String c = new String("hello");
System.out.println(a == c);          // false — different heap object
System.out.println(a.equals(c));     // true — same content
```
- **`StringBuilder` vs `StringBuffer`:** `StringBuilder` is faster (not synchronized); `StringBuffer` is thread-safe (synchronized) — prefer `StringBuilder` unless multiple threads mutate the same buffer.

### 🔗 Learn More — Programming Fundamentals
- [Java Language Specification](https://docs.oracle.com/javase/specs/)
- [Baeldung: Java Guides](https://www.baeldung.com/)

---

## 9. Most Asked Interview Questions

**Rapid-fire — be able to answer each in 30–60 seconds:**

1. Explain the 4 pillars of OOP with one real example each.
2. Difference between abstract class and interface — when would you choose one over the other?
3. What's the difference between method overloading and overriding?
4. Explain each SOLID principle with a code smell it prevents.
5. Design a parking lot / vending machine / elevator system using OOP (classic scenario question — think classes, relationships, and which pattern(s) apply).
6. When would you use Singleton vs a simple static utility class?
7. What problem does the Strategy pattern solve? Give an example from a payment system.
8. What is idempotency, and why does it matter for `PUT` vs `POST`?
9. Explain REST statelessness — why does it improve scalability?
10. What's the difference between authentication and authorization? Where does JWT fit in?
11. What is the N+1 query problem and how do you fix it in JPA/Hibernate?
12. Explain ACID properties with a money-transfer example.
13. Explain pass-by-value vs pass-by-reference in Java with a code example.
14. What's the difference between checked and unchecked exceptions?
15. Why is `String` immutable in Java? What's the String Pool?
16. Explain CORS — why does a frontend get blocked calling an API on a different origin?
17. What is the box model in CSS? Difference between `content-box` and `border-box`?
18. Difference between `==` and `.equals()` in Java.
19. What's dependency injection, and how does Spring implement it?
20. Explain composition vs inheritance — why is "favor composition" common advice?

---

## 10. Most Used Topics in Real Software Engineering

Based on what actually shows up in day-to-day backend/full-stack work (and matches your own architecture-pattern study):

- **OOP + SOLID** — foundational to every class you write; code review feedback is often SOLID-violation feedback in disguise.
- **Dependency Injection** — the backbone of Spring Boot; almost every class you write depends on it.
- **REST API design** (status codes, idempotency, versioning) — your daily bread with microservices.
- **Design patterns actually seen constantly:** Strategy, Factory, Builder, Singleton, Observer, Repository, Decorator (Spring proxies), Template Method (`JdbcTemplate`).
- **Database/ORM basics** (joins, transactions, N+1 problem) — directly maps to your PostgreSQL + JPA work.
- **HTTP/networking basics** (status codes, CORS, load balancing) — needed for any service-to-service or frontend-backend debugging.
- **Exception handling & logging** — critical for production debugging.
- **Git** (see Fundamentals below) — used every single day.

### Git — commonly bundled into "Programming Fundamentals" MCQs
```bash
git clone <repo>
git checkout -b feature/new-thing
git add . && git commit -m "message"
git push origin feature/new-thing
git rebase main          # rewrite history onto latest main
git merge feature/x      # combine branches, preserves history
git cherry-pick <hash>   # apply a specific commit elsewhere
git stash                # temporarily shelve uncommitted changes
```
- **Merge vs Rebase:** merge preserves full history with a merge commit; rebase rewrites commit history onto a new base for a linear log — never rebase shared/public branches.
- **`git reset` vs `git revert`:** reset moves the branch pointer (can lose commits, dangerous on shared branches); revert creates a new commit that undoes changes (safe for shared branches).

### 🔗 Learn More — Git
- [Pro Git Book (free)](https://git-scm.com/book/en/v2)
- [Learn Git Branching (interactive)](https://learngitbranching.js.org/)

---

**Next:** `02-Data-Structures-Algorithms.md` →

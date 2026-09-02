# TypeScript — Deep Dive & Interview Reference (2026)

**Current state (Sept 2026):** **TypeScript 7.0** shipped in July 2026 — the compiler was rewritten natively in Go (`tsgo`), giving roughly **10× faster type-checking and project loads**. The language semantics are unchanged; what changed is speed, and that some deep API consumers (custom transformers, ts-patch-style plugins) need migration. TS 5.9 remains the JS-based fallback for those. Type-stripping in Node 22+/24 means you can often run `.ts` directly without a build step for scripts.

---

## 1. The mental model: types are erased, structure is what matters

TypeScript is a **structural** type system with **erasure** at runtime. Two consequences drive almost everything:

1. Anything shaped like `{ id: string }` *is* a `{ id: string }` — no `implements` required.
2. No type exists at runtime. `instanceof MyInterface` is impossible; validation at boundaries must be actual code.

```ts
interface Identified { id: string }

function log(x: Identified) { console.log(x.id); }
log({ id: "a", extra: 1 } as const);       // ok structurally...
log({ id: "a", extra: 1 });                // ✗ excess property check on OBJECT LITERALS only
const obj = { id: "a", extra: 1 };
log(obj);                                   // ✓ — the check doesn't apply to a variable
```

That asymmetry (excess property checks apply only to fresh object literals) surprises people constantly.

> **Asked as:** "Structural vs nominal typing." · "Do types exist at runtime?" · "Why did TS complain about an extra property here but not there?"

---

## 2. `unknown`, `any`, `never` — the three you must get right

```ts
let a: any;      // opt out of the type system — every operation allowed. Avoid.
let u: unknown;  // top type — must be narrowed before use. The safe `any`.
function fail(msg: string): never { throw new Error(msg); }   // bottom type — never returns

function handle(input: unknown) {
  if (typeof input === "string") return input.toUpperCase();   // narrowed to string
  if (Array.isArray(input)) return input.length;
  throw new Error("unsupported");
}

// `never` for exhaustiveness — the compiler now guards your switch
type Shape = { kind: "circle"; r: number } | { kind: "rect"; w: number; h: number };

function area(s: Shape): number {
  switch (s.kind) {
    case "circle": return Math.PI * s.r ** 2;
    case "rect":   return s.w * s.h;
    default: {
      const _exhaustive: never = s;      // add a new Shape variant → compile error here
      return _exhaustive;
    }
  }
}
```

This exhaustiveness pattern is the single highest-value TypeScript trick in real codebases.

> **Asked as:** "`any` vs `unknown`." · "When is `never` useful?" · "How do you make a switch exhaustive?"

---

## 3. Narrowing and type guards

```ts
// User-defined type guard
function isOrder(x: unknown): x is Order {
  return typeof x === "object" && x !== null && "id" in x && "total" in x;
}

// Assertion function (note the explicit return type annotation is required)
function assertDefined<T>(v: T | null | undefined, name: string): asserts v is T {
  if (v == null) throw new Error(`${name} is required`);
}

const user = users.find((u) => u.id === id);
assertDefined(user, "user");
user.email;                      // narrowed to User — no `!` needed

// Discriminated unions beat optional-flag objects
type Result<T, E = Error> =
  | { ok: true;  value: T }
  | { ok: false; error: E };

function unwrap<T>(r: Result<T>): T {
  if (r.ok) return r.value;      // narrowed
  throw r.error;
}
```

Avoid non-null assertion `!` and `as` casts — each one is a place where a runtime crash can hide. `satisfies` (TS 4.9+) gives you checking *without* widening:

```ts
const routes = {
  home: "/",
  order: "/orders/:id",
} satisfies Record<string, `/${string}`>;

routes.home;   // type is "/" (literal preserved), not string — `as Record<...>` would have widened it
```

> **Asked as:** "Write a type guard." · "`as` vs `satisfies`." · "Why avoid non-null assertions?"

---

## 4. Generics that carry real constraints

```ts
// Constrain to what you actually use
function pluck<T, K extends keyof T>(items: readonly T[], key: K): T[K][] {
  return items.map((i) => i[key]);
}
pluck(users, "email");     // string[]
pluck(users, "nope");      // ✗ compile error

// Conditional + inference
type ElementOf<T> = T extends readonly (infer U)[] ? U : never;
type Awaited2<T> = T extends Promise<infer U> ? Awaited2<U> : T;   // built-in as `Awaited`

// Mapped types with key remapping (TS 4.1+)
type Getters<T> = {
  [K in keyof T & string as `get${Capitalize<K>}`]: () => T[K]
};
type UserGetters = Getters<{ id: string; age: number }>;
// → { getId: () => string; getAge: () => number }

// Deep readonly — a recursive mapped type
type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;
```

**Utility types you should know cold:** `Partial`, `Required`, `Readonly`, `Pick`, `Omit`, `Record`, `Exclude`, `Extract`, `NonNullable`, `ReturnType`, `Parameters`, `Awaited`, `NoInfer` (5.4+).

```ts
type CreateUserDto = Omit<User, "id" | "createdAt">;
type UserUpdate    = Partial<CreateUserDto>;
type Handler       = (req: Request) => Promise<Response>;
type HandlerReturn = Awaited<ReturnType<Handler>>;    // Response
```

> **Asked as:** "Implement `Omit` yourself." · "What does `infer` do?" · "Explain conditional types." · "Difference between `keyof` and `typeof`."

---

## 5. Runtime validation at the boundary

Types don't validate. Every untrusted input — HTTP body, env var, queue message, third-party API — needs a runtime schema, and you derive the static type from it so the two can never drift.

```ts
import { z } from "zod";

const OrderSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["NEW", "PAID", "CANCELLED"]),
  amountCents: z.number().int().nonnegative(),
  createdAt: z.coerce.date(),
});

type Order = z.infer<typeof OrderSchema>;      // single source of truth

export async function getOrder(id: string): Promise<Order> {
  const res = await fetch(`/api/orders/${id}`);
  const json: unknown = await res.json();       // NOT `as Order` — that's a lie
  return OrderSchema.parse(json);               // throws with a precise path on mismatch
}

// Env config validated once at startup — fail fast, not at 3 a.m.
const Env = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]),
});
export const env = Env.parse(process.env);
```

Alternatives with the same idea: Valibot (smaller bundle), ArkType, TypeBox (JSON-Schema-native, good with Fastify).

> **Asked as:** "How do you type an API response safely?" · "Why is `as SomeType` on `res.json()` dangerous?" · "How do you validate environment config?"

---

## 6. `tsconfig.json` that a senior would sign off

```jsonc
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",

    "strict": true,                          // the one flag that matters most
    "noUncheckedIndexedAccess": true,        // arr[i] is T | undefined — catches real bugs
    "exactOptionalPropertyTypes": true,      // `{a?: string}` ≠ `{a: string | undefined}`
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,

    "isolatedModules": true,                 // required by esbuild/swc/Vite
    "verbatimModuleSyntax": true,            // explicit `import type`
    "skipLibCheck": true,                    // big build-time win, low risk
    "declaration": true,
    "sourceMap": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

`strict: true` turns on `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, `strictPropertyInitialization`, and more. **`noUncheckedIndexedAccess`** is the underused one — it forces you to handle `arr[0]` possibly being `undefined`, which is where a surprising number of production crashes come from.

**Migrating a JS codebase:** `allowJs: true` + `checkJs: false` → rename leaf files first → turn on `strict` per-directory using project references → never use `// @ts-ignore` without `// @ts-expect-error` (which errors when the underlying problem is fixed, so it self-cleans).

> **Asked as:** "What does `strict` actually enable?" · "How would you migrate a JS project to TS?" · "`@ts-ignore` vs `@ts-expect-error`."

---

## 7. Declaration merging, modules, and ambient types

```ts
// Augmenting a third-party type (e.g. attaching a user to Express Request)
declare global {
  namespace Express {
    interface Request { user?: { id: string; roles: string[] } }
  }
}
export {};   // makes this file a module — required for `declare global`

// Module augmentation
declare module "fastify" {
  interface FastifyInstance { db: DatabasePool }
}
```

Interfaces merge; type aliases do not. That's the practical reason to expose **interfaces** in public library APIs (consumers can extend them) and use **type aliases** for unions, tuples, and mapped/conditional types.

> **Asked as:** "`interface` vs `type` — when do you pick which?" · "How do you add a property to Express's Request type?"

---

## 8. Performance of the type system itself

Slow builds are usually your own types, not the compiler.

- Prefer `interface` over large intersecting `type` aliases — interfaces are cached better.
- Avoid deeply recursive conditional types over big unions (`DeepPartial` on a 200-field type is a classic build-killer).
- `skipLibCheck: true`.
- Use **project references** (`composite: true`) so a monorepo rebuilds only what changed.
- Diagnose with `tsc --extendedDiagnostics` and `--generateTrace trace/` → open in `edge://tracing`.
- TS 7's Go compiler removes a lot of this pain, but pathological types are still pathological.

> **Asked as:** "Our type-check takes 4 minutes — how do you attack it?"

---

## 9. Rapid-fire answers

| Question | Answer |
|---|---|
| `interface` vs `type` | Interfaces merge and extend cleanly; types do unions, tuples, conditionals, mapped types |
| `enum` vs union of literals | Prefer `type X = "a" \| "b"` or `as const` objects — enums emit runtime code and have odd numeric behaviour |
| `const` assertion | `as const` makes literals readonly and narrow: `["a","b"] as const` → `readonly ["a","b"]` |
| Covariance surprise | Arrays are covariant and therefore unsound: `Dog[]` assignable to `Animal[]`, then you can push a `Cat` |
| `void` vs `undefined` | `void` in a callback return position means "return value ignored" — a `() => number` is assignable to `() => void` |
| Abstract class vs interface | Abstract class can carry implementation and state; interface is types only |
| `readonly` | Compile-time only; use `Object.freeze` for runtime immutability |
| Optional chaining + generics | `NoInfer<T>` (5.4+) stops a parameter from participating in inference |
| Decorators | ES-standard decorators are supported since TS 5.0 (different from the legacy `experimentalDecorators` used by NestJS/TypeORM — don't mix) |
| Type-only import | `import type { X } from "./x"` — erased entirely, avoids circular-import runtime problems |

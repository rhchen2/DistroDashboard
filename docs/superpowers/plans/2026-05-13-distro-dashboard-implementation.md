# DistroDashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v1 of DistroDashboard — a personal cash-flow + status dashboard for TCG distro pre-orders, with GTS Distribution as the first scraper.

**Architecture:** Monorepo (pnpm workspaces) containing a local Playwright scraper CLI (`apps/scraper`), a Next.js dashboard on Vercel (`apps/web`), a Supabase Edge Function for ingest (`supabase/functions/ingest`), and a shared Zod contracts package (`packages/contracts`). Scraper pushes normalized order snapshots to the ingest function; ingest writes to Postgres and triggers Next.js cache revalidation. Dashboard is read-only, single user, gated by Vercel Authentication.

**Tech Stack:** TypeScript, pnpm workspaces, Node 20 + Playwright (scraper), Next.js 16 App Router with Cache Components + shadcn/ui + Tailwind (web), Supabase Postgres + Edge Functions (data), Vitest (tests), GitHub Actions (CI), Vercel (web hosting).

**Reference spec:** [2026-05-13-distro-dashboard-design.md](../specs/2026-05-13-distro-dashboard-design.md)

---

## How to read this plan

- **9 phases.** Each ends with working, demonstrable software. Stop after any phase to ship/evaluate.
- **Tasks within a phase are sequential.** Don't parallelize unless explicitly noted.
- **Every code step shows real code.** No placeholders. If something is genuinely unknowable until implementation (e.g., GTS HTML selectors), the task says "discover during execution" and explains how.
- **Commits at the end of every task.** Granular history is a feature.
- **API verification note:** Next.js 16 Cache Components (`'use cache'`, `cacheTag`, `revalidateTag`) are new; verify the exact API in the official docs at implementation time. Same for shadcn chart components.

---

## File Structure (target end state)

```
DistroDashboard/
├── .github/
│   └── workflows/
│       └── ci.yml
├── apps/
│   ├── scraper/
│   │   ├── src/
│   │   │   ├── cli.ts                          # CLI entrypoint
│   │   │   ├── core/
│   │   │   │   ├── runSync.ts                  # orchestrator
│   │   │   │   ├── ingestClient.ts             # POST to /ingest
│   │   │   │   ├── browserContext.ts           # cookie persistence
│   │   │   │   └── tripwire.ts                 # zero-orders detection
│   │   │   ├── scrapers/
│   │   │   │   ├── index.ts                    # registry
│   │   │   │   └── gts/
│   │   │   │       ├── index.ts                # Scraper export
│   │   │   │       ├── gtsFetch.ts             # Playwright I/O
│   │   │   │       └── gtsParse.ts             # pure parsing
│   │   │   ├── config.ts                       # reads config.local.json
│   │   │   └── capture.ts                      # fixture capture command
│   │   ├── test-fixtures/
│   │   │   └── gts/                            # redacted real HTML
│   │   ├── tests/
│   │   │   ├── factories.ts                    # makeOrderSnapshot, makeSyncRun
│   │   │   ├── runSync.test.ts
│   │   │   ├── ingestClient.test.ts
│   │   │   ├── tripwire.test.ts
│   │   │   └── gts/
│   │   │       └── gtsParse.test.ts
│   │   ├── config.local.json.example
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   └── web/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx                        # Overview
│       │   ├── cashflow/page.tsx
│       │   ├── orders/page.tsx
│       │   ├── releases/page.tsx
│       │   ├── sync/page.tsx
│       │   └── api/
│       │       └── revalidate/route.ts
│       ├── components/
│       │   ├── ui/                             # shadcn components
│       │   ├── sidebar.tsx
│       │   ├── stale-sync-pill.tsx
│       │   ├── kpi-card.tsx
│       │   ├── status-chip.tsx
│       │   ├── variance-cell.tsx
│       │   ├── order-drawer.tsx
│       │   └── first-run-panel.tsx
│       ├── lib/
│       │   ├── db.ts                           # server-only Supabase client
│       │   ├── queries/
│       │   │   ├── orders.ts
│       │   │   ├── payments.ts
│       │   │   ├── releases.ts
│       │   │   └── syncRuns.ts
│       │   └── rules/
│       │       ├── variance.ts
│       │       ├── staleness.ts
│       │       └── bucket.ts                   # weekly bucket logic
│       ├── tests/
│       │   ├── rules/
│       │   │   ├── variance.test.ts
│       │   │   ├── staleness.test.ts
│       │   │   └── bucket.test.ts
│       │   └── queries/
│       │       └── ...
│       ├── package.json
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       ├── tsconfig.json
│       └── vitest.config.ts
├── packages/
│   └── contracts/
│       ├── src/
│       │   ├── index.ts
│       │   ├── orderSnapshot.ts                # Zod + TS types
│       │   └── scraper.ts                      # Scraper interface
│       ├── tests/
│       │   └── orderSnapshot.test.ts
│       ├── package.json
│       ├── tsconfig.json
│       └── vitest.config.ts
├── supabase/
│   ├── migrations/
│   │   ├── 20260513000001_init_distros_orders.sql
│   │   ├── 20260513000002_init_items_history.sql
│   │   ├── 20260513000003_init_payments_shipments.sql
│   │   ├── 20260513000004_init_sync_runs.sql
│   │   └── 20260513000005_seed_distros.sql
│   ├── functions/
│   │   └── ingest/
│   │       ├── index.ts                        # Deno entrypoint
│   │       ├── handlers/
│   │       │   ├── orders.ts                   # success payload handling
│   │       │   └── failure.ts                  # failure payload handling
│   │       ├── lib/
│   │       │   ├── auth.ts
│   │       │   ├── revalidate.ts
│   │       │   └── statusHeadline.ts
│   │       └── tests/
│   │           ├── auth.test.ts
│   │           ├── orders.test.ts
│   │           └── statusHeadline.test.ts
│   └── config.toml
├── docs/
│   └── superpowers/
│       ├── specs/2026-05-13-distro-dashboard-design.md   # already committed
│       └── plans/2026-05-13-distro-dashboard-implementation.md  # this file
├── scripts/
│   └── setup-task-scheduler.ps1                # Windows scheduled task
├── .gitignore
├── .editorconfig
├── package.json                                # workspace root
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
├── .eslintrc.cjs
├── .prettierrc
└── README.md
```

---

## Phase milestones (where you can stop and have working software)

| After phase | What works |
|---|---|
| Phase 1 | Repo scaffold + contracts package with passing tests |
| Phase 2 | DB schema lives in Supabase, seeded with GTS row |
| Phase 3 | Ingest function accepts payloads end-to-end (curl-testable) |
| Phase 4 | Scraper core can POST a synthetic OrderSnapshot to ingest |
| Phase 5 | Real GTS scraper produces real data in DB |
| Phase 6 | Empty web app deploys to Vercel behind auth |
| Phase 7 | All five dashboard pages render real data |
| Phase 8 | CI green, nightly Task Scheduler entry installed |
| Phase 9 | README, runbook, first end-to-end production sync |

---

## Phase 1 — Repo Scaffold + Contracts Package

**Goal:** pnpm workspace with TypeScript, ESLint, Prettier configured; `packages/contracts` published locally with full Zod schema + passing tests.

### Task 1.1 — Initialize pnpm workspace

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.gitignore`
- Create: `.editorconfig`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "distro-dashboard",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20.0.0", "pnpm": ">=9.0.0" },
  "scripts": {
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "build": "pnpm -r build",
    "lint": "eslint .",
    "format": "prettier --write .",
    "check": "pnpm typecheck && pnpm test"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0",
    "typescript": "^5.4.0"
  },
  "packageManager": "pnpm@9.0.0"
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules
.pnpm-store
dist
.next
.turbo
.cache
.env
.env.local
.env.*.local
*.log
.DS_Store
config.local.json
.vercel
supabase/.temp
.vscode
.idea
```

- [ ] **Step 4: Create `.editorconfig`**

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 5: Run pnpm install (validates workspace config)**

Run: `pnpm install`
Expected: creates `node_modules`, `pnpm-lock.yaml`, no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml .gitignore .editorconfig pnpm-lock.yaml
git commit -m "chore: initialize pnpm workspace"
```

---

### Task 1.2 — Shared TypeScript config + ESLint + Prettier

**Files:**
- Create: `tsconfig.base.json`
- Create: `.eslintrc.cjs`
- Create: `.prettierrc`

- [ ] **Step 1: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 2: Create `.eslintrc.cjs`** (legacy file for broader tool support)

```js
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  ignorePatterns: ["dist", "node_modules", ".next", "supabase/.temp"],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
  },
  overrides: [
    {
      // Forbid server-only DB imports inside files that opt-in to client rendering.
      // Detection is structural: scan for "use client" directive at top of file.
      files: ["apps/web/**/*.{ts,tsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["@/lib/db", "**/lib/db", "@supabase/supabase-js"],
                message:
                  "Service-role DB access is server-only. Do not import from a client component.",
              },
            ],
          },
        ],
      },
    },
  ],
};
```

> Note: this rule fires on all files in `apps/web`. Files that genuinely need
> `lib/db` access (server components, route handlers) override with an inline
> `/* eslint-disable no-restricted-imports */` and add a `// server-only` comment.
> A stricter setup using a custom rule that conditionally enforces only when
> `"use client"` is present is overkill for v1.

- [ ] **Step 3: Create `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 4: Install ESLint deps**

```bash
pnpm add -D -w @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

- [ ] **Step 5: Commit**

```bash
git add tsconfig.base.json .eslintrc.cjs .prettierrc package.json pnpm-lock.yaml
git commit -m "chore: add shared TS, ESLint, Prettier config"
```

---

### Task 1.3 — Scaffold `packages/contracts`

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/vitest.config.ts`
- Create: `packages/contracts/src/index.ts`

- [ ] **Step 1: Create `packages/contracts/package.json`**

```json
{
  "name": "@distro/contracts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "tsc"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `packages/contracts/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create `packages/contracts/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 4: Create `packages/contracts/src/index.ts`**

```ts
export {};
```

- [ ] **Step 5: Install**

Run: `pnpm install`
Expected: `@distro/contracts` linked in workspace; `zod` and `vitest` installed.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts pnpm-lock.yaml
git commit -m "feat(contracts): scaffold @distro/contracts package"
```

---

### Task 1.4 — Write failing test for `OrderSnapshot` schema

**Files:**
- Create: `packages/contracts/tests/orderSnapshot.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/contracts/tests/orderSnapshot.test.ts
import { describe, expect, it } from "vitest";
import { OrderSnapshotSchema } from "../src/index.js";

describe("OrderSnapshotSchema", () => {
  const validSnapshot = {
    distroOrderId: "PO-44821",
    placedAt: "2026-04-12",
    status: "invoiced",
    totals: {
      subtotalCents: 124000,
      taxCents: 0,
      shippingCents: 1500,
      totalCents: 125500,
    },
    items: [
      {
        sku: "OP-12-BOX",
        productName: "One Piece OP-12 Booster Box",
        qty: 6,
        unitCostCents: 20000,
        releaseDate: "2026-06-07",
      },
    ],
    payments: [
      {
        kind: "deposit",
        expectedDate: "2026-04-15",
        expectedCents: 50000,
        actualDate: null,
        actualCents: null,
      },
    ],
    shipments: [],
    rawPayload: { source: "test" },
  };

  it("accepts a fully-populated valid snapshot", () => {
    const parsed = OrderSnapshotSchema.parse(validSnapshot);
    expect(parsed.distroOrderId).toBe("PO-44821");
  });

  it("rejects missing distroOrderId", () => {
    const { distroOrderId: _, ...bad } = validSnapshot;
    expect(() => OrderSnapshotSchema.parse(bad)).toThrow();
  });

  it("rejects invalid status enum", () => {
    expect(() =>
      OrderSnapshotSchema.parse({ ...validSnapshot, status: "unknown_state" }),
    ).toThrow();
  });

  it("rejects malformed date string", () => {
    expect(() =>
      OrderSnapshotSchema.parse({ ...validSnapshot, placedAt: "April 12 2026" }),
    ).toThrow();
  });

  it("requires payment.expectedCents to be a number", () => {
    expect(() =>
      OrderSnapshotSchema.parse({
        ...validSnapshot,
        payments: [{ ...validSnapshot.payments[0], expectedCents: "fifty" }],
      }),
    ).toThrow();
  });

  it("accepts empty items, payments, shipments arrays", () => {
    expect(() =>
      OrderSnapshotSchema.parse({
        ...validSnapshot,
        items: [],
        payments: [],
        shipments: [],
      }),
    ).not.toThrow();
  });

  it("allows null for nullable date fields on items and payments", () => {
    expect(() =>
      OrderSnapshotSchema.parse({
        ...validSnapshot,
        items: [{ ...validSnapshot.items[0], releaseDate: null, sku: null }],
        payments: [{ ...validSnapshot.payments[0], expectedDate: null }],
      }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @distro/contracts test`
Expected: FAIL — `OrderSnapshotSchema` is not exported.

- [ ] **Step 3: Commit the failing test**

```bash
git add packages/contracts/tests/orderSnapshot.test.ts
git commit -m "test(contracts): add OrderSnapshot schema tests (failing)"
```

---

### Task 1.5 — Implement `OrderSnapshot` Zod schema

**Files:**
- Create: `packages/contracts/src/orderSnapshot.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Create `packages/contracts/src/orderSnapshot.ts`**

```ts
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const OrderStatusSchema = z.enum([
  "open",
  "invoiced",
  "partial_shipped",
  "shipped",
  "delivered",
  "cancelled",
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const PaymentKindSchema = z.enum(["deposit", "balance", "full", "adjustment"]);
export type PaymentKind = z.infer<typeof PaymentKindSchema>;

const ItemSchema = z.object({
  sku: z.string().nullable(),
  productName: z.string(),
  qty: z.number().int().positive(),
  unitCostCents: z.number().int().nonnegative(),
  releaseDate: isoDate.nullable(),
});

const PaymentSchema = z.object({
  kind: PaymentKindSchema,
  expectedDate: isoDate.nullable(),
  expectedCents: z.number().int(),
  actualDate: isoDate.nullable(),
  actualCents: z.number().int().nullable(),
});

const ShipmentItemSchema = z.object({
  sku: z.string().nullable(),
  qty: z.number().int().positive(),
});

const ShipmentSchema = z.object({
  shippedAt: isoDate,
  tracking: z.string().nullable(),
  carrier: z.string().nullable(),
  items: z.array(ShipmentItemSchema),
});

export const OrderSnapshotSchema = z.object({
  distroOrderId: z.string().min(1),
  placedAt: isoDate,
  status: OrderStatusSchema,
  totals: z.object({
    subtotalCents: z.number().int(),
    taxCents: z.number().int(),
    shippingCents: z.number().int(),
    totalCents: z.number().int(),
  }),
  items: z.array(ItemSchema),
  payments: z.array(PaymentSchema),
  shipments: z.array(ShipmentSchema),
  rawPayload: z.unknown(),
});
export type OrderSnapshot = z.infer<typeof OrderSnapshotSchema>;
```

- [ ] **Step 2: Update `packages/contracts/src/index.ts`**

```ts
export * from "./orderSnapshot.js";
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm --filter @distro/contracts test`
Expected: PASS, all 7 tests green.

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter @distro/contracts typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/
git commit -m "feat(contracts): implement OrderSnapshot Zod schema"
```

---

### Task 1.6 — `Scraper` interface + ingest envelope schemas

**Files:**
- Create: `packages/contracts/src/scraper.ts`
- Create: `packages/contracts/src/ingest.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/contracts/tests/ingest.test.ts`

- [ ] **Step 1: Create `packages/contracts/src/scraper.ts`**

```ts
import type { OrderSnapshot } from "./orderSnapshot.js";

// Loose context type so this package stays Deno-compatible (no Playwright dep).
// Concrete Scraper implementations narrow this.
export interface ScraperRunContext {
  [key: string]: unknown;
}

export interface Scraper {
  readonly slug: string;
  readonly displayName: string;
  login(ctx: ScraperRunContext): Promise<void>;
  fetchOrders(ctx: ScraperRunContext): Promise<OrderSnapshot[]>;
}
```

- [ ] **Step 2: Create `packages/contracts/src/ingest.ts`**

```ts
import { z } from "zod";
import { OrderSnapshotSchema } from "./orderSnapshot.js";

export const IngestOrdersPayloadSchema = z.object({
  kind: z.literal("orders"),
  distroSlug: z.string().min(1),
  syncRunId: z.string().uuid(),
  rows: z.array(OrderSnapshotSchema),
});
export type IngestOrdersPayload = z.infer<typeof IngestOrdersPayloadSchema>;

export const IngestFailurePayloadSchema = z.object({
  kind: z.literal("failure"),
  distroSlug: z.string().min(1),
  syncRunId: z.string().uuid(),
  error: z.string(),
  screenshotBase64: z.string().nullable(),
});
export type IngestFailurePayload = z.infer<typeof IngestFailurePayloadSchema>;

export const IngestPayloadSchema = z.discriminatedUnion("kind", [
  IngestOrdersPayloadSchema,
  IngestFailurePayloadSchema,
]);
export type IngestPayload = z.infer<typeof IngestPayloadSchema>;
```

- [ ] **Step 3: Update `packages/contracts/src/index.ts`**

```ts
export * from "./orderSnapshot.js";
export * from "./scraper.js";
export * from "./ingest.js";
```

- [ ] **Step 4: Write failing test for ingest envelopes**

```ts
// packages/contracts/tests/ingest.test.ts
import { describe, expect, it } from "vitest";
import { IngestPayloadSchema } from "../src/index.js";

const validUuid = "00000000-0000-4000-8000-000000000001";

describe("IngestPayloadSchema", () => {
  it("accepts an orders payload", () => {
    const p = { kind: "orders", distroSlug: "gts", syncRunId: validUuid, rows: [] };
    expect(() => IngestPayloadSchema.parse(p)).not.toThrow();
  });

  it("accepts a failure payload with screenshot", () => {
    const p = {
      kind: "failure",
      distroSlug: "gts",
      syncRunId: validUuid,
      error: "Login form not found",
      screenshotBase64: "iVBORw0KGgo=",
    };
    expect(() => IngestPayloadSchema.parse(p)).not.toThrow();
  });

  it("rejects unknown kind", () => {
    expect(() =>
      IngestPayloadSchema.parse({ kind: "weird", distroSlug: "gts" }),
    ).toThrow();
  });

  it("rejects non-UUID syncRunId", () => {
    expect(() =>
      IngestPayloadSchema.parse({
        kind: "orders",
        distroSlug: "gts",
        syncRunId: "not-a-uuid",
        rows: [],
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @distro/contracts test`
Expected: PASS, all tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src packages/contracts/tests/ingest.test.ts
git commit -m "feat(contracts): add Scraper interface + ingest payload envelopes"
```

---

### Task 1.7 — Phase 1 close-out

- [ ] **Step 1: Run full check**

Run: `pnpm check`
Expected: typecheck + all tests pass.

- [ ] **Step 2: Push**

```bash
git push origin main
```

**Milestone reached:** repo scaffold + contracts package working with passing tests.

---

## Phase 2 — Supabase Project + Schema Migrations

**Goal:** Local Supabase running; full 7-table schema applied; `distros` seeded with the GTS row; `pnpm db:reset` reliably rebuilds the schema.

**Prereq:** Install Supabase CLI (`brew install supabase/tap/supabase` or scoop/winget on Windows; verify with `supabase --version`).

### Task 2.1 — Initialize Supabase locally

**Files:**
- Create: `supabase/config.toml` (created by `supabase init`)
- Modify: `package.json` (add db scripts)

- [ ] **Step 1: Run `supabase init`**

Run (from repo root): `supabase init`
Expected: creates `supabase/` directory with `config.toml`, `seed.sql`, etc.

- [ ] **Step 2: Add db scripts to root `package.json`**

Edit `package.json`, add to `scripts`:

```json
{
  "scripts": {
    "db:start": "supabase start",
    "db:stop": "supabase stop",
    "db:reset": "supabase db reset",
    "db:diff": "supabase db diff",
    "functions:serve": "supabase functions serve"
  }
}
```

- [ ] **Step 3: Start Supabase locally**

Run: `pnpm db:start`
Expected: docker pulls images, Studio at `http://127.0.0.1:54323`, DB at port 54322. Note printed `service_role key` and `anon key` — save for later tasks.

- [ ] **Step 4: Commit**

```bash
git add supabase/config.toml supabase/seed.sql package.json
git commit -m "chore(db): initialize Supabase project"
```

---

### Task 2.2 — Migration: `distros` + `orders`

**Files:**
- Create: `supabase/migrations/20260513000001_init_distros_orders.sql`

- [ ] **Step 1: Create migration**

```sql
-- supabase/migrations/20260513000001_init_distros_orders.sql

create extension if not exists "pgcrypto";

create table distros (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  display_name  text not null,
  portal_url    text,
  created_at    timestamptz not null default now()
);

create table orders (
  id                uuid primary key default gen_random_uuid(),
  distro_id         uuid not null references distros(id),
  distro_order_id   text not null,
  placed_at         date,
  status            text not null check (status in (
    'open', 'invoiced', 'partial_shipped', 'shipped', 'delivered', 'cancelled'
  )),
  expected_release  date,
  subtotal_cents    int,
  tax_cents         int,
  shipping_cents    int,
  total_cents       int,
  raw_payload       jsonb,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  unique (distro_id, distro_order_id)
);

create index orders_status_idx on orders(status);
create index orders_placed_at_idx on orders(placed_at desc);
create index orders_distro_id_idx on orders(distro_id);
```

- [ ] **Step 2: Apply via `supabase db reset`**

Run: `pnpm db:reset`
Expected: prints "Applying migration 20260513000001_init_distros_orders.sql", no errors.

- [ ] **Step 3: Verify in Studio**

Open `http://127.0.0.1:54323`, Tables → confirm `distros` and `orders` exist with the columns above.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260513000001_init_distros_orders.sql
git commit -m "feat(db): add distros and orders tables"
```

---

### Task 2.3 — Migration: `order_items` + `order_item_history` + price-drift trigger

**Files:**
- Create: `supabase/migrations/20260513000002_init_items_history.sql`

- [ ] **Step 1: Create migration**

```sql
-- supabase/migrations/20260513000002_init_items_history.sql

create table order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references orders(id) on delete cascade,
  sku               text,
  product_name      text not null,
  qty               int not null check (qty > 0),
  unit_cost_cents   int not null check (unit_cost_cents >= 0),
  line_total_cents  int not null,
  release_date      date,
  status            text check (status is null or status in (
    'pending', 'shipped', 'cancelled', 'substituted'
  ))
);

create index order_items_order_id_idx on order_items(order_id);
create index order_items_release_date_idx on order_items(release_date);

create table order_item_history (
  id              bigserial primary key,
  order_item_id   uuid not null references order_items(id) on delete cascade,
  observed_at     timestamptz not null default now(),
  unit_cost_cents int not null,
  qty             int not null
);

create index order_item_history_item_idx on order_item_history(order_item_id, observed_at desc);

-- Trigger: append history row when price or qty changes on UPDATE.
-- INSERT does not trigger history (the initial value is the baseline).
create or replace function record_order_item_history() returns trigger
language plpgsql as $$
begin
  if (new.unit_cost_cents is distinct from old.unit_cost_cents)
     or (new.qty is distinct from old.qty) then
    insert into order_item_history (order_item_id, unit_cost_cents, qty)
    values (new.id, new.unit_cost_cents, new.qty);
  end if;
  return new;
end;
$$;

create trigger order_items_history_trg
  after update on order_items
  for each row execute function record_order_item_history();
```

- [ ] **Step 2: Apply**

Run: `pnpm db:reset`
Expected: clean apply.

- [ ] **Step 3: Manually verify trigger works**

Open Studio SQL editor and run:

```sql
insert into distros (slug, display_name) values ('test', 'Test') returning id;
-- copy the returned id, substitute below
insert into orders (distro_id, distro_order_id, status)
  values ('<id-from-above>', 'TEST-1', 'open') returning id;
insert into order_items (order_id, product_name, qty, unit_cost_cents, line_total_cents)
  values ('<order-id>', 'Test Box', 1, 5000, 5000) returning id;
update order_items set unit_cost_cents = 5500 where id = '<item-id>';
select * from order_item_history;  -- expect 1 row with unit_cost_cents = 5500
```

Expected: history table has exactly one row capturing the new price (5500). Clean up with `delete from distros where slug = 'test';` (cascades).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260513000002_init_items_history.sql
git commit -m "feat(db): add order_items + price-drift history trigger"
```

---

### Task 2.4 — Migration: `order_payments` + `shipments`

**Files:**
- Create: `supabase/migrations/20260513000003_init_payments_shipments.sql`

- [ ] **Step 1: Create migration**

```sql
-- supabase/migrations/20260513000003_init_payments_shipments.sql

create table order_payments (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  kind            text not null check (kind in ('deposit', 'balance', 'full', 'adjustment')),
  expected_date   date,
  expected_cents  int,
  actual_date     date,
  actual_cents    int,
  source          text not null check (source in ('scraped', 'inferred', 'manual'))
);

create index order_payments_order_idx on order_payments(order_id);
create index order_payments_expected_date_idx on order_payments(expected_date)
  where actual_date is null;
create index order_payments_actual_date_idx on order_payments(actual_date)
  where actual_date is not null;

create table shipments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  shipped_at  date,
  tracking    text,
  carrier     text,
  items       jsonb
);

create index shipments_order_idx on shipments(order_id);
create index shipments_shipped_at_idx on shipments(shipped_at desc);
```

- [ ] **Step 2: Apply**

Run: `pnpm db:reset`
Expected: clean apply.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260513000003_init_payments_shipments.sql
git commit -m "feat(db): add order_payments and shipments tables"
```

---

### Task 2.5 — Migration: `sync_runs`

**Files:**
- Create: `supabase/migrations/20260513000004_init_sync_runs.sql`

- [ ] **Step 1: Create migration**

```sql
-- supabase/migrations/20260513000004_init_sync_runs.sql

create table sync_runs (
  id              uuid primary key default gen_random_uuid(),
  distro_id       uuid not null references distros(id),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null check (status in ('running', 'success', 'partial', 'error')),
  orders_seen     int not null default 0,
  orders_changed  int not null default 0,
  error_message   text,
  screenshot_url  text
);

create index sync_runs_distro_started_idx on sync_runs(distro_id, started_at desc);
create index sync_runs_status_idx on sync_runs(status);
```

- [ ] **Step 2: Apply**

Run: `pnpm db:reset`
Expected: clean apply.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260513000004_init_sync_runs.sql
git commit -m "feat(db): add sync_runs table"
```

---

### Task 2.6 — Migration: seed `distros` with GTS

**Files:**
- Create: `supabase/migrations/20260513000005_seed_distros.sql`

- [ ] **Step 1: Create seed migration**

```sql
-- supabase/migrations/20260513000005_seed_distros.sql

insert into distros (slug, display_name, portal_url)
values ('gts', 'GTS Distribution', 'https://www.gtsdistribution.com/')
on conflict (slug) do nothing;
```

> Using a migration (not `supabase/seed.sql`) so the GTS row is present in
> production too. `seed.sql` is reset-only.

- [ ] **Step 2: Apply**

Run: `pnpm db:reset`
Expected: clean apply.

- [ ] **Step 3: Verify**

In Studio SQL editor:

```sql
select slug, display_name from distros;
```

Expected: one row, `gts | GTS Distribution`.

- [ ] **Step 4: Commit and push**

```bash
git add supabase/migrations/20260513000005_seed_distros.sql
git commit -m "feat(db): seed distros with GTS row"
git push origin main
```

**Milestone reached:** local Supabase has full schema + GTS seed. `pnpm db:reset` is a one-command rebuild.

---

## Phase 3 — Ingest Edge Function

**Goal:** A Supabase Edge Function at `supabase/functions/ingest` that authenticates a scraper token, validates payloads with the contracts package, upserts orders/items/payments/shipments idempotently, recomputes the cached `orders.status` headline, and triggers Next.js cache revalidation. End state: a `curl` POST puts data in the DB.

### Task 3.1 — Bootstrap the function

**Files:**
- Create: `supabase/functions/ingest/index.ts`
- Create: `supabase/functions/ingest/deno.json`

- [ ] **Step 1: Create function skeleton**

Run: `supabase functions new ingest`
Expected: creates `supabase/functions/ingest/index.ts` with a hello-world handler.

- [ ] **Step 2: Replace `supabase/functions/ingest/index.ts`** with auth-only skeleton:

```ts
// supabase/functions/ingest/index.ts
import { serve } from "https://deno.land/std@0.220.0/http/server.ts";

const SCRAPER_TOKEN = Deno.env.get("SCRAPER_TOKEN") ?? "";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  const token = req.headers.get("x-scraper-token");
  if (!SCRAPER_TOKEN || token !== SCRAPER_TOKEN) {
    return new Response("Unauthorized", { status: 401 });
  }
  return new Response(JSON.stringify({ ok: true, received: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
```

- [ ] **Step 3: Create `supabase/functions/ingest/deno.json`** (declares ESM resolution for workspace imports)

```json
{
  "imports": {
    "@distro/contracts": "../../../packages/contracts/src/index.ts",
    "zod": "https://deno.land/x/zod@v3.23.8/mod.ts"
  }
}
```

> Note: `packages/contracts` source imports `zod` via NPM-style; Deno resolves it via the imports map above. This is why the contracts package must be ESM-only with no Node-specific imports.

- [ ] **Step 4: Serve locally**

In one terminal: `pnpm functions:serve`
Expected: function listening at `http://127.0.0.1:54321/functions/v1/ingest`.

- [ ] **Step 5: Manual smoke test**

In another terminal:

```bash
curl -i -X POST http://127.0.0.1:54321/functions/v1/ingest \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: `401 Unauthorized`.

```bash
SCRAPER_TOKEN=dev-token curl -i -X POST http://127.0.0.1:54321/functions/v1/ingest \
  -H "Content-Type: application/json" \
  -H "x-scraper-token: dev-token" \
  -d '{}'
```

Set the function env via `supabase/.env.local`:

```
SCRAPER_TOKEN=dev-token
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<from `supabase status` output>
REVALIDATE_URL=
REVALIDATE_TOKEN=
VERCEL_BYPASS_TOKEN=
```

Restart `pnpm functions:serve` so env is picked up. Retry the curl — expect `200 {"ok": true, "received": true}`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/ingest supabase/.env.local.example
git commit -m "feat(ingest): bootstrap edge function with token auth"
```

> Don't commit `supabase/.env.local` — it's in `.gitignore`. Add a `supabase/.env.local.example` template:
>
> ```
> SCRAPER_TOKEN=
> SUPABASE_URL=
> SUPABASE_SERVICE_ROLE_KEY=
> REVALIDATE_URL=
> REVALIDATE_TOKEN=
> VERCEL_BYPASS_TOKEN=
> ```

---

### Task 3.2 — Tests: auth + payload validation

**Files:**
- Create: `supabase/functions/ingest/tests/auth.test.ts`
- Create: `supabase/functions/ingest/lib/auth.ts`
- Modify: `supabase/functions/ingest/index.ts`

- [ ] **Step 1: Extract auth logic into a testable module**

Create `supabase/functions/ingest/lib/auth.ts`:

```ts
export function checkScraperToken(req: Request, expected: string): boolean {
  if (!expected) return false;
  return req.headers.get("x-scraper-token") === expected;
}
```

- [ ] **Step 2: Update `index.ts` to use the helper**

Replace the inline check in `index.ts` with `checkScraperToken(req, SCRAPER_TOKEN)`.

- [ ] **Step 3: Write Deno test**

```ts
// supabase/functions/ingest/tests/auth.test.ts
import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { checkScraperToken } from "../lib/auth.ts";

Deno.test("checkScraperToken accepts matching header", () => {
  const req = new Request("http://x", { headers: { "x-scraper-token": "abc" } });
  assertEquals(checkScraperToken(req, "abc"), true);
});

Deno.test("checkScraperToken rejects empty expected", () => {
  const req = new Request("http://x", { headers: { "x-scraper-token": "abc" } });
  assertEquals(checkScraperToken(req, ""), false);
});

Deno.test("checkScraperToken rejects mismatch", () => {
  const req = new Request("http://x", { headers: { "x-scraper-token": "wrong" } });
  assertEquals(checkScraperToken(req, "abc"), false);
});

Deno.test("checkScraperToken rejects missing header", () => {
  const req = new Request("http://x");
  assertEquals(checkScraperToken(req, "abc"), false);
});
```

- [ ] **Step 4: Run Deno test**

Run: `deno test --allow-all supabase/functions/ingest/tests/auth.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/ingest/lib/auth.ts supabase/functions/ingest/tests/auth.test.ts supabase/functions/ingest/index.ts
git commit -m "test(ingest): extract and test scraper token auth"
```

---

### Task 3.3 — Status headline recomputation (pure function, fully testable)

**Files:**
- Create: `supabase/functions/ingest/lib/statusHeadline.ts`
- Create: `supabase/functions/ingest/tests/statusHeadline.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// supabase/functions/ingest/tests/statusHeadline.test.ts
import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { recomputeHeadline } from "../lib/statusHeadline.ts";
import type { OrderSnapshot } from "@distro/contracts";

const base: OrderSnapshot = {
  distroOrderId: "X",
  placedAt: "2026-04-01",
  status: "open",
  totals: { subtotalCents: 0, taxCents: 0, shippingCents: 0, totalCents: 0 },
  items: [],
  payments: [],
  shipments: [],
  rawPayload: null,
};

Deno.test("trusts scraped status when no shipments or payments contradict", () => {
  assertEquals(recomputeHeadline({ ...base, status: "open" }), "open");
  assertEquals(recomputeHeadline({ ...base, status: "invoiced" }), "invoiced");
});

Deno.test("collapses to delivered when shipments + payments imply done", () => {
  const snap: OrderSnapshot = {
    ...base,
    status: "shipped",
    payments: [{
      kind: "full", expectedDate: null, expectedCents: 100,
      actualDate: "2026-04-15", actualCents: 100,
    }],
    shipments: [{ shippedAt: "2026-04-16", tracking: "1Z", carrier: "UPS", items: [] }],
  };
  // Status is left as scraper said; delivered requires explicit scraper confirmation.
  assertEquals(recomputeHeadline(snap), "shipped");
});

Deno.test("promotes shipped → partial_shipped if any item is pending", () => {
  const snap: OrderSnapshot = {
    ...base,
    status: "shipped",
    items: [
      { sku: "A", productName: "A", qty: 1, unitCostCents: 100, releaseDate: null },
      { sku: "B", productName: "B", qty: 1, unitCostCents: 100, releaseDate: null },
    ],
    shipments: [{
      shippedAt: "2026-04-16", tracking: null, carrier: null,
      items: [{ sku: "A", qty: 1 }], // B not shipped
    }],
  };
  assertEquals(recomputeHeadline(snap), "partial_shipped");
});

Deno.test("respects cancelled regardless of other fields", () => {
  assertEquals(
    recomputeHeadline({ ...base, status: "cancelled" }),
    "cancelled",
  );
});
```

- [ ] **Step 2: Run tests → fail**

Run: `deno test --allow-all supabase/functions/ingest/tests/statusHeadline.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `lib/statusHeadline.ts`**

```ts
// supabase/functions/ingest/lib/statusHeadline.ts
import type { OrderSnapshot, OrderStatus } from "@distro/contracts";

export function recomputeHeadline(snap: OrderSnapshot): OrderStatus {
  // Cancelled is sticky — never override.
  if (snap.status === "cancelled") return "cancelled";

  // If scraper said "shipped" but at least one item isn't covered by any
  // shipment's items list, we know it's partial.
  if (snap.status === "shipped" && snap.items.length > 0) {
    const shippedQtyBySku = new Map<string | null, number>();
    for (const sh of snap.shipments) {
      for (const it of sh.items) {
        shippedQtyBySku.set(it.sku, (shippedQtyBySku.get(it.sku) ?? 0) + it.qty);
      }
    }
    const fullyShipped = snap.items.every(
      (it) => (shippedQtyBySku.get(it.sku) ?? 0) >= it.qty,
    );
    if (!fullyShipped) return "partial_shipped";
  }

  // Trust the scraper otherwise — they see the source of truth.
  return snap.status;
}
```

- [ ] **Step 4: Run tests → pass**

Run: `deno test --allow-all supabase/functions/ingest/tests/statusHeadline.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/ingest/lib/statusHeadline.ts supabase/functions/ingest/tests/statusHeadline.test.ts
git commit -m "feat(ingest): status headline recomputation with unit tests"
```

---

### Task 3.4 — Orders upsert handler (integration test against local Supabase)

**Files:**
- Create: `supabase/functions/ingest/handlers/orders.ts`
- Create: `supabase/functions/ingest/tests/orders.test.ts`

- [ ] **Step 1: Write integration test**

This test requires `supabase start` and `pnpm db:reset` to have run.

```ts
// supabase/functions/ingest/tests/orders.test.ts
import { assertEquals, assertExists } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleOrders } from "../handlers/orders.ts";
import type { IngestOrdersPayload } from "@distro/contracts";

const SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function client() {
  return createClient(SUPA_URL, SVC, { auth: { persistSession: false } });
}

const validUuid = crypto.randomUUID();

const samplePayload = (overrides: Partial<IngestOrdersPayload> = {}): IngestOrdersPayload => ({
  kind: "orders",
  distroSlug: "gts",
  syncRunId: validUuid,
  rows: [
    {
      distroOrderId: "PO-TEST-1",
      placedAt: "2026-04-12",
      status: "invoiced",
      totals: { subtotalCents: 12000, taxCents: 0, shippingCents: 500, totalCents: 12500 },
      items: [{
        sku: "TEST-BOX", productName: "Test Box", qty: 2,
        unitCostCents: 6000, releaseDate: "2026-06-01",
      }],
      payments: [{
        kind: "deposit", expectedDate: "2026-04-20", expectedCents: 5000,
        actualDate: null, actualCents: null,
      }],
      shipments: [],
      rawPayload: { test: true },
    },
  ],
  ...overrides,
});

async function cleanup() {
  const c = client();
  await c.from("orders").delete().eq("distro_order_id", "PO-TEST-1");
  await c.from("sync_runs").delete().eq("id", validUuid);
}

Deno.test("handleOrders inserts a new order with items + payments", async () => {
  await cleanup();
  const c = client();
  const result = await handleOrders(c, samplePayload());
  assertEquals(result.changed, 1);

  const { data: orders } = await c.from("orders").select("*")
    .eq("distro_order_id", "PO-TEST-1");
  assertEquals(orders?.length, 1);
  const orderId = orders![0].id;

  const { data: items } = await c.from("order_items").select("*").eq("order_id", orderId);
  assertEquals(items?.length, 1);
  assertEquals(items![0].unit_cost_cents, 6000);

  const { data: pays } = await c.from("order_payments").select("*").eq("order_id", orderId);
  assertEquals(pays?.length, 1);
  assertEquals(pays![0].expected_cents, 5000);

  await cleanup();
});

Deno.test("handleOrders is idempotent — second call with same payload does not duplicate", async () => {
  await cleanup();
  const c = client();
  await handleOrders(c, samplePayload());
  await handleOrders(c, samplePayload());

  const { data: orders } = await c.from("orders").select("id")
    .eq("distro_order_id", "PO-TEST-1");
  assertEquals(orders?.length, 1);

  await cleanup();
});

Deno.test("handleOrders fills actual_date on existing payment when scrape sees it charged", async () => {
  await cleanup();
  const c = client();
  await handleOrders(c, samplePayload());

  const updated = samplePayload();
  updated.rows[0].payments[0] = {
    ...updated.rows[0].payments[0],
    actualDate: "2026-04-21",
    actualCents: 5000,
  };
  await handleOrders(c, updated);

  const { data: orderRow } = await c.from("orders").select("id")
    .eq("distro_order_id", "PO-TEST-1").single();
  const { data: pays } = await c.from("order_payments").select("*")
    .eq("order_id", orderRow!.id);

  assertEquals(pays?.length, 1);
  assertEquals(pays![0].actual_date, "2026-04-21");
  assertEquals(pays![0].actual_cents, 5000);

  await cleanup();
});

Deno.test("handleOrders triggers price-history when unit_cost_cents changes", async () => {
  await cleanup();
  const c = client();
  await handleOrders(c, samplePayload());

  const cheaper = samplePayload();
  cheaper.rows[0].items[0] = { ...cheaper.rows[0].items[0], unitCostCents: 5500 };
  await handleOrders(c, cheaper);

  const { data: orderRow } = await c.from("orders").select("id")
    .eq("distro_order_id", "PO-TEST-1").single();
  const { data: items } = await c.from("order_items").select("id")
    .eq("order_id", orderRow!.id);
  const { data: hist } = await c.from("order_item_history").select("*")
    .eq("order_item_id", items![0].id);

  // At least one history row from the price change. (May have more if seed
  // wrote an initial row — we accept >= 1 to keep the test robust.)
  assertExists(hist);
  assertEquals(hist!.length >= 1, true);
  assertEquals(hist!.some((h) => h.unit_cost_cents === 5500), true);

  await cleanup();
});
```

- [ ] **Step 2: Run test → fail**

Run: `deno test --allow-all --env=supabase/.env.local supabase/functions/ingest/tests/orders.test.ts`
Expected: FAIL — `handleOrders` not defined.

- [ ] **Step 3: Implement `handlers/orders.ts`**

```ts
// supabase/functions/ingest/handlers/orders.ts
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { IngestOrdersPayload, OrderSnapshot } from "@distro/contracts";
import { recomputeHeadline } from "../lib/statusHeadline.ts";

export interface HandleOrdersResult {
  changed: number;
  errors: Array<{ distroOrderId: string; message: string }>;
}

export async function handleOrders(
  c: SupabaseClient,
  payload: IngestOrdersPayload,
): Promise<HandleOrdersResult> {
  const { data: distroRow, error: dErr } = await c.from("distros")
    .select("id").eq("slug", payload.distroSlug).single();
  if (dErr || !distroRow) {
    throw new Error(`Unknown distro slug: ${payload.distroSlug}`);
  }
  const distroId = distroRow.id;

  const errors: HandleOrdersResult["errors"] = [];
  let changed = 0;

  for (const snap of payload.rows) {
    try {
      await upsertOneOrder(c, distroId, snap);
      changed++;
    } catch (err) {
      errors.push({
        distroOrderId: snap.distroOrderId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { changed, errors };
}

async function upsertOneOrder(
  c: SupabaseClient,
  distroId: string,
  snap: OrderSnapshot,
): Promise<void> {
  const headline = recomputeHeadline(snap);
  const earliestRelease =
    snap.items.map((i) => i.releaseDate).filter((d): d is string => !!d).sort()[0] ?? null;

  // Upsert the order row.
  const { data: order, error: oErr } = await c.from("orders").upsert(
    {
      distro_id: distroId,
      distro_order_id: snap.distroOrderId,
      placed_at: snap.placedAt,
      status: headline,
      expected_release: earliestRelease,
      subtotal_cents: snap.totals.subtotalCents,
      tax_cents: snap.totals.taxCents,
      shipping_cents: snap.totals.shippingCents,
      total_cents: snap.totals.totalCents,
      raw_payload: snap.rawPayload,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "distro_id,distro_order_id" },
  ).select("id").single();
  if (oErr || !order) throw new Error(`orders upsert failed: ${oErr?.message}`);

  // Items: replace wholesale.
  await c.from("order_items").delete().eq("order_id", order.id);
  if (snap.items.length > 0) {
    const itemRows = snap.items.map((it) => ({
      order_id: order.id,
      sku: it.sku,
      product_name: it.productName,
      qty: it.qty,
      unit_cost_cents: it.unitCostCents,
      line_total_cents: it.unitCostCents * it.qty,
      release_date: it.releaseDate,
      status: null,
    }));
    const { error: iErr } = await c.from("order_items").insert(itemRows);
    if (iErr) throw new Error(`order_items insert failed: ${iErr.message}`);
  }

  // Payments: upsert by (order_id, kind, expected_date) — distros rarely have two
  // payments of the same kind+date for one order.
  for (const p of snap.payments) {
    // Try to find existing row matching kind + expected_date.
    const { data: existing } = await c.from("order_payments").select("id")
      .eq("order_id", order.id)
      .eq("kind", p.kind)
      .eq(p.expectedDate ? "expected_date" : "kind", p.expectedDate ?? p.kind)
      // The above is a workaround for matching nulls. We then narrow:
      .limit(1);

    const matched = (existing ?? []).find((_r) => true);

    if (matched) {
      await c.from("order_payments").update({
        expected_cents: p.expectedCents,
        actual_date: p.actualDate,
        actual_cents: p.actualCents,
        source: "scraped",
      }).eq("id", matched.id);
    } else {
      await c.from("order_payments").insert({
        order_id: order.id,
        kind: p.kind,
        expected_date: p.expectedDate,
        expected_cents: p.expectedCents,
        actual_date: p.actualDate,
        actual_cents: p.actualCents,
        source: "scraped",
      });
    }
  }

  // Shipments: replace wholesale (distros may rewrite tracking).
  await c.from("shipments").delete().eq("order_id", order.id);
  if (snap.shipments.length > 0) {
    const shipRows = snap.shipments.map((s) => ({
      order_id: order.id,
      shipped_at: s.shippedAt,
      tracking: s.tracking,
      carrier: s.carrier,
      items: s.items,
    }));
    const { error: sErr } = await c.from("shipments").insert(shipRows);
    if (sErr) throw new Error(`shipments insert failed: ${sErr.message}`);
  }
}
```

> Note: the payment matching above intentionally avoids deleting all payments per
> sync, so `actual_date` filled in by an earlier successful match is preserved
> if the scraper later loses sight of it. The match heuristic is `(kind,
> expected_date)`; this is fragile if a distro publishes two same-kind payments
> on the same date for one order. For v1, accept that risk.

- [ ] **Step 4: Run tests → pass**

Run: `deno test --allow-all --env=supabase/.env.local supabase/functions/ingest/tests/orders.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/ingest/handlers/orders.ts supabase/functions/ingest/tests/orders.test.ts
git commit -m "feat(ingest): orders upsert handler with idempotency tests"
```

---

### Task 3.5 — Failure payload handler (screenshot upload + sync_run update)

**Files:**
- Create: `supabase/functions/ingest/handlers/failure.ts`
- Create: `supabase/functions/ingest/tests/failure.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// supabase/functions/ingest/tests/failure.test.ts
import { assertEquals, assertExists } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleFailure } from "../handlers/failure.ts";

const SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.test("handleFailure updates sync_run with error + uploads screenshot", async () => {
  const c = createClient(SUPA_URL, SVC, { auth: { persistSession: false } });
  const { data: distro } = await c.from("distros").select("id").eq("slug", "gts").single();

  // seed a sync_run
  const { data: run } = await c.from("sync_runs").insert({
    distro_id: distro!.id, status: "running",
  }).select("id").single();

  // 1x1 transparent PNG
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

  await handleFailure(c, {
    kind: "failure",
    distroSlug: "gts",
    syncRunId: run!.id,
    error: "Login form not found",
    screenshotBase64: png,
  });

  const { data: updated } = await c.from("sync_runs").select("*").eq("id", run!.id).single();
  assertEquals(updated!.status, "error");
  assertEquals(updated!.error_message, "Login form not found");
  assertExists(updated!.screenshot_url);
  assertExists(updated!.finished_at);

  // cleanup
  await c.from("sync_runs").delete().eq("id", run!.id);
});
```

- [ ] **Step 2: Run → fail**

Expected: `handleFailure` not defined.

- [ ] **Step 3: Implement `handlers/failure.ts`**

```ts
// supabase/functions/ingest/handlers/failure.ts
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { IngestFailurePayload } from "@distro/contracts";

const BUCKET = "sync-debug";

export async function handleFailure(
  c: SupabaseClient,
  payload: IngestFailurePayload,
): Promise<void> {
  let screenshotUrl: string | null = null;

  if (payload.screenshotBase64) {
    // Ensure bucket exists (idempotent).
    await c.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);

    const path = `${payload.distroSlug}/${payload.syncRunId}.png`;
    const bytes = Uint8Array.from(atob(payload.screenshotBase64), (ch) => ch.charCodeAt(0));

    const { error: upErr } = await c.storage.from(BUCKET).upload(path, bytes, {
      contentType: "image/png",
      upsert: true,
    });
    if (upErr) throw new Error(`screenshot upload failed: ${upErr.message}`);

    const { data: signed } = await c.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 30);
    screenshotUrl = signed?.signedUrl ?? null;
  }

  const { error: updErr } = await c.from("sync_runs").update({
    status: "error",
    error_message: payload.error,
    screenshot_url: screenshotUrl,
    finished_at: new Date().toISOString(),
  }).eq("id", payload.syncRunId);
  if (updErr) throw new Error(`sync_runs update failed: ${updErr.message}`);
}
```

- [ ] **Step 4: Run → pass**

Expected: test passes; sync_runs row shows status=error, screenshot_url populated.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/ingest/handlers/failure.ts supabase/functions/ingest/tests/failure.test.ts
git commit -m "feat(ingest): failure payload handler with screenshot upload"
```

---

### Task 3.6 — Wire handlers into `index.ts` + revalidation hook

**Files:**
- Modify: `supabase/functions/ingest/index.ts`
- Create: `supabase/functions/ingest/lib/revalidate.ts`

- [ ] **Step 1: Create `lib/revalidate.ts`**

```ts
// supabase/functions/ingest/lib/revalidate.ts
const REVALIDATE_URL = Deno.env.get("REVALIDATE_URL") ?? "";
const REVALIDATE_TOKEN = Deno.env.get("REVALIDATE_TOKEN") ?? "";
const BYPASS = Deno.env.get("VERCEL_BYPASS_TOKEN") ?? "";

const TAGS = ["orders", "payments", "releases", "syncRuns"] as const;

export async function fireRevalidate(): Promise<void> {
  if (!REVALIDATE_URL || !REVALIDATE_TOKEN) {
    console.warn("Revalidate skipped — REVALIDATE_URL or REVALIDATE_TOKEN missing");
    return;
  }
  const url = new URL(REVALIDATE_URL);
  if (BYPASS) url.searchParams.set("x-vercel-protection-bypass", BYPASS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "x-revalidate-token": REVALIDATE_TOKEN,
        "content-type": "application/json",
      },
      body: JSON.stringify({ tags: TAGS }),
    });
    if (!res.ok) {
      console.error(`Revalidate failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error("Revalidate threw:", err);
  }
}
```

- [ ] **Step 2: Rewrite `index.ts`**

```ts
// supabase/functions/ingest/index.ts
import { serve } from "https://deno.land/std@0.220.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { IngestPayloadSchema } from "@distro/contracts";
import { checkScraperToken } from "./lib/auth.ts";
import { handleOrders } from "./handlers/orders.ts";
import { handleFailure } from "./handlers/failure.ts";
import { fireRevalidate } from "./lib/revalidate.ts";

const SCRAPER_TOKEN = Deno.env.get("SCRAPER_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!checkScraperToken(req, SCRAPER_TOKEN)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const parsed = IngestPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.format() }), {
      status: 422,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  try {
    if (parsed.data.kind === "orders") {
      const result = await handleOrders(supabase, parsed.data);
      // Close out the sync_run on success
      await supabase.from("sync_runs").update({
        status: result.errors.length === 0 ? "success" : "partial",
        orders_seen: parsed.data.rows.length,
        orders_changed: result.changed,
        error_message: result.errors.length ? JSON.stringify(result.errors) : null,
        finished_at: new Date().toISOString(),
      }).eq("id", parsed.data.syncRunId);

      await fireRevalidate();
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } else {
      await handleFailure(supabase, parsed.data);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
```

- [ ] **Step 3: Manual end-to-end smoke test**

With `pnpm functions:serve` running, POST a valid orders payload:

```bash
SYNC_ID=$(uuidgen)
curl -i -X POST http://127.0.0.1:54321/functions/v1/ingest \
  -H "Content-Type: application/json" \
  -H "x-scraper-token: dev-token" \
  -d "$(cat <<JSON
{
  "kind": "orders",
  "distroSlug": "gts",
  "syncRunId": "$SYNC_ID",
  "rows": [{
    "distroOrderId": "SMOKE-1",
    "placedAt": "2026-05-13",
    "status": "open",
    "totals": { "subtotalCents": 1000, "taxCents": 0, "shippingCents": 0, "totalCents": 1000 },
    "items": [],
    "payments": [],
    "shipments": [],
    "rawPayload": null
  }]
}
JSON
)"
```

> The above curl will fail because the syncRunId doesn't exist in `sync_runs` yet. That's expected — for the smoke test, first insert a row via Studio, then re-run with that UUID. The full end-to-end flow (orchestrator creates sync_run first) is Phase 4.

Expected: HTTP 200 with `{"changed": 1, "errors": []}`.

Verify in Studio:
```sql
select * from orders where distro_order_id = 'SMOKE-1';
```

- [ ] **Step 4: Clean up smoke data**

```sql
delete from orders where distro_order_id = 'SMOKE-1';
```

- [ ] **Step 5: Commit and push**

```bash
git add supabase/functions/ingest
git commit -m "feat(ingest): wire handlers + revalidation in main handler"
git push origin main
```

**Milestone reached:** ingest function accepts validated payloads, writes to DB, fires (currently no-op) revalidation. Curl-testable end-to-end.

---

## Phase 4 — Scraper Core (No GTS-specific Code Yet)

**Goal:** `apps/scraper` builds; tests pass; a fake scraper module can be registered, the orchestrator creates a sync_run, POSTs to ingest, and closes the run. GTS-specific scraping is Phase 5.

### Task 4.1 — Scaffold `apps/scraper`

**Files:**
- Create: `apps/scraper/package.json`
- Create: `apps/scraper/tsconfig.json`
- Create: `apps/scraper/vitest.config.ts`
- Create: `apps/scraper/src/cli.ts`
- Create: `apps/scraper/config.local.json.example`

- [ ] **Step 1: Create `apps/scraper/package.json`**

```json
{
  "name": "@distro/scraper",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "tsc",
    "sync": "tsx src/cli.ts sync",
    "capture": "tsx src/cli.ts capture",
    "scraper:capture": "tsx src/cli.ts capture"
  },
  "dependencies": {
    "@distro/contracts": "workspace:*",
    "playwright": "^1.45.0",
    "tsx": "^4.7.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `apps/scraper/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create `apps/scraper/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
```

- [ ] **Step 4: Create `apps/scraper/src/cli.ts`** (placeholder for now)

```ts
const cmd = process.argv[2];
console.log(`scraper cli: ${cmd ?? "(no command)"}`);
process.exit(0);
```

- [ ] **Step 5: Create `apps/scraper/config.local.json.example`**

```json
{
  "ingestUrl": "http://127.0.0.1:54321/functions/v1/ingest",
  "scraperToken": "dev-token",
  "distros": {
    "gts": {
      "username": "",
      "password": ""
    }
  }
}
```

- [ ] **Step 6: Install playwright browsers (one-time)**

```bash
pnpm install
pnpm --filter @distro/scraper exec playwright install chromium
```

- [ ] **Step 7: Commit**

```bash
git add apps/scraper pnpm-lock.yaml
git commit -m "feat(scraper): scaffold @distro/scraper package"
```

---

### Task 4.2 — Config loader

**Files:**
- Create: `apps/scraper/src/config.ts`
- Create: `apps/scraper/tests/config.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// apps/scraper/tests/config.test.ts
import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";

describe("parseConfig", () => {
  it("accepts a minimal valid config", () => {
    const json = {
      ingestUrl: "http://example.com",
      scraperToken: "tok",
      distros: { gts: { username: "u", password: "p" } },
    };
    expect(() => parseConfig(json)).not.toThrow();
  });

  it("rejects missing ingestUrl", () => {
    expect(() => parseConfig({ scraperToken: "tok", distros: {} })).toThrow();
  });

  it("rejects empty scraperToken", () => {
    expect(() =>
      parseConfig({ ingestUrl: "http://x", scraperToken: "", distros: {} }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter @distro/scraper test`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `src/config.ts`**

```ts
// apps/scraper/src/config.ts
import { readFileSync } from "node:fs";
import { z } from "zod";

const DistroCredsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const ConfigSchema = z.object({
  ingestUrl: z.string().url(),
  scraperToken: z.string().min(1),
  distros: z.record(z.string(), DistroCredsSchema),
});
export type Config = z.infer<typeof ConfigSchema>;

export function parseConfig(input: unknown): Config {
  return ConfigSchema.parse(input);
}

export function loadConfig(path = "config.local.json"): Config {
  const raw = readFileSync(path, "utf8");
  return parseConfig(JSON.parse(raw));
}
```

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter @distro/scraper test`
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/scraper/src/config.ts apps/scraper/tests/config.test.ts
git commit -m "feat(scraper): config loader with validation"
```

---

### Task 4.3 — Ingest client

**Files:**
- Create: `apps/scraper/src/core/ingestClient.ts`
- Create: `apps/scraper/tests/ingestClient.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// apps/scraper/tests/ingestClient.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postOrders, postFailure } from "../src/core/ingestClient.js";
import type { OrderSnapshot } from "@distro/contracts";

const URL = "http://example.com/ingest";
const TOKEN = "tok";

const fakeSnapshot: OrderSnapshot = {
  distroOrderId: "PO-1",
  placedAt: "2026-04-12",
  status: "open",
  totals: { subtotalCents: 0, taxCents: 0, shippingCents: 0, totalCents: 0 },
  items: [], payments: [], shipments: [], rawPayload: null,
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe("postOrders", () => {
  it("POSTs payload with x-scraper-token header", async () => {
    (fetch as any).mockResolvedValue(new Response(JSON.stringify({ changed: 1 }), { status: 200 }));
    const runId = "00000000-0000-4000-8000-000000000001";
    await postOrders({
      url: URL, token: TOKEN, distroSlug: "gts", syncRunId: runId, rows: [fakeSnapshot],
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [calledUrl, init] = (fetch as any).mock.calls[0];
    expect(calledUrl).toBe(URL);
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({ "x-scraper-token": TOKEN });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.kind).toBe("orders");
    expect(body.rows.length).toBe(1);
  });

  it("throws on non-2xx response", async () => {
    (fetch as any).mockResolvedValue(new Response("nope", { status: 422 }));
    await expect(postOrders({
      url: URL, token: TOKEN, distroSlug: "gts",
      syncRunId: "00000000-0000-4000-8000-000000000001", rows: [],
    })).rejects.toThrow(/422/);
  });
});

describe("postFailure", () => {
  it("POSTs failure payload", async () => {
    (fetch as any).mockResolvedValue(new Response("{}", { status: 200 }));
    await postFailure({
      url: URL, token: TOKEN, distroSlug: "gts",
      syncRunId: "00000000-0000-4000-8000-000000000001",
      error: "boom", screenshotBase64: "abc",
    });
    expect(fetch).toHaveBeenCalledOnce();
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.kind).toBe("failure");
    expect(body.error).toBe("boom");
    expect(body.screenshotBase64).toBe("abc");
  });
});
```

- [ ] **Step 2: Run → fail**

Expected: module missing.

- [ ] **Step 3: Implement `src/core/ingestClient.ts`**

```ts
// apps/scraper/src/core/ingestClient.ts
import type { OrderSnapshot } from "@distro/contracts";

export interface PostOrdersArgs {
  url: string;
  token: string;
  distroSlug: string;
  syncRunId: string;
  rows: OrderSnapshot[];
}

export interface PostFailureArgs {
  url: string;
  token: string;
  distroSlug: string;
  syncRunId: string;
  error: string;
  screenshotBase64: string | null;
}

async function post(url: string, token: string, body: unknown): Promise<Response> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-scraper-token": token },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`ingest POST failed: ${res.status} ${await res.text()}`);
  }
  return res;
}

export async function postOrders(args: PostOrdersArgs): Promise<{ changed: number }> {
  const res = await post(args.url, args.token, {
    kind: "orders",
    distroSlug: args.distroSlug,
    syncRunId: args.syncRunId,
    rows: args.rows,
  });
  return (await res.json()) as { changed: number };
}

export async function postFailure(args: PostFailureArgs): Promise<void> {
  await post(args.url, args.token, {
    kind: "failure",
    distroSlug: args.distroSlug,
    syncRunId: args.syncRunId,
    error: args.error,
    screenshotBase64: args.screenshotBase64,
  });
}
```

- [ ] **Step 4: Run → pass**

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/scraper/src/core/ingestClient.ts apps/scraper/tests/ingestClient.test.ts
git commit -m "feat(scraper): ingest HTTP client with tests"
```

---

### Task 4.4 — Tripwire helper (zero-orders detection)

**Files:**
- Create: `apps/scraper/src/core/tripwire.ts`
- Create: `apps/scraper/tests/tripwire.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// apps/scraper/tests/tripwire.test.ts
import { describe, expect, it } from "vitest";
import { isSuspiciousZero } from "../src/core/tripwire.js";

describe("isSuspiciousZero", () => {
  it("returns false when current > 0", () => {
    expect(isSuspiciousZero(5, 10)).toBe(false);
  });
  it("returns false when prior is null (first ever run)", () => {
    expect(isSuspiciousZero(0, null)).toBe(false);
  });
  it("returns false when prior was 0", () => {
    expect(isSuspiciousZero(0, 0)).toBe(false);
  });
  it("returns true when current is 0 and prior was > 0", () => {
    expect(isSuspiciousZero(0, 7)).toBe(true);
  });
});
```

- [ ] **Step 2: Run → fail**

- [ ] **Step 3: Implement `tripwire.ts`**

```ts
// apps/scraper/src/core/tripwire.ts
export function isSuspiciousZero(currentCount: number, priorCount: number | null): boolean {
  if (currentCount > 0) return false;
  if (priorCount === null) return false;
  return priorCount > 0;
}
```

- [ ] **Step 4: Run → pass**

- [ ] **Step 5: Commit**

```bash
git add apps/scraper/src/core/tripwire.ts apps/scraper/tests/tripwire.test.ts
git commit -m "feat(scraper): tripwire helper for zero-orders detection"
```

---

### Task 4.5 — Browser context helper (cookie persistence)

**Files:**
- Create: `apps/scraper/src/core/browserContext.ts`

> No tests for this file — it wraps Playwright, manual verification in Phase 5.

- [ ] **Step 1: Implement**

```ts
// apps/scraper/src/core/browserContext.ts
import { chromium, type BrowserContext } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface OpenContextArgs {
  slug: string;
  headed?: boolean;
  cookieDir?: string;
}

export async function openContext(args: OpenContextArgs): Promise<BrowserContext> {
  const cookiePath = `${args.cookieDir ?? ".cache/cookies"}/${args.slug}.json`;
  if (!existsSync(dirname(cookiePath))) {
    mkdirSync(dirname(cookiePath), { recursive: true });
  }
  const browser = await chromium.launch({ headless: !args.headed });
  const ctx = await browser.newContext({
    storageState: existsSync(cookiePath) ? cookiePath : undefined,
  });
  // Attach close hook to persist cookies on dispose.
  const originalClose = ctx.close.bind(ctx);
  ctx.close = async () => {
    try { await ctx.storageState({ path: cookiePath }); } catch { /* ignore */ }
    await originalClose();
    await browser.close();
  };
  return ctx;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/scraper/src/core/browserContext.ts
git commit -m "feat(scraper): browser context with persistent cookies"
```

---

### Task 4.6 — Test factories (DRY)

**Files:**
- Create: `apps/scraper/tests/factories.ts`

- [ ] **Step 1: Create factories**

```ts
// apps/scraper/tests/factories.ts
import type { OrderSnapshot } from "@distro/contracts";

export function makeOrderSnapshot(overrides: Partial<OrderSnapshot> = {}): OrderSnapshot {
  return {
    distroOrderId: "PO-TEST",
    placedAt: "2026-04-12",
    status: "open",
    totals: { subtotalCents: 1000, taxCents: 0, shippingCents: 0, totalCents: 1000 },
    items: [],
    payments: [],
    shipments: [],
    rawPayload: null,
    ...overrides,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/scraper/tests/factories.ts
git commit -m "chore(scraper): add OrderSnapshot test factory"
```

---

### Task 4.7 — Orchestrator (runSync)

**Files:**
- Create: `apps/scraper/src/core/runSync.ts`
- Create: `apps/scraper/tests/runSync.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// apps/scraper/tests/runSync.test.ts
import { describe, expect, it, vi } from "vitest";
import { runSync } from "../src/core/runSync.js";
import type { Scraper } from "@distro/contracts";
import { makeOrderSnapshot } from "./factories.js";

function makeDeps(overrides: Partial<Parameters<typeof runSync>[1]> = {}) {
  return {
    openContext: vi.fn().mockResolvedValue({ close: vi.fn() }),
    createSyncRun: vi.fn().mockResolvedValue("sync-id-1"),
    closeSyncRun: vi.fn().mockResolvedValue(undefined),
    lastSuccessfulCount: vi.fn().mockResolvedValue(0),
    postOrders: vi.fn().mockResolvedValue({ changed: 0 }),
    postFailure: vi.fn().mockResolvedValue(undefined),
    takeScreenshot: vi.fn().mockResolvedValue("base64"),
    ...overrides,
  };
}

function fakeScraper(impl: Partial<Scraper> = {}): Scraper {
  return {
    slug: "fake",
    displayName: "Fake",
    login: vi.fn().mockResolvedValue(undefined),
    fetchOrders: vi.fn().mockResolvedValue([]),
    ...impl,
  } as Scraper;
}

describe("runSync", () => {
  it("marks run as success when scraper returns rows", async () => {
    const deps = makeDeps();
    const s = fakeScraper({ fetchOrders: vi.fn().mockResolvedValue([makeOrderSnapshot()]) });
    await runSync([s], deps);
    expect(deps.postOrders).toHaveBeenCalledOnce();
    expect(deps.closeSyncRun).toHaveBeenCalledWith(
      "sync-id-1",
      expect.objectContaining({ status: "success", ordersSeen: 1 }),
    );
  });

  it("marks run as partial when scraper returns 0 but prior > 0 (tripwire)", async () => {
    const deps = makeDeps({ lastSuccessfulCount: vi.fn().mockResolvedValue(5) });
    const s = fakeScraper({ fetchOrders: vi.fn().mockResolvedValue([]) });
    await runSync([s], deps);
    expect(deps.postOrders).not.toHaveBeenCalled();
    expect(deps.closeSyncRun).toHaveBeenCalledWith(
      "sync-id-1",
      expect.objectContaining({ status: "partial", ordersSeen: 0 }),
    );
  });

  it("marks run as success when scraper returns 0 and prior was 0", async () => {
    const deps = makeDeps({ lastSuccessfulCount: vi.fn().mockResolvedValue(0) });
    const s = fakeScraper({ fetchOrders: vi.fn().mockResolvedValue([]) });
    await runSync([s], deps);
    expect(deps.postOrders).toHaveBeenCalledOnce();
    expect(deps.closeSyncRun).toHaveBeenCalledWith(
      "sync-id-1",
      expect.objectContaining({ status: "success", ordersSeen: 0 }),
    );
  });

  it("on error, POSTs failure payload and marks run as error", async () => {
    const deps = makeDeps();
    const s = fakeScraper({
      fetchOrders: vi.fn().mockRejectedValue(new Error("login form gone")),
    });
    await runSync([s], deps);
    expect(deps.postFailure).toHaveBeenCalledOnce();
    expect(deps.closeSyncRun).toHaveBeenCalledWith(
      "sync-id-1",
      expect.objectContaining({ status: "error" }),
    );
  });

  it("processes scrapers independently — one failure does not block the next", async () => {
    let n = 0;
    const deps = makeDeps({
      createSyncRun: vi.fn().mockImplementation(async () => `run-${++n}`),
    });
    const bad = fakeScraper({
      slug: "bad",
      fetchOrders: vi.fn().mockRejectedValue(new Error("x")),
    });
    const good = fakeScraper({
      slug: "good",
      fetchOrders: vi.fn().mockResolvedValue([makeOrderSnapshot()]),
    });
    await runSync([bad, good], deps);
    expect(deps.closeSyncRun).toHaveBeenCalledTimes(2);
    expect(deps.postFailure).toHaveBeenCalledTimes(1);
    expect(deps.postOrders).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run → fail**

- [ ] **Step 3: Implement `runSync.ts`**

```ts
// apps/scraper/src/core/runSync.ts
import type { Scraper, ScraperRunContext } from "@distro/contracts";
import { isSuspiciousZero } from "./tripwire.js";

export interface SyncRunCloseArgs {
  status: "success" | "partial" | "error";
  ordersSeen: number;
  ordersChanged: number;
  errorMessage: string | null;
}

export interface RunSyncDeps {
  openContext: (slug: string) => Promise<ScraperRunContext & { close: () => Promise<void> }>;
  createSyncRun: (slug: string) => Promise<string>;
  closeSyncRun: (syncRunId: string, args: SyncRunCloseArgs) => Promise<void>;
  lastSuccessfulCount: (slug: string) => Promise<number | null>;
  postOrders: (args: {
    distroSlug: string;
    syncRunId: string;
    rows: import("@distro/contracts").OrderSnapshot[];
  }) => Promise<{ changed: number }>;
  postFailure: (args: {
    distroSlug: string;
    syncRunId: string;
    error: string;
    screenshotBase64: string | null;
  }) => Promise<void>;
  takeScreenshot: (
    ctx: ScraperRunContext & { close: () => Promise<void> },
  ) => Promise<string | null>;
}

export async function runSync(scrapers: Scraper[], deps: RunSyncDeps): Promise<void> {
  for (const scraper of scrapers) {
    const syncRunId = await deps.createSyncRun(scraper.slug);
    let ctx: (ScraperRunContext & { close: () => Promise<void> }) | undefined;
    try {
      ctx = await deps.openContext(scraper.slug);
      await scraper.login(ctx);
      const rows = await scraper.fetchOrders(ctx);

      const prior = await deps.lastSuccessfulCount(scraper.slug);
      if (isSuspiciousZero(rows.length, prior)) {
        await deps.closeSyncRun(syncRunId, {
          status: "partial",
          ordersSeen: 0,
          ordersChanged: 0,
          errorMessage: `zero orders returned (prior successful run had ${prior})`,
        });
        continue;
      }

      const result = await deps.postOrders({
        distroSlug: scraper.slug,
        syncRunId,
        rows,
      });
      await deps.closeSyncRun(syncRunId, {
        status: "success",
        ordersSeen: rows.length,
        ordersChanged: result.changed,
        errorMessage: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      let screenshot: string | null = null;
      if (ctx) {
        try { screenshot = await deps.takeScreenshot(ctx); } catch { /* ignore */ }
      }
      await deps.postFailure({
        distroSlug: scraper.slug,
        syncRunId,
        error: message,
        screenshotBase64: screenshot,
      });
      await deps.closeSyncRun(syncRunId, {
        status: "error",
        ordersSeen: 0,
        ordersChanged: 0,
        errorMessage: message,
      });
    } finally {
      if (ctx) {
        try { await ctx.close(); } catch { /* ignore */ }
      }
    }
  }
}
```

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter @distro/scraper test`
Expected: all 5 runSync tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/scraper/src/core/runSync.ts apps/scraper/tests/runSync.test.ts
git commit -m "feat(scraper): orchestrator with tripwire and per-scraper isolation"
```

---

### Task 4.8 — Wire up real deps (Supabase + screenshot)

**Files:**
- Create: `apps/scraper/src/core/deps.ts`

- [ ] **Step 1: Implement real `RunSyncDeps` factory**

```ts
// apps/scraper/src/core/deps.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import type { BrowserContext } from "playwright";
import { openContext as openCtx } from "./browserContext.js";
import { postOrders, postFailure } from "./ingestClient.js";
import type { Config } from "../config.js";
import type { RunSyncDeps } from "./runSync.js";

// We need a Supabase client to write sync_runs from the local side, since the
// orchestrator owns the sync_run lifecycle (create at start, close at end).
// The ingest function ALSO updates sync_runs (orders_seen/changed on success,
// status=error on failure). They write to non-overlapping fields except status,
// which the ingest function overrides at the end of its run.

export interface BuildDepsArgs {
  config: Config;
  supabaseUrl: string;
  supabaseServiceRole: string;
  headed?: boolean;
}

export function buildDeps(args: BuildDepsArgs): RunSyncDeps {
  const supa = createClient(args.supabaseUrl, args.supabaseServiceRole, {
    auth: { persistSession: false },
  });

  return {
    openContext: async (slug) => {
      const ctx = await openCtx({ slug, headed: args.headed });
      return Object.assign(ctx as unknown as Record<string, unknown>, {
        close: () => ctx.close(),
      }) as any;
    },

    createSyncRun: async (slug) => {
      const { data: d } = await supa.from("distros").select("id").eq("slug", slug).single();
      if (!d) throw new Error(`distro not seeded: ${slug}`);
      const { data: run, error } = await supa.from("sync_runs").insert({
        distro_id: d.id, status: "running",
      }).select("id").single();
      if (error || !run) throw new Error(`create sync_run failed: ${error?.message}`);
      return run.id;
    },

    closeSyncRun: async (syncRunId, args) => {
      await supa.from("sync_runs").update({
        status: args.status,
        orders_seen: args.ordersSeen,
        orders_changed: args.ordersChanged,
        error_message: args.errorMessage,
        finished_at: new Date().toISOString(),
      }).eq("id", syncRunId);
    },

    lastSuccessfulCount: async (slug) => {
      const { data: d } = await supa.from("distros").select("id").eq("slug", slug).single();
      if (!d) return null;
      const { data: run } = await supa.from("sync_runs").select("orders_seen")
        .eq("distro_id", d.id).eq("status", "success")
        .order("finished_at", { ascending: false }).limit(1).maybeSingle();
      return run?.orders_seen ?? null;
    },

    postOrders: async (a) => postOrders({
      url: args.config.ingestUrl,
      token: args.config.scraperToken,
      distroSlug: a.distroSlug,
      syncRunId: a.syncRunId,
      rows: a.rows,
    }),

    postFailure: async (a) => postFailure({
      url: args.config.ingestUrl,
      token: args.config.scraperToken,
      distroSlug: a.distroSlug,
      syncRunId: a.syncRunId,
      error: a.error,
      screenshotBase64: a.screenshotBase64,
    }),

    takeScreenshot: async (ctx) => {
      // ctx is a Playwright BrowserContext at runtime
      try {
        const pages = (ctx as unknown as BrowserContext).pages();
        const page = pages[0];
        if (!page) return null;
        const buf = await page.screenshot({ type: "png" });
        return buf.toString("base64");
      } catch {
        return null;
      }
    },
  };
}

// Local helper: read service role key + URL from a .env.local file in the scraper.
// Kept here to avoid pulling in dotenv.
export function readScraperEnv(path = "apps/scraper/.env.local"): {
  supabaseUrl: string;
  supabaseServiceRole: string;
} {
  const raw = readFileSync(path, "utf8");
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]!] = m[2]!.replace(/^"(.*)"$/, "$1");
  }
  return {
    supabaseUrl: env.SUPABASE_URL ?? "",
    supabaseServiceRole: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  };
}
```

- [ ] **Step 2: Add `@supabase/supabase-js` to scraper deps**

```bash
pnpm --filter @distro/scraper add @supabase/supabase-js
```

- [ ] **Step 3: Commit**

```bash
git add apps/scraper/src/core/deps.ts apps/scraper/package.json pnpm-lock.yaml
git commit -m "feat(scraper): real RunSyncDeps factory wired to Supabase"
```

---

### Task 4.9 — CLI entrypoint + fake scraper end-to-end check

**Files:**
- Modify: `apps/scraper/src/cli.ts`
- Create: `apps/scraper/src/scrapers/index.ts` (registry)
- Create: `apps/scraper/src/scrapers/fake/index.ts` (temporary, removed in Phase 5)

- [ ] **Step 1: Create temporary fake scraper**

```ts
// apps/scraper/src/scrapers/fake/index.ts
import type { Scraper } from "@distro/contracts";

// TEMP: removed after GTS scraper lands in Phase 5.
export const fakeScraper: Scraper = {
  slug: "gts",                // pretend to be GTS so distro FK resolves
  displayName: "Fake (dev)",
  async login() { /* noop */ },
  async fetchOrders() {
    return [
      {
        distroOrderId: "FAKE-PO-1",
        placedAt: "2026-05-13",
        status: "open" as const,
        totals: { subtotalCents: 12000, taxCents: 0, shippingCents: 500, totalCents: 12500 },
        items: [{
          sku: "FAKE-1", productName: "Fake Booster Box", qty: 6,
          unitCostCents: 2000, releaseDate: "2026-06-15",
        }],
        payments: [{
          kind: "deposit" as const, expectedDate: "2026-05-20",
          expectedCents: 5000, actualDate: null, actualCents: null,
        }],
        shipments: [],
        rawPayload: { source: "fake-scraper" },
      },
    ];
  },
};
```

- [ ] **Step 2: Create scrapers registry**

```ts
// apps/scraper/src/scrapers/index.ts
import type { Scraper } from "@distro/contracts";
import { fakeScraper } from "./fake/index.js";

export const scrapers: Scraper[] = [fakeScraper];
```

- [ ] **Step 3: Replace `src/cli.ts`**

```ts
// apps/scraper/src/cli.ts
import { loadConfig } from "./config.js";
import { buildDeps, readScraperEnv } from "./core/deps.js";
import { runSync } from "./core/runSync.js";
import { scrapers } from "./scrapers/index.js";

function parseArgs(): { command: string; only?: string; headed: boolean; dryRun: boolean } {
  const [, , command = "", ...rest] = process.argv;
  let only: string | undefined;
  let headed = false;
  let dryRun = false;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--only") only = rest[++i];
    else if (rest[i] === "--headed") headed = true;
    else if (rest[i] === "--dry-run") dryRun = true;
  }
  return { command, only, headed, dryRun };
}

async function main() {
  const args = parseArgs();
  const config = loadConfig();
  const env = readScraperEnv();

  if (args.command !== "sync") {
    console.error(`unknown command: ${args.command}`);
    process.exit(2);
  }

  const selected = args.only ? scrapers.filter((s) => s.slug === args.only) : scrapers;
  if (selected.length === 0) {
    console.error(`no scrapers matched --only=${args.only}`);
    process.exit(2);
  }

  if (args.dryRun) {
    console.log("DRY RUN — would sync:", selected.map((s) => s.slug).join(", "));
    return;
  }

  const deps = buildDeps({
    config, supabaseUrl: env.supabaseUrl,
    supabaseServiceRole: env.supabaseServiceRole, headed: args.headed,
  });

  await runSync(selected, deps);
  console.log("sync complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Create `apps/scraper/.env.local`** (gitignored)

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<service role key from `supabase status`>
```

Also create `apps/scraper/config.local.json` from `.example`, fill `ingestUrl` and `scraperToken=dev-token`.

- [ ] **Step 5: End-to-end smoke test**

Ensure `supabase start` and `pnpm functions:serve` are running. Then:

```bash
pnpm sync
```

Expected: console prints "sync complete". In Studio:

```sql
select id, distro_order_id, status from orders where distro_order_id = 'FAKE-PO-1';
select status, orders_seen, orders_changed from sync_runs order by started_at desc limit 1;
```

Expect order present, sync_run with status='success', orders_seen=1, orders_changed=1.

Cleanup:
```sql
delete from orders where distro_order_id = 'FAKE-PO-1';
delete from sync_runs where status = 'success';
```

- [ ] **Step 6: Commit and push**

```bash
git add apps/scraper/src/cli.ts apps/scraper/src/scrapers
git commit -m "feat(scraper): CLI entrypoint with fake scraper for E2E verification"
git push origin main
```

**Milestone reached:** scraper core is end-to-end functional with a fake module. Phase 5 swaps fake → GTS.

---

## Phase 5 — Real GTS Scraper

**Goal:** Replace the fake scraper with a real GTS implementation: `gtsFetch` does Playwright I/O against gtsdistribution.com; `gtsParse` is pure and fully unit-tested against captured HTML fixtures.

> **Note:** This phase is partly *exploratory* — selectors and HTML structure are unknown until you log in and look. Each task explains what to do; the actual selectors and parse logic are filled in during execution.

### Task 5.1 — `scraper:capture` command

**Files:**
- Create: `apps/scraper/src/capture.ts`
- Modify: `apps/scraper/src/cli.ts` (add capture command)

- [ ] **Step 1: Implement capture**

```ts
// apps/scraper/src/capture.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { openContext } from "./core/browserContext.js";

export interface CaptureArgs {
  slug: string;
  loginUrl: string;
  urls: string[];        // pages to capture (e.g., order list, one order detail)
  outDir: string;        // e.g., apps/scraper/test-fixtures/gts/<timestamp>
}

export async function capture(args: CaptureArgs): Promise<void> {
  mkdirSync(args.outDir, { recursive: true });
  const ctx = await openContext({ slug: args.slug, headed: true });
  const page = await ctx.newPage();

  // First page: login (user solves interactively in headed mode if needed)
  await page.goto(args.loginUrl);
  console.log("Log in manually in the opened browser, then press Enter here.");
  await new Promise<void>((resolve) => process.stdin.once("data", () => resolve()));

  for (const url of args.urls) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const html = await page.content();
    const slug = url.replace(/[^a-z0-9]/gi, "_").slice(0, 60);
    writeFileSync(`${args.outDir}/${slug}.html`, html, "utf8");
    console.log(`captured ${url}`);
  }

  await ctx.close();
}
```

- [ ] **Step 2: Wire into CLI**

Add to `src/cli.ts` after the existing `if (args.command !== "sync")` branch — restructure as a switch:

```ts
switch (args.command) {
  case "sync": {
    // existing sync logic (move into a function syncCommand(args))
    break;
  }
  case "capture": {
    const url = process.argv.find((a) => a.startsWith("--url="));
    if (!url) {
      console.error("usage: pnpm capture --only gts --url=<page1> --url=<page2>");
      process.exit(2);
    }
    const urls = process.argv.filter((a) => a.startsWith("--url=")).map((a) => a.slice(6));
    const slug = args.only ?? "gts";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await capture({
      slug,
      loginUrl: "https://www.gtsdistribution.com/login",
      urls,
      outDir: `apps/scraper/test-fixtures/${slug}/${stamp}`,
    });
    break;
  }
  default:
    console.error(`unknown command: ${args.command}`);
    process.exit(2);
}
```

- [ ] **Step 3: Verify capture works**

Run: `pnpm capture --only gts --url=https://www.gtsdistribution.com/account/orders`

Expected: opens browser, you log in manually, presses Enter on console, HTML written to `apps/scraper/test-fixtures/gts/<timestamp>/_account_orders.html`.

- [ ] **Step 4: Commit**

```bash
git add apps/scraper/src/capture.ts apps/scraper/src/cli.ts
git commit -m "feat(scraper): capture command for fixture collection"
```

---

### Task 5.2 — Capture initial fixtures

> **Manual phase — no code commits beyond fixture files.**

- [ ] **Step 1: Log in to GTS manually in a real browser** (not via scraper). Note the URLs of: order list page, an individual order detail page (one with multiple line items if possible), an invoice page if separate.

- [ ] **Step 2: Capture each**

```bash
pnpm capture --only gts \
  --url=<order-list-url> \
  --url=<order-detail-url> \
  --url=<invoice-url-if-any>
```

- [ ] **Step 3: Redact**

Open each captured HTML in an editor. Replace:
- Real PO numbers with `PO-FIX-1`, `PO-FIX-2`
- Personal address / phone with placeholders
- Auth tokens or session IDs found in inline JS

Keep product names, prices, dates — those are the parser targets.

- [ ] **Step 4: Move fixtures to a stable name**

Move from `test-fixtures/gts/<timestamp>/` to `test-fixtures/gts/order_list.html`, `test-fixtures/gts/order_detail_multi_item.html`, etc. Delete timestamped dir.

- [ ] **Step 5: Commit fixtures**

```bash
git add apps/scraper/test-fixtures/gts/*.html
git commit -m "test(scraper): add redacted GTS HTML fixtures"
```

---

### Task 5.3 — Write `gtsParse` tests against fixtures

**Files:**
- Create: `apps/scraper/src/scrapers/gts/gtsParse.ts` (empty exports for now)
- Create: `apps/scraper/tests/gts/gtsParse.test.ts`

- [ ] **Step 1: Stub `gtsParse.ts`**

```ts
// apps/scraper/src/scrapers/gts/gtsParse.ts
import type { OrderSnapshot } from "@distro/contracts";

export interface ParsedOrderListEntry {
  distroOrderId: string;
  detailUrl: string;
}

export function parseOrderList(_html: string): ParsedOrderListEntry[] {
  throw new Error("not implemented");
}

export function parseOrderDetail(_html: string): OrderSnapshot {
  throw new Error("not implemented");
}
```

- [ ] **Step 2: Write fixture-driven tests**

```ts
// apps/scraper/tests/gts/gtsParse.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseOrderList, parseOrderDetail } from
  "../../src/scrapers/gts/gtsParse.js";

const FIX = "apps/scraper/test-fixtures/gts";
const orderList = readFileSync(`${FIX}/order_list.html`, "utf8");
const orderDetail = readFileSync(`${FIX}/order_detail_multi_item.html`, "utf8");

describe("parseOrderList", () => {
  it("extracts PO numbers", () => {
    const rows = parseOrderList(orderList);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.distroOrderId).toMatch(/^PO-/);
      expect(row.detailUrl).toContain("/");
    }
  });
});

describe("parseOrderDetail", () => {
  const snap = () => parseOrderDetail(orderDetail);

  it("extracts a valid status", () => {
    expect([
      "open", "invoiced", "partial_shipped", "shipped", "delivered", "cancelled",
    ]).toContain(snap().status);
  });

  it("extracts at least one line item with positive qty and price", () => {
    const items = snap().items;
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].qty).toBeGreaterThan(0);
    expect(items[0].unitCostCents).toBeGreaterThan(0);
  });

  it("totals sum >= subtotal", () => {
    const t = snap().totals;
    expect(t.totalCents).toBeGreaterThanOrEqual(t.subtotalCents);
  });

  it("placedAt is a valid YYYY-MM-DD", () => {
    expect(snap().placedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // Add fixture-specific assertions after capture, e.g.:
  // it("knows PO-FIX-1 has 3 items totaling $245.50", () => {
  //   expect(snap().items.length).toBe(3);
  //   expect(snap().totals.totalCents).toBe(24550);
  // });
});
```

- [ ] **Step 3: Run → fail**

Expected: throws "not implemented" — captured failure of behavior, not contract.

- [ ] **Step 4: Commit failing tests**

```bash
git add apps/scraper/src/scrapers/gts/gtsParse.ts apps/scraper/tests/gts/gtsParse.test.ts
git commit -m "test(scraper/gts): fixture-driven gtsParse tests (failing)"
```

---

### Task 5.4 — Implement `gtsParse`

> **Exploratory task** — actual implementation depends on GTS HTML structure. Use a library like `cheerio` (jQuery-like server-side DOM) or `node-html-parser`.

**Files:**
- Modify: `apps/scraper/src/scrapers/gts/gtsParse.ts`
- Add dep: `cheerio`

- [ ] **Step 1: Add cheerio**

```bash
pnpm --filter @distro/scraper add cheerio
```

- [ ] **Step 2: Implement `parseOrderList`**

Open `order_list.html` in an editor. Identify the repeated row container (table row, list item, etc.). Write:

```ts
import * as cheerio from "cheerio";
// ...
export function parseOrderList(html: string): ParsedOrderListEntry[] {
  const $ = cheerio.load(html);
  const rows: ParsedOrderListEntry[] = [];
  // Replace selector after inspecting the captured HTML:
  $("tr.order-row").each((_, el) => {
    const $el = $(el);
    const distroOrderId = $el.find(".order-number").text().trim();
    const detailUrl = $el.find("a.order-link").attr("href") ?? "";
    if (distroOrderId && detailUrl) rows.push({ distroOrderId, detailUrl });
  });
  return rows;
}
```

> Adjust selectors based on real HTML. Iterate until the list-test passes.

- [ ] **Step 3: Implement `parseOrderDetail`**

Identify in the captured HTML: order header (status, placed date, totals), line items table, payment schedule section if any, shipment/tracking section if any. Write the parser:

```ts
export function parseOrderDetail(html: string): OrderSnapshot {
  const $ = cheerio.load(html);

  const distroOrderId = $(".order-header .po-number").text().trim();
  const placedAt = formatDate($(".order-header .placed-date").text().trim());
  const status = inferStatus($(".order-header .status").text().trim());

  // ... totals, items, payments, shipments parsing ...

  return {
    distroOrderId,
    placedAt,
    status,
    totals,
    items,
    payments,
    shipments,
    rawPayload: { html_length: html.length },
  };
}

function formatDate(input: string): string {
  // Convert "Apr 12, 2026" or "04/12/2026" → "2026-04-12"
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) throw new Error(`bad date: ${input}`);
  return d.toISOString().slice(0, 10);
}

function inferStatus(text: string): OrderStatus {
  const t = text.toLowerCase();
  if (t.includes("cancel")) return "cancelled";
  if (t.includes("deliver")) return "delivered";
  if (t.includes("partial")) return "partial_shipped";
  if (t.includes("ship")) return "shipped";
  if (t.includes("invoic")) return "invoiced";
  return "open";
}
```

> Add helper functions inline as needed. Money parsing must handle `$1,234.50` → `123450` cents (strip `$,`, multiply by 100, round to integer).

- [ ] **Step 4: Iterate until tests pass**

Run: `pnpm --filter @distro/scraper test tests/gts/gtsParse.test.ts`

Loop: adjust selectors → run → fix → run. Add fixture-specific assertions (commented placeholder in §5.3) once you know real PO numbers and totals.

- [ ] **Step 5: Commit**

```bash
git add apps/scraper/src/scrapers/gts/gtsParse.ts apps/scraper/tests/gts/gtsParse.test.ts pnpm-lock.yaml apps/scraper/package.json
git commit -m "feat(scraper/gts): parse order list and order detail from fixtures"
```

---

### Task 5.5 — Implement `gtsFetch` (Playwright I/O)

**Files:**
- Create: `apps/scraper/src/scrapers/gts/gtsFetch.ts`

> No automated tests — exercised manually via `pnpm sync --headed --only gts --dry-run`.

- [ ] **Step 1: Implement**

```ts
// apps/scraper/src/scrapers/gts/gtsFetch.ts
import type { BrowserContext, Page } from "playwright";
import { parseOrderList, parseOrderDetail } from "./gtsParse.js";
import type { OrderSnapshot } from "@distro/contracts";

export interface GtsCreds { username: string; password: string }

export class MfaRequiredError extends Error {
  constructor() { super("GTS requires MFA — solve interactively with --headed"); }
}

const LOGIN_URL = "https://www.gtsdistribution.com/login";
const ORDERS_URL = "https://www.gtsdistribution.com/account/orders";

async function isLoggedIn(page: Page): Promise<boolean> {
  await page.goto(ORDERS_URL, { waitUntil: "domcontentloaded" });
  return !page.url().includes("/login");
}

export async function loginIfNeeded(ctx: BrowserContext, creds: GtsCreds): Promise<void> {
  const page = await ctx.newPage();
  try {
    if (await isLoggedIn(page)) return;

    await page.goto(LOGIN_URL);
    // Selectors below MUST be adjusted to match real GTS form.
    await page.fill('input[name="email"]', creds.username);
    await page.fill('input[name="password"]', creds.password);
    await page.click('button[type="submit"]');

    await page.waitForLoadState("networkidle");

    if (page.url().includes("/mfa") || page.url().includes("/two-factor")) {
      throw new MfaRequiredError();
    }
    if (page.url().includes("/login")) {
      throw new Error("login failed — still on login page (bad creds?)");
    }
  } finally {
    await page.close();
  }
}

export async function fetchOrders(ctx: BrowserContext): Promise<OrderSnapshot[]> {
  const page = await ctx.newPage();
  try {
    await page.goto(ORDERS_URL, { waitUntil: "networkidle" });
    const listHtml = await page.content();
    const entries = parseOrderList(listHtml);

    const snapshots: OrderSnapshot[] = [];
    for (const entry of entries) {
      const url = new URL(entry.detailUrl, ORDERS_URL).toString();
      await page.goto(url, { waitUntil: "networkidle" });
      const html = await page.content();
      snapshots.push(parseOrderDetail(html));
    }
    return snapshots;
  } finally {
    await page.close();
  }
}
```

- [ ] **Step 2: Create scraper module index**

```ts
// apps/scraper/src/scrapers/gts/index.ts
import type { Scraper } from "@distro/contracts";
import type { BrowserContext } from "playwright";
import { loginIfNeeded, fetchOrders, type GtsCreds } from "./gtsFetch.js";

export function makeGtsScraper(creds: GtsCreds): Scraper {
  return {
    slug: "gts",
    displayName: "GTS Distribution",
    async login(ctx) {
      await loginIfNeeded(ctx as unknown as BrowserContext, creds);
    },
    async fetchOrders(ctx) {
      return await fetchOrders(ctx as unknown as BrowserContext);
    },
  };
}
```

- [ ] **Step 3: Update scrapers registry**

```ts
// apps/scraper/src/scrapers/index.ts
import type { Scraper } from "@distro/contracts";
import { makeGtsScraper } from "./gts/index.js";
import { loadConfig } from "../config.js";

export function buildScrapers(): Scraper[] {
  const config = loadConfig();
  return [makeGtsScraper(config.distros.gts)];
}
```

Update `cli.ts` to use `buildScrapers()` instead of importing the static `scrapers` array.

- [ ] **Step 4: Delete the fake scraper**

```bash
rm -rf apps/scraper/src/scrapers/fake
```

- [ ] **Step 5: Commit**

```bash
git add apps/scraper/src
git commit -m "feat(scraper/gts): wire Playwright fetch + real Scraper module"
```

---

### Task 5.6 — Manual end-to-end against real GTS

- [ ] **Step 1: Fill `config.local.json` with real GTS creds**

- [ ] **Step 2: Run headed dry-run**

```bash
pnpm sync --only gts --headed --dry-run
```

> Note: `--dry-run` skips POSTing to ingest, but the current CLI also skips even fetching. **Modify** the dry-run flag semantics so it still fetches and logs, just doesn't POST. Make this part of this task.

- [ ] **Step 3: Real run against local Supabase**

Ensure `supabase start` + `pnpm functions:serve` are running. Then:

```bash
pnpm sync --only gts
```

Expected: orders land in DB. Verify with `select count(*) from orders;` in Studio.

- [ ] **Step 4: Inspect raw_payload sanity**

```sql
select distro_order_id, jsonb_typeof(raw_payload) from orders limit 5;
```

Expected: all rows have a non-null raw_payload.

- [ ] **Step 5: Commit any required adjustments + push**

```bash
git add apps/scraper
git commit -m "fix(scraper/gts): adjustments from real-portal end-to-end test"
git push origin main
```

**Milestone reached:** real GTS pre-order data is flowing into local Supabase. Phase 6+ build the web UI to read it.

---

## Phase 6 — Web App Foundation

**Goal:** Next.js 16 App Router project at `apps/web` deploys to Vercel behind Vercel Authentication; renders an empty layout with sidebar nav and the stale-sync pill; revalidation webhook is wired and tested.

### Task 6.1 — Bootstrap Next.js 16

**Files:**
- Create: `apps/web/` (via `create-next-app`)

- [ ] **Step 1: Run create-next-app inside `apps/`**

```bash
cd apps
pnpm create next-app@latest web --typescript --app --tailwind --eslint --src-dir=false --import-alias='@/*' --no-turbopack
cd ..
```

> Verify the Next.js version is 16.x. Cache Components / `'use cache'` directive require Next 16. If create-next-app pins to an older minor, run `pnpm --filter web add next@latest react@latest react-dom@latest`.

- [ ] **Step 2: Update `apps/web/package.json` name + scripts**

```json
{
  "name": "@distro/web",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "next lint"
  }
}
```

- [ ] **Step 3: Extend root `tsconfig.json` from base**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Configure Next.js cache components**

Edit `apps/web/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Required for "use cache" directive + cacheTag in Next 16.
    // Verify exact flag name in official docs at implementation time.
    useCache: true,
    cacheComponents: true,
  },
};

export default nextConfig;
```

- [ ] **Step 5: Run dev server smoke test**

```bash
pnpm --filter @distro/web dev
```

Expected: `http://localhost:3000` shows default Next.js page.

- [ ] **Step 6: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): bootstrap Next.js 16 app router project"
```

---

### Task 6.2 — Install shadcn/ui and base components

**Files:**
- Create: `apps/web/components/ui/*` (via shadcn CLI)

- [ ] **Step 1: Init shadcn**

```bash
cd apps/web
pnpm dlx shadcn@latest init -d
cd ../..
```

Defaults: New York style, Slate base color, CSS variables yes.

- [ ] **Step 2: Install base components**

```bash
cd apps/web
pnpm dlx shadcn@latest add button card badge table sheet tooltip skeleton separator chart
cd ../..
```

- [ ] **Step 3: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): add shadcn/ui base components"
```

---

### Task 6.3 — Server-only Supabase client (`lib/db.ts`)

**Files:**
- Create: `apps/web/lib/db.ts`

- [ ] **Step 1: Install supabase-js**

```bash
pnpm --filter @distro/web add @supabase/supabase-js
```

- [ ] **Step 2: Create `apps/web/lib/db.ts`**

```ts
// apps/web/lib/db.ts
// server-only
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (server env).",
    );
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}
```

> The `server-only` import causes a build error if any client component (a file with `"use client"`) imports this module — defense in depth on top of the ESLint rule.

- [ ] **Step 3: Install server-only**

```bash
pnpm --filter @distro/web add server-only
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/db.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): server-only Supabase client"
```

---

### Task 6.4 — Layout + sidebar nav

**Files:**
- Modify: `apps/web/app/layout.tsx`
- Create: `apps/web/components/sidebar.tsx`
- Modify: `apps/web/app/page.tsx` (will be replaced again in Phase 7)

- [ ] **Step 1: Create sidebar**

```tsx
// apps/web/components/sidebar.tsx
import Link from "next/link";

const links = [
  { href: "/", label: "Overview" },
  { href: "/cashflow", label: "Cash Flow" },
  { href: "/orders", label: "Orders" },
  { href: "/releases", label: "Releases" },
  { href: "/sync", label: "Sync" },
];

export function Sidebar() {
  return (
    <nav className="flex h-screen w-56 flex-col gap-1 border-r bg-muted/30 p-4">
      <div className="mb-6 px-2 text-lg font-semibold">DistroDashboard</div>
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="rounded-md px-3 py-2 text-sm hover:bg-accent"
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: Replace `apps/web/app/layout.tsx`**

```tsx
// apps/web/app/layout.tsx
import type { Metadata } from "next";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "DistroDashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="flex min-h-screen bg-background text-foreground">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Replace `apps/web/app/page.tsx`**

```tsx
// apps/web/app/page.tsx
export default function Page() {
  return <h1 className="text-2xl font-bold">Overview</h1>;
}
```

- [ ] **Step 4: Verify dev server renders**

```bash
pnpm --filter @distro/web dev
```

Visit `http://localhost:3000` — expect sidebar + "Overview" heading.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app apps/web/components/sidebar.tsx
git commit -m "feat(web): layout with sidebar nav"
```

---

### Task 6.5 — Revalidation route handler

**Files:**
- Create: `apps/web/app/api/revalidate/route.ts`
- Create: `apps/web/tests/api/revalidate.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// apps/web/tests/api/revalidate.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockRevalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag: mockRevalidateTag }));

beforeEach(() => {
  mockRevalidateTag.mockReset();
  process.env.REVALIDATE_TOKEN = "secret";
});
afterEach(() => { delete process.env.REVALIDATE_TOKEN; });

describe("POST /api/revalidate", () => {
  it("rejects missing token", async () => {
    const { POST } = await import("../../app/api/revalidate/route.js");
    const res = await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ tags: ["orders"] }),
    }));
    expect(res.status).toBe(401);
  });

  it("rejects wrong token", async () => {
    const { POST } = await import("../../app/api/revalidate/route.js");
    const res = await POST(new Request("http://x", {
      method: "POST",
      headers: { "x-revalidate-token": "wrong" },
      body: JSON.stringify({ tags: ["orders"] }),
    }));
    expect(res.status).toBe(401);
  });

  it("calls revalidateTag for each tag", async () => {
    const { POST } = await import("../../app/api/revalidate/route.js");
    const res = await POST(new Request("http://x", {
      method: "POST",
      headers: { "x-revalidate-token": "secret" },
      body: JSON.stringify({ tags: ["orders", "payments"] }),
    }));
    expect(res.status).toBe(200);
    expect(mockRevalidateTag).toHaveBeenCalledWith("orders");
    expect(mockRevalidateTag).toHaveBeenCalledWith("payments");
  });
});
```

- [ ] **Step 2: Add vitest config for web**

Create `apps/web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

Install: `pnpm --filter @distro/web add -D vitest`

- [ ] **Step 3: Run → fail**

Expected: route file doesn't exist.

- [ ] **Step 4: Implement route**

```ts
// apps/web/app/api/revalidate/route.ts
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

const KNOWN_TAGS = new Set(["orders", "payments", "releases", "syncRuns"]);

export async function POST(req: Request): Promise<Response> {
  const expected = process.env.REVALIDATE_TOKEN;
  if (!expected || req.headers.get("x-revalidate-token") !== expected) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  let body: { tags?: string[] };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }
  const tags = (body.tags ?? []).filter((t) => KNOWN_TAGS.has(t));
  for (const tag of tags) revalidateTag(tag);
  return NextResponse.json({ ok: true, revalidated: tags });
}
```

- [ ] **Step 5: Run → pass**

```bash
pnpm --filter @distro/web test
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/revalidate apps/web/tests apps/web/vitest.config.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): revalidation route handler with tests"
```

---

### Task 6.6 — Stale-sync pill (server component)

**Files:**
- Create: `apps/web/lib/queries/syncRuns.ts`
- Create: `apps/web/components/stale-sync-pill.tsx`
- Modify: `apps/web/components/sidebar.tsx`

- [ ] **Step 1: Create query helper**

```ts
// apps/web/lib/queries/syncRuns.ts
import "server-only";
import { unstable_cacheTag as cacheTag } from "next/cache";
import { db } from "../db.js";

export interface LatestSyncInfo {
  status: "success" | "partial" | "error" | "running" | null;
  finishedAt: string | null;
  hoursSince: number | null;
}

export async function getLatestSync(): Promise<LatestSyncInfo> {
  "use cache";
  cacheTag("syncRuns");

  const { data } = await db()
    .from("sync_runs")
    .select("status, finished_at")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { status: null, finishedAt: null, hoursSince: null };

  const finishedAt = data.finished_at ?? null;
  const hoursSince = finishedAt
    ? (Date.now() - new Date(finishedAt).getTime()) / 36e5
    : null;

  return {
    status: data.status as LatestSyncInfo["status"],
    finishedAt,
    hoursSince,
  };
}
```

> Verify the exact `cacheTag` import path against Next.js 16 docs at implementation time — it may be `next/cache` or `unstable_cacheTag` depending on the release.

- [ ] **Step 2: Create pill component**

```tsx
// apps/web/components/stale-sync-pill.tsx
import { getLatestSync } from "@/lib/queries/syncRuns";

const STALE_HOURS = 36;

export async function StaleSyncPill() {
  const info = await getLatestSync();
  const isStale =
    info.status === "error" ||
    (info.hoursSince !== null && info.hoursSince > STALE_HOURS);

  const label =
    info.finishedAt === null
      ? "No syncs yet"
      : `Last sync: ${formatAgo(info.hoursSince!)}`;

  return (
    <div
      className={`mt-auto rounded-md px-3 py-2 text-xs ${
        isStale ? "bg-red-500/15 text-red-400" : "bg-emerald-500/10 text-emerald-400"
      }`}
    >
      {label}
    </div>
  );
}

function formatAgo(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 36) return `${Math.round(hours)}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
```

- [ ] **Step 3: Render in sidebar**

```tsx
// apps/web/components/sidebar.tsx
import Link from "next/link";
import { StaleSyncPill } from "./stale-sync-pill";

const links = [
  { href: "/", label: "Overview" },
  { href: "/cashflow", label: "Cash Flow" },
  { href: "/orders", label: "Orders" },
  { href: "/releases", label: "Releases" },
  { href: "/sync", label: "Sync" },
];

export function Sidebar() {
  return (
    <nav className="flex h-screen w-56 flex-col gap-1 border-r bg-muted/30 p-4">
      <div className="mb-6 px-2 text-lg font-semibold">DistroDashboard</div>
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="rounded-md px-3 py-2 text-sm hover:bg-accent"
        >
          {l.label}
        </Link>
      ))}
      <StaleSyncPill />
    </nav>
  );
}
```

- [ ] **Step 4: Local env**

Create `apps/web/.env.local`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<from supabase status>
REVALIDATE_TOKEN=dev-revalidate-token
```

- [ ] **Step 5: Verify in dev**

```bash
pnpm --filter @distro/web dev
```

Visit homepage. With sync data from Phase 5, expect a green "Last sync: Xh ago" pill at the bottom of the sidebar.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib apps/web/components apps/web/.env.local.example
git commit -m "feat(web): stale-sync pill in sidebar"
```

> Add `apps/web/.env.local.example` with the variable names + blank values; gitignore `.env.local`.

---

### Task 6.7 — Vercel project + auth

> Manual steps in Vercel dashboard, captured as a runbook entry.

- [ ] **Step 1: Create Vercel project**

```bash
cd apps/web
pnpm dlx vercel link
cd ../..
```

Configure to point at `apps/web` as the root directory in the Vercel project settings.

- [ ] **Step 2: Set production env vars in Vercel dashboard**

| Variable | Source | Scope |
|---|---|---|
| `SUPABASE_URL` | Supabase production project | Production |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase production project | Production (encrypted) |
| `REVALIDATE_TOKEN` | Generate `openssl rand -hex 32` | Production (encrypted) |

- [ ] **Step 3: Enable Vercel Authentication**

Vercel Dashboard → Settings → Deployment Protection → enable "Vercel Authentication" for Production. Confirm only your team can access.

- [ ] **Step 4: Generate Protection Bypass for Automation token**

Settings → Deployment Protection → Protection Bypass for Automation → Generate. Store as `VERCEL_BYPASS_TOKEN` in **Supabase function env** (production):

```bash
supabase secrets set VERCEL_BYPASS_TOKEN=<token>
supabase secrets set REVALIDATE_URL=https://<prod-domain>/api/revalidate
supabase secrets set REVALIDATE_TOKEN=<same as Vercel env>
```

- [ ] **Step 5: First deploy**

```bash
cd apps/web
pnpm dlx vercel --prod
cd ../..
```

Expected: deploy succeeds, URL prints. Visit URL — should hit Vercel Authentication wall, login, then see the dashboard sidebar.

- [ ] **Step 6: Test revalidation E2E from prod**

After a successful manual `pnpm sync` (which now talks to prod Supabase if env is pointed there), check that pages updated. Or invoke ingest directly via curl to prod Edge Function with a valid syncRunId.

- [ ] **Step 7: Commit Vercel config**

```bash
git add apps/web/.vercel/project.json apps/web/.env.local.example
git commit -m "chore(web): vercel project linked"
git push origin main
```

> `.vercel/project.json` is safe to commit (no secrets). `.vercel/.env*` is gitignored.

**Milestone reached:** empty dashboard is live behind Vercel Auth; revalidation pipeline works end-to-end.

---

## Phase 7 — Dashboard Pages

**Goal:** All five pages render real data from Supabase. Cash Flow is the flagship — built first after Overview.

> Pattern: each page has (a) one or more query helpers in `lib/queries/`, (b) UI rule helpers in `lib/rules/` (when applicable), (c) a server-component page, (d) unit tests on the pure rule helpers.

### Task 7.1 — UI rule helpers: variance, staleness, bucket

**Files:**
- Create: `apps/web/lib/rules/variance.ts`
- Create: `apps/web/lib/rules/staleness.ts`
- Create: `apps/web/lib/rules/bucket.ts`
- Create: `apps/web/tests/rules/variance.test.ts`
- Create: `apps/web/tests/rules/staleness.test.ts`
- Create: `apps/web/tests/rules/bucket.test.ts`

- [ ] **Step 1: Write all three failing tests**

```ts
// apps/web/tests/rules/variance.test.ts
import { describe, expect, it } from "vitest";
import { isVarianceFlagged, varianceCents } from "@/lib/rules/variance";

describe("variance", () => {
  it("isVarianceFlagged true when abs diff > $25 in cents", () => {
    expect(isVarianceFlagged({ expectedCents: 10000, actualCents: 13000 })).toBe(true);
  });
  it("isVarianceFlagged true when diff > 2% even if under $25", () => {
    expect(isVarianceFlagged({ expectedCents: 500, actualCents: 520 })).toBe(true);
  });
  it("isVarianceFlagged false when within both thresholds", () => {
    expect(isVarianceFlagged({ expectedCents: 10000, actualCents: 10100 })).toBe(false);
  });
  it("isVarianceFlagged false when actual is null", () => {
    expect(isVarianceFlagged({ expectedCents: 1000, actualCents: null })).toBe(false);
  });
  it("varianceCents returns difference", () => {
    expect(varianceCents({ expectedCents: 1000, actualCents: 1100 })).toBe(100);
    expect(varianceCents({ expectedCents: 1000, actualCents: null })).toBe(null);
  });
});
```

```ts
// apps/web/tests/rules/staleness.test.ts
import { describe, expect, it } from "vitest";
import { isStale } from "@/lib/rules/staleness";

describe("staleness", () => {
  it("not stale when last success < 36h ago", () => {
    expect(isStale({ status: "success", hoursSince: 12 })).toBe(false);
  });
  it("stale when last success >= 36h ago", () => {
    expect(isStale({ status: "success", hoursSince: 40 })).toBe(true);
  });
  it("stale regardless of age when last status is error", () => {
    expect(isStale({ status: "error", hoursSince: 1 })).toBe(true);
  });
  it("stale when no syncs yet (null status)", () => {
    expect(isStale({ status: null, hoursSince: null })).toBe(true);
  });
});
```

```ts
// apps/web/tests/rules/bucket.test.ts
import { describe, expect, it } from "vitest";
import { weekKey } from "@/lib/rules/bucket";

describe("weekKey (America/New_York, Sun→Sat)", () => {
  it("Sunday 2026-05-10 → 2026-05-10", () => {
    expect(weekKey("2026-05-10")).toBe("2026-05-10");
  });
  it("Wed 2026-05-13 → 2026-05-10", () => {
    expect(weekKey("2026-05-13")).toBe("2026-05-10");
  });
  it("Sat 2026-05-16 → 2026-05-10", () => {
    expect(weekKey("2026-05-16")).toBe("2026-05-10");
  });
  it("Sun 2026-05-17 → 2026-05-17 (next week)", () => {
    expect(weekKey("2026-05-17")).toBe("2026-05-17");
  });
});
```

- [ ] **Step 2: Run → fail**

- [ ] **Step 3: Implement**

```ts
// apps/web/lib/rules/variance.ts
export interface VarianceInput {
  expectedCents: number;
  actualCents: number | null;
}

export function varianceCents(v: VarianceInput): number | null {
  if (v.actualCents === null) return null;
  return v.actualCents - v.expectedCents;
}

export function isVarianceFlagged(v: VarianceInput): boolean {
  if (v.actualCents === null) return false;
  const diff = Math.abs(v.actualCents - v.expectedCents);
  if (diff > 2500) return true; // $25
  if (v.expectedCents === 0) return false;
  return diff / Math.abs(v.expectedCents) > 0.02; // 2%
}
```

```ts
// apps/web/lib/rules/staleness.ts
export interface StalenessInput {
  status: "success" | "partial" | "error" | "running" | null;
  hoursSince: number | null;
}

const STALE_HOURS = 36;

export function isStale(s: StalenessInput): boolean {
  if (s.status === null || s.hoursSince === null) return true;
  if (s.status === "error") return true;
  return s.hoursSince > STALE_HOURS;
}
```

```ts
// apps/web/lib/rules/bucket.ts
// Pure date math — interprets the input YYYY-MM-DD as America/New_York and
// returns the Sunday of that week, also YYYY-MM-DD.
//
// Implementation note: for dates within the America/New_York zone, we treat
// the date as 12:00 PM local to avoid DST boundary surprises, then walk back
// to the most recent Sunday.

export function weekKey(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`expected YYYY-MM-DD, got ${date}`);
  }
  // Parse as a local-noon date, then derive day-of-week in America/New_York.
  const local = new Date(`${date}T12:00:00-04:00`); // EDT; safe for noon
  // Use UTC day-of-week since the offset already places it in NY-noon.
  const dow = local.getUTCDay(); // 0 = Sun
  const sunday = new Date(local);
  sunday.setUTCDate(local.getUTCDate() - dow);
  return sunday.toISOString().slice(0, 10);
}
```

> The TZ math above is intentionally simple. For January (EST, -05:00) the noon-EDT offset still lands inside the same UTC day, so the day-of-week derivation is stable. If a test fixture breaks this, switch to `Intl.DateTimeFormat` with `timeZone: "America/New_York"`.

- [ ] **Step 4: Run → pass**

```bash
pnpm --filter @distro/web test
```

Expected: all rule tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/rules apps/web/tests/rules
git commit -m "feat(web): variance, staleness, bucket rule helpers with tests"
```

---

### Task 7.2 — Query helpers (`lib/queries`)

**Files:**
- Create: `apps/web/lib/queries/orders.ts`
- Create: `apps/web/lib/queries/payments.ts`
- Create: `apps/web/lib/queries/releases.ts`

> No unit tests for these — they're thin Supabase wrappers. Integration testing happens manually via the pages.

- [ ] **Step 1: Create `orders.ts`**

```ts
// apps/web/lib/queries/orders.ts
import "server-only";
import { unstable_cacheTag as cacheTag } from "next/cache";
import { db } from "../db.js";

export interface OrderRow {
  id: string;
  distroSlug: string;
  distroOrderId: string;
  placedAt: string | null;
  status: string;
  totalCents: number | null;
  expectedRelease: string | null;
  lastSeenAt: string;
}

export async function getOpenOrderCount(): Promise<number> {
  "use cache";
  cacheTag("orders");
  const { count } = await db().from("orders").select("id", { count: "exact", head: true })
    .not("status", "in", "(delivered,cancelled)");
  return count ?? 0;
}

export async function getInTransitCount(): Promise<number> {
  "use cache";
  cacheTag("orders");
  const { count } = await db().from("orders").select("id", { count: "exact", head: true })
    .in("status", ["partial_shipped", "shipped"]);
  return count ?? 0;
}

export interface OrdersFilters {
  status?: string[];
  distroSlug?: string[];
  q?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export async function listOrders(f: OrdersFilters = {}): Promise<OrderRow[]> {
  "use cache";
  cacheTag("orders");
  let q = db().from("orders").select(
    "id, distros(slug), distro_order_id, placed_at, status, total_cents, expected_release, last_seen_at",
  );
  if (f.status?.length) q = q.in("status", f.status);
  if (f.distroSlug?.length) {
    // Join filter — assumes a Postgres view or direct join. For Supabase JS we
    // filter by distro_id resolved via slug in a separate query if needed.
    // Simplification for v1: filter slug client-side after fetch (small dataset).
  }
  if (f.q) q = q.ilike("distro_order_id", `%${f.q}%`);
  if (f.fromDate) q = q.gte("placed_at", f.fromDate);
  if (f.toDate) q = q.lte("placed_at", f.toDate);
  q = q.order("placed_at", { ascending: false });
  q = q.range(f.offset ?? 0, (f.offset ?? 0) + (f.limit ?? 100) - 1);

  const { data } = await q;
  const rows = (data ?? []).map((r: any) => ({
    id: r.id,
    distroSlug: r.distros?.slug ?? "?",
    distroOrderId: r.distro_order_id,
    placedAt: r.placed_at,
    status: r.status,
    totalCents: r.total_cents,
    expectedRelease: r.expected_release,
    lastSeenAt: r.last_seen_at,
  })) as OrderRow[];

  return f.distroSlug?.length
    ? rows.filter((r) => f.distroSlug!.includes(r.distroSlug))
    : rows;
}
```

- [ ] **Step 2: Create `payments.ts`**

```ts
// apps/web/lib/queries/payments.ts
import "server-only";
import { unstable_cacheTag as cacheTag } from "next/cache";
import { db } from "../db.js";

export interface PaymentRow {
  id: string;
  orderId: string;
  distroSlug: string;
  distroOrderId: string;
  kind: "deposit" | "balance" | "full" | "adjustment";
  expectedDate: string | null;
  expectedCents: number | null;
  actualDate: string | null;
  actualCents: number | null;
}

const SELECT = `
  id, kind, expected_date, expected_cents, actual_date, actual_cents,
  orders ( id, distro_order_id, distros ( slug ) )
`;

function shape(r: any): PaymentRow {
  return {
    id: r.id,
    orderId: r.orders?.id ?? "",
    distroSlug: r.orders?.distros?.slug ?? "?",
    distroOrderId: r.orders?.distro_order_id ?? "?",
    kind: r.kind,
    expectedDate: r.expected_date,
    expectedCents: r.expected_cents,
    actualDate: r.actual_date,
    actualCents: r.actual_cents,
  };
}

export async function getUpcomingPayments(limit = 100): Promise<PaymentRow[]> {
  "use cache";
  cacheTag("payments");
  const { data } = await db().from("order_payments").select(SELECT)
    .is("actual_date", null)
    .order("expected_date", { ascending: true })
    .limit(limit);
  return (data ?? []).map(shape);
}

export async function getRecentlyChargedPayments(days = 30): Promise<PaymentRow[]> {
  "use cache";
  cacheTag("payments");
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const { data } = await db().from("order_payments").select(SELECT)
    .not("actual_date", "is", null)
    .gte("actual_date", since)
    .order("actual_date", { ascending: false });
  return (data ?? []).map(shape);
}

export async function getDueThisWeekCents(): Promise<number> {
  "use cache";
  cacheTag("payments");
  const today = new Date();
  // Compute end-of-week (Saturday) in America/New_York roughly.
  const day = today.getUTCDay();
  const daysUntilSat = 6 - day;
  const sat = new Date(today);
  sat.setUTCDate(today.getUTCDate() + daysUntilSat);
  const end = sat.toISOString().slice(0, 10);
  const start = today.toISOString().slice(0, 10);

  const { data } = await db().from("order_payments").select("expected_cents")
    .is("actual_date", null)
    .gte("expected_date", start)
    .lte("expected_date", end);
  return (data ?? []).reduce((sum: number, r: any) => sum + (r.expected_cents ?? 0), 0);
}

export async function getDueNext30dCents(): Promise<number> {
  "use cache";
  cacheTag("payments");
  const start = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const { data } = await db().from("order_payments").select("expected_cents")
    .is("actual_date", null)
    .gte("expected_date", start)
    .lte("expected_date", end);
  return (data ?? []).reduce((sum: number, r: any) => sum + (r.expected_cents ?? 0), 0);
}
```

- [ ] **Step 3: Create `releases.ts`**

```ts
// apps/web/lib/queries/releases.ts
import "server-only";
import { unstable_cacheTag as cacheTag } from "next/cache";
import { db } from "../db.js";

export interface ReleaseRow {
  releaseDate: string | null;     // null bucketed as "TBD"
  productName: string;
  qty: number;
  totalCents: number;
  distros: string[];
}

export async function getReleasesGrouped(): Promise<ReleaseRow[]> {
  "use cache";
  cacheTag("releases");
  // Pull all items with their parent order's distro slug, aggregate in JS.
  const { data } = await db().from("order_items").select(`
    release_date, product_name, qty, line_total_cents,
    orders ( distros ( slug ) )
  `);
  const map = new Map<string, ReleaseRow>();
  for (const r of data ?? []) {
    const key = `${r.release_date ?? "TBD"}::${r.product_name}`;
    const existing = map.get(key);
    const slug = (r as any).orders?.distros?.slug ?? "?";
    if (existing) {
      existing.qty += r.qty;
      existing.totalCents += r.line_total_cents;
      if (!existing.distros.includes(slug)) existing.distros.push(slug);
    } else {
      map.set(key, {
        releaseDate: r.release_date,
        productName: r.product_name,
        qty: r.qty,
        totalCents: r.line_total_cents,
        distros: [slug],
      });
    }
  }
  return [...map.values()].sort((a, b) => {
    if (a.releaseDate === null) return -1;
    if (b.releaseDate === null) return 1;
    return a.releaseDate.localeCompare(b.releaseDate);
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/queries
git commit -m "feat(web): query helpers for orders, payments, releases"
```

---

### Task 7.3 — Overview page

**Files:**
- Modify: `apps/web/app/page.tsx`
- Create: `apps/web/components/kpi-card.tsx`
- Create: `apps/web/components/first-run-panel.tsx`

- [ ] **Step 1: Create `kpi-card.tsx`**

```tsx
// apps/web/components/kpi-card.tsx
import { Card } from "@/components/ui/card";

export interface KpiCardProps {
  label: string;
  value: string;
  asOf?: string | null;       // human-readable "as of" string
  stale?: boolean;
}

export function KpiCard({ label, value, asOf, stale }: KpiCardProps) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl">{value}</div>
      {asOf && (
        <div className={`mt-2 text-xs ${stale ? "text-red-400" : "text-muted-foreground"}`}>
          as of {asOf}
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Create `first-run-panel.tsx`**

```tsx
// apps/web/components/first-run-panel.tsx
import { Card } from "@/components/ui/card";

export function FirstRunPanel() {
  return (
    <Card className="p-8">
      <h2 className="text-xl font-semibold">Get started</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        No sync data yet. Run the scraper to populate the dashboard.
      </p>
      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
        <li>Clone the repo onto your laptop</li>
        <li>Fill <code className="rounded bg-muted px-1">apps/scraper/config.local.json</code> with your GTS credentials</li>
        <li>Run <code className="rounded bg-muted px-1">pnpm sync</code></li>
      </ol>
    </Card>
  );
}
```

- [ ] **Step 3: Replace `app/page.tsx`**

```tsx
// apps/web/app/page.tsx
import { KpiCard } from "@/components/kpi-card";
import { FirstRunPanel } from "@/components/first-run-panel";
import { getLatestSync } from "@/lib/queries/syncRuns";
import { getOpenOrderCount, getInTransitCount } from "@/lib/queries/orders";
import {
  getDueThisWeekCents, getDueNext30dCents, getUpcomingPayments,
} from "@/lib/queries/payments";
import { getReleasesGrouped } from "@/lib/queries/releases";
import { isStale } from "@/lib/rules/staleness";

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatAgo(hours: number | null): string {
  if (hours === null) return "never";
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 36) return `${Math.round(hours)}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function OverviewPage() {
  const sync = await getLatestSync();
  if (sync.status === null) {
    return (
      <div className="max-w-2xl">
        <FirstRunPanel />
      </div>
    );
  }

  const stale = isStale({ status: sync.status, hoursSince: sync.hoursSince });
  const asOf = formatAgo(sync.hoursSince);

  const [openCount, dueWk, due30, transit, upcoming, releases] = await Promise.all([
    getOpenOrderCount(),
    getDueThisWeekCents(),
    getDueNext30dCents(),
    getInTransitCount(),
    getUpcomingPayments(5),
    getReleasesGrouped(),
  ]);

  const upcomingReleases = releases
    .filter((r) => r.releaseDate !== null)
    .filter((r) => {
      const inFortnight = new Date(r.releaseDate!).getTime() - Date.now();
      return inFortnight > 0 && inFortnight < 14 * 86400_000;
    })
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Overview</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <KpiCard label="Open Orders" value={String(openCount)} asOf={asOf} stale={stale} />
        <KpiCard label="Due This Week" value={dollars(dueWk)} asOf={asOf} stale={stale} />
        <KpiCard label="Due Next 30d" value={dollars(due30)} asOf={asOf} stale={stale} />
        <KpiCard label="In Transit" value={String(transit)} asOf={asOf} stale={stale} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title="Next 5 Charges">
          <ul className="space-y-2 text-sm">
            {upcoming.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span>{p.expectedDate ?? "TBD"} · {p.distroSlug.toUpperCase()} · {p.distroOrderId} · {p.kind}</span>
                <span className="font-mono">{dollars(p.expectedCents ?? 0)}</span>
              </li>
            ))}
            {upcoming.length === 0 && <li className="text-muted-foreground">None.</li>}
          </ul>
        </Panel>
        <Panel title="Releasing Next 14 Days">
          <ul className="space-y-2 text-sm">
            {upcomingReleases.map((r) => (
              <li key={`${r.releaseDate}-${r.productName}`} className="flex justify-between">
                <span>{r.releaseDate} · {r.productName}</span>
                <span className="font-mono">{r.qty}× · {dollars(r.totalCents)}</span>
              </li>
            ))}
            {upcomingReleases.length === 0 && <li className="text-muted-foreground">None.</li>}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Verify in dev**

```bash
pnpm --filter @distro/web dev
```

Expected: Overview page renders KPIs, Next Charges, Releasing. If no data: First Run panel.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/page.tsx apps/web/components
git commit -m "feat(web): overview page with KPIs and panels"
```

---

### Task 7.4 — Cash Flow page (flagship)

**Files:**
- Create: `apps/web/app/cashflow/page.tsx`
- Create: `apps/web/components/variance-cell.tsx`

> Bar chart: shadcn chart wraps Recharts. For v1, render the table sections fully and use a minimal stacked-bar chart. The chart is the dessert; the tables are the meal.

- [ ] **Step 1: Create `variance-cell.tsx`**

```tsx
// apps/web/components/variance-cell.tsx
import { varianceCents, isVarianceFlagged } from "@/lib/rules/variance";

export function VarianceCell({
  expectedCents, actualCents,
}: { expectedCents: number; actualCents: number | null }) {
  const v = varianceCents({ expectedCents, actualCents });
  if (v === null) return <span className="text-muted-foreground">—</span>;
  const flagged = isVarianceFlagged({ expectedCents, actualCents });
  const sign = v >= 0 ? "+" : "−";
  const abs = Math.abs(v) / 100;
  return (
    <span className={`font-mono ${flagged ? "text-red-400" : ""}`}>
      {sign}${abs.toLocaleString("en-US", { minimumFractionDigits: 2 })}
    </span>
  );
}
```

- [ ] **Step 2: Create the page**

```tsx
// apps/web/app/cashflow/page.tsx
import {
  getUpcomingPayments, getRecentlyChargedPayments,
} from "@/lib/queries/payments";
import { VarianceCell } from "@/components/variance-cell";
import { weekKey } from "@/lib/rules/bucket";

function dollars(cents: number | null): string {
  if (cents === null) return "—";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export default async function CashFlowPage() {
  const [upcoming, recent] = await Promise.all([
    getUpcomingPayments(200),
    getRecentlyChargedPayments(30),
  ]);

  const buckets = new Map<string, { actual: number; expected: number }>();
  for (const p of upcoming) {
    if (!p.expectedDate || p.expectedCents === null) continue;
    const k = weekKey(p.expectedDate);
    const b = buckets.get(k) ?? { actual: 0, expected: 0 };
    b.expected += p.expectedCents;
    buckets.set(k, b);
  }
  for (const p of recent) {
    if (!p.actualDate || p.actualCents === null) continue;
    const k = weekKey(p.actualDate);
    const b = buckets.get(k) ?? { actual: 0, expected: 0 };
    b.actual += p.actualCents;
    buckets.set(k, b);
  }
  const series = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, vals]) => ({ week, ...vals }));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Cash Flow</h1>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          By Week
        </h2>
        <div className="space-y-1">
          {series.map((b) => {
            const total = b.actual + b.expected;
            return (
              <div key={b.week} className="flex items-center gap-3">
                <div className="w-28 font-mono text-xs">{b.week}</div>
                <div className="relative flex h-6 flex-1 overflow-hidden rounded bg-muted">
                  <div
                    className="bg-emerald-500"
                    style={{ width: `${(b.actual / Math.max(1, total)) * 100}%` }}
                  />
                  <div
                    className="bg-emerald-500/30"
                    style={{ width: `${(b.expected / Math.max(1, total)) * 100}%` }}
                  />
                </div>
                <div className="w-28 text-right font-mono text-xs">{dollars(total)}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Upcoming Payments
        </h2>
        <Table headers={["Date", "Distro", "Order", "Kind", "Amount"]}>
          {upcoming.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="py-2 pr-4 font-mono text-xs">{p.expectedDate ?? "TBD"}</td>
              <td className="py-2 pr-4">{p.distroSlug.toUpperCase()}</td>
              <td className="py-2 pr-4">{p.distroOrderId}</td>
              <td className="py-2 pr-4 capitalize">{p.kind}</td>
              <td className="py-2 pr-4 text-right font-mono">{dollars(p.expectedCents)}</td>
            </tr>
          ))}
        </Table>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Recently Charged (last 30 days)
        </h2>
        <Table headers={["Date", "Distro", "Order", "Kind", "Expected", "Actual", "Variance"]}>
          {recent.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="py-2 pr-4 font-mono text-xs">{p.actualDate}</td>
              <td className="py-2 pr-4">{p.distroSlug.toUpperCase()}</td>
              <td className="py-2 pr-4">{p.distroOrderId}</td>
              <td className="py-2 pr-4 capitalize">{p.kind}</td>
              <td className="py-2 pr-4 text-right font-mono">{dollars(p.expectedCents)}</td>
              <td className="py-2 pr-4 text-right font-mono">{dollars(p.actualCents)}</td>
              <td className="py-2 pr-4 text-right">
                <VarianceCell
                  expectedCents={p.expectedCents ?? 0}
                  actualCents={p.actualCents}
                />
              </td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th
              key={h}
              className={`pb-2 pr-4 text-left text-xs font-normal uppercase tracking-wide text-muted-foreground ${
                i >= headers.length - 1 ? "text-right" : ""
              }`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/cashflow apps/web/components/variance-cell.tsx
git commit -m "feat(web): cash flow flagship page with weekly buckets + variance"
```

---

### Task 7.5 — Orders page + drawer

**Files:**
- Create: `apps/web/app/orders/page.tsx`
- Create: `apps/web/components/status-chip.tsx`
- Create: `apps/web/components/order-drawer.tsx`

- [ ] **Step 1: Create `status-chip.tsx`**

```tsx
// apps/web/components/status-chip.tsx
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const BUCKET = {
  open: { label: "Open", cls: "bg-slate-500/20 text-slate-300" },
  invoiced: { label: "In Progress", cls: "bg-amber-500/20 text-amber-300" },
  partial_shipped: { label: "In Progress", cls: "bg-amber-500/20 text-amber-300" },
  shipped: { label: "Done", cls: "bg-emerald-500/20 text-emerald-300" },
  delivered: { label: "Done", cls: "bg-emerald-500/20 text-emerald-300" },
  cancelled: { label: "Cancelled", cls: "bg-zinc-500/20 text-zinc-400" },
} as const;

export function StatusChip({ status }: { status: string }) {
  const b = (BUCKET as Record<string, { label: string; cls: string }>)[status] ?? {
    label: status, cls: "bg-muted text-muted-foreground",
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`rounded px-2 py-0.5 text-xs ${b.cls}`}>{b.label}</span>
      </TooltipTrigger>
      <TooltipContent>{status}</TooltipContent>
    </Tooltip>
  );
}
```

- [ ] **Step 2: Create `order-drawer.tsx`** (client component)

```tsx
// apps/web/components/order-drawer.tsx
"use client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useRouter, useSearchParams } from "next/navigation";

export interface OrderDrawerData {
  id: string;
  distroOrderId: string;
  status: string;
  totalCents: number | null;
  items: Array<{ productName: string; qty: number; unitCostCents: number; releaseDate: string | null }>;
  payments: Array<{ kind: string; expectedDate: string | null; expectedCents: number | null; actualDate: string | null; actualCents: number | null }>;
  shipments: Array<{ shippedAt: string | null; tracking: string | null; carrier: string | null }>;
  rawPayload: unknown;
}

export function OrderDrawer({ data, open }: { data: OrderDrawerData | null; open: boolean }) {
  const router = useRouter();
  const params = useSearchParams();

  function close() {
    const p = new URLSearchParams(params);
    p.delete("order");
    router.push(`?${p.toString()}`);
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && close()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {data && (
          <>
            <SheetHeader>
              <SheetTitle>{data.distroOrderId}</SheetTitle>
            </SheetHeader>
            <section className="mt-4 space-y-1 text-sm">
              <div>Status: {data.status}</div>
              <div>Total: ${((data.totalCents ?? 0) / 100).toFixed(2)}</div>
            </section>
            <section className="mt-6">
              <h3 className="mb-2 text-xs uppercase text-muted-foreground">Items</h3>
              <ul className="space-y-1 text-sm">
                {data.items.map((it, i) => (
                  <li key={i}>
                    {it.qty}× {it.productName} — ${(it.unitCostCents / 100).toFixed(2)}{" "}
                    {it.releaseDate && <span className="text-xs text-muted-foreground">(releases {it.releaseDate})</span>}
                  </li>
                ))}
              </ul>
            </section>
            <section className="mt-6">
              <h3 className="mb-2 text-xs uppercase text-muted-foreground">Payments</h3>
              <ul className="space-y-1 text-sm">
                {data.payments.map((p, i) => (
                  <li key={i}>
                    {p.kind} — expected {p.expectedDate ?? "?"} ${((p.expectedCents ?? 0) / 100).toFixed(2)}
                    {p.actualDate && ` · charged ${p.actualDate} $${((p.actualCents ?? 0) / 100).toFixed(2)}`}
                  </li>
                ))}
              </ul>
            </section>
            <section className="mt-6">
              <h3 className="mb-2 text-xs uppercase text-muted-foreground">Shipments</h3>
              <ul className="space-y-1 text-sm">
                {data.shipments.map((s, i) => (
                  <li key={i}>
                    {s.shippedAt ?? "?"} · {s.carrier ?? "?"} · {s.tracking ?? "—"}
                  </li>
                ))}
                {data.shipments.length === 0 && <li className="text-muted-foreground">None.</li>}
              </ul>
            </section>
            <details className="mt-6">
              <summary className="cursor-pointer text-xs text-muted-foreground">Raw payload</summary>
              <pre className="mt-2 max-h-80 overflow-auto rounded bg-muted p-2 text-xs">
                {JSON.stringify(data.rawPayload, null, 2)}
              </pre>
            </details>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: Create order detail loader + page**

```tsx
// apps/web/app/orders/page.tsx
import "server-only";
import { unstable_cacheTag as cacheTag } from "next/cache";
import { listOrders } from "@/lib/queries/orders";
import { db } from "@/lib/db";
import { StatusChip } from "@/components/status-chip";
import { OrderDrawer, type OrderDrawerData } from "@/components/order-drawer";

async function getOrderDetail(id: string): Promise<OrderDrawerData | null> {
  "use cache";
  cacheTag("orders");
  const { data: order } = await db().from("orders").select(`
    id, distro_order_id, status, total_cents, raw_payload,
    order_items ( product_name, qty, unit_cost_cents, release_date ),
    order_payments ( kind, expected_date, expected_cents, actual_date, actual_cents ),
    shipments ( shipped_at, tracking, carrier )
  `).eq("id", id).maybeSingle();
  if (!order) return null;
  return {
    id: order.id,
    distroOrderId: order.distro_order_id,
    status: order.status,
    totalCents: order.total_cents,
    items: ((order.order_items as any[]) ?? []).map((i) => ({
      productName: i.product_name, qty: i.qty, unitCostCents: i.unit_cost_cents,
      releaseDate: i.release_date,
    })),
    payments: ((order.order_payments as any[]) ?? []).map((p) => ({
      kind: p.kind, expectedDate: p.expected_date, expectedCents: p.expected_cents,
      actualDate: p.actual_date, actualCents: p.actual_cents,
    })),
    shipments: ((order.shipments as any[]) ?? []).map((s) => ({
      shippedAt: s.shipped_at, tracking: s.tracking, carrier: s.carrier,
    })),
    rawPayload: order.raw_payload,
  };
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const status = params.status?.split(",");
  const distroSlug = params.distro?.split(",");
  const q = params.q;
  const drawerOrderId = params.order;

  const [rows, drawerData] = await Promise.all([
    listOrders({ status, distroSlug, q }),
    drawerOrderId ? getOrderDetail(drawerOrderId) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Orders</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="pb-2 pr-4">Distro</th>
            <th className="pb-2 pr-4">PO#</th>
            <th className="pb-2 pr-4">Placed</th>
            <th className="pb-2 pr-4">Status</th>
            <th className="pb-2 pr-4 text-right">Total</th>
            <th className="pb-2 pr-4">Last Update</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="py-2 pr-4">{r.distroSlug.toUpperCase()}</td>
              <td className="py-2 pr-4">
                <a className="hover:underline" href={`?order=${r.id}`}>{r.distroOrderId}</a>
              </td>
              <td className="py-2 pr-4 font-mono text-xs">{r.placedAt ?? "—"}</td>
              <td className="py-2 pr-4"><StatusChip status={r.status} /></td>
              <td className="py-2 pr-4 text-right font-mono">
                {r.totalCents !== null ? `$${(r.totalCents / 100).toFixed(2)}` : "—"}
              </td>
              <td className="py-2 pr-4 font-mono text-xs">
                {new Date(r.lastSeenAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <OrderDrawer data={drawerData} open={!!drawerData} />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/orders apps/web/components/status-chip.tsx apps/web/components/order-drawer.tsx
git commit -m "feat(web): orders page with side drawer detail"
```

---

### Task 7.6 — Releases page

**Files:**
- Create: `apps/web/app/releases/page.tsx`

- [ ] **Step 1: Create page**

```tsx
// apps/web/app/releases/page.tsx
import { getReleasesGrouped } from "@/lib/queries/releases";

export default async function ReleasesPage() {
  const rows = await getReleasesGrouped();
  const tbd = rows.filter((r) => r.releaseDate === null);
  const dated = rows.filter((r) => r.releaseDate !== null);
  const groups = new Map<string, typeof rows>();
  for (const r of dated) {
    const wk = new Date(r.releaseDate!);
    wk.setUTCDate(wk.getUTCDate() - wk.getUTCDay());
    const key = wk.toISOString().slice(0, 10);
    const existing = groups.get(key) ?? [];
    existing.push(r);
    groups.set(key, existing);
  }
  const sortedGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Releases</h1>
      {tbd.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm uppercase text-muted-foreground">TBD Release</h2>
          <ReleaseList rows={tbd} />
        </section>
      )}
      {sortedGroups.map(([week, rows]) => (
        <section key={week}>
          <h2 className="mb-3 text-sm uppercase text-muted-foreground">
            Week of {week}
          </h2>
          <ReleaseList rows={rows} />
        </section>
      ))}
    </div>
  );
}

function ReleaseList({ rows }: { rows: Array<{ releaseDate: string | null; productName: string; qty: number; totalCents: number; distros: string[] }> }) {
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((r) => (
        <li
          key={`${r.releaseDate ?? "tbd"}-${r.productName}`}
          className="flex items-center justify-between rounded border bg-card px-3 py-2"
        >
          <div>
            <div className="font-medium">{r.productName}</div>
            <div className="text-xs text-muted-foreground">
              {r.releaseDate ?? "TBD"} · {r.distros.join(", ").toUpperCase()}
            </div>
          </div>
          <div className="text-right font-mono text-xs">
            <div>{r.qty}× units</div>
            <div className="text-muted-foreground">${(r.totalCents / 100).toFixed(2)}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/releases
git commit -m "feat(web): releases timeline grouped by week"
```

---

### Task 7.7 — Sync page

**Files:**
- Create: `apps/web/app/sync/page.tsx`
- Modify: `apps/web/lib/queries/syncRuns.ts` (add `listSyncRuns`)

- [ ] **Step 1: Add `listSyncRuns` to `syncRuns.ts`**

```ts
// append to apps/web/lib/queries/syncRuns.ts
export interface SyncRunRow {
  id: string;
  distroSlug: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "success" | "partial" | "error";
  ordersSeen: number;
  ordersChanged: number;
  errorMessage: string | null;
  screenshotUrl: string | null;
}

export async function listSyncRuns(limit = 50, offset = 0): Promise<SyncRunRow[]> {
  "use cache";
  cacheTag("syncRuns");
  const { data } = await db().from("sync_runs").select(`
    id, started_at, finished_at, status, orders_seen, orders_changed,
    error_message, screenshot_url, distros ( slug )
  `).order("started_at", { ascending: false })
    .range(offset, offset + limit - 1);
  return ((data as any[]) ?? []).map((r) => ({
    id: r.id,
    distroSlug: r.distros?.slug ?? "?",
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    status: r.status,
    ordersSeen: r.orders_seen,
    ordersChanged: r.orders_changed,
    errorMessage: r.error_message,
    screenshotUrl: r.screenshot_url,
  }));
}

export interface DistroFreshnessRow {
  distroSlug: string;
  lastSuccessAt: string | null;
  latestStatus: "running" | "success" | "partial" | "error" | null;
}

export async function getDistroFreshness(): Promise<DistroFreshnessRow[]> {
  "use cache";
  cacheTag("syncRuns");
  const { data: distros } = await db().from("distros").select("id, slug");
  const out: DistroFreshnessRow[] = [];
  for (const d of distros ?? []) {
    const { data: latest } = await db().from("sync_runs").select("status, finished_at, started_at")
      .eq("distro_id", d.id).order("started_at", { ascending: false }).limit(1).maybeSingle();
    const { data: lastOk } = await db().from("sync_runs").select("finished_at")
      .eq("distro_id", d.id).eq("status", "success")
      .order("finished_at", { ascending: false }).limit(1).maybeSingle();
    out.push({
      distroSlug: d.slug,
      lastSuccessAt: lastOk?.finished_at ?? null,
      latestStatus: latest?.status ?? null,
    });
  }
  return out;
}
```

- [ ] **Step 2: Create page**

```tsx
// apps/web/app/sync/page.tsx
import { listSyncRuns, getDistroFreshness } from "@/lib/queries/syncRuns";

export default async function SyncPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const offset = Number(params.offset ?? 0);
  const limit = 50;

  const [runs, freshness] = await Promise.all([
    listSyncRuns(limit, offset),
    getDistroFreshness(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Sync</h1>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {freshness.map((f) => (
          <div key={f.distroSlug} className="rounded-lg border bg-card p-4">
            <div className="text-xs uppercase text-muted-foreground">{f.distroSlug}</div>
            <div className="mt-1 text-sm">
              Last success: {f.lastSuccessAt ? new Date(f.lastSuccessAt).toLocaleString() : "never"}
            </div>
            <div className="mt-1 text-sm">Latest run: {f.latestStatus ?? "—"}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm uppercase text-muted-foreground">Run the scraper</h2>
        <pre className="select-all rounded bg-muted px-3 py-2 text-sm">pnpm sync</pre>
        <p className="mt-2 text-xs text-muted-foreground">
          The scraper runs on your laptop. There's no remote-trigger button in v1.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm uppercase text-muted-foreground">Recent Sync Runs</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 pr-4">Started</th>
              <th className="pb-2 pr-4">Distro</th>
              <th className="pb-2 pr-4">Duration</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4 text-right">Seen / Changed</th>
              <th className="pb-2 pr-4">Detail</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="py-2 pr-4 font-mono text-xs">
                  {new Date(r.startedAt).toLocaleString()}
                </td>
                <td className="py-2 pr-4">{r.distroSlug.toUpperCase()}</td>
                <td className="py-2 pr-4 font-mono text-xs">
                  {r.finishedAt
                    ? `${Math.round((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000)}s`
                    : "—"}
                </td>
                <td className="py-2 pr-4">{r.status}</td>
                <td className="py-2 pr-4 text-right font-mono text-xs">
                  {r.ordersSeen} / {r.ordersChanged}
                </td>
                <td className="py-2 pr-4 text-xs">
                  {r.errorMessage && <div className="text-red-400">{r.errorMessage}</div>}
                  {r.screenshotUrl && (
                    <a className="underline" href={r.screenshotUrl} target="_blank">screenshot</a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.length === limit && (
          <a className="mt-3 inline-block text-sm underline" href={`?offset=${offset + limit}`}>
            Load more
          </a>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Commit and push**

```bash
git add apps/web/app/sync apps/web/lib/queries/syncRuns.ts
git commit -m "feat(web): sync log page with distro freshness cards"
git push origin main
```

**Milestone reached:** all five dashboard pages render real data. The product is functional.

---

## Phase 8 — CI + Operations

**Goal:** Tests run on every PR via GitHub Actions; deploys to Vercel are automatic; nightly Task Scheduler entry installed on the laptop.

### Task 8.1 — GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create workflow**

```yaml
# .github/workflows/ci.yml
name: ci
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: pnpm
      - run: pnpm install --frozen-lockfile

      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase start
      - run: supabase db reset --local
        env:
          SUPABASE_DB_PASSWORD: postgres

      - run: pnpm typecheck
      - run: pnpm test
        env:
          SUPABASE_URL: http://127.0.0.1:54321
          # service role key is deterministic for local Supabase; reads from `supabase status`
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.LOCAL_SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.placeholder' }}

      - run: pnpm --filter @distro/web build
        env:
          SUPABASE_URL: http://127.0.0.1:54321
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.LOCAL_SUPABASE_SERVICE_ROLE_KEY || 'placeholder' }}
          REVALIDATE_TOKEN: ci-token

  deploy-functions:
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase functions deploy ingest --project-ref $SUPABASE_PROJECT_REF
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_PROJECT_REF: ${{ secrets.SUPABASE_PROJECT_REF }}

  deploy-migrations:
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase db push --project-ref $SUPABASE_PROJECT_REF
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_PROJECT_REF: ${{ secrets.SUPABASE_PROJECT_REF }}
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
```

- [ ] **Step 2: Register GitHub secrets**

In repo settings → Secrets and variables → Actions, add:
- `SUPABASE_ACCESS_TOKEN` (personal access token from Supabase dashboard)
- `SUPABASE_PROJECT_REF` (the project ID, found in dashboard URL)
- `SUPABASE_DB_PASSWORD` (set during project creation)

- [ ] **Step 3: Open a test PR**

Create a trivial branch, push, open a PR. Expected: CI runs typecheck + tests + build; turns green.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow for test + deploy"
git push origin main
```

---

### Task 8.2 — Windows Task Scheduler script

**Files:**
- Create: `scripts/setup-task-scheduler.ps1`
- Create: `scripts/sync.bat`

- [ ] **Step 1: Create `scripts/sync.bat`**

```bat
@echo off
cd /d %~dp0\..
pnpm sync >> %~dp0\..\.cache\sync.log 2>&1
```

- [ ] **Step 2: Create `scripts/setup-task-scheduler.ps1`**

```powershell
# Run as Administrator from repo root:
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup-task-scheduler.ps1

$repoPath = (Resolve-Path "$PSScriptRoot\..").Path
$batPath = Join-Path $repoPath "scripts\sync.bat"

if (-not (Test-Path $batPath)) {
    Write-Error "sync.bat not found at $batPath"
    exit 1
}

# Ensure log dir exists
New-Item -ItemType Directory -Force -Path (Join-Path $repoPath ".cache") | Out-Null

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$batPath`""
$trigger = New-ScheduledTaskTrigger -Daily -At 3:00AM
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited

Register-ScheduledTask -TaskName "DistroSync" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force

Write-Host "DistroSync scheduled for 3:00 AM daily. Logs at $repoPath\.cache\sync.log"
```

- [ ] **Step 3: Install scheduled task**

Run as Administrator from the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-task-scheduler.ps1
```

Verify in Task Scheduler GUI: `DistroSync` appears, next run is 3:00 AM.

- [ ] **Step 4: Manual one-shot run**

In Task Scheduler GUI: right-click DistroSync → Run. Tail `.cache/sync.log` to confirm output.

- [ ] **Step 5: Commit**

```bash
git add scripts/setup-task-scheduler.ps1 scripts/sync.bat
git commit -m "ops: Windows Task Scheduler setup for nightly sync"
git push origin main
```

**Milestone reached:** CI green; nightly scraper installed; pushes auto-deploy migrations + functions + web.

---

## Phase 9 — README + Runbook

**Goal:** A teammate (or future-you in six months) can read the repo and successfully run, contribute, and operate the system.

### Task 9.1 — Top-level README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

```markdown
# DistroDashboard

Personal dashboard for tracking TCG pre-orders across distributors.

- Local Playwright scraper logs in to each distro and pushes normalized order data to a Supabase Edge Function
- Supabase Postgres stores orders, payments, shipments, sync history
- Next.js 16 dashboard on Vercel (behind Vercel Authentication) renders the data, with a flagship Cash Flow page

See [docs/superpowers/specs/2026-05-13-distro-dashboard-design.md](docs/superpowers/specs/2026-05-13-distro-dashboard-design.md) for the design.

## Layout

```
apps/scraper/      # local Node + Playwright CLI
apps/web/          # Next.js dashboard
packages/contracts # shared Zod schemas
supabase/          # migrations + ingest edge function
```

## First-time setup

1. Install pnpm (`npm i -g pnpm`), Node 20, Supabase CLI, Playwright deps.
2. `pnpm install`
3. `pnpm --filter @distro/scraper exec playwright install chromium`
4. Local Supabase: `pnpm db:start && pnpm db:reset`
5. Copy env templates:
   - `cp apps/scraper/config.local.json.example apps/scraper/config.local.json` and fill GTS creds + ingest URL + token
   - `cp apps/scraper/.env.local.example apps/scraper/.env.local` and fill Supabase URL + service role key
   - `cp apps/web/.env.local.example apps/web/.env.local` and fill
   - `cp supabase/.env.local.example supabase/.env.local` and fill
6. Start the edge function: `pnpm functions:serve`
7. Run a sync: `pnpm sync`
8. Start the web app: `pnpm --filter @distro/web dev`, visit http://localhost:3000

## Daily operation

- Nightly sync runs at 3:00 AM via Windows Task Scheduler. See [scripts/setup-task-scheduler.ps1](scripts/setup-task-scheduler.ps1).
- Manual sync: `pnpm sync`
- Logs: `.cache/sync.log`

## Adding a new distro

1. `mkdir apps/scraper/src/scrapers/<slug>`
2. Capture HTML fixtures: `pnpm capture --only <slug> --url=<page1> --url=<page2>`
3. Write `<slug>Parse.ts` + tests against fixtures
4. Write `<slug>Fetch.ts` (Playwright I/O, no automated tests)
5. Export `makeXxxScraper` from `<slug>/index.ts`, register in `apps/scraper/src/scrapers/index.ts`
6. Add row to `distros` table in a new migration
7. Add credentials to `config.local.json`

## Troubleshooting

- **Sync fails with login error:** run `pnpm sync --only <slug> --headed` to see what GTS is showing.
- **Dashboard stale:** check `/sync` page for the latest run. If failed, the screenshot link helps diagnose.
- **Cache won't invalidate:** verify `REVALIDATE_TOKEN` matches across Supabase function env + Vercel env, and `VERCEL_BYPASS_TOKEN` is set in Supabase.

## Tech

TypeScript · pnpm workspaces · Next.js 16 · Supabase · Playwright · Tailwind · shadcn/ui · Vitest
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and operation guide"
git push origin main
```

---

### Task 9.2 — Final verification + ship

- [ ] **Step 1: Reset the local environment to a clean slate**

```bash
pnpm db:reset
```

- [ ] **Step 2: Run a real end-to-end sync** against local Supabase with the real GTS scraper.

Expected: orders populate, no errors in console, sync_run shows status=success.

- [ ] **Step 3: Open `http://localhost:3000`**

Walk each page: Overview, Cash Flow, Orders, Releases, Sync. Verify:
- Overview shows real KPIs, stale pill is green
- Cash Flow shows weekly buckets and upcoming payments
- Orders table loads, drawer opens on row click
- Releases shows your real pre-orders grouped by week
- Sync log shows the run you just did

- [ ] **Step 4: Deploy to production** if not already

```bash
cd apps/web && pnpm dlx vercel --prod && cd ../..
```

Update the scraper's `config.local.json` `ingestUrl` to point at production:

```
https://<prod-project>.supabase.co/functions/v1/ingest
```

- [ ] **Step 5: Run one production sync from your laptop**

```bash
pnpm sync
```

Expected: production dashboard reflects the sync in seconds (revalidateTag fires after ingest).

- [ ] **Step 6: Tag v0.1.0**

```bash
git tag v0.1.0
git push origin v0.1.0
```

**Milestone reached:** v1 of DistroDashboard is shipping. Phase 1+ done.

---

## After v1 — Deferred Items

These are explicit non-goals from the spec but documented here so future-you remembers what was punted:

- Manual order entry / editing
- Notifications (email or Slack on charge events)
- CSV exports
- Dark / light mode toggle (currently dark-only)
- Real-time updates / SSE
- Settings UI (distro management is direct SQL right now)
- Dedicated `/orders/[id]` deep-linkable page (currently drawer only)
- Calendar grid view on `/releases` (currently timeline only)
- TCGCSV / TCGplayer enrichment (release dates + market prices)
- "Sync now" button that actually triggers a remote scrape
- Multi-user / RLS / `owner_id` columns
- E2E tests via Playwright
- Husky / lint-staged pre-commit hooks
- Staging environment (preview deploys go against prod Supabase)


# DistroDashboard — Design

**Status:** Draft for review
**Date:** 2026-05-13
**Repo:** `github.com/rhchen2/DistroDashboard`
**Author:** Ry Chen (with Claude)

---

## 1. Problem & Goals

A personal dashboard for tracking TCG pre-orders across multiple distributors. Distributor portals don't surface cash flow, release schedules, or status aging well. This dashboard pulls the data from each distro nightly and presents it in one place.

### Primary goals (v1)

1. See every open pre-order at a glance: distro, status, total, next charge date.
2. **Cash flow visibility** — know what's getting charged this week, this month, next quarter. (Top priority.)
3. See product release dates so receiving can be planned.
4. Surface drift: prices that change between order and charge, stuck orders, failed syncs.
5. Multi-distro framework starting with **GTS Distribution**; adding a new distro must be a new module, not a rewrite.

### Non-goals (v1)

- Manual order entry or editing (read-only on scraped data)
- Notifications (email/Slack)
- Multi-user / team access (Vercel Authentication gates the whole app to the owner)
- Product-catalog enrichment (TCGCSV/TCGplayer matching) — distro-only data for v1
- CSV exports, dark mode toggle, real-time updates

---

## 2. Architecture Overview

```
┌─────────────────────────┐        ┌──────────────────────────────┐
│  Local Scraper CLI      │        │  Cloud (Next.js on Vercel)   │
│  apps/scraper           │        │  apps/web                    │
│  Node + Playwright      │        │  Server Components + shadcn  │
│  ─────────────────────  │  HTTPS │  ┌────────────────────────┐  │
│  config.local.json      │  POST  │  │  Dashboard UI          │  │
│  (GTS creds, ingest     ├───────►│  │  / /cashflow /orders   │  │
│   token)                │        │  │  /releases /sync       │  │
│  ─────────────────────  │        │  └──────────┬─────────────┘  │
│  Windows Task Sched.    │        │             │                │
│  03:00 nightly +        │        │  Edge Function: /ingest      │
│  pnpm sync (manual)     │        │  validates + upserts         │
└─────────────────────────┘        │             │                │
                                   │             ▼                │
                                   │   ┌──────────────────────┐   │
                                   │   │ Supabase Postgres    │   │
                                   │   └──────────────────────┘   │
                                   │                              │
                                   │  ingest → POST /api/         │
                                   │  revalidate-tag → cache      │
                                   │  invalidation                │
                                   └──────────────────────────────┘
```

### Component responsibilities

| Component | Lives in | Job |
|---|---|---|
| Scraper CLI | `apps/scraper` | Log into each distro, fetch orders, POST normalized snapshots to `/ingest`. |
| Contracts | `packages/contracts` | Zod schemas (the `OrderSnapshot` shape). Imported by both scraper and ingest function. |
| Ingest Edge Function | `supabase/functions/ingest` | Auth via shared token, validate payload, upsert orders/items/payments/shipments idempotently, fire revalidation webhook. |
| Database | Supabase Postgres | Source of truth for all order data. |
| Web app | `apps/web` | Next.js App Router. Server Components read DB via service role. Vercel Authentication gates access. |

### Why this shape

- **Scraper isolation.** A flaky portal can't crash the dashboard — bad scrapes get rejected at `/ingest`.
- **One ingestion path.** All distros flow through the same upsert; dashboard never branches per-distro.
- **Local creds.** GTS password never leaves the owner's laptop.
- **Cheap.** No paid headless-browser service, no extra worker container.

### Repo layout

```
DistroDashboard/
├── apps/
│   ├── web/                          # Next.js dashboard
│   └── scraper/                      # Node + Playwright CLI
│       ├── src/
│       │   ├── core/                 # orchestrator, normalizer, ingest client
│       │   ├── scrapers/
│       │   │   ├── index.ts          # registry
│       │   │   ├── gts/
│       │   │   │   ├── gtsFetch.ts   # Playwright I/O (untestable)
│       │   │   │   └── gtsParse.ts   # HTML/JSON → rows (unit-tested)
│       │   └── cli.ts
│       ├── test-fixtures/gts/        # redacted real HTML
│       ├── config.local.json         # gitignored
│       └── config.local.json.example
├── packages/
│   └── contracts/                    # OrderSnapshot Zod + TS types
├── supabase/
│   ├── migrations/
│   └── functions/ingest/
├── docs/superpowers/specs/           # this file
└── .github/workflows/ci.yml
```

---

## 3. Data Model

Postgres schema. Seven tables. No `owner_id` columns (single user, Vercel Authentication at the edge).

**Timezone:** all `date` columns are interpreted in `America/New_York`. Weekly cash-flow buckets run Sunday→Saturday in that TZ. Server queries that bucket by week MUST do the TZ conversion explicitly (e.g. `date_trunc('week', expected_date AT TIME ZONE 'America/New_York')`).

```sql
-- One distro we pull from
distros (
  id            uuid pk default gen_random_uuid(),
  slug          text unique not null,           -- 'gts'
  display_name  text not null,                  -- 'GTS Distribution'
  portal_url    text,
  created_at    timestamptz default now()
);

-- One row per distro PO. Idempotency key: (distro_id, distro_order_id).
orders (
  id                uuid pk default gen_random_uuid(),
  distro_id         uuid not null references distros(id),
  distro_order_id   text not null,              -- distro's PO number
  placed_at         date,
  status            text not null,              -- open|invoiced|partial_shipped|shipped|delivered|cancelled
  expected_release  date,                       -- earliest release across items
  subtotal_cents    int,
  tax_cents         int,
  shipping_cents    int,
  total_cents       int,
  raw_payload       jsonb,                      -- original scraped record, for debugging
  first_seen_at     timestamptz default now(),
  last_seen_at      timestamptz default now(),
  unique (distro_id, distro_order_id)
);

-- Current line items. Replaced wholesale on each sync.
order_items (
  id                uuid pk default gen_random_uuid(),
  order_id          uuid not null references orders(id) on delete cascade,
  sku               text,
  product_name      text not null,
  qty               int not null,
  unit_cost_cents   int not null,
  line_total_cents  int not null,
  release_date      date,
  status            text                        -- pending|shipped|cancelled|substituted (per-line; nullable if distro doesn't expose)
);

-- Append-only price/qty history. Trigger writes a row when order_items UPDATE
-- changes unit_cost_cents or qty.
order_item_history (
  id              bigserial pk,
  order_item_id   uuid not null references order_items(id) on delete cascade,
  observed_at     timestamptz default now(),
  unit_cost_cents int not null,
  qty             int not null
);

-- Payment schedule. The cash-flow source of truth.
order_payments (
  id              uuid pk default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  kind            text not null,                -- deposit|balance|full|adjustment
  expected_date   date,
  expected_cents  int,
  actual_date     date,                         -- null until detected as charged
  actual_cents    int,
  source          text not null                 -- 'scraped'|'inferred'|'manual'
);

-- Shipments. Multi-box orders can have multiple rows.
shipments (
  id            uuid pk default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  shipped_at    date,
  tracking      text,
  carrier       text,
  items         jsonb                           -- [{sku, qty}] — denormalized intentionally
);

-- One row per scraper run.
sync_runs (
  id              uuid pk default gen_random_uuid(),
  distro_id       uuid not null references distros(id),
  started_at      timestamptz not null,
  finished_at     timestamptz,
  status          text not null,                -- running|success|partial|error
  orders_seen     int default 0,
  orders_changed  int default 0,
  error_message   text,
  screenshot_url  text                          -- Supabase Storage signed URL
);
```

### Key design decisions

- **`(distro_id, distro_order_id)` unique** — the idempotency key. Re-running a scrape upserts.
- **`raw_payload jsonb` on orders** — kept so fields can be re-derived later without re-scraping.
- **`order_items` replaced per sync; price history captured via trigger** to `order_item_history`. Cheap insurance against distro price changes between order and charge.
- **`order_payments` separate table** — supports deposit + balance splits, predicted vs. actual, variance reporting. Drives the entire Cash Flow page.
- **`shipments.items` as JSONB** — multi-box orders can't always be tied cleanly to `order_items` rows. Denormalize.
- **`orders.status` is a cached headline** — derivable from `shipments` + `order_payments`. The ingest function recomputes it on each sync.
- **`sync_runs.status='partial'`** — used when the scraper succeeded but saw fewer orders than expected (tripwire — see § 5.3).

### Status enum semantics

| Status | Meaning |
|---|---|
| `open` | Order placed, nothing invoiced or charged |
| `invoiced` | Distro has issued an invoice; charge expected soon |
| `partial_shipped` | At least one shipment, more items pending |
| `shipped` | All items shipped, none confirmed delivered |
| `delivered` | All shipments marked delivered |
| `cancelled` | Order or remaining items cancelled |

UI collapses these into 4 visual buckets: Open · In Progress (`invoiced`, `partial_shipped`) · Done (`shipped`, `delivered`) · Cancelled. Tooltip shows precise status.

---

## 4. Scraper Module Interface

The scraper-per-distro pattern hinges on a shared contract.

### Architectural requirement: split fetch from parse

Every scraper module MUST be two files:

- **`<distro>Fetch.ts`** — Playwright navigation, login, page retrieval. Manual verification only; no automated tests.
- **`<distro>Parse.ts`** — pure functions that turn HTML/JSON into raw rows, then into `OrderSnapshot`. Fully unit-tested against captured fixtures.

This split is non-negotiable. Without it, parser bugs are invisible until they show up in production data.

### The contract

```ts
// packages/contracts/src/scraper.ts

export interface Scraper {
  readonly slug: string;                     // 'gts'
  readonly displayName: string;              // 'GTS Distribution'

  login(ctx: BrowserContext): Promise<void>; // throws on MFA or bad creds
  fetchOrders(ctx: BrowserContext): Promise<OrderSnapshot[]>;
}

export interface OrderSnapshot {
  distroOrderId: string;                     // idempotency key within the distro
  placedAt: string;                          // YYYY-MM-DD
  status: 'open' | 'invoiced' | 'partial_shipped' | 'shipped' | 'delivered' | 'cancelled';
  totals: {
    subtotalCents: number;
    taxCents: number;
    shippingCents: number;
    totalCents: number;
  };
  items: Array<{
    sku: string | null;
    productName: string;
    qty: number;
    unitCostCents: number;
    releaseDate: string | null;              // YYYY-MM-DD
  }>;
  payments: Array<{
    kind: 'deposit' | 'balance' | 'full' | 'adjustment';
    expectedDate: string | null;
    expectedCents: number;
    actualDate: string | null;
    actualCents: number | null;
  }>;
  shipments: Array<{
    shippedAt: string;                       // YYYY-MM-DD
    tracking: string | null;
    carrier: string | null;
    items: Array<{ sku: string | null; qty: number }>;
  }>;
  rawPayload: unknown;
}
```

Zod schemas in `packages/contracts/src/zod.ts` mirror these types. Both scraper (validates before send) and ingest function (validates on receive) import them. **Single source of truth for the data contract.**

**Deno compatibility:** the ingest function runs on Supabase Edge Functions (Deno runtime). `packages/contracts` is published as ESM only, has no Node-specific imports (no `fs`, `path`, `process`), and pins a Zod version that ships an ESM build. The ingest function imports it via the workspace path during local dev and via a bundled copy at deploy time.

### Orchestrator (`apps/scraper/src/core/runSync.ts`)

```
for each registered scraper:
  syncRunId = createSyncRun(distroId, status='running')
  try:
    ctx = openBrowserContext(cookies=.cache/cookies/<slug>.json)
    if not cookiesStillValid: scraper.login(ctx)
    rows = await scraper.fetchOrders(ctx)
    validate rows against Zod schema  -- throws on schema failure

    if rows.length === 0 AND lastSuccessfulRun(distroId).orders_seen > 0:
      closeSyncRun(syncRunId, status='partial',
                   orders_seen=0, error_message='zero orders returned')
      continue   -- do NOT POST; DB rows untouched

    response = POST /ingest with X-Scraper-Token + body=rows
    closeSyncRun(syncRunId, status='success',
                 orders_seen=rows.length, orders_changed=response.changed)

  catch (err):
    screenshotB64 = takeScreenshot(ctx)
    POST /ingest with X-Scraper-Token + body={ kind: 'failure', syncRunId,
                                                error: err.message,
                                                screenshot: screenshotB64 }
    closeSyncRun(syncRunId, status='error', error_message=err.message)
  finally:
    closeBrowserContext(ctx)
```

The ingest function handles both success payloads (`{ kind: 'orders', rows: OrderSnapshot[] }`) and failure payloads (`{ kind: 'failure', syncRunId, error, screenshot }`). For failure payloads it uploads the screenshot to Supabase Storage and updates the existing `sync_runs` row with `screenshot_url`.

**No retries inside a run.** Retry on next scheduled invocation. Retrying inside Playwright produces flaky debugging hell.

### Registry

```ts
// apps/scraper/src/scrapers/index.ts
import { gtsScraper } from './gts';
export const scrapers: Scraper[] = [gtsScraper /* phdScraper, ... */];
```

Adding a new distro:
1. Create `src/scrapers/<slug>/<slug>Fetch.ts` and `<slug>Parse.ts`
2. Wire into a `Scraper` export in `src/scrapers/<slug>/index.ts`
3. Add to the registry
4. Insert row into `distros` table
5. Add credentials to `config.local.json`

No changes to ingest, schema, dashboard, or contracts unless the distro exposes a field we hadn't seen.

### CLI surface

```
pnpm sync                          # all registered scrapers
pnpm sync --only gts               # one scraper
pnpm sync --headed                 # show the browser for debugging
pnpm sync --dry-run                # scrape but don't POST
pnpm scraper:capture --only gts --order PO-44821  # save redacted HTML to test-fixtures
```

Nightly run: `schtasks /create /sc daily /st 03:00 /tn DistroSync /tr "...sync.bat"` (Windows Task Scheduler).

### Known constraint

- **GTS MFA assumption.** GTS is not expected to enable MFA. If they do, the scraper will throw and `sync_run` will be marked `error` until the user resolves it manually with `--headed`.

---

## 5. Dashboard UI

Next.js App Router, server components only, shadcn/ui + Tailwind, charts via shadcn chart components.

### 5.1 Pages

| Route | Purpose |
|---|---|
| `/` | Overview — KPI cards + Next Charges + Releasing Soon |
| `/cashflow` | Flagship — predicted vs. actual charges over time + variance |
| `/orders` | Filterable order table with side drawer detail (no dedicated detail page in v1) |
| `/releases` | Vertical timeline grouped by week |
| `/sync` | Sync log table, per-distro freshness cards |

Top sidebar nav with these 5 entries + a "Last sync: 4h ago" pill that turns red if the latest `sync_runs` row is `error` OR if more than 36h since last `success`.

### 5.2 Page details

**Overview (`/`)**
Four KPI cards: Open Orders · Due This Week · Due Next 30d · In Transit. Each card shows `as of {last_sync_time}` subtext (red if > 36h).

Two side-by-side panels: Next 5 Charges (from `order_payments` where `actual_date is null` ORDER BY `expected_date` ASC LIMIT 5) and Releasing Next 14 Days (from `order_items.release_date` BETWEEN `now()` and `now() + 14 days`).

**First-run state:** if `sync_runs` is empty, replace Overview with a Getting Started panel: "1. Clone the scraper repo, 2. Fill `config.local.json`, 3. Run `pnpm sync`."

**Cash Flow (`/cashflow`)** — the flagship.
- Default range: **Week** (Month and Quarter selectable).
- Stacked bar chart, $ charged per period: dark = actual, light = expected.
- Upcoming Payments table: `actual_date is null`, sorted by `expected_date`.
- Recently Charged table (last 30 days): `actual_date is not null`, with a Variance column = `actual_cents - expected_cents`.
- **Variance flag rule:** red text if `abs(actual_cents - expected_cents) > 2500` (i.e. $25) OR `abs(actual_cents - expected_cents) / expected_cents > 0.02`.

**Orders (`/orders`)**
Server-rendered table. Columns: Distro · PO# · Placed · Status · Items · Total · Next Charge · Last Update.

Filters as URL params: `?status=open,invoiced&distro=gts&q=booster&from=2026-04-01&to=2026-05-31`. Bookmarkable.

Row click → side drawer (Sheet component from shadcn) with full detail: items, payments, shipments, raw payload viewer in a collapsible.

Status chip: 4 visual buckets (see § 3 status semantics), tooltip on hover shows precise underlying status.

**Releases (`/releases`)**
Vertical timeline grouped by week. Each release row: product name, total qty across orders, total $ committed, source distros. Items with `release_date is null` bucket at the top as "TBD release."

**Sync (`/sync`)**
Per-distro status cards at top showing "last successful sync" and "current run status." Red if errored or stale.

Paginated table of `sync_runs`: started, distro, duration, status, orders seen/changed, error message, screenshot link. `LIMIT 50` + "Load more."

**No "Sync now" button.** Page shows a copyable `pnpm sync` command. Honest about the laptop-bound scraper.

### 5.3 Caching strategy

Next.js 16 Cache Components. Every Supabase query in server components is wrapped with `cacheTag()`:

```ts
async function getOrders() {
  'use cache';
  cacheTag('orders');
  return supabase.from('orders').select('...');
}
```

The ingest Edge Function, after a successful upsert, calls a Next.js Route Handler at `/api/revalidate` with `X-Revalidate-Token`. That handler invokes `revalidateTag('orders')`, `revalidateTag('payments')`, etc. for whatever changed.

**Important: Vercel Authentication blocks server-to-server webhooks by default.** The Edge Function has no Vercel session cookie, so a naive POST to `/api/revalidate` returns the Vercel login page (HTTP 401). The fix is Vercel's deployment protection bypass: include `x-vercel-protection-bypass=<token>` as a header (or query param) on the request. Generate the bypass token once in the Vercel dashboard (Settings → Deployment Protection → Protection Bypass for Automation), store it as `VERCEL_BYPASS_TOKEN` in the Supabase function env. The `/api/revalidate` handler still verifies its own `X-Revalidate-Token` independently — bypass token gets you past Vercel, revalidate token authenticates the caller.

Result: pages are statically cached and re-render *instantly* after sync. No `revalidate: 60` polling waste.

### 5.4 What's NOT in v1

- No manual order editing
- No notifications
- No CSV export
- No dark mode toggle (dark default)
- No real-time / SSE
- No settings UI — distro list seeded into Supabase directly, scraper config is a local file
- No dedicated `/orders/[id]` page — drawer only
- No calendar grid view on `/releases` — timeline only

---

## 6. Auth, Secrets, Deploy

### Auth

**Vercel Authentication** on the production deployment. Toggle in Vercel dashboard. Only the owner's Vercel account can access the app. Zero auth code in the repo.

### Secrets

| Secret | Lives in | Used by |
|---|---|---|
| GTS username/password | `apps/scraper/config.local.json` (gitignored) | Scraper login |
| `INGEST_URL` + `X-Scraper-Token` | `apps/scraper/.env.local` (gitignored) | Scraper → ingest function (the scraper's *only* upstream credential) |
| `X-Scraper-Token` shared secret | Supabase function env | Auth check on `/ingest` |
| `REVALIDATE_WEBHOOK_TOKEN` | Supabase function env + Vercel env | Auth on `/api/revalidate` (caller identity) |
| `VERCEL_BYPASS_TOKEN` | Supabase function env | Bypasses Vercel Authentication for the `/api/revalidate` route only |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase function env + Vercel env (server-side only) | Ingest function DB writes; Next.js server components reading DB |
| `SUPABASE_URL` | Vercel env + Supabase function env | Same |

GTS credentials never leave the owner's laptop. The scraper does **not** hold the Supabase service role key — it only knows the ingest endpoint and its scraper token. Failure screenshots are POSTed to ingest as base64; the ingest function performs the Storage upload. This keeps the laptop-side secret surface to a single token.

### Service-role safety rules

Next.js server components use the service role key. To prevent accidental client exposure:

- All Supabase reads go through a single `apps/web/lib/db.ts` module.
- ESLint rule forbids importing `lib/db` (or `@supabase/*`) from any file containing `"use client"`.
- No `NEXT_PUBLIC_*` Supabase keys. Belt-and-suspenders: even if a client component accidentally imported `lib/db`, `process.env.SUPABASE_SERVICE_ROLE_KEY` is `undefined` in the browser bundle (Next.js only ships `NEXT_PUBLIC_*` env vars to the client). The page would crash; the key would not leak.

### Deploy targets

- **Web app:** Vercel, auto-deploy on push to `main`, preview deploys on PRs, Vercel Authentication on production.
- **Supabase project:** `distrodashboard-prod`, single project, region chosen at provision.
- **Migrations:** `supabase db push` from CI on push to `main` when `supabase/migrations/` changes.
- **Edge Functions:** `supabase functions deploy ingest` from CI when `supabase/functions/` changes.
- **Scraper CLI:** runs only on the owner's laptop. README documents Task Scheduler setup.

### CI workflow

`.github/workflows/ci.yml` (illustrative — the implementation plan produces the real YAML with proper `steps:` syntax, action versions, and caching):

```text
on: pull_request, push
test job:
  - pnpm install --frozen-lockfile
  - pnpm typecheck
  - supabase start                   # local Postgres for integration tests
  - supabase db reset --local
  - pnpm test
  - pnpm build --filter web
deploy job (push to main only):
  - supabase functions deploy ingest  # when supabase/functions/ changed
  - supabase db push                  # when supabase/migrations/ changed
  # Vercel handles web deploy via its own GitHub integration
```

Target wall-clock: < 60s for the test job.

### Not in v1

- No staging environment (preview deploys against prod Supabase)
- No automated secret rotation
- No SSO / team plans / audit log

---

## 7. Testing Strategy

Tests target *behaviors that would silently break in production*, not test-type coverage.

### Behaviors to verify (priority order)

1. **Contract schemas reject malformed payloads.** Zod, unit. `packages/contracts`.
2. **`gtsParse` produces correct `OrderSnapshot[]` from fixture HTML.** Unit. Fixtures captured by `pnpm scraper:capture`.
3. **Orchestrator tripwire:** marks run as `partial` when scraper returns 0 orders after a prior `> 0` run. Unit. `apps/scraper/core`.
4. **Ingest function:** rejects bad auth, validates schema, upserts idempotently, recomputes `orders.status` headline. Integration, local Supabase.
5. **Ingest function: payment diff:** `order_payments` upsert correctly distinguishes new vs. updated rows; `actual_date`/`actual_cents` fill in over time. Integration.
6. **cacheTag invalidation end-to-end:** seed an order → POST ingest → assert Overview page reflects new data. Integration.
7. **UI rule unit tests:** variance threshold (`> $25 OR > 2%`), staleness threshold (`> 36h`), first-run detection (`sync_runs` empty).

### Tooling

- **Vitest** for all unit + integration tests.
- **Local Supabase** (`supabase start`) for integration tests. Reset between runs.
- **Test fixtures:** `apps/scraper/test-fixtures/gts/*.html` — redacted real HTML. Captured via `pnpm scraper:capture --only gts --order <po>`.
- **Snapshot factories:** `makeOrderSnapshot(overrides)`, `makeSyncRun(overrides)` to keep test setup short.
- **No Husky, no Playwright, no visual regression in v1.** Pre-commit is a manual `pnpm check` script (`tsc && vitest related`). CI is the enforcement layer.

### Manual verification

- `pnpm sync --headed --dry-run` against the real GTS portal before any scraper change merges.
- Smoke test on the Vercel preview URL before promoting to prod.

---

## 8. Open Questions

None blocking implementation. Pre-existing assumptions to revisit if violated:
- GTS does not enable MFA. If they do: scraper throws, owner runs `--headed` once, cookies persist.
- One owner, no second user soon. If a second user is added: introduce Supabase Auth + RLS, add `owner_id` columns, migrate existing rows.
- 1–7 distros total. If more: orchestrator may need fan-out (queues / parallelism).

---

## 9. Implementation Sequencing (high-level)

Detailed sequencing is the job of the implementation plan, not this spec. Rough order:

1. Repo scaffold: pnpm workspace, `apps/web`, `apps/scraper`, `packages/contracts`, Supabase project, Vercel project
2. DB migration (all 7 tables + price-history trigger) + seed the `distros` table with the GTS row so `sync_runs` FKs resolve on first run
3. `packages/contracts` Zod schema
4. Ingest Edge Function (with tests)
5. `apps/scraper` core (orchestrator, ingest client, normalizer, tests)
6. GTS scraper (`gtsFetch` + `gtsParse`, fixture capture, parse tests)
7. End-to-end manual sync verifying real GTS data lands in DB
8. `apps/web` foundation: layout, sidebar, Vercel Auth, db.ts, cacheTag plumbing, revalidation webhook
9. Overview page
10. Cash Flow page (the flagship)
11. Orders page + drawer
12. Releases page
13. Sync page
14. CI workflow, Task Scheduler entry, README

Each numbered item is a candidate commit / PR boundary.

# Tuck & Howell Call Center

A mobile-first web app that shows the owner, managers and CSRs everything about the call center: who is waiting for a callback, how the team is doing, where leads come from, and what unreturned calls cost.

All data is **seeded dummy data** for now. It is generated in the browser, is identical on every reload, and is labeled with the system it will come from (ServiceTitan, Dialpad, AI Voice Agent, GoHighLevel).

## Run it

Requires Node 20 or newer.

```bash
npm install
npm run dev        # http://localhost:3000
```

Other scripts:

```bash
npm run lint       # ESLint
npm run typecheck  # TypeScript, strict
npm test           # Vitest: callback engine rules and mock data checks
npm run build      # production build
```

No API keys or environment variables are needed.

## Folder structure

```
src/
  app/                    Routes (App Router). Each page.tsx renders a view from components/views
  components/
    app/                  Providers (theme, data loading, live simulator) and shared hooks
    layout/               App shell: sidebar, header, bottom tabs, role switcher
    callbacks/            Waiting line (Today), callback actions (claim, call, mark outcome), detail drawer
    charts/               Recharts kit and chart components, restyled to the design tokens
    common/               Page header, KPI figure, chips, data table (TanStack), empty states
    team/                 Dialpad availability timeline
    ui/                   shadcn/ui primitives (Radix), styled to DESIGN.md
    views/                One file per page
  lib/
    types/                Domain types (Call, Customer, Callback, Lead, Csr, Job, ...)
    data/
      sources/            One adapter interface per system
      mock/               Seeded generator (mulberry32) and mock adapters implementing those interfaces
      index.ts            USE_MOCK_DATA switch and loadDataset()
    metrics/
      definitions.ts      Every metric: name, plain explanation, formula, source of truth
      calculations.ts     Pure metric functions
    callbacks/
      engine.ts           Callback rules as pure functions (the five lists)
      simulator.ts        Live demo events every 20 to 40 seconds
    time.ts               America/New_York time helpers
  store/                  Zustand: app settings (persisted) and data (dataset, live events, derived callbacks)
DESIGN.md                 Design tokens, layout, principles
```

## How the callback lists work

The five lists (Needs callback, Attempted, Called back, Booked, Closed) are never stored. `src/lib/callbacks/engine.ts` derives them from the raw event log every time: calls, texts, jobs, and user actions (claims, closes). That keeps every rule in one tested place, and means real events can be fed in later without touching the UI. The rules, with tests, are in `engine.ts` and `engine.test.ts`. The defaults (20 second minimum call, 3 attempts, 2 hour retry wait, 15 minute claim expiry, 15 minute alert) are editable in Settings and are marked as draft until the call center manager confirms them.

## Plugging in the real systems

UI components never import adapters. They read one `Dataset` from the data store, which is filled by `loadDataset()` in `src/lib/data/index.ts`. To connect a real system:

1. Implement the interface in `src/lib/data/sources/`:
   - `serviceTitan.ts`: customers, calls, texts, jobs and invoices, campaigns, web leads
   - `dialpad.ts`: CSRs, availability and break status, internal call counts
   - `aiVoiceAgent.ts`: AI Voice Agent calls (currently Broccoli, synced via ServiceTitan)
   - `goHighLevel.ts`: Angi leads

   Each file already has a `create...Adapter()` stub that throws "not configured". Replace the stub with real API calls. Calls to these APIs need server-side credentials, so put them behind Route Handlers or Server Functions and have the adapter call those.
2. Set `REAL_GO_LIVE_AT` in `src/lib/data/index.ts` to the date the callback app went live.
3. Set `USE_MOCK_DATA = false`. The live simulator turns off automatically.

For live updates, replace the simulator with a subscription (webhooks or polling) that calls `useDataStore.getState().applyEvent()` with new calls, texts, jobs or actions. The engine moves customers between lists the same way it does in the demo.

Source of truth: call counts come from ServiceTitan (Dialpad also counts internal calls). Availability and breaks come from Dialpad.

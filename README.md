# Tuck & Howell Call Center

A mobile-first web app for Tuck & Howell's call center. It has two tabs:

- **Stats:** every call back we owe, in one donut chart by platform (Broccoli, Dialpad, ServiceTitan, Lace). Click a slice to see that platform's share, how fast we called back, bookings, trend and the calls in it.
- **Callbacks:** a live table of every call back, from every platform. Open calls stay on top; when someone calls the customer back, the row turns done and moves down.

### Where call backs come from

Set in one place, `PLATFORM_OF` in `src/lib/metrics/callback-log.ts`:

| Platform | Call backs |
|---|---|
| Dialpad | Abandoned (hung up on hold) and Missed (rang a CSR, nobody answered) |
| Broccoli | AI Voice Agent calls where the caller did not book |
| ServiceTitan | Web form requests |
| Lace | Answered calls that did not book, flagged by Lace AI for a follow-up |

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
npm test           # Vitest: abandoned-call metrics, callback rules, mock data checks
npm run build      # production build
```

No API keys or environment variables are needed.

## Folder structure

```
src/
  app/                    Routes (App Router): / Stats, /callbacks Callbacks
  components/
    app/                  Providers (theme, data loading, live simulator) and shared hooks
    layout/               App shell: sidebar with one tab, header with freshness and theme
    charts/               Recharts kit and the small line graph used in the tables
    common/               Page header, date range picker, change indicator, sortable paged table (TanStack), empty states
    ui/                   shadcn/ui primitives (Radix), styled to DESIGN.md
    views/
      stats.tsx                The Stats tab: summary, platform donut, platform details
      callbacks.tsx            The Callbacks table
  lib/
    types/                Domain types (Call, Customer, Callback, Lead, Csr, Job, ...)
    data/
      sources/            One adapter interface per system
      mock/               Seeded generator (mulberry32) and mock adapters implementing those interfaces
      index.ts            USE_MOCK_DATA switch and loadDataset()
    metrics/
      abandoned.ts        Shared helpers: callback speed groups, time bins for the line graphs
      callback-log.ts     Every call back, by type and platform: assigned CSR, attempts, reached CSR, speed, done
      definitions.ts      Every metric: name, plain explanation, formula, source of truth
      calculations.ts     Pure metric functions
    callbacks/
      engine.ts           Callback rules as pure functions (the five lists)
      simulator.ts        Live demo events every 20 to 40 seconds
    time.ts               America/New_York time helpers
  store/                  Zustand: app settings (persisted) and data (dataset, live events, derived callbacks)
DESIGN.md                 Design tokens, layout, principles
```

## How the numbers are worked out

All in `src/lib/metrics/abandoned.ts`, tested in `abandoned.test.ts`:

- **Abandoned calls:** inbound calls where the caller hung up while waiting in the queue.
- **Broccoli calls:** inbound calls the AI Voice Agent answered where the caller did not book. Calls Broccoli booked need no call back; the page shows their count in a note.
- **Got called back:** within 3 days of the hang-up, we made an outbound call to any of the customer's phone numbers (answered or not), or the customer called in again and a CSR answered.
- **Still open:** abandoned calls not called back yet. Called back % is got called back ÷ abandoned calls.
- **How fast are we calling back:** time from the hang-up to that first call back, in five groups from within 5 minutes to slower than 4 hours. Overnight calls are timed from 7 am, when CSRs start. Booked means a job was booked for the customer within 3 days; book rate is booked ÷ that group's count.
- **Call length before hang-up (Abandoned):** how long the caller was on hold before hanging up, in five groups. Rule of thumb: all should be 10 seconds or less, so rows go green to red.
- **Call length with Broccoli:** how long callers talked with the AI, in five groups from under 30 seconds to over 4 minutes. There is no good or bad direction, so these rows use one neutral color.
- **Line graphs:** calls per hour when the date range is one or two days, per day for longer ranges. All rows in a table share one scale so they can be compared.

## The Callbacks table

Built in `src/lib/metrics/callback-log.ts`, tested in `callback-log.test.ts`. One row per call that needed a call back:

- **Type:** Abandoned (hung up on hold), Missed (rang a CSR, nobody answered), Broccoli (AI Voice Agent, no booking), Web form, or Lace flag (answered, no booking, flagged by Lace AI). Hover a type to see the reason.
- **Assigned to:** the CSR whose line rang and did not pick up (for Lace flags, the CSR who took the call). Calls that came in when nobody was on shift show After hours; web forms show Unassigned.
- **Length (sec):** how long the original call lasted.
- **Attempt:** our outbound calls to any of the customer's numbers within 3 days, up to the one that reached them.
- **Reached CSR?:** Yes when one of those calls lasted 20 seconds or more, or the customer called again and a CSR answered.
- **Action needed:** Call back until someone calls the customer back; None after that.
- **Done?:** ticked automatically as soon as someone calls the customer back (or they reach a CSR, or a job is booked). Done rows move below the open ones, live, with a notification. You can tick or untick it by hand; the choice is saved in this browser.

## How the callback lists work

The five lists (Needs callback, Attempted, Called back, Booked, Closed) are never stored. `src/lib/callbacks/engine.ts` derives them from the raw event log every time: calls, texts, jobs, and user actions (claims, closes). That keeps every rule in one tested place, and means real events can be fed in later without touching the UI. The rules, with tests, are in `engine.ts` and `engine.test.ts`. The defaults (20 second minimum call, 3 attempts, 2 hour retry wait, 15 minute claim expiry, 15 minute alert) are in `DEFAULT_CALLBACK_SETTINGS` in `src/lib/types/index.ts` and are drafts until the call center manager confirms them. The engine still runs behind the scenes; the callback screens were removed when the app was narrowed to the Abandoned page.

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

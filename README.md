# Tuck & Howell Call Center

A mobile-first web app for Tuck & Howell's call center, running on **live ServiceTitan data**. It has two tabs:

- **Stats:** every missed and abandoned call in one donut chart by type. Click a slice to see its share, how fast we called back, who called back, a trend line and the calls in it.
- **Callbacks:** a live table of every missed and abandoned call. Open calls stay on top; when someone calls the customer back, the row turns done and moves down. New calls appear on their own.

There is no dummy data. Every number comes from ServiceTitan's Telecom API.

## Run it

Requires Node 20 or newer.

1. Put the ServiceTitan credentials in `.env` at the project root (it is ignored by Git, never commit it):

   ```
   service_titan_client_id=...
   service_titan_secret=...
   service_titan_app_key=...
   service_titan_tenant_id=...
   ```

   The tenant id is optional; if it is missing the app reads it from the access token.

2. Start the app:

   ```bash
   npm install
   npm run dev        # http://localhost:3000
   ```

Other scripts:

```bash
npm run lint       # ESLint
npm run typecheck  # TypeScript, strict
npm test           # Vitest: call back rules
npm run build      # production build
```

## How live updates work

- The browser never sees the credentials. It calls the app's own endpoint, `GET /api/callbacks?from=<ms>&to=<ms>`, which talks to ServiceTitan on the server.
- The server signs in with the client credentials (token cached until it expires) and keeps an in-memory copy of the calls. The first request for a date range downloads every call in it. After that, each sync asks ServiceTitan only for calls **modified since the last sync** (`modifiedOnOrAfter`), at most every 8 seconds, so it is fast and light.
- The Callbacks and Stats pages ask the endpoint every **15 seconds** (and right away when the tab becomes visible again). A new abandoned or missed call, or a call back, shows up within about 15 seconds, with a notification.
- ServiceTitan does not push call events, so this is polling. For instant updates, ServiceTitan webhooks or Dialpad events could replace it later without changing the pages.

## The rules

All in `src/lib/callbacks/live.ts`, tested in `live.test.ts`:

| Rule | Detail |
|---|---|
| Abandoned | Inbound call with ServiceTitan call type **Abandoned** (the caller hung up before anyone answered). Calls typed Abandoned that have an agent on them are left out, matching the team's report. |
| Missed | Any other inbound call with **no agent** on it |
| Not a lead | Calls ServiceTitan types **Not a lead** (spam, vendors, hidden voicemails) are left out completely |
| Call back | Any outbound call to the caller's number within 3 days. It marks the row **done** and moves it down. |
| Customer called us | No call back from us, but the caller called again later (any time) and a CSR answered. The row is **done**, marked "no call back from us", and left out of our callback speed. |
| Attempt | Our outbound calls to that number, up to the one that reached them |
| Reached CSR? | A call back of 20 seconds or more, or the caller reaching a CSR |
| Callback speed | From the missed call to the first call back. Overnight calls are timed from 7 am. |
| Done? | Ticked automatically by a call back. You can tick or untick it by hand; the choice is saved in this browser. |

Phone numbers are matched on their last 10 digits, so `+18645550101` and `(864) 555-0101` are the same caller.

**Assigned to** shows "Not recorded": ServiceTitan does not record whose line rang when nobody picked up. Dialpad has that, and can fill the column once it is connected.

## Folder structure

```
src/
  app/
    page.tsx                  Stats
    callbacks/page.tsx        Callbacks
    api/callbacks/route.ts    Live call backs endpoint (server)
  components/
    app/                      Providers (theme) and hooks (clock, live polling, layout)
    layout/                   App shell: sidebar, header with live status
    charts/                   Recharts kit and the small line graph
    common/                   Page header, date range picker, sortable paged table (TanStack), empty states
    ui/                       shadcn/ui primitives (Radix), styled to DESIGN.md
    views/                    stats.tsx, callbacks.tsx
  lib/
    servicetitan/
      client.ts               Sign-in, token cache, paged GETs (server only)
      calls.ts                Live call cache with incremental sync (server only)
    callbacks/live.ts         Call back rules, speed groups, time bins (shared)
    metrics/definitions.ts    Name, plain explanation, formula and source of every number
    range.ts, format.ts, time.ts
  store/                      Zustand: theme and Done ticks (saved), live connection status
DESIGN.md                     Design tokens, layout, principles
```

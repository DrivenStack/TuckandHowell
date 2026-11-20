# Call Center: design system

A calm, confident instrument for an owner who trusts numbers. It should read like a private banking statement: quiet ground, strong figures, one loud thing on the screen at a time.

## Color

Six named values. Each has one job and keeps it on every screen.

| Token | Light | Dark | Job |
|---|---|---|---|
| `ink` | `#13232E` | `#E6ECEE` | Text, the navigation rail, primary buttons |
| `ground` | `#F3F5F4` | `#0D171E` | The page itself. Most content sits directly on it |
| `panel` | `#FFFFFF` | `#14222B` | Raised surfaces: the waiting line, drawers, tables |
| `cool` | `#2C6E9B` | `#6CA9D6` | Calm, on track, better than last week, links |
| `warm` | `#D9822B` | `#E39A50` | Needs attention, heating calls, waits of 5 to 15 min |
| `alarm` | `#B9443C` | `#E2726A` | Urgent only: long waits, worse than last week |

Supporting tones derived from those (not new hues):

- `muted` text `#56656F` / `#93A3AC` (4.9:1 and 6.8:1 on their grounds).
- `line` hairlines `#DCE2E0` / `#243642`.
- `warm-text` `#9A5712` / `#E9A866`. The raw amber fails contrast as text on white, so text uses this darker step and the bright amber is kept for fills and markers.
- `success` `#2F7D5B` / `#5DB38A`. Used only for "Booked" and "Resolved". Never for decoration.
- Tints (`cool`, `warm`, `alarm` at 10 to 14% opacity) for status chips and the waiting line bands.

Charts use the same meaning with slightly more saturated steps, checked with a colorblind validator (lightness band, chroma floor, CVD and normal-vision separation): CSR answered `#1F67A3` / `#5799D2`, AI Voice Agent `#5E9BD0` / `#2A6299`, missed `#B8433A` / `#D0625A` (light / dark). The brand blue alone read as gray at chart scale, which is why chart series get their own steps. Every multi-series chart has a legend and a hover tooltip, because the lighter series is under 3:1 against the panel. Target lines are dashed `ink` at 40%.

## Type

**Hanken Grotesk** (variable, via `next/font/google`). It is warm without being soft, has true tabular figures (`tnum`), and its numerals stay legible at 64px and at 11px. Every number uses `font-variant-numeric: tabular-nums`.

| Role | Size / line | Weight | Use |
|---|---|---|---|
| Hero figure | 64 / 64 (mobile 48) | 600, -0.03em | Waiting count, snapshot numbers |
| Figure | 32 / 36 | 600, -0.02em | KPI values |
| Page title | 28 / 34 (mobile 24) | 600, -0.015em | One per page |
| Section | 17 / 24 | 600 | Section headings |
| Body | 15 / 22 | 400 | Default |
| Small | 13 / 18 | 450 | Labels, table cells, explanations |
| Caption | 12 / 16 | 500 | Source notes, axis labels |

Sentence case everywhere. No uppercase, no tracked eyebrows, no middle-dot meta strings.

## Shape and depth

Radius follows importance, not a single default:

- 22px: the signature waiting line panel.
- 14px: drawers, tables, chart panels.
- 10px: buttons, inputs, segmented controls.
- Full round: status chips, avatars.

Depth: the ground carries most content with no container at all (KPIs, charts on Today). Panels use a 1px `line` border and no shadow. Only floating layers (drawers, menus, toasts) get a soft shadow. No gradients.

## Layout

Mobile first at 390px. 16px side gutter, 20px at tablet, 32px desktop, content max 1240px.

**Today, mobile (390px)**

```
┌──────────────────────────────┐
│ Tuck & Howell   ● 1m   👤 ◐ │  header: wordmark, freshness, role, theme
├──────────────────────────────┤
│ Today                         │
│ Who is waiting, how today is  │
│ going                         │
│ ╭──────────────────────────╮ │
│ │ 4  People waiting for a  │ │  SIGNATURE: the waiting line
│ │    callback              │ │  one plain sentence:
│ │ 4 people are waiting. 1  │ │  "1 has waited more than 15 minutes"
│ │ has waited over 15 min.  │ │
│ │ [ Go to callbacks ]      │ │
│ ├────────┬────────┬────────┤ │
│ │ 1 Over │ 1 5-15 │ 2 Under│ │  three counts, word + icon + color
│ │ 15 min │ min    │ 5 min  │ │
│ ├──────────────────────────┤ │
│ │ Dana W.   No Heat  38 min│ │  queue, longest wait first
│ │ ██████████████████ red   │ │  timer bar fills up to 15 min
│ │ Joe P.    Drains    7 min│ │
│ │ ███████░░░░░░░░░ amber   │ │
│ ╰──────────────────────────╯ │
│ 184 calls in    61% booked   │  KPI grid, 2 columns, on ground
│ ...                           │
│ Calls by hour  (chart)        │
│ Where today's calls ended up  │
│ Booking rate, 30 days         │
├──────────────────────────────┤
│ Today Callbacks Leads Team More│  bottom tabs (44px+)
└──────────────────────────────┘
```

**Today, desktop (1440px)**

```
┌────────┬──────────────────────────────────────────────────────┐
│ T&H    │ Today                         Updated 1 min ago Owner◐│
│ Call   ├──────────────────────────────────────────────────────┤
│ Center │ ╭──────────────────────────────────────────────────╮ │
│        │ │ 4  People waiting.  1 has waited over 15 min.    │ │
│ Today  │ │                                 [Go to callbacks]│ │
│ Callbk │ │ 1 Over 15 min │ 1 5 to 15 min │ 2 Under 5 min    │ │
│ Leads  │ │ Dana W.  No Heat   ████████████████  38 min  ›   │ │
│ Team   │ │ Joe P.   Drains    ██████░░░░░░░░░░   7 min  ›   │ │
│ AI     │ ╰──────────────────────────────────────────────────╯ │
│ ...    │ KPI KPI KPI KPI / KPI KPI KPI KPI  (full width)       │
│        │ Calls by hour (wide)       | Where calls ended up     │
│        │ Booking rate, 30 days (wide)                         │
└────────┴──────────────────────────────────────────────────────┘
  ink rail                ground
```

**Callbacks, mobile**

```
┌──────────────────────────────┐
│ Callbacks                     │
│ Everyone who needs a call...  │
│ [Needs 7][Attempted 3][Called]│  scrollable segmented control with counts
│ [Search name or phone]  [⚙ 2] │  filters open a sheet
│ ┌──────────────────────────┐ │
│ │ Dana Whitfield     Urgent│ │  stacked card row
│ │ No Heat  Greer   VIP     │ │
│ │ Waiting 38 min  2 calls  │ │
│ │ [Claim callback]   [Call]│ │
│ └──────────────────────────┘ │
│ ...                           │
└──────────────────────────────┘
```

**Callbacks, desktop**

```
┌────────┬──────────────────────────────────────────────────────┐
│ rail   │ Callbacks                                 date range │
│        │ ▸ Time to call back by day | How callbacks ended     │
│        │ [Needs 7][Attempted 3][Called back][Booked][Closed]  │
│        │ [Search........] priority source job VIP claimed city│
│        │ ┌──────────────────────────────────────────────────┐ │
│        │ │Customer   Reason  Waiting Calls Priority Claim Act│ │
│        │ │Dana W.    No Heat 38 min   2    Urgent   ◯   ...  │ │
│        │ └──────────────────────────────────────────────────┘ │
│        │                          drawer slides from right ──▶│
└────────┴──────────────────────────────────────────────────────┘
```

## Principles

1. **Waiting is the loudest thing.** Only the waiting line and urgent items get strong color. Everything else stays ink on ground.
2. **A color means one thing, everywhere.** Blue calm or better, amber attention, red urgent, green booked. Always paired with a word or icon.
3. **Every number explains itself.** Name in the owner's words, an info icon with one sentence, and its source (ServiceTitan or Dialpad) nearby.
4. **One thumb, one action.** One primary button per screen, 44px targets, and labels that say exactly what happens ("Claim callback", then "Callback claimed").
5. **Motion confirms, it does not decorate.** One quiet entrance on Today; otherwise motion only when something moves, opens or changes count. Reduced motion turns it off.

## Review against the brief

What I changed after the first draft, and why:

- **Amber as text.** The suggested `#D9822B` is 2.9:1 on white, below AA. Kept it for markers and fills, added `warm-text` `#9A5712` for words.
- **Navigation rail in ink, not white.** A first draft used a white sidebar, which made every surface look like the same SaaS card kit. A deep ink rail gives the app one firm anchor and lets the ground stay quiet.
- **Fewer containers.** The first draft boxed every KPI. Now KPIs and most charts sit directly on the ground, separated by space and hairlines. Only the waiting line, tables and drawers are raised.
- **Green narrowed.** Was used for "better than last week". Changed to `cool`, so green means one thing only: booked or resolved.
- **AI Voice Agent series color.** Was amber in the first draft, which would have read as "attention" on every chart. Changed to a light cool step, since AI-handled calls are not a warning by themselves.
- **Priority shown as a word with an icon,** never a score or a color alone.
- **Waiting line simplified (after owner feedback).** The first version placed markers on a non-linear minutes axis with colored zones. It looked good but needed explaining. It is now a plain queue: one sentence summary, three counts (over 15 min, 5 to 15, under 5), and one row per customer with a timer bar that fills up and turns red at the urgent time.

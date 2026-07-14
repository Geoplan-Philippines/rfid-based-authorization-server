# Reports — backend requests from the frontend

Written against the contract in `frontend-reports-api.md`. Everything the reports
module needs to *render* exists today; these are the gaps that currently force
either dead UI (a disabled button, a count that can't be clicked) or a worse
workflow than the data would allow.

Ordered by impact on the admin's monitoring loop. Each item states what the UI
does today, what it would do with the endpoint, and the exact shape wanted.

---

## 1. `result` and `search` filters on `GET /reports/exceptions` — **high**

**Today.** The exceptions report renders `meta.resultCounts` (`UNKNOWN_TAG · 12`,
`DENIED · 3`, …) as *read-only tags*. They look exactly like the filter chips on
`/transactions`, which is where the whole app has taught admins that a count chip
is clickable. We deliberately did not make them clickable, because the only thing
we could filter is the 20 rows already on the page — the counts are range-wide, so
a client-side filter would visibly disagree with them.

**Wanted.** Same semantics as `GET /transactions`, which already supports both:

```http
GET /reports/exceptions?from=2026-07-08&to=2026-07-14&result=UNKNOWN_TAG&search=EPC123&page=1&limit=20
```

| Parameter | Rules |
| --- | --- |
| `result` | Optional. One of `UNKNOWN_TAG` \| `FACE_MISMATCH` \| `PLATE_MISMATCH` \| `DENIED` \| `ERROR`. Any other value → `400`. |
| `search` | Optional. Free-text over `eventCode`, `rfidTag.epcId`, `plateRead`, `truck.plateNumber`, driver name — matching `/transactions`. |

**Important:** `meta.resultCounts` must keep ignoring `result` (so the chips still
show every bucket while one is selected) but *should* respect `search` — again the
same rule `/transactions` already applies to its counts. `meta.total` and
`meta.lastPage` reflect the full filter set as usual.

This one change turns the breakdown from a label into the report's primary filter.

---

## 2. Export endpoints — **high**

**Today.** Every report page (and the Dashboard, Transactions, and Audit Logs
before them) ships an **Export** button that is permanently `disabled` with a
"coming soon" title. Compliance reporting is the stated reason this module exists,
and an admin currently cannot get a single number out of it.

**Wanted.** One export route per report, mirroring the report's own query
parameters exactly so the export is always "what I am looking at":

```http
GET /reports/daily-summary/export?date=2026-07-14&format=csv
GET /reports/monthly-breakdown/export?month=2026-07&format=csv
GET /reports/exceptions/export?from=2026-07-08&to=2026-07-14&result=UNKNOWN_TAG&format=csv
GET /reports/peak-hours/export?from=2026-06-15&to=2026-07-14&format=csv
```

- `format`: `csv` now, `pdf` later. Unknown value → `400`.
- Respond with the file body, not the JSON envelope:
  - `Content-Type: text/csv; charset=utf-8`
  - `Content-Disposition: attachment; filename="exceptions-2026-07-08_2026-07-14.csv"`
- The exceptions export must cover the **whole range, not one page** — ignore
  `page`/`limit`.
- Auth: same bearer token; please allow the header (the frontend fetches as a
  blob rather than navigating, so a cookie-less `window.open` is not in play).

---

## 3. Previous-period comparison in `ReportSummary` — **medium**

**Today.** A daily summary says "14 exceptions". An admin cannot tell whether 14
is a normal Tuesday or a crisis without manually stepping back through days. The
Dashboard already solves exactly this for one card (`trucksToday.deltaVsYesterday`);
the reports have nothing.

**Wanted.** Add a `previous` block to `ReportSummary`, computed over the
immediately preceding window of equal length (yesterday for daily, previous month
for monthly, the preceding N days for peak-hours):

```ts
type ReportSummary = {
  // …existing fields unchanged…
  previous: {
    totalGateEvents: number;
    verified: number;
    exceptions: number;
    manualOverrides: number;
    verificationRate: number; // 0–100, one decimal
  } | null; // null when no preceding window exists (e.g. before the first recorded event)
};
```

Deltas stay a frontend concern — we only need the baseline. This lets every KPI
card carry a "vs previous period" line, which is the single highest-value
monitoring signal the module is currently missing.

---

## 4. Hourly throughput in `GET /reports/daily-summary` — **medium**

**Today.** The Daily Summary shows totals but not the day's *shape*. The Dashboard
already returns `hourlyThroughput` for its own day, so the aggregation exists — the
daily report just can't reach it, and firing a second request to `/dashboard/overview`
to fill one panel of a report would be a smell.

**Wanted.** Add the same array the dashboard returns, unchanged in shape:

```ts
type DailySummaryData = {
  // …existing fields unchanged…
  hourlyThroughput: Array<{
    hour: number;      // 0–23, gate-local
    verified: number;
    exception: number;
    total: number;
  }>; // exactly 24 entries, sorted 0 → 23
};
```

The frontend already has a chart component for exactly this shape; the panel drops
straight in.

---

## 5. Open-event count in exceptions `meta` — **low**

**Today.** Rows carry `isOpen`, and we badge them "still open", but the count of
open exceptions in the range is only knowable by paging through every page.

**Wanted.** One number in the existing `meta`:

```ts
type ExceptionsMeta = {
  // …existing fields unchanged…
  openCount: number; // exceptions in the range with no BARRIER_OPENED event yet
};
```

---

## Not requested

- **Custom report builder.** Cut from the UI; the four fixed reports cover the
  monitoring loop. Please don't build a generic query endpoint for it.
- **Override audit report.** Cut. `manualOverrides` in `ReportSummary` and the
  `MANUAL_OVERRIDE` bucket in `resultCounts` already cover the need; `/transactions`
  can already list them via its existing `result` filter.
- **A `result` filter on the summary endpoints.** The seven-key `resultCounts` is
  enough; we don't need the daily/monthly/peak-hours totals recomputed per result.

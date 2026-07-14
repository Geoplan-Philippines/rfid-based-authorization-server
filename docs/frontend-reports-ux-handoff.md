# Frontend reports UX handoff

This is the complete frontend contract for the Reports module. Use it as the
source of truth for report pages; it supersedes the older
frontend-reports-api.md reference.

## Scope

Build four authenticated, read-only report pages:

1. Daily Summary
2. Monthly Breakdown
3. Exceptions Report
4. Peak Hours

Do not build report export UI. There are no CSV or PDF export endpoints, and
there is no future-facing disabled state to preserve. Remove or hide every
Export / CSV control from all Reports pages rather than rendering a disabled
button. Do not call any /reports/*/export route.

Also do not build a custom report builder, a separate override report, or
result filters on Daily Summary, Monthly Breakdown, or Peak Hours.

## Authentication and response shape

Every request needs the normal bearer token:

~~~
Authorization: Bearer <jwt>
~~~

Dates are JSON ISO-8601 strings in responses. Non-paginated endpoints return:

~~~
{
  "statusCode": 200,
  "message": "Success",
  "data": { }
}
~~~

The Exceptions Report is paginated:

~~~
{
  "statusCode": 200,
  "message": "Success",
  "data": [ ],
  "meta": { }
}
~~~

Use the data object (or data array) below as the endpoint payload. Query
validation errors return 400; unauthenticated requests return 401.

## Shared reporting behavior

- Calendar dates use the gate/server local timezone. Send YYYY-MM-DD directly;
  do not turn a user-selected calendar day into a UTC timestamp.
- Every recorded GateEvent is counted by its occurredAt calendar day, including
  an event that is still open.
- An open event has no BARRIER_OPENED timeline entry. It still contributes to
  total volume and its result bucket, but not to avgPassTime.sampleSize.
- Exceptions are only UNKNOWN_TAG, FACE_MISMATCH, PLATE_MISMATCH, DENIED, and
  ERROR.
- MANUAL_OVERRIDE is an approved operational action, not an exception. It is
  included in manualOverrides and the seven-result summary counts, but it never
  appears in the Exceptions Report.
- A range is inclusive at both ends. For example, to=2026-07-14 includes the
  full local day of July 14.
- Invalid calendar dates and a from date later than to return 400.

The shared result types are:

~~~
type GateEventResult =
  | 'VERIFIED'
  | 'UNKNOWN_TAG'
  | 'FACE_MISMATCH'
  | 'PLATE_MISMATCH'
  | 'MANUAL_OVERRIDE'
  | 'DENIED'
  | 'ERROR';

type ExceptionResult =
  | 'UNKNOWN_TAG'
  | 'FACE_MISMATCH'
  | 'PLATE_MISMATCH'
  | 'DENIED'
  | 'ERROR';
~~~

## Summary data and comparisons

Daily Summary, Monthly Breakdown, and Peak Hours return this full summary for
their selected period:

~~~
type ResultCounts = Record<GateEventResult, number>;

type ReportMetrics = {
  totalGateEvents: number;
  verified: number;
  exceptions: number;
  manualOverrides: number;
  openEvents: number;
  verificationRate: number; // verified / totalGateEvents, 0-100, one decimal
  avgPassTime: {
    milliseconds: number | null;
    sampleSize: number;
  };
  resultCounts: ResultCounts; // always all seven keys, including zeroes
};

type PreviousReportSummary = {
  totalGateEvents: number;
  verified: number;
  exceptions: number;
  manualOverrides: number;
  verificationRate: number; // 0-100, one decimal
};

type ReportSummary = ReportMetrics & {
  previous: PreviousReportSummary | null;
};
~~~

Use summary.previous as the frontend baseline for KPI delta text; the API does
not return precomputed deltas.

The prior period is:

| Endpoint | Previous baseline |
| --- | --- |
| Daily Summary | Previous calendar day |
| Monthly Breakdown | Previous calendar month |
| Peak Hours | Immediately preceding calendar window with the same number of days |

A null previous means there is no gate event before the selected period at all.
If older history exists but the immediately preceding period has zero events,
previous is a zero-filled object, not null. This lets the UI distinguish
"no earlier history" from "zero in the comparison period."

Monthly day rows intentionally use ReportMetrics only: they do not include a
previous field.

## 1. Daily Summary

~~~
GET /reports/daily-summary?date=2026-07-14
~~~

Query parameters:

| Parameter | Rules | Default |
| --- | --- | --- |
| date | Optional real YYYY-MM-DD calendar date | Today |

Use the backend-provided title directly; do not recreate it on the client.

~~~
type DailyHourlyThroughputBucket = {
  hour: number; // 0 through 23, gate-local hour
  verified: number;
  exception: number;
  total: number;
};

type DailySummaryData = {
  date: string; // YYYY-MM-DD actually reported
  title: string; // for example: Daily Gate Summary - Tuesday, July 14, 2026
  generatedAt: string;
  summary: ReportSummary;
  hourlyThroughput: DailyHourlyThroughputBucket[];
};
~~~

hourlyThroughput always has exactly 24 rows in ascending hour order. A manual
override contributes to total only; it does not increment exception.

## 2. Monthly Breakdown

~~~
GET /reports/monthly-breakdown?month=2026-07
~~~

Query parameters:

| Parameter | Rules | Default |
| --- | --- | --- |
| month | Optional YYYY-MM, with months 01 through 12 | Current month |

This endpoint aggregates GateEvent records only.

~~~
type MonthlyBreakdownDay = ReportMetrics & {
  date: string; // YYYY-MM-DD
};

type MonthlyBreakdownData = {
  month: string; // YYYY-MM actually reported
  generatedAt: string;
  summary: ReportSummary; // full selected month; previous is previous calendar month
  days: MonthlyBreakdownDay[];
};
~~~

days is sorted ascending and includes every day in the month, including
zero-event days. Use it directly for the daily trend chart or table.

## 3. Exceptions Report

~~~
GET /reports/exceptions?from=2026-07-08&to=2026-07-14&result=UNKNOWN_TAG&search=EPC123&page=1&limit=20
~~~

Query parameters:

| Parameter | Rules | Default |
| --- | --- | --- |
| from | Optional YYYY-MM-DD | If alone, to is today |
| to | Optional YYYY-MM-DD | If alone, range starts six calendar days earlier |
| page | Positive integer | 1 |
| limit | Integer from 1 to 50 | 20 |
| result | Optional ExceptionResult only | No result filter |
| search | Optional free text | No search filter |

When both dates are omitted, the report covers today plus the preceding six
calendar days. result is normalized to uppercase, so lowercase input is
accepted, but send the listed enum values. VERIFIED and MANUAL_OVERRIDE are
invalid result filters and return 400.

search is server-side and matches the full range, not just the visible page. It
searches eventCode, the RFID EPC ID, raw plate reading, assigned truck plate
number, and driver name. Multiword driver searches such as Ramon Reyes match
across first and last name.

Changing a date, result chip, or search term should reset page to 1 and make a
new request. Do not client-filter only the rows already loaded.

~~~
type ExceptionReportItem = {
  id: string; // use when navigating to GET /transactions/:id
  eventCode: string;
  occurredAt: string;
  result: ExceptionResult;
  reason: string; // backend display explanation
  plateRead: string | null;
  rfidTag: {
    epcId: string;
    status: 'ACTIVE' | 'INACTIVE' | 'LOST' | 'BLOCKED' | 'RETIRED';
  } | null;
  truck: {
    id: string;
    plateNumber: string;
    model: string;
  } | null;
  driver: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  verification: {
    rfidMatched: boolean;
    plateMatched: boolean | null;
    faceMatched: boolean | null;
    plateConfidence: number | null;
    faceConfidence: number | null;
    verifiedAt: string;
  } | null;
  barrierOpenedAt: string | null;
  isOpen: boolean;
};

type ExceptionsMeta = {
  total: number;
  page: number;
  limit: number;
  lastPage: number;
  period: {
    from: string; // YYYY-MM-DD
    to: string; // YYYY-MM-DD
  };
  resultCounts: Record<ExceptionResult, number>;
  openCount: number;
};
~~~

Rows are newest first.

Important filter semantics:

- data, meta.total, and meta.lastPage use the full filter set: date range,
  search, and selected result.
- meta.resultCounts ignores the selected result so every exception chip remains
  informative. It still respects date range and search.
- meta.openCount also ignores the selected result and respects date range and
  search. It is the count of matching exceptions that have no BARRIER_OPENED
  timeline entry.
- resultCounts always includes all five exception keys with numeric values,
  including zeroes.

Recommended chip behavior: render resultCounts as clickable filters, visually
mark the selected chip, retain the current search and dates, and leave the
counts unchanged when a chip is selected.

## 4. Peak Hours

~~~
GET /reports/peak-hours?from=2026-06-15&to=2026-07-14
~~~

Query parameters:

| Parameter | Rules | Default |
| --- | --- | --- |
| from | Optional real YYYY-MM-DD | If alone, to is today |
| to | Optional real YYYY-MM-DD | If alone, range starts 29 calendar days earlier |

When both dates are omitted, the report covers today plus the preceding 29
calendar days.

~~~
type PeakHourBucket = {
  hour: number; // 0 through 23 in gate-local time
  label: string; // for example: 8 AM-9 AM
  totalGateEvents: number;
  verified: number;
  exceptions: number;
  manualOverrides: number;
};

type PeakHoursData = {
  period: {
    from: string;
    to: string;
  };
  generatedAt: string;
  summary: ReportSummary;
  hours: PeakHourBucket[]; // exactly 24 rows, 0 through 23
  peakHours: PeakHourBucket[]; // tied highest-volume rows; [] with no events
};
~~~

Render hours for the full distribution chart. peakHours can contain more than
one item because ties are intentional.

## Frontend completion checklist

- Use the four routes above with the existing authenticated API client.
- Render backend-built titles, labels, explanations, and date periods directly.
- Add KPI comparison text from summary.previous while handling null as
  "No earlier data" rather than calculating a delta.
- Add Daily Summary hourly throughput using the 24-row data array.
- Make Exception result counts interactive server-side filters and show
  search-wide openCount.
- Remove all disabled Export / CSV UI from Reports. No export API work is
  pending for this module.


# Reports API

This is the frontend contract for the RFID authorization reports pages. All endpoints are read-only and require an authenticated user:

```http
Authorization: Bearer <jwt>
```

The API returns ISO 8601 strings for every `Date` field after JSON serialization.

## Shared reporting rules

- Calendar dates use the gate/server's local timezone, matching the existing dashboard. Do not convert `YYYY-MM-DD` query values to UTC before sending them.
- Every recorded gate event is counted on its `occurredAt` calendar day, even if it is still open. This preserves the actual arrival/authorization-attempt date.
- `openEvents` means there is no `BARRIER_OPENED` timeline event yet. Open events count in total volume and in their current result, but never contribute to `avgPassTime.sampleSize`.
- `MANUAL_OVERRIDE` is an approved operational action. It is counted as `manualOverrides`, but is not an exception and never appears in the Exceptions Report.
- An exception is exactly one of: `UNKNOWN_TAG`, `FACE_MISMATCH`, `PLATE_MISMATCH`, `DENIED`, or `ERROR`.
- Date ranges are inclusive at both ends. Internally the API uses an exclusive next-day boundary, so a `to=2026-07-14` range includes all events on July 14.
- If only `from` is supplied, `to` defaults to today. If only `to` is supplied, `from` is calculated by going back the endpoint's default number of calendar days.
- Invalid dates return `400`. `from` must not be later than `to`.

## Response envelope

For Daily Summary, Monthly Breakdown, and Peak Hours, successful responses have this shape:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {}
}
```

Exceptions is paginated, so its successful response puts the array in `data` and pagination/range data in top-level `meta`:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": [],
  "meta": {}
}
```

## Shared types

`ReportSummary` is returned by the daily, monthly, and peak-hours endpoints.

```ts
type GateEventResult =
  | 'VERIFIED'
  | 'UNKNOWN_TAG'
  | 'FACE_MISMATCH'
  | 'PLATE_MISMATCH'
  | 'MANUAL_OVERRIDE'
  | 'DENIED'
  | 'ERROR';

type ReportSummary = {
  totalGateEvents: number;
  verified: number;
  exceptions: number;
  manualOverrides: number;
  openEvents: number;
  verificationRate: number; // 0–100, rounded to one decimal
  avgPassTime: {
    milliseconds: number | null;
    sampleSize: number;
  };
  resultCounts: Record<GateEventResult, number>;
};
```

`resultCounts` always includes all seven result keys with numeric values, including zeroes. `verificationRate` is `verified / totalGateEvents`; it is `0` when there are no events.

## Daily Summary

```http
GET /reports/daily-summary?date=2026-07-14
```

`date` is optional, must be a real `YYYY-MM-DD` date, and defaults to today.

```ts
type DailySummaryData = {
  date: string; // YYYY-MM-DD actually reported
  title: string; // e.g. "Daily Gate Summary — Tuesday, July 14, 2026"
  generatedAt: string;
  summary: ReportSummary;
};
```

Use `title` directly in the page header; the frontend does not need to format a report title itself.

## Monthly Breakdown

```http
GET /reports/monthly-breakdown?month=2026-07
```

`month` is optional, must be `YYYY-MM` with a month from `01` through `12`, and defaults to the current month.

```ts
type MonthlyBreakdownData = {
  month: string; // YYYY-MM actually reported
  generatedAt: string;
  summary: ReportSummary; // totals for the full month
  days: Array<{
    date: string; // YYYY-MM-DD
  } & ReportSummary>;
};
```

`days` is ordered ascending and includes every day in the month, including zero-event days. Use it directly for daily charts or a month table. This endpoint only aggregates `GateEvent` records.

## Exceptions Report

```http
GET /reports/exceptions?from=2026-07-08&to=2026-07-14&page=1&limit=20
```

Query parameters:

| Parameter | Rules | Default |
| --- | --- | --- |
| `from` | Optional `YYYY-MM-DD` | Seven-day window start when `to` is also omitted; otherwise see shared rules |
| `to` | Optional `YYYY-MM-DD` | Today when `from` is supplied |
| `page` | Positive integer | `1` |
| `limit` | Integer from `1` to `50` | `20` |

If neither date is supplied, the response covers today and the preceding six calendar days.

```ts
type ExceptionResult =
  | 'UNKNOWN_TAG'
  | 'FACE_MISMATCH'
  | 'PLATE_MISMATCH'
  | 'DENIED'
  | 'ERROR';

type ExceptionReportItem = {
  id: string; // Use for GET /transactions/:id when opening the detail screen
  eventCode: string;
  occurredAt: string;
  result: ExceptionResult;
  reason: string; // Backend-built display explanation
  plateRead: string | null;
  rfidTag: { epcId: string; status: string } | null;
  truck: { id: string; plateNumber: string; model: string } | null;
  driver: { id: string; firstName: string; lastName: string } | null;
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
  period: { from: string; to: string };
  resultCounts: Record<ExceptionResult, number>;
};
```

Rows are newest first. `resultCounts` contains only the five exception result keys and is calculated across the full selected date range, not just the current page.

## Peak Hours

```http
GET /reports/peak-hours?from=2026-06-15&to=2026-07-14
```

`from` and `to` are optional real `YYYY-MM-DD` dates. When neither is supplied, the report covers today and the preceding 29 calendar days.

```ts
type PeakHourBucket = {
  hour: number; // 0–23 in gate/server local time
  label: string; // e.g. "8 AM–9 AM"
  totalGateEvents: number;
  verified: number;
  exceptions: number;
  manualOverrides: number;
};

type PeakHoursData = {
  period: { from: string; to: string };
  generatedAt: string;
  summary: ReportSummary;
  hours: PeakHourBucket[]; // exactly 24 rows, sorted 0 through 23
  peakHours: PeakHourBucket[]; // all tied highest-volume hours; [] when no events exist
};
```

Render `hours` for the full hourly chart. Use `peakHours` for a summary card; multiple rows are intentional when two or more hours tie for the highest volume.

# User Management — Frontend Implementation Guide

Everything needed to build the User Management screens against the Eagle Cement backend. This document is self-contained: you do not need to read the backend source.

Backend: NestJS + Prisma + PostgreSQL. Auth is stateless JWT (Bearer).

---

## 1. Connection basics

| Item | Value |
| --- | --- |
| Base URL | `http://<host>:<port>/api/v1` (global prefix `api`, URI version `v1`) |
| Default dev port | `8000` (`PORT` in the backend `.env`) |
| Default allowed CORS origin | `http://localhost:4200` |
| Allowed CORS headers | `Content-Type`, `Authorization`, `x-api-key` |
| Allowed CORS methods | `GET`, `HEAD`, `PUT`, `PATCH`, `POST`, `DELETE`, `OPTIONS` |
| `credentials` | `true` (but auth uses the `Authorization` header, not cookies) |
| Auth header | `Authorization: Bearer <accessToken>` |
| Rate limit | 100 requests / 60s per IP, global. Exceeding it returns **429** |

Every path in this document is relative to the base URL. `POST /users` means `POST http://localhost:8000/api/v1/users`.

All `Date` fields serialize to **ISO 8601 strings** (`"2026-08-05T04:21:09.412Z"`).

---

## 2. Access control — read this first

**Every `/users` endpoint requires role `SUPER_ADMIN`.** There is no read-only tier. An authenticated `ADMIN` or `OPERATOR` gets `403` on all six routes, including the `GET`s.

Practical consequences for the UI:

- Show the "User Management" nav entry **only** when the signed-in user's `role === 'SUPER_ADMIN'`. Do not render it and let the API reject — that produces a screen full of 403s.
- Guard the route itself too (route guard / middleware), not just the nav item.
- Do not use `GET /users` anywhere else in the app (e.g. to resolve a name for an audit-log actor) unless you are certain the viewer is a `SUPER_ADMIN`.

The three roles:

| Role | Meaning |
| --- | --- |
| `SUPER_ADMIN` | Full user management. The only role that can call `/users`. |
| `ADMIN` | Default role assigned when `role` is omitted on create. |
| `OPERATOR` | Gate operator. |

Note: at present the other modules (drivers, trucks, rfid-tags, transactions, dashboard, reports, audit-logs) only require a **valid JWT** — they do not check role. So today the role field mainly gates user management. Do not build product logic that assumes `OPERATOR` is blocked elsewhere.

---

## 3. Response envelope

### Success (single object)

Every non-paginated success is wrapped by a global interceptor:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": { }
}
```

`message` is the literal string `"Success"` on every 2xx. It is never a useful human message — do not display it.

### Success (paginated list)

`GET /users` hoists pagination to a top-level `meta`:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": [ ],
  "meta": { "total": 42, "page": 1, "limit": 10, "lastPage": 5 }
}
```

### Error

Every error — validation, auth, business rule, or crash — comes back in this shape from a global exception filter:

```json
{
  "statusCode": 409,
  "message": "Email already in use",
  "error": "Conflict",
  "path": "/api/v1/users",
  "timestamp": "2026-08-05T04:21:09.412Z"
}
```

**`message` is `string | string[]`.** It is a `string[]` for DTO validation failures (400) and a `string` for everything else. Your error handler must normalize both:

```ts
const toMessages = (message: string | string[]): string[] =>
  Array.isArray(message) ? message : [message];
```

The backend error strings are English and written for operators. They are safe to surface directly, or map them to localized copy using the tables in section 6.

### Status codes used

| Code | When |
| --- | --- |
| `200` | Successful `GET` and `PATCH` |
| `201` | Successful `POST` (**including `POST /auth/login`** — it is 201, not 200) |
| `400` | DTO validation failed, malformed UUID, or empty update body |
| `401` | Missing / malformed / expired token |
| `403` | Authenticated but not `SUPER_ADMIN`, or a blocked business action |
| `404` | User id does not exist |
| `409` | Email already taken, or updating an archived user |
| `429` | Rate limit exceeded |
| `500` | Unhandled server error |

---

## 4. Authentication flow

### `POST /auth/login`

No auth header. Returns **201**.

```jsonc
// request
{ "email": "super@eaglecement.com", "password": "password123" }
```

`email` is trimmed and lowercased server-side; both fields are required and non-empty.

```jsonc
// response 201
{
  "statusCode": 201,
  "message": "Success",
  "data": {
    "id": "b3d2f1a0-1111-4222-8333-444455556666",
    "email": "super@eaglecement.com",
    "firstName": "Super",
    "lastName": "Admin",
    "role": "SUPER_ADMIN",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

Failure is always `401` with `"Invalid email or password"` — the same message for an unknown email, a wrong password, **and an archived account**. Never tell the user which one it was; the backend deliberately does not.

**Token lifetime is 30 days.** There is no refresh endpoint and no logout endpoint. Logging out = discarding the token client-side.

### `GET /auth/me`

Requires the Bearer token. Returns the current user as a `User` object (section 5) — same shape the `/users` endpoints return.

```jsonc
{ "statusCode": 200, "message": "Success", "data": { /* User */ } }
```

Returns `401` `"User no longer exists"` if the account was deleted **or archived** since the token was issued.

**Call `/auth/me` on app boot.** You need `data.id` and `data.role` for:

- gating the User Management route (`role === 'SUPER_ADMIN'`),
- disabling self-destructive actions in the UI (section 7) — the API rejects them, but the button should be disabled before the user clicks it.

> ⚠️ **Known backend limitation.** JWTs are not checked against the database on every request. Archiving a user blocks future logins and makes `/auth/me` return 401, but that user's **already-issued token keeps working on other modules until it expires (up to 30 days).** Treat a 401 from `/auth/me` as a forced logout, and don't promise the operator that "archive" instantly kicks someone out of the system.

---

## 5. Core types

```ts
type Role = 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR';

/** The only user shape the API ever returns. `password` is never included. */
type User = {
  id: string;                 // uuid v4
  firstName: string | null;   // nullable
  lastName: string | null;    // nullable
  email: string;              // always lowercase, unique
  role: Role;
  isArchived: boolean;
  createdAt: string;          // ISO 8601
  updatedAt: string;          // ISO 8601
};

type ApiResponse<T> = {
  statusCode: number;
  message: string;
  data: T;
};

type PaginationMeta = {
  total: number;     // rows matching the filter, across all pages
  page: number;      // echo of the requested page
  limit: number;     // echo of the requested limit
  lastPage: number;  // Math.ceil(total / limit) — 0 when total is 0
};

type PaginatedApiResponse<T> = ApiResponse<T[]> & { meta: PaginationMeta };

type ApiError = {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
};
```

`firstName` and `lastName` are **both nullable**. Build the display name defensively:

```ts
const displayName = (user: User): string =>
  [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email;
```

`/auth/me` and all `/users` endpoints return this exact same `User` shape — use one type across the app.

---

## 6. Endpoints

All six require `Authorization: Bearer <token>` **and** `role === 'SUPER_ADMIN'`.

### 6.1 Create user

```http
POST /users
Content-Type: application/json
```

```jsonc
{
  "firstName": "Juan",        // optional, max 100 chars
  "lastName": "Dela Cruz",    // optional, max 100 chars
  "email": "juan@example.com",// REQUIRED, valid email; trimmed + lowercased server-side
  "password": "password123",  // REQUIRED, min 8 chars
  "role": "OPERATOR"          // optional; omit to get "ADMIN"
}
```

Returns **201** with the created `User`.

- Omitting `role` creates an **`ADMIN`**.
- Creating another `SUPER_ADMIN` **is allowed** here (it is the recovery path if the sole super admin is lost). This is the *only* way to make a `SUPER_ADMIN` — `PATCH` can never promote one.
- The user can log in immediately with the password you set. There is no invite email, no activation step, and no "must change password on first login" flag. Whoever creates the account must communicate the password out-of-band.

| Code | `message` | Cause |
| --- | --- | --- |
| `400` | `string[]` of field errors | See validation table below |
| `401` | `"Unauthorized"` | Missing / invalid / expired token |
| `403` | `"Insufficient role"` | Caller is not `SUPER_ADMIN` |
| `409` | `"Email already in use"` | Email is taken (including by an **archived** user) |

### 6.2 List users

```http
GET /users?page=1&limit=10&search=juan&role=OPERATOR&includeArchived=false
```

| Param | Rules | Default |
| --- | --- | --- |
| `page` | Integer ≥ 1 | `1` |
| `limit` | Integer 1–50 (**hard max 50**) | `10` |
| `search` | Free text | none |
| `role` | `SUPER_ADMIN` \| `ADMIN` \| `OPERATOR` | none (all roles) |
| `includeArchived` | The literal string `"true"` enables it | `false` |

Behaviour:

- **Sort order is fixed:** `createdAt` descending (newest first). Not configurable — do not build column-sort UI that expects the server to honour it.
- `search` is a case-insensitive *contains* match across `firstName`, `lastName`, and `email`, OR'd together. If the search string is a well-formed UUID it *also* matches `id` exactly — so pasting a user id from the audit log finds that user.
- An empty or whitespace-only `search` is ignored (no filter), not treated as "match nothing".
- `includeArchived` accepts only `"true"` (or a real boolean `true`). `"True"`, `"1"`, `"yes"` all evaluate to **`false` without an error**. Send the exact lowercase string.
- Filters combine with AND: `role=ADMIN&search=juan` returns admins matching "juan".
- `meta.total` counts everything matching the filter, not just the current page.
- **`meta.lastPage` is `0` when `total` is `0`.** Guard your paginator so it doesn't render "Page 1 of 0".

Returns **200**:

```jsonc
{
  "statusCode": 200,
  "message": "Success",
  "data": [ /* User[] */ ],
  "meta": { "total": 42, "page": 1, "limit": 10, "lastPage": 5 }
}
```

| Code | Cause |
| --- | --- |
| `400` | `page < 1`, `limit > 50`, non-numeric `page`/`limit`, invalid `role` value, unknown query param |
| `401` / `403` | As above |

### 6.3 Get one user

```http
GET /users/:id
```

`:id` must be a valid UUID. Returns **200** with the `User`.

**Archived users are returned by this endpoint** (unlike `/auth/me`). That is deliberate — the detail screen must stay reachable after archiving so the operator can restore the account. Check `data.isArchived` and render an archived banner.

| Code | `message` | Cause |
| --- | --- | --- |
| `400` | `"Validation failed (uuid is expected)"` | `:id` is not a UUID |
| `404` | `"User not found"` | No such user |
| `401` / `403` | — | As above |

### 6.4 Update user

```http
PATCH /users/:id
Content-Type: application/json
```

Every field is optional, but **at least one must be present**. Same validation rules as create.

```jsonc
{
  "firstName": "Juan",
  "lastName": "Dela Cruz",
  "email": "new@example.com",
  "password": "newpassword123",  // admin password reset — no current password required
  "role": "ADMIN"
}
```

Returns **200** with the updated `User`.

**Send only the fields that actually changed.** This is not cosmetic — see the `role` rules below and the gotchas in section 8.

| Code | `message` | Cause |
| --- | --- | --- |
| `400` | `string[]` of field errors | Validation failed |
| `400` | `"Validation failed (uuid is expected)"` | `:id` is not a UUID |
| `400` | `"At least one user field is required"` | Body was `{}` |
| `403` | `"Cannot promote a user to SUPER_ADMIN via this endpoint."` | `role: "SUPER_ADMIN"` in the body — **even if the target is already a `SUPER_ADMIN`** |
| `403` | `"Cannot change your own role."` | `:id` is the caller and `role` differs from their current role |
| `404` | `"User not found"` | No such user |
| `409` | `"Cannot update an archived user. Unarchive it first."` | Target is archived |
| `409` | `"Email already in use"` | New email belongs to another user |

Checks run in this order: exists → not archived → role rules → non-empty body. So archiving beats a bad role value in the error you get back.

Password reset semantics: a `SUPER_ADMIN` sets another user's password directly, with **no current-password confirmation**. There is no self-service "change my password" endpoint in this MVP — a user who forgets their password must ask a `SUPER_ADMIN` to reset it here.

### 6.5 Archive user

```http
PATCH /users/:id/archive
```

No body. Returns **200** with the user, `isArchived: true`.

This is a **soft delete**. There is no hard-delete endpoint for users. The row is kept, the email stays reserved, and the account can be restored.

Effects: the user can no longer log in (`401 "Invalid email or password"`), and `/auth/me` rejects their token. See the token-lifetime caveat in section 4.

| Code | `message` | Cause |
| --- | --- | --- |
| `400` | `"Validation failed (uuid is expected)"` | `:id` is not a UUID |
| `403` | `"Cannot archive your own account."` | `:id` is the caller |
| `404` | `"User not found"` | No such user |

Archiving an already-archived user succeeds idempotently with `200`.

### 6.6 Unarchive (restore) user

```http
PATCH /users/:id/unarchive
```

No body. Returns **200** with the user, `isArchived: false`. The account can log in again immediately with its existing password.

| Code | `message` | Cause |
| --- | --- | --- |
| `400` | `"Validation failed (uuid is expected)"` | `:id` is not a UUID |
| `404` | `"User not found"` | No such user |

No self-guard here — you cannot be archived and authenticated at the same time. Unarchiving an already-active user succeeds idempotently.

> Note the verb: user archive/restore is **`PATCH`** with `/unarchive`. Drivers and trucks use `POST /:id/archive` and `POST /:id/restore`. The API is inconsistent between modules — do not copy the driver/truck pattern here.

---

## 7. Validation rules and exact error strings

The backend uses a global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.

**`forbidNonWhitelisted: true` is the #1 source of surprise 400s.** Any property not in the DTO makes the whole request fail with `"property <name> should not exist"`. Never send `id`, `confirmPassword`, `createdAt`, `updatedAt`, `isArchived`, `fullName`, or a spread of the whole user object. Build the payload explicitly from the changed form fields.

Exact messages returned in the `message` array:

| Field | Rule | Message |
| --- | --- | --- |
| `firstName` / `lastName` | max 100 chars | `"firstName must be shorter than or equal to 100 characters"` |
| `firstName` / `lastName` | must be a string | `"firstName must be a string"` |
| `email` | valid email | `"email must be an email"` |
| `password` | min 8 chars | `"password must be longer than or equal to 8 characters"` |
| `password` | must be a string | `"password must be a string"` |
| `role` | valid enum | `"role must be one of the following values: SUPER_ADMIN, ADMIN, OPERATOR"` |
| `page` | integer | `"page must be an integer number"` |
| `page` | ≥ 1 | `"page must not be less than 1"` |
| `limit` | ≤ 50 | `"limit must not be greater than 50"` |
| any | unknown property | `"property confirmPassword should not exist"` |

A missing required field triggers **multiple** messages at once (e.g. omitting `password` on create returns both the length and the string error). Render the array, or show the first entry per field.

Client-side rules to mirror so users get instant feedback:

- `email` — required on create, must look like an email. It is trimmed and lowercased server-side; mirror that in the input so the UI doesn't show a mismatch after save.
- `password` — required on create, min 8 characters. No complexity requirement is enforced by the backend.
- `firstName` / `lastName` — optional, max 100. Whitespace is trimmed server-side.
- `role` — a select limited to the three enum values.

---

## 8. Business rules → UI behaviour

These are enforced server-side. Mirror them in the UI so the operator never hits an avoidable error.

| Rule | API behaviour | What the UI should do |
| --- | --- | --- |
| Cannot archive yourself | `403 "Cannot archive your own account."` | Disable/hide the Archive action on the row where `user.id === currentUser.id`. Tooltip: "You cannot archive your own account." |
| Cannot change your own role | `403 "Cannot change your own role."` | Disable the Role select when editing yourself. |
| Cannot promote to `SUPER_ADMIN` via edit | `403 "Cannot promote a user to SUPER_ADMIN via this endpoint."` | Remove `SUPER_ADMIN` from the Role options in the **edit** form. Keep it in the **create** form. |
| Editing an existing `SUPER_ADMIN` | Same 403 if `role: "SUPER_ADMIN"` is sent, even unchanged | When editing a `SUPER_ADMIN`, either omit `role` from the payload entirely, or offer only demotion options (`ADMIN`, `OPERATOR`). |
| Cannot edit an archived user | `409 "Cannot update an archived user. Unarchive it first."` | Hide the Edit action on archived rows; offer Restore instead. |
| Email is unique across active **and archived** users | `409 "Email already in use"` | On 409, focus the email field with an inline error. Suggest searching with `includeArchived=true` — the email may belong to an archived account that should be restored instead. |
| Archived users are hidden by default | Absent from `GET /users` unless `includeArchived=true` | Provide a "Show archived" toggle; otherwise Restore is unreachable. |
| Soft delete only | No delete endpoint exists | Label the action **Archive**, not Delete. Do not promise data removal. |

Send-only-changed-fields is the safest default payload strategy, and it makes the `SUPER_ADMIN` edge cases disappear:

```ts
const buildUpdatePayload = (form: UserForm, original: User): UpdateUserPayload => {
  const payload: UpdateUserPayload = {};
  if (form.firstName !== (original.firstName ?? '')) payload.firstName = form.firstName;
  if (form.lastName !== (original.lastName ?? '')) payload.lastName = form.lastName;
  if (form.email.trim().toLowerCase() !== original.email) payload.email = form.email;
  if (form.role !== original.role) payload.role = form.role;
  if (form.password) payload.password = form.password; // only when the reset field is filled
  return payload;
};
```

If the result is `{}`, skip the request entirely — the API would answer `400 "At least one user field is required"`.

---

## 9. Suggested screens

### 9.1 User list (`/users`)

- **Table columns:** Name (`displayName`, with email as a secondary line), Email, Role badge, Status badge (`Active` / `Archived` from `isArchived`), Created (`createdAt`), Actions.
- **Toolbar:** debounced search input (~300 ms) → `search`; Role dropdown (All + 3 roles) → `role`; "Show archived" toggle → `includeArchived`; "Add User" button.
- **Pagination:** server-side. Page size options must not exceed **50**. Reset `page` to 1 whenever `search`, `role`, or `includeArchived` changes, otherwise you can land on an out-of-range page and get an empty table.
- **Row actions:** Edit (hidden when archived), Archive (hidden for self and for already-archived), Restore (only when archived).
- **Empty states:** distinguish "no users yet" (`total === 0` with no filters) from "no results" (`total === 0` with filters) and offer a Clear Filters action for the latter.
- **Sync the filters to the URL query string** so a refresh or a shared link keeps the view.

### 9.2 Create user (modal or `/users/new`)

Fields: First name, Last name, Email, Password, Role (all three values, default `ADMIN`).

Optional convenience: a "generate password" button plus copy-to-clipboard, since the creator must deliver the password manually. Warn that the password is shown only once in the UI — the API never returns it again.

On success: close, toast `"User created"`, refresh the list.

### 9.3 Edit user (modal or `/users/:id/edit`)

Fields: First name, Last name, Email, Role (**`SUPER_ADMIN` excluded**; whole control disabled when editing yourself), and a separate "Reset password" field that is blank by default and only sent when filled.

Do not preload a fake password value into the form.

On success: toast `"User updated"`, refresh the row.

### 9.4 User detail (`/users/:id`)

Header with display name, email, role badge, status badge. An archived banner with a Restore button when `isArchived` is true. Optionally an Activity tab (section 10).

### 9.5 Archive / Restore confirmation

Archive dialog: "Archive **{name}**? They will no longer be able to sign in. You can restore this account later." Confirm button label: **Archive**.

Restore dialog: "Restore **{name}**? They will be able to sign in again with their existing password."

---

## 10. Optional: activity history

Every user mutation writes an audit record. The audit endpoint needs only a **valid JWT** (no role check), so it is safe to use anywhere.

```http
GET /audit-logs?entityType=User&entityId=<userId>&page=1&limit=10
```

Also filterable by `actorId` and `action`. Same `PaginationMeta` envelope as `/users`.

```ts
type AuditLog = {
  id: string;
  actorId: string | null;   // the SUPER_ADMIN who performed it
  action: string;
  entityType: string;       // "User" for these
  entityId: string;         // the affected user's id
  metadata: unknown | null;
  createdAt: string;
};
```

Actions and their `metadata` payloads for users:

| `action` | `metadata` |
| --- | --- |
| `CREATE_USER` | `{ "email": "juan@example.com", "role": "ADMIN" }` |
| `UPDATE_USER` | `{ "fields": ["email", "password"] }` — field **names** only, never values |
| `ARCHIVE_USER` | `null` |
| `UNARCHIVE_USER` | `null` |

`UPDATE_USER` metadata lets you render "Password was reset" without ever exposing the value. `actorId` is a raw UUID — resolving it to a name requires `GET /users/:id`, which is `SUPER_ADMIN`-only, so only render actor names on screens already restricted to super admins.

---

## 11. Reference client

Framework-agnostic TypeScript. Adapt to your HTTP layer; the important parts are the envelope unwrapping and the error normalization.

```ts
const BASE_URL = 'http://localhost:8000/api/v1';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly messages: string[],
    readonly error: string,
  ) {
    super(messages[0] ?? error);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('accessToken');

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const raw = (body as ApiError | null)?.message ?? 'Request failed';
    throw new ApiRequestError(
      response.status,
      Array.isArray(raw) ? raw : [raw],
      (body as ApiError | null)?.error ?? 'Error',
    );
  }

  return body as T;
}

// ---- payload types -------------------------------------------------------

export type CreateUserPayload = {
  firstName?: string;
  lastName?: string;
  email: string;
  password: string;
  role?: Role;
};

export type UpdateUserPayload = Partial<CreateUserPayload>;

export type ListUsersParams = {
  page?: number;
  limit?: number;          // max 50
  search?: string;
  role?: Role;
  includeArchived?: boolean;
};

// ---- endpoints -----------------------------------------------------------

export const usersApi = {
  create: (payload: CreateUserPayload) =>
    request<ApiResponse<User>>('/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then((res) => res.data),

  list: (params: ListUsersParams = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.search?.trim()) query.set('search', params.search.trim());
    if (params.role) query.set('role', params.role);
    if (params.includeArchived) query.set('includeArchived', 'true');

    return request<PaginatedApiResponse<User>>(`/users?${query.toString()}`);
  },

  getById: (id: string) =>
    request<ApiResponse<User>>(`/users/${id}`).then((res) => res.data),

  update: (id: string, payload: UpdateUserPayload) =>
    request<ApiResponse<User>>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }).then((res) => res.data),

  archive: (id: string) =>
    request<ApiResponse<User>>(`/users/${id}/archive`, { method: 'PATCH' }).then((res) => res.data),

  unarchive: (id: string) =>
    request<ApiResponse<User>>(`/users/${id}/unarchive`, { method: 'PATCH' }).then((res) => res.data),
};

export const authApi = {
  login: (email: string, password: string) =>
    request<ApiResponse<AuthResult>>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }).then((res) => res.data),

  me: () => request<ApiResponse<User>>('/auth/me').then((res) => res.data),
};

type AuthResult = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: Role;
  accessToken: string;
};
```

Note `list` returns the **whole** response (it needs `meta`), while the others unwrap to `.data`.

---

## 12. Gotcha checklist

Verify each before calling the module done:

- [ ] User Management route and nav item gated on `role === 'SUPER_ADMIN'`.
- [ ] `POST /auth/login` handled as **201**, not 200.
- [ ] Error `message` handled as `string | string[]`.
- [ ] No extra properties in any request body (`forbidNonWhitelisted` → 400).
- [ ] Update payload contains only changed fields; skipped entirely when empty.
- [ ] `role` omitted from the edit payload when it did not change (avoids the `SUPER_ADMIN` 403).
- [ ] `SUPER_ADMIN` removed from the edit-form role options, kept in create.
- [ ] Role select disabled when editing yourself.
- [ ] Archive action hidden/disabled on your own row.
- [ ] Edit hidden on archived rows; Restore offered instead.
- [ ] `limit` never exceeds 50.
- [ ] `page` resets to 1 on any filter change.
- [ ] `meta.lastPage === 0` handled in the paginator.
- [ ] `includeArchived` sent as the exact lowercase string `"true"`.
- [ ] `firstName` / `lastName` treated as nullable everywhere.
- [ ] `GET /users/:id` returns archived users — render the archived state instead of assuming 404.
- [ ] 409 on email shown inline on the email field, with a hint that an archived account may hold it.
- [ ] Action labelled "Archive", never "Delete".
- [ ] 401 from any call triggers logout + redirect to login.
- [ ] 429 surfaces a "too many requests, try again shortly" message.
- [ ] Newly created passwords shown once, with a copy action and a warning.

---

## 13. Endpoint summary

| Method | Path | Role | Body | Returns |
| --- | --- | --- | --- | --- |
| `POST` | `/auth/login` | public | `{ email, password }` | `201` `AuthResult` |
| `GET` | `/auth/me` | any authenticated | — | `200` `User` |
| `POST` | `/users` | `SUPER_ADMIN` | `CreateUserPayload` | `201` `User` |
| `GET` | `/users` | `SUPER_ADMIN` | — | `200` `User[]` + `meta` |
| `GET` | `/users/:id` | `SUPER_ADMIN` | — | `200` `User` (archived included) |
| `PATCH` | `/users/:id` | `SUPER_ADMIN` | `UpdateUserPayload` | `200` `User` |
| `PATCH` | `/users/:id/archive` | `SUPER_ADMIN` | — | `200` `User` |
| `PATCH` | `/users/:id/unarchive` | `SUPER_ADMIN` | — | `200` `User` |
| `GET` | `/audit-logs` | any authenticated | — | `200` `AuditLog[]` + `meta` |

## 14. Not in this MVP

Do not design around these — the endpoints do not exist:

- Self-service password change (a user changing their own password with the current one). Password reset is `SUPER_ADMIN`-only via `PATCH /users/:id`.
- Forgot-password / email reset flow.
- Refresh tokens, token revocation, logout endpoint, or session listing.
- Hard delete.
- Bulk actions (bulk archive, CSV import/export).
- Avatars / profile photos for users. (Drivers and trucks have photo uploads; users do not.)
- Server-side sorting, or sorting by any field other than `createdAt` desc.
- Email notification on account creation.

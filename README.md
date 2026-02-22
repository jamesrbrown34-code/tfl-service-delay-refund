# TfL Service Delay Refund

Local-first Week 1 foundation for importing Oyster journey history and storing it in SQLite.

## What is in this repo

- `apps/api`: ASP.NET Core Minimal API that owns SQLite migrations and journey import/query endpoints.
- `apps/worker`: Playwright + TypeScript worker for human-in-the-loop login + journey scrape.
- `apps/web`: Minimal static UI that lists imported journeys from the API.
- `data/`: Runtime SQLite DB location (created automatically).

---

## 1) Prerequisites

### Required

- **.NET 8 SDK** (`dotnet --version`)
- **Node.js 22+ + npm** (`node --version`, `npm --version`)
- **Python 3** for serving the static UI (`python3 --version`)

### Useful (optional)

- `sqlite3` CLI for direct DB inspection (`sqlite3 --version`)

---

## 2) First-time setup

### 2.1 API dependencies

```bash
cd apps/api
dotnet restore
```

### 2.2 Worker dependencies

```bash
cd apps/worker
npm install
npx playwright install chromium
```

> If your environment blocks npm registry access, run these commands from a machine/network that allows package downloads.

---

## 3) Running the Week 1 ingestion flow

Open **3 terminals**.

### Terminal A — Start API

```bash
cd apps/api
dotnet run
```

Expected:
- API available on `http://localhost:5080`
- DB auto-created at `data/tfl-delay-refund.db`
- Migration `001_init.sql` auto-applied on startup

Quick check:

```bash
curl http://localhost:5080/health
```

Should return JSON like:

```json
{"status":"ok"}
```

### Terminal B — Start Web UI

```bash
cd apps/web
python3 -m http.server 4173
```

Open: `http://localhost:4173`

### Terminal C — Run Worker Import

```bash
cd apps/worker
npm run import
```

Worker behavior:
1. Opens a **headed** Chromium browser to Oyster.
2. Waits for **manual login + SMS 2FA**.
3. Navigates to journey history.
4. Parses rows and posts to `POST /journeys/import`.
5. Writes browser state to `apps/worker/storage-state.json`.

After worker completes, refresh the web page to see imported journeys.

---

## 4) API endpoints (current)

### Health

- `GET /health`

### List journeys

- `GET /journeys`
- Returns up to 500 rows, newest first.

### Import journeys

- `POST /journeys/import`
- Request body: array of journey records

Example:

```bash
curl -X POST http://localhost:5080/journeys/import \
  -H "Content-Type: application/json" \
  -d '[
    {
      "id":"test-1",
      "oysterCardId":"primary",
      "startStation":"Paddington",
      "endStation":"Oxford Circus",
      "startedAt":"2026-02-21T08:00:00Z",
      "endedAt":"2026-02-21T08:25:00Z",
      "fare":2.8,
      "rawSource":"manual seed"
    }
  ]'
```

---

## 5) Database procedures (SQLite)

DB file path (default):

```text
data/tfl-delay-refund.db
```

### 5.1 Open DB in sqlite3

```bash
sqlite3 data/tfl-delay-refund.db
```

### 5.2 List tables

```sql
.tables
```

### 5.3 Inspect journeys schema

```sql
.schema journeys
```

### 5.4 Query latest journeys

```sql
SELECT id, oyster_card_id, start_station, end_station, started_at_utc, ended_at_utc, fare, imported_at_utc
FROM journeys
ORDER BY started_at_utc DESC
LIMIT 20;
```

### 5.5 Count imported journeys

```sql
SELECT COUNT(*) AS total_journeys FROM journeys;
```

### 5.6 Delete all journey rows (keep table)

```sql
DELETE FROM journeys;
```

### 5.7 Reset DB completely

Stop API first, then:

```bash
rm -f data/tfl-delay-refund.db
```

Restart API to recreate DB and re-apply migrations.

### 5.8 Backup DB

```bash
cp data/tfl-delay-refund.db data/tfl-delay-refund.backup.db
```

---

## 6) Troubleshooting

### `dotnet: command not found`
Install .NET 8 SDK and rerun `dotnet restore` / `dotnet run`.

### Worker cannot install packages (`npm 403`)
This is usually environment policy or registry/network restriction. Use a network with npm registry access.

### Worker opens browser but imports 0 rows
Selectors in `apps/worker/src/index.ts` are currently a Week 1 scaffold and may need refinement against real Oyster history markup.

### Web page shows load error
Confirm API is running and reachable on `http://localhost:5080`.

---

## 7) Current limitations (Week 1 scaffold)

- Journey table parsing is intentionally conservative and placeholder-level.
- Session reuse exists (`storage-state.json`) but refresh/expiry handling is not yet implemented.
- Eligibility rules and claim submission are not in this slice.

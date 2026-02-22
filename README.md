# TfL Service Delay Refund

Local-first Week 1 foundation for importing Oyster journey history with a simplified **CSV-backed** MVP data store.

## What is in this repo

- `apps/api`: ASP.NET Core Minimal API that imports and serves journey records from CSV.
- `apps/worker`: Playwright + TypeScript worker for human-in-the-loop login + journey scrape.
- `apps/web`: Minimal static UI that lists imported journeys from the API.
- `data/`: Runtime CSV data location (created automatically).

---

## 1) Prerequisites

### Required

- **.NET 8 SDK** (`dotnet --version`)
- **Node.js 22+ + npm** (`node --version`, `npm --version`)

---

## C# solution layout

The API is wired into a standard C# solution file at the repository root:

- `tfl-service-delay-refund.sln`
- project: `apps/api/TflDelayRefund.Api.csproj`

Useful commands:

```bash
# restore all .NET projects in the solution
dotnet restore tfl-service-delay-refund.sln

# build all .NET projects in the solution
dotnet build tfl-service-delay-refund.sln

# run the API project
dotnet run --project apps/api/TflDelayRefund.Api.csproj
```

---

## 2) First-time setup

### 2.1 API dependencies (solution-based)

```bash
dotnet restore tfl-service-delay-refund.sln
```

### 2.2 Web dependencies

```bash
cd apps/web
npm install
```

### 2.3 Worker dependencies

```bash
cd apps/worker
npm install
npx playwright install chromium
```

> If your environment blocks npm registry access, run these commands from a machine/network that allows package downloads.

---

## 3) Running the Week 1 ingestion flow

Open **3 terminals**.

### Terminal A — Start API (via solution project)

```bash
dotnet run --project apps/api/TflDelayRefund.Api.csproj
```

Expected:
- API available on `http://localhost:5080`
- CSV store auto-created at `data/journeys.csv`

Quick check:

```bash
curl http://localhost:5080/health
```

Should return JSON like:

```json
{"status":"ok"}
```

### Terminal B — Start Web UI (Node)

```bash
cd apps/web
npm run start
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
- Records are upserted by `id` into `data/journeys.csv`

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

## 5) CSV procedures (MVP data store)

CSV file path:

```text
data/journeys.csv
```

### 5.1 View CSV header/rows

```bash
head -n 20 data/journeys.csv
```

### 5.2 Count imported rows (excluding header)

```bash
tail -n +2 data/journeys.csv | wc -l
```

### 5.3 Reset journey data

Stop API first, then:

```bash
rm -f data/journeys.csv
```

Restart API to recreate CSV with header.

### 5.4 Backup CSV

```bash
cp data/journeys.csv data/journeys.backup.csv
```

---

## 6) Troubleshooting

### `dotnet: command not found`
Install .NET 8 SDK and rerun `dotnet restore tfl-service-delay-refund.sln` / `dotnet run --project apps/api/TflDelayRefund.Api.csproj`.

### Worker cannot install packages (`npm 403`)
This is usually environment policy or registry/network restriction. Use a network with npm registry access.

### Worker opens browser but imports 0 rows
Selectors in `apps/worker/src/index.ts` are currently a Week 1 scaffold and may need refinement against real Oyster history markup.

### Web page shows load error
Confirm API is running and reachable on `http://localhost:5080`.
Also confirm the web server is running via `cd apps/web && npm run start`.

---

## 7) Current limitations (Week 1 scaffold)

- CSV storage is intentionally simple for MVP and not optimized for multi-user concurrency.
- Journey table parsing is intentionally conservative and placeholder-level.
- Session reuse exists (`storage-state.json`) but refresh/expiry handling is not yet implemented.
- Eligibility rules and claim submission are not in this slice.

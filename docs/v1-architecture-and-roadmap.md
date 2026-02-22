# V1 Architecture and 4-Week Build Plan

## 1) Product goal (V1)

Build a **local-first desktop workflow** that:
1. Opens Oyster web UI (`https://oyster.tfl.gov.uk/`) in a visible automated browser.
2. Lets the user complete login + 2FA manually.
3. Reads journeys for the maximum available history window (up to 8 weeks).
4. Calculates likely delay-refund eligibility (15+ minute delays).
5. Prepares and optionally submits claims through the existing TfL Oyster UI.

> Principle: use **human-in-the-loop automation**, not fully autonomous login.

---

## 2) Recommended stack (aligned to C# + TypeScript skills)

### Local MVP
- **Automation runner:** Node.js + TypeScript + Playwright
- **Local API/app logic:** ASP.NET Core Minimal API (C#)
- **Storage:** SQLite
- **UI for local use:** Next.js (or simple React + Vite)
- **Background jobs:** start with in-process scheduler; move to Hangfire/BullMQ later

### Why this split
- Playwright + TS gives fastest UI automation iteration.
- C# keeps domain/rules/business logic in your strongest backend language.
- SQLite avoids deployment friction in early iterations.

---

## 3) High-level architecture

```text
┌─────────────────────────────┐
│ Local Web UI (Next.js)      │
│ - Connect account session   │
│ - View parsed journeys      │
│ - Review claim candidates   │
│ - Approve submit            │
└──────────────┬──────────────┘
               │ HTTP
┌──────────────▼──────────────┐
│ API (ASP.NET Core)          │
│ - Orchestration             │
│ - Eligibility rules         │
│ - Audit log                 │
│ - Session metadata          │
└───────┬───────────┬─────────┘
        │           │
   SQLite DB   Task queue (later)
        │           │
┌───────▼───────────▼─────────┐
│ Playwright Worker (TS)      │
│ - Open browser in headed mode│
│ - Pause for manual 2FA      │
│ - Navigate Oyster pages     │
│ - Extract journeys          │
│ - Fill refund forms         │
└─────────────────────────────┘
```

---

## 4) Session and 2FA strategy

Because SMS 2FA is required:
1. Worker launches headed browser.
2. User logs in and enters SMS code manually.
3. Worker waits for authenticated marker (e.g., account dashboard element).
4. Persist encrypted browser storage state/cookies.
5. Reuse state for subsequent runs until expired; on expiry, prompt user again.

### Security requirements
- Never store plaintext password.
- Encrypt session state at rest.
- Add short TTL + easy “log out all sessions”.
- Keep an audit trail of every automated action.

---

## 5) Data model (minimal)

### Tables
- `users`
- `oyster_cards`
- `journeys`
- `expected_journey_times`
- `claim_candidates`
- `claims_submitted`
- `audit_events`
- `auth_sessions`

### Key fields to capture
- Journey start/end station, tap-in/out times, route hints, fare, source page timestamp.
- Expected duration (minutes), actual duration (minutes), delay minutes.
- Candidate status (`new`, `reviewed`, `approved`, `submitted`, `rejected`).

---

## 6) Eligibility rules engine (V1)

Implement deterministic rules in C#:
1. Match journey to expected duration record.
2. Compute `delay = actual_duration - expected_duration`.
3. Flag eligible if `delay >= 15`.
4. Exclude unsupported/ambiguous records (manual review queue).

### Source of expected durations
- Start with hardcoded curated table for frequent station pairs.
- Add an admin tool to update durations over time.
- Keep source provenance per row (`manual`, `tfl_site`, etc.).

---

## 7) Suggested repository structure

```text
tfl-service-delay-refund/
  README.md
  docs/
    v1-architecture-and-roadmap.md
    product-requirements.md
    selectors-and-ui-notes.md
  apps/
    web/                      # Next.js UI
    api/                      # ASP.NET Core API
    worker/                   # Playwright TS worker
  packages/
    contracts/                # shared DTOs / OpenAPI generated types
    rules-test-fixtures/      # sample journeys for rule testing
  infra/
    docker/
    scripts/
  data/
    seed/
```

---

## 8) 4-week delivery plan

## Week 1 — Foundations + data ingestion proof
- Bootstrap monorepo layout.
- Create API skeleton + SQLite migrations.
- Implement Playwright worker with:
  - launch browser (headed)
  - manual login checkpoint
  - navigate to journey history
  - parse and store journey rows
- Build minimal local UI page to list imported journeys.

**Exit criteria**
- A real Oyster account can complete login and import journeys for 8 weeks.

## Week 2 — Eligibility engine + review workflow
- Add expected journey duration table and seed.
- Implement eligibility engine and candidate generation.
- UI: add candidate review screen (approve/reject).
- Add audit log entries for import and candidate decisions.

**Exit criteria**
- User can review system-generated candidates with transparent delay math.

## Week 3 — Assisted claim submission
- Add worker flow to navigate refund claim UI and fill forms.
- Introduce dry-run mode (no submit click).
- Add “submit approved claims” with confirmation prompt.
- Add screenshot and trace capture per claim attempt.

**Exit criteria**
- End-to-end run from imported journeys to prepared (or submitted) claims.

## Week 4 — Hardening + packaging
- Retry/backoff strategy for flaky selectors.
- Session refresh and re-auth prompts.
- Better error taxonomy (site changes, auth expired, selector missing).
- Create local installer/dev scripts and docs.
- Add analytics dashboard (success rate, claims submitted, failures).

**Exit criteria**
- Stable local MVP usable repeatedly by one user.

---

## 9) Transition path: local → hosted web → Android

### Phase A (now): local single-user
- Everything runs on user machine.
- Best for legal/operational risk control.

### Phase B: hosted web app
- Host UI/API; keep automation workers isolated.
- User-triggered login sessions in controlled browser worker environment.
- Stricter compliance/privacy posture required.

### Phase C: Android app
- React Native client consuming same API.
- Keep browser automation server-side only.
- Mobile app handles review/approvals, not direct site automation.

---

## 10) Risks and mitigations

- **Risk:** Oyster UI changes break selectors.  
  **Mitigation:** selector registry, smoke tests, screenshot-on-failure.

- **Risk:** 2FA/session expiry interrupts automation.  
  **Mitigation:** explicit re-auth UX and resumable jobs.

- **Risk:** false positives in claim eligibility.  
  **Mitigation:** manual approval required before submit in V1.

- **Risk:** compliance/policy issues for automation.  
  **Mitigation:** review TfL terms, user-consented actions, conservative rate limits.

---

## 11) MVP “definition of done”

- User can connect account with manual 2FA.
- App imports recent journeys and stores them.
- App computes and displays delay eligibility >=15 mins.
- User can approve/reject candidates.
- App can fill claim forms and optionally submit with confirmation.
- Every operation is logged and debuggable.

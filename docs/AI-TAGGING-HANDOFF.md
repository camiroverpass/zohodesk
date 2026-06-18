# AI Ticket Auto-Tagging — Project Handoff

_Last updated: 2026-06-17. Repo: `Desktop/zohodesk` (Next.js 16 + shadcn). Resume from here._

## Goal & scope
Reduce repetitive CS/support work by AI-classifying Zoho Desk tickets into the `cf_problem`
field. Chosen from a broader onboarding+support automation brainstorm; **self-onboarding is
handled separately by the team and is out of scope here.**

Decision: **extend this `zohodesk` repo** (it already had the Zoho read + `bulkUpdateTicketProblem`
write + bulk-tag UI) rather than build new.

> **Note (2026-06-17):** the original "human-in-the-loop before any write" stance was **superseded** — see
> "Direction" below. Tickets now auto-tag themselves (mechanical rule + high-confidence AI); the dashboard
> is the oversight surface, not a required approval gate.

## Status (what's done)
- **Phase 0 — taxonomy:** ✅ Consolidated ~80 messy `cf_problem` values into **35 categories**.
- **Proof of accuracy:** ✅ Gold-set eval shows **high-confidence ≈ 90%+** on real tickets.
- **Phase 2 — dashboard UI:** ✅ AI-suggestion column built, compiles clean, validated live in browser.
- **Phase 1 — noise dedup pass:** ✅ mechanical rule built (`src/lib/dedup.ts`). See "Dedup — what the data said" below.
- **Auto-apply automation:** ✅ built + locally dry-run-verified. Mechanical rule + **all high-confidence** AI
  suggestions write automatically; medium/low fall through to the dashboard. Two entry points share one helper
  (`src/lib/autotag.ts`): **Vercel Cron** (`/api/cron/auto-tag`, the active path) and a **Zoho webhook**
  (`/api/zoho-webhook`, optional). **Not deployed yet** — see "Going live (Cron)".

### ⏭️ RESUME HERE (tomorrow, 2026-06-18)
All code is written, typechecks, lints, and the production build passes. **Nothing is committed to git.** The
only remaining work to make tickets self-tag is **deploy to Vercel** (first deploy for this repo — cami is new
to Vercel and Cron Jobs need a **Pro** plan). Steps in "Going live (Cron)". First decision tomorrow: **commit
the working tree** (Claude offered; cami hadn't answered), then deploy + `?dryRun=1` preview before going live.

## Direction (decided 2026-06-17)
The end goal is **tickets that tag themselves** — automation, not a dashboard someone has to open. The dashboard
is now the **oversight/correction** surface. Auto-apply aggressiveness = **mechanical rule + ALL high-confidence**
classifier output (occasional wrong tag on a real ticket is an accepted trade for killing manual labor). Both
entry points **never overwrite a ticket that already has a `cf_problem`** — idempotent, safe against clobbering
human work.

**Trigger = Vercel Cron (chosen for zero Zoho admin setup; ~5-min delay is fine).** A scheduled GET pulls recent
untagged tickets and tags them. A Zoho Desk **webhook** route also exists (real-time) for if/when someone with
Desk admin access wants instant tagging — both call the same `autoTagTicket()` helper. Cron is the active path.

## Dedup — what the data said (revised the original plan)
The handoff originally planned a **caller + time-window pairing** rule (lone "New Call" → Missed Follow-Up,
paired → Duplicate). `scripts/explore-pairs.mjs` over 1,500 recent tickets **refuted the lone→Missed mapping**:
- "New Call from Support Team -…" tickets are RingCentral auto-notifications. **~91% (100/110) are already
  human-tagged `Duplicate Ticket`;** the rest are TEST/Spam/mislabels.
- **`Missed Phone Call Follow-Up Email` never appears on them (0/110).** It lives on a *separate*
  `<Park> - Phone Call` ticket that CS creates/renames when they actually follow up.
- Lone notifications (same caller, days apart, no sibling in window) are **still tagged Duplicate** by CS.

So the time-window pairing added complexity *without* improving accuracy. The shipped rule is trivial:
**subject starts with "New Call from Support Team" → `Duplicate Ticket`** (`mechanicalTag()` in `src/lib/dedup.ts`).

## Key decisions (the "why")
1. **Category names = existing Zoho picklist values** (not new clean names) so AI suggestions write
   back without fragmenting the picklist. Only **`Codes`** is a brand-new value (must be added to the
   Zoho picklist before it can be written). See `src/lib/taxonomy.json`.
2. **`Codes`** = verification/login codes from integration platforms (e.g. Channex). Actionable —
   leave the ticket **OPEN**.
3. **OTA/channel booking notifications** (Vrbo, Hotels.com, Airbnb auto-messages) → **Spam**.
4. **Inbound marketing/sales pitches aimed AT RoverPass** → **Marketing** (not Spam).
5. **Park's own RoverPass subscription billing** (failed auto-payment on their plan, payment-info
   updates) → **Saas Subscription - update**. Payouts/camper payments at the park → **Payout Update/Issue**.
6. **Camper Cannot Complete Reservation** is a tracked booking bug — wins over generic **Bug**.
7. Several near-duplicate-looking labels are intentionally **kept separate** (CS uses them distinctly):
   Waivers ≠ Reports Issue; Account Check in / Review Complaint / Missed Phone Call Follow-Up Email /
   At Risk Check In / Training Call Follow-Up Email are all separate.

## Data findings
- 2,500-ticket tally: ~80 distinct values, **~27% are noise** (Spam 14%, Duplicate 10%, Test ~3%),
  **13.7% untagged**, top real category = Training/Feature Questions (17.6%).
- **Most tickets have EMPTY descriptions** (phone-call/auto tickets). Real content lives in Zoho
  conversation **threads** — now fetched via `fetchThreadSummaries()` / `enrichWithFirstThread()`.
- **"Agreement vs human tag" is a bad yardstick** (~35–44%) because the existing human tags are
  inconsistent and some are mislabeled. Use the **gold set** for real accuracy.

## Structural lessons (shape the design)
- **Duplicate / "New Call" can't be an LLM job** — needs a mechanical pass, not the classifier. ✅ Done.
  ⚠️ The *original theory* here (voicemail → 2 tickets; lone "New Call" → Missed-Follow-Up; distinguished by a
  sibling voicemail in a time window) turned out to be **wrong** — the data refuted it. See "Dedup — what the
  data said": the shipped rule is simply *New Call notification → Duplicate Ticket*, no pairing.
- **Confidence gate works:** high-confidence ≈ 90%+, low-confidence ≈ guessing. So: auto-apply
  high-confidence, route medium/low to human review.

## What was built (files)
**App (production code):**
- `src/lib/taxonomy.json` — canonical 35-category taxonomy + `legacyMapping` (old→new). Single source
  of truth; `description` fields are fed to the classifier.
- `src/lib/classify.ts` — server-only classifier. `claude-opus-4-8`, structured output
  (`output_config.format`), one call per ticket, bounded concurrency, retry+fallback.
- `src/lib/dedup.ts` — **mechanical** (non-LLM) rule: `isNewCallNotification()` / `mechanicalTag()`
  → New Call notifications get `Duplicate Ticket`. Pure functions; no API calls.
- `src/lib/zoho.ts` — `fetchThreadSummaries(ticketIds)` (first-thread content per ticket) and
  `getTicketById(id)` (single-ticket fetch; note the single GET rejects a `fields` param).
- `src/lib/autotag.ts` — **shared decision used by both entry points.** `autoTagTicket(ticket, {dryRun?})`:
  skip-if-tagged → mechanical rule → classify + auto-apply high-confidence, performing the write.
- `src/app/api/cron/auto-tag/route.ts` — **the active automation.** GET handler guarded by `CRON_SECRET`
  (Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; manual runs use `?token=`). Scans the 200 most
  recent tickets, takes ≤40 untagged, runs each through `autoTagTicket` (concurrency 5). `?dryRun=1` previews
  without writing. Returns a JSON summary (`scanned/untagged/tagged/skipped/errors` + per-ticket detail).
- `src/app/api/zoho-webhook/route.ts` — alternate real-time entry point (POST, verifies `ZOHO_WEBHOOK_SECRET`,
  fetches the ticket, calls `autoTagTicket`). Built + tested but **not the active trigger** (needs Zoho admin).
- `vercel.json` — `crons` entry: `/api/cron/auto-tag` every 5 min (`*/5 * * * *`).
- `src/proxy.ts` — added `/api/zoho-webhook` and `/api/cron` to `PUBLIC_PATHS` (Next 16 renamed middleware →
  **proxy**; it password-gates everything else). Both routes self-guard with their own secrets.
- `src/app/actions.ts` — `suggestTagsForTickets(tickets)` server action (read-only, caps at 60).
- `src/components/tickets-table.tsx` — "Suggest tags (AI)" button, "AI suggestion" column
  (category + confidence pill + per-row Apply), "Apply N high-confidence" bulk action.

**Analysis / eval scripts (Node, read-only unless noted):**
- `scripts/_classify.mjs`, `scripts/_zoho.mjs` — shared classifier + Zoho fetch/thread enrichment.
- `scripts/classify-sample.mjs [N]` — classify N recent tickets, print agreement vs human tags.
- `scripts/goldset-export.mjs [N]` — export tickets → `goldset.csv` for hand-labeling.
- `scripts/goldset-xlsx.mjs` — convert `goldset.csv` → `goldset.xlsx` with a dropdown on `gold_label`.
- `scripts/goldset-eval.mjs` — score AI vs hand labels (reads `goldset.xlsx` or `.csv`); reports
  accuracy by confidence + mismatches.
- `scripts/peek-tickets.mjs <ticket#s>` — dump subject+description for specific tickets.
- `scripts/explore-calls.mjs [N]` — channel/subject distribution + sample of call-like tickets.
- `scripts/explore-pairs.mjs [N] [windowH]` — the dedup analysis that revised the plan (crosstab of the
  pairing rule's prediction vs the existing human tag; global frequency of the Missed-Follow-Up tag).

**Docs:** `docs/problem-taxonomy.md` (taxonomy decisions — partly stale, predates the 35-cat expansion).

## How to run
```sh
# Dashboard (the live feature)
npm run dev            # localhost:3000 → log in with DASHBOARD_PASSWORD → filter to -None- → "Suggest tags (AI)"

# Re-measure accuracy
node scripts/goldset-export.mjs 50     # then fill gold_label
node scripts/goldset-xlsx.mjs          # optional: dropdown version
node scripts/goldset-eval.mjs          # scores AI vs your labels

# Quick sanity classify
node scripts/classify-sample.mjs 30
```

## Going live (Cron — the active path)
The cron route is built + tested (dry-run verified end-to-end: scanned 200 → 24 untagged → would-tag 10 → 0
errors, no writes). To turn it on:
1. **Deploy to Vercel.** Set these env vars in the deployment: `CRON_SECRET`, `ANTHROPIC_API_KEY`, and the
   `ZOHO_*` vars (`ZOHO_CLIENT_ID/SECRET/REFRESH_TOKEN/ORG_ID/DEPARTMENT_ID`). All are in `.env.local`
   locally (gitignored). Vercel auto-injects `Authorization: Bearer $CRON_SECRET` into cron requests.
2. `vercel.json` already schedules `/api/cron/auto-tag` every 5 min — Vercel picks it up on deploy.
3. **Preview before trusting:** hit `https://<deploy>/api/cron/auto-tag?dryRun=1&token=<CRON_SECRET>` to see
   exactly what it *would* tag without writing. Drop `dryRun=1` (or just let the schedule fire) to go live.
   Tuning knobs in the route: `SCAN_RECENT` (200), `MAX_PER_RUN` (40), `maxDuration` (60s; raise on Pro).
   Local smoke test used: `curl ".../api/cron/auto-tag?dryRun=1" -H "Authorization: Bearer $CRON_SECRET"`.

## Optional: Zoho webhook (real-time alternative)
Only if someone with **Zoho Desk admin** wants instant (not 5-min) tagging. In **Zoho Desk → Setup →
Automation → Workflows**, add a rule on **Tickets**, **on Create**, with a **Webhook** action: POST to
`https://<deploy>/api/zoho-webhook`, payload including the ticket id (handler reads `ticketId`/`id`/`ticket.id`),
header `x-webhook-token: <ZOHO_WEBHOOK_SECRET>`. Same `autoTagTicket` logic. Can run alongside the cron (both
skip already-tagged tickets, so no double-tagging).

## Gotchas / notes
- **Secrets:** `CRON_SECRET` (cron) and `ZOHO_WEBHOOK_SECRET` (webhook), both in `.env.local`. Both routes are
  in `proxy.ts` `PUBLIC_PATHS` so the dashboard password doesn't block them; the secrets are the only gate.
  Don't remove them from PUBLIC_PATHS.
- **Idempotency:** both entry points skip any ticket that already has a `cf_problem`. Safe to re-fire / run
  cron + webhook together (no double-tagging).
- **Auto-apply scope is "all high-confidence"** per the 2026-06-17 decision — including real (non-noise)
  categories. To narrow it, edit the high-confidence gate in `src/lib/autotag.ts` (one place; both entry
  points inherit it) — e.g. only auto-apply noise categories and route the rest to dashboard review.
- **dryRun:** `autoTagTicket(ticket, {dryRun:true})` and `/api/cron/auto-tag?dryRun=1` compute decisions
  without writing — use to preview after any rule/taxonomy change.
- **API key:** `ANTHROPIC_API_KEY` lives in `.env.local` (reused from centcom's Render env). There is
  no separate Anthropic Console account for this email — the API platform is separate from Claude Code.
- **Per-ticket, not batched:** batching made the model dedupe/under-produce. Classify one ticket per call.
- **Thinking is OFF** in the classifier (classification is simple + output is schema-constrained).
- **Garbled `reason` text:** the model sometimes returns broken reason sentences. The *category* is
  unaffected (enum-constrained); only the explanation looks bad. Fix before showing reasons to CS.
- **New deps added:** `@anthropic-ai/sdk`, `exceljs`.
- **Gitignored (customer content):** `goldset.csv`, `goldset.xlsx`.
- **Nothing committed to git yet** — all changes are in the working tree.

## Open roadmap (next, in value order)
1. **Deploy to Vercel with the env vars** (see "Going live"). The `vercel.json` cron then runs every 5 min —
   this is what turns the automation on. Everything else is built.
2. **Preview with `?dryRun=1`** against prod once deployed, then let it go live.
3. **Watch live accuracy for a few days** via the dashboard (oversight surface). If real-category mistakes
   are too frequent, narrow the auto-apply gate in `src/lib/autotag.ts` to noise-only.
4. **Add the `Codes` value to the Zoho picklist** (still required before the classifier can write it).
5. **Polish** — fix garbled `reason` text; refresh `docs/problem-taxonomy.md` to the 35-category reality.

~Done:~ mechanical dedup (`src/lib/dedup.ts`), shared `autoTagTicket` (`src/lib/autotag.ts`), and both
auto-apply entry points — Vercel Cron (`/api/cron/auto-tag` + `vercel.json`, active) and Zoho webhook
(`/api/zoho-webhook`, optional).

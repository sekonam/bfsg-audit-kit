# bfsg-audit-kit

Internal delivery tooling for a German accessibility consulting practice: crawl a shop, scan it
against **WCAG 2.1 AA / EN 301 549**, produce a German audit report and a
**Barrierefreiheitserklärung** (accessibility statement per BFSGV Anlage 3), and watch for
regressions.

> **This is not a product.** It is not a SaaS, not multi-tenant, and it has no billing, accounts
> or subscriptions — deliberately. That half of the market is already sold by BFSG-Guard
> (€49–99/month), AccessGO (€39/month) and Eye-Able (3,000+ customers). The billable value is the
> ~43% of WCAG criteria a machine cannot check, done by a person. This repo automates the other,
> non-billable 90% of the work: prospecting, scanning, reporting, statement generation.
> Background: `docs/PRODUCT-SPEC.md`.

## Hard constraints, enforced in code

| Constraint                                                                  | How it is enforced                                                                                                                                       |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Politeness** — robots.txt, 1 req / 2 s / host, identified bot, ≤ 20 pages | `src/core/crawl/policy.ts`; the crawler **refuses to start without `BFSG_CONTACT_URL`**; every non-default value must be passed explicitly and is logged |
| **RDG boundary** — technical conformance only, never legal consequences     | Scope note rendered into every report and statement; `test/report.rdg.test.ts` fails the build if forbidden phrasing appears                             |
| **§ 7 Abs. 2 UWG** — no cold email to German businesses                     | **No email capability exists.** `scripts/guard-no-email.sh` fails CI if a mail transport is added. Outreach is telephone and post only                   |
| **GDPR**                                                                    | Art. 30 record and Art. 14 notice in `docs/`; the prospect store keeps a source and a collection date per record                                         |

## Quick start

```bash
pnpm install
pnpm exec playwright install chromium
cp .env.example .env      # BFSG_CONTACT_URL is required
pnpm run cli doctor       # validates config and politeness settings
```

### Commands

```bash
bfsg doctor                                   # config + politeness self-check
bfsg scan    <url> [--out dir] [--pdf]        # crawl + axe + Lighthouse → scan.json + report
bfsg report  <scan.json> [--pdf]              # German HTML (+ PDF) audit report
bfsg statement <answers.json> [--pdf]         # Barrierefreiheitserklärung (Anlage 3)
bfsg baseline <scan.json>                     # store the scan as the monitoring baseline
bfsg monitor <url>                            # re-scan, diff against baseline, regression report
bfsg rank    [dir]                            # prospect ranking across stored scans
```

`monitor` exits **2** on a regression. That is the notification mechanism — there is no email
channel and there will not be one.

There is no `send`, `mail` or `notify` command, and a test asserts that `--help` never grows one.

All customer-facing output is **German**. Code, tests and internal docs are English.

## Development

```bash
pnpm run verify   # format:check + lint + typecheck + test:coverage + build
```

Coverage floor is **80 % on `src/core/**`** (crawl policy, normalisation, scoring, rendering,
diffing) and CI fails below it. No test makes a live network call: everything is scanned from
fixtures in `test/fixtures/` served by a local HTTP server.

**Never point the crawler at a live third-party shop during development.** The politeness rules
exist precisely to prevent that.

## Repository map

| Path             | Contents                                                                             |
| ---------------- | ------------------------------------------------------------------------------------ |
| `src/core/`      | Pure logic: WCAG catalogue, normalisation, scoring, crawl policy, rendering, diffing |
| `src/adapters/`  | Impure edges: Playwright, axe, Lighthouse, PDF, HTTP                                 |
| `src/pipeline/`  | Crawl → scan → report → monitor orchestration                                        |
| `src/cli/`       | Commander CLI                                                                        |
| `docs/`          | Product/technical spec, roadmap, runbook, maintenance, promotion, GDPR paperwork     |
| `outreach/`      | German telephone script and postal letter — **drafts for human review**              |
| `test/fixtures/` | Synthetic shop pages used by every test                                              |

## Documentation

| Document                                          | Read it when                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `docs/PRODUCT-SPEC.md`                            | Deciding what to build, price or refuse. SKUs, competitor prices, the four decision gates. |
| `docs/TECHNICAL-SPEC.md`                          | Changing the crawler, the scoring model or the document generators.                        |
| `docs/RUNBOOK.md`                                 | Actually running an audit, start to finish, including the 🧑 manual half.                  |
| `docs/PROMOTION.md`                               | Approaching anyone. Agency white-label → telephone → post. Never email.                    |
| `docs/ROADMAP.md`                                 | What exists, what is deliberately absent, known limitations, remaining human steps.        |
| `docs/MAINTENANCE.md`                             | Upgrading axe-core or Playwright without silently invalidating every score.                |
| `docs/GDPR-ART30.md`, `docs/GDPR-ART14-NOTICE.md` | Before keeping any prospect data.                                                          |
| `CONTRIBUTING.md`                                 | Working in the tree. Includes "things that look like bugs and are not".                    |

## Status

Everything in `docs/ROADMAP.md` marked done is backed by a test or a file. Three human steps block
customer contact and no amount of code removes them: **a lawyer must read the Barrierefreiheits-
erklärung wording**, **a native German speaker must review the outreach drafts in `outreach/`**,
and **the market surveillance authority's contact details must be verified** for each statement.

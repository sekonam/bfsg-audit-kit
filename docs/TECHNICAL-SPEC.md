# TECHNICAL-SPEC

## 1. Shape

Node 22, TypeScript strict, ESM. One package, no monorepo — there is one operator and one
deliverable pipeline.

```
CLI  ──►  pipeline  ──►  core (pure)
                    └─►  adapters (impure: Playwright, axe, Lighthouse, PDF, HTTP)
```

The split is load-bearing for testability: **everything that decides anything lives in
`src/core` and is a pure function**. The browser only supplies bytes.

| Layer    | Path              | Rule                                                                       |
| -------- | ----------------- | -------------------------------------------------------------------------- |
| Core     | `src/core/**`     | No I/O, no network, no browser. 80% coverage floor, enforced in CI.        |
| Adapters | `src/adapters/**` | Thin wrappers over Playwright / axe / Lighthouse / Chromium PDF / `fetch`. |
| Pipeline | `src/pipeline/**` | Orchestration and file layout.                                             |
| CLI      | `src/cli/**`      | Commander, German output.                                                  |
| Config   | `src/config/**`   | Env + `.env`, validated through the crawl policy.                          |

## 2. Crawl

### 2.1 Three gates, in order, on every fetch

1. **robots.txt** (`src/core/crawl/robots.ts`) — RFC 9309 group selection: the most specific
   matching `User-agent` group wins, the longest matching rule wins within it, `Allow` breaks
   ties, `*` and `$` are supported, `Crawl-delay` is honoured.
   **A 4xx means "no robots.txt, everything allowed". A 5xx or a network failure means DENY ALL** —
   a server we cannot ask is a server we do not crawl.
2. **Page budget** — 20 per shop by default, decremented before the request is issued.
3. **Rate limit** (`src/core/crawl/rate-limit.ts`) — per host, 2000 ms. The limiter reserves its
   slot _before_ awaiting, so concurrent callers queue at 2 s spacing instead of racing. A site's
   own `Crawl-delay` can slow us down; it can never speed us up.

There is no code path through `src/pipeline/crawl.ts` that skips these.

### 2.2 Politeness policy as a type

`createPolicy()` (`src/core/crawl/policy.ts`) throws without an absolute http(s) contact URL, and
throws on any value _less polite_ than the default unless the caller passes
`override: { reason }`. The reason is stored on the policy and printed before every run and into
every report's methodology section. More polite values need no ceremony.

`User-Agent: BfsgAuditBot/0.1 (+<contact URL>)`.

### 2.3 Sampling

The queue is re-sorted on each iteration to prefer links whose URL classifies as a **critical
journey not yet sampled** (home → category → product → cart → checkout), then everything else.
After link discovery is exhausted, a small set of candidate paths (`/warenkorb`, `/cart`,
`/kasse`, `/checkout`, …) is tried for journeys a shop rarely links from its header — still
subject to all three gates.

**Template de-duplication** (`src/core/crawl/signature.ts`): pages are reduced to a sequence of
`tag.class` tokens with scripts, styles, comments and digit-bearing class names stripped, then
hashed with FNV-1a. Two product pages of the same template collapse to one sample; the duplicate
is recorded in `skipped` with the URL it matched, never silently dropped.

**Journey classification** (`src/core/crawl/journey.ts`) reads both German and English path
vocabulary and tolerates a file extension, because OXID and JTL shops still serve
`/warenkorb.html`. `/checkout/cart` is a cart, not a checkout.

**Fingerprinting** (`src/core/crawl/fingerprint.ts`): weighted signals over public markup and
response headers for Shopify, Shopify Hydrogen, Shopware 5 and 6, WooCommerce, Magento, JTL, OXID
and plentymarkets. No admin paths, no version endpoints, nothing a normal visitor would not
request. `unknown` is a legitimate and reportable result — custom shops are the most interesting
prospects.

## 3. Scanning

**axe runs inside the crawl's page visit**, not in a second pass. This halves the request count
per shop, which is the politeness-relevant number. Element screenshots are captured in the same
visit, capped per page.

**Lighthouse** attaches over CDP to the same Chromium the crawler launched
(`--remote-debugging-port`), and runs only on the five critical journeys, each through the same
rate limiter. Its failures are non-fatal and are surfaced as warnings — a scan that loses
Lighthouse still produces a report, and the report says the score is unavailable rather than
pretending it was 100.

### 3.1 Normalisation

`src/core/findings/normalize.ts` merges per-page engine output into per-shop findings:

- **Merge key is the engine rule id.** One missing-label defect on eight templates is ONE finding
  with eight instances — which is how the report, the effort estimate and the diff should treat
  it.
- **Lighthouse audits that axe already reported on the same page are dropped.** Lighthouse's
  accessibility category is axe-powered; counting both would double-count every occurrence.
- **WCAG criteria come from axe's `wcag<digits>` tags**, parsed so that `wcag1410` is 1.4.10 and
  not 1.4.1. AAA tags are discarded.
- **Best-practice findings (no AA criterion) are kept but segregated.** They appear in their own
  report section and never affect the score. Telling a customer that a best-practice hint is a
  conformance failure would be false.
- **German copy comes from a hand-written catalogue** (`src/core/wcag/rule-catalog.ts`) covering
  the ~55 rules that actually fire on German shops, written for a merchant rather than a
  developer. Unknown rules fall back to the engine's English text prefixed `[EN] `, so catalogue
  gaps are visible instead of silently shipped.

## 4. Scoring

`src/core/findings/score.ts`. Two numbers answering two different questions:

**`conformance` (0–100), shown to the customer.**

```
penalty  = Σ  severityWeight × occurrenceFactor(instances)
           severityWeight: critical 10 · serious 6 · moderate 3 · minor 1
           occurrenceFactor(n) = min(1 + log2(n), 7)
conformance = round(100 · e^(−penalty / 120))
```

The occurrence cap exists so one pathological page (a table with 400 unlabelled inputs) cannot
dominate. The decay constant 120 is calibrated against the Buzzmatic distribution so a typical
shop lands in the 50–89 band rather than near zero.

**It is a prioritisation heuristic, not a conformance measure, and every report says so in those
words.** A shop scoring 100 has passed the ~57% a machine can check.

**`prospect` (0–100), internal only.** A good prospect is not the worst shop:

```
prospect = 100 · gaussian(conformance; peak 55, width 20)
              × (0.4 + 0.6 · criticalJourneysAffected/5)
              × (0.5 + 0.5 · mechanicallyFixableShare)
```

A shop at 95 has nothing to sell. A shop at 10 needs a rebuild the €2,400 fixed price cannot
absorb. Defects on cart and checkout are the ones a merchant recognises as lost revenue, and
mechanically fixable defects are cheap hours.

**Effort estimate:** a severity base per finding, ×0.6 for mechanically fixable work (one colour
token fixes every occurrence) and ×1.4 for judgement work, plus a small per-occurrence term and a
fixed overhead for setup and re-test. Reported as a range, explicitly not an offer.

## 5. Documents

All customer-facing output is **German**. Code, tests and these docs are English.

Both the report and the Barrierefreiheitserklärung render through one shell
(`src/core/report/shell.ts`) that supplies `lang`, a unique `<title>`, a skip link as the first
focusable element, exactly one `<main>`, header/footer landmarks, a visible focus indicator, an
inline stylesheet with documented contrast ratios, and print rules. **Everything is inline** — the
documents are handed over as single files and must render offline, as an attachment and in the
PDF printer. There is no JavaScript and no external request.

### 5.1 The RDG check is a code path

`src/core/report/rdg.ts` holds a list of forbidden patterns in **both directions** — threats
(`Bußgeld`, `Abmahnung`, `Sanktion`, `rechtswidrig`, `haftbar`) and guarantees (`rechtssicher`,
`gesetzeskonform`, `BFSG-konform`). `assertNoLegalClaims()` runs over every finished document and
throws `RdgBoundaryError`. There is no flag to disable it, and it catches operator-supplied text
as well as our own.

### 5.2 Report

Sections: summary scorecard · the five critical journeys (with the ones the crawl could not reach
named explicitly) · findings grouped by success criterion with screenshots · best-practice hints
in a separate section · "what this cannot tell you" naming the ~43% · effort estimate · methodology
including the politeness settings actually used · the full scope note.

A finding is filed under its **lowest-numbered criterion** with the others listed inside, rather
than repeated under each — repeating it duplicated whole sections and their element ids.

### 5.3 Barrierefreiheitserklärung

`src/core/statement/`. Renders the five elements BFSGV Anlage 3 requires for a service, in order,
with stable heading ids so the mapping is testable.

Two rules that are deliberately awkward:

- **The market surveillance authority is operator input carrying a mandatory `verifiedOn` date.**
  Nothing is pre-filled and `data/erklaerung.beispiel.json` contains only placeholders the schema
  refuses. Inventing an authority address for a legally required statement would be a defect, and
  authority details change.
- **`meta.legalReviewConfirmed` defaults to false**, and while it is false every statement renders
  with a visible ENTWURF banner. Only a human, after a lawyer has read the wording, can flip it.

### 5.4 PDF

Chromium `page.pdf()` with `print` media emulation, `tagged: true` and `outline: true`. A tagged
PDF is what makes headings and tables navigable for a screen reader; an untagged PDF of an
accessibility report would be absurd. The test asserts `/StructTreeRoot` is present in the output.

## 6. Monitoring

`src/core/monitor/diff.ts` compares two `ScanResult`s on rule id. A **regression** is a new
finding, more occurrences of an existing one, or a lower score. Changes to the sampled page set
are reported too, because they often explain a finding that vanished without being fixed.

`bfsg monitor` writes `ueberwachungsbericht.html` and `diff.json` and **exits 2 on a regression** —
that is the notification mechanism, because no email channel exists.

## 7. File layout

```
out/<shop-id>/
  scan.json                        machine-readable result
  baseline.json                    comparison point for monitoring
  bericht.html / bericht.pdf       the customer-facing report
  ueberwachungsbericht.html        regression report
  diff.json
  screenshots/*.png
  barrierefreiheitserklaerung.html / .pdf
```

German filenames are deliberate: these are attached to a mail or handed over on a call.

## 8. Testing

- **No test makes a live network call.** Every scan runs against `test/fixtures/shop`, a synthetic
  German Shopware-flavoured shop served on 127.0.0.1, with defects planted deliberately and
  documented in a comment at the top of each file.
- **Generated documents are verified, not asserted.** `test/helpers/a11y.ts` loads them in a real
  Chromium and runs axe; the report, the statement (published and ENTWURF) and the regression
  report (both forms) must produce zero violations at WCAG 2.1 AA.
- The CLI is tested as a subprocess, including the refusals: no contact URL, no override reason.
- Coverage floor 80% on `src/core/**`, enforced in CI.

## 9. Dependency pins worth knowing

- **`playwright` is pinned to exactly 1.54.2.** 1.55+ ships no `mac13-arm64` browser build, and
  the development machine is macOS 13. A `pnpm.overrides` entry forces `@axe-core/playwright` onto
  the same `playwright-core`, so the two `Page` types are the same type.
- axe-core 4.13, Lighthouse 12.8. Both versions are recorded in every `scan.json` and printed in
  the report's methodology table, because a finding count is only comparable within one engine
  version.

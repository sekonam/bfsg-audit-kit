# ROADMAP — what exists, what does not, and why

Status as of the initial build. Every "done" below is backed by a test or a file, not by prose.

## Built and verified

| Capability                                                     | Where                                              | Evidence                                                                                         |
| -------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Politeness policy that refuses to run anonymously              | `src/core/crawl/policy.ts`                         | `test/crawl-policy.test.ts` (11 tests), CLI refusal in `test/cli.test.ts`                        |
| robots.txt parsing and matching, RFC 9309 semantics            | `src/core/crawl/robots.ts`                         | `test/robots.test.ts` (17 tests), plus an end-to-end assertion that `/intern` is never requested |
| Per-host rate limiting with slot reservation                   | `src/core/crawl/rate-limit.ts`                     | `test/crawl-mechanics.test.ts`                                                                   |
| Platform fingerprinting (8 systems)                            | `src/core/crawl/fingerprint.ts`                    | unit tests + fixture shop detected as Shopware                                                   |
| Template de-duplication by DOM signature                       | `src/core/crawl/signature.ts`                      | two fixture product pages collapse to one sample                                                 |
| Journey classification, DE + EN vocabulary                     | `src/core/crawl/journey.ts`                        | all five journeys reached on the fixture shop                                                    |
| Crawl + axe in one page visit                                  | `src/pipeline/crawl.ts`, `src/adapters/`           | each HTML document fetched exactly once                                                          |
| Lighthouse over CDP on the critical journeys                   | `src/adapters/lighthouse.ts`                       | `test/lighthouse-integration.test.ts` — real score, real version                                 |
| Normalisation to WCAG 2.1 AA + German copy for ~55 rules       | `src/core/wcag/`, `src/core/findings/normalize.ts` | 27 tests                                                                                         |
| Severity × occurrence scoring, prospect score, effort estimate | `src/core/findings/score.ts`                       | 22 tests including golden values                                                                 |
| German HTML + tagged PDF report                                | `src/core/report/`, `src/adapters/pdf.ts`          | 21 unit tests, 5 browser a11y tests, `/StructTreeRoot` asserted                                  |
| RDG boundary enforced at render time                           | `src/core/report/rdg.ts`                           | throws on threats _and_ on guarantees                                                            |
| Anlage-3 Barrierefreiheitserklärung                            | `src/core/statement/`                              | 22 tests + 6 browser a11y tests, published and ENTWURF forms                                     |
| Baseline diff and regression report                            | `src/core/monitor/`                                | 11 tests                                                                                         |
| CLI: doctor/scan/report/statement/baseline/monitor/rank        | `src/cli/`                                         | 8 subprocess tests                                                                               |
| No email capability                                            | `scripts/guard-no-email.sh`                        | CI job                                                                                           |

## Deliberately not built

| Not built                                                          | Why                                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Any SaaS surface**: accounts, billing, multi-tenancy, hosted API | The productisable half is already sold by BFSG-Guard (€49–99/mo), AccessGO (€39/mo) and Eye-Able (3,000+ customers). Building it buys nothing a customer will pay for. `docs/PRODUCT-SPEC.md` §2.                     |
| **Email of any kind**                                              | § 7 Abs. 2 UWG. Not a gap — a structural refusal, guarded in CI.                                                                                                                                                      |
| **A prospect database**                                            | Would be a GDPR data controller obligation on day one. The paperwork is written (`docs/GDPR-ART30.md`, `docs/GDPR-ART14-NOTICE.md`) so it can be built correctly, but nothing here stores a person's contact details. |
| **Theme codemods (Liquid/Twig)**                                   | The spec is explicit that these should be built only from defects seen **twice in real projects**. There have been zero real projects. Writing them now would be inventing a library against imagined themes.         |
| **A public "free checker" landing page**                           | The inbound channel is contested by e-Recht24; it is a multi-year asset, not an acquisition plan. `docs/PROMOTION.md` §4.                                                                                             |
| **Automatic remediation / overlays**                               | Overlays are legally discredited (the FTC fined accessiBe $1M) and the position of this practice is explicitly against them.                                                                                          |
| **PDF, video-caption or third-party-embed auditing**               | Out of scope on every quote, so out of scope in the tool.                                                                                                                                                             |
| **A hosted per-shop report URL**                                   | The spec asks for a per-shop path; the tool writes a per-shop directory. Publishing it needs a domain and a server, which are operator decisions, not code.                                                           |

## Reviewed

The whole tree went through an independent correctness review after the first build. It
reproduced and fixed, among others: redirects bypassing robots.txt; robots group selection
picking a group matched only by a short prefix; percent-encoded paths never matching umlaut
`Disallow` rules; Lighthouse escaping the page budget and dropping the bot User-Agent;
`javascript:` URLs passing zod's `.url()` into an `href`; a headline occurrence count that
contradicted the table beneath it; a critical defect moving onto the checkout not counting as a
regression; and the RDG guard making a shop unreportable because its footer said "Haftung".
Each fix has a regression test that names the scenario. Six tests that asserted less than their
names claimed were tightened — including one that claimed to verify the bot User-Agent and
verified nothing of the sort.

## Known limitations, stated plainly

1. **The scanner accepts a placeholder as a field label.** axe's `label` rule passes when an input
   has a `placeholder`, though it is a real 3.3.2 defect. Only the manual pass catches it. The
   fixture shop contains this exact case so the gap stays visible.
2. **Journey classification is heuristic.** A shop that links its cart only from JavaScript, or
   requires a filled basket to reach checkout, will show those journeys as unreached. The report
   names them explicitly rather than silently reporting on four journeys out of five.
3. **The conformance score is a heuristic**, calibrated against a published distribution rather
   than derived from anything normative. It is a prioritisation aid. Every report says so.
4. **Screenshots are of the first offending element only**, capped per page. A finding with 40
   occurrences gets one picture.
5. **A blocked redirect still costs one request.** The first hop is fetched before the
   `Location` header can be read; only the disallowed hop is refused. This is the minimum
   possible and is recorded in the report's skipped list.
6. **No German native speaker has reviewed the customer-facing German.** It is grammatical and
   uses the right terminology, but it was written by a machine.
7. **The statement wording has not been reviewed by a lawyer**, which is why it renders as ENTWURF
   until a human confirms otherwise.
8. **Nothing has been run against a real shop.** By instruction and by principle: crawling live
   German shops with no purpose is exactly the behaviour the politeness rules exist to prevent.

## Human steps before anything reaches a customer

| Step                                                                                                    | Who            | Blocking                          |
| ------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------- |
| Publish the bot contact page named in `BFSG_CONTACT_URL`                                                | operator       | before any real crawl             |
| Native-German review of `outreach/telefon-skript.md` and `outreach/brief-vorlage.md`                    | German speaker | before first contact              |
| **Lawyer review of the Barrierefreiheitserklärung wording**, then set `meta.legalReviewConfirmed: true` | German lawyer  | before any statement is published |
| Verify the market surveillance authority's contact details and set `authority.verifiedOn`               | operator       | per statement                     |
| Native-German review of the report template copy                                                        | German speaker | before the first paid audit       |
| Gewerbeanmeldung, AGB, privacy policy, Steuerberater                                                    | operator       | before invoicing                  |

## If it is pursued — the order that matters

The tooling is Gate 4 work delivered before Gates 1–3. That inversion is deliberate and stated,
but it does not change the order of what actually decides this:

1. **15 agencies, by phone or post.** ≥2 willing to trial = proceed. 0 = stop.
2. **30 calls + 20 letters to in-scope shops.** ≥5 of 50 asking for the report or a quote = pass.
3. **Three real projects, every task timed.** >35 h/project means the fixed price is wrong.
4. **Then** extend this repo — starting with codemods for whatever those three projects proved
   repetitive.

No amount of polish here changes the answer to step 1.

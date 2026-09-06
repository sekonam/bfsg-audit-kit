# CONTRIBUTING

Private repository, one maintainer. These notes are for that maintainer in six months, and for
any assistant working in the tree.

## Before you change anything

Read `docs/PRODUCT-SPEC.md` §2 and §5. Two categories of change are out of bounds regardless of
how reasonable they look in isolation:

1. **Anything that turns this into a product** — accounts, billing, multi-tenancy, a hosted
   service. The automated half of this market is already sold by German competitors at €39–49/month.
2. **Anything that can send a message** — mail transports, webhooks that post to a third party,
   "just a notification service". § 7 Abs. 2 UWG. `scripts/guard-no-email.sh` fails CI on the
   obvious cases; the rule is broader than the script.

## Workflow

```bash
pnpm run verify   # format:check + lint + typecheck + coverage + build
```

Per change: **specify → implement → test → review → fix → commit → push.** A step is not done
until lint, typecheck, tests and build pass and the work is pushed.

Every bug found in review gets a **failing test first**, then the fix.

## Conventions

- **TypeScript strict**, ESM, `.ts` extensions in relative imports (`rewriteRelativeImportExtensions`
  rewrites them on build).
- **No parameter properties** (`constructor(readonly x)`). Node's `--experimental-strip-types`
  cannot erase them and the CLI is run straight from source in development.
- **Pure logic goes in `src/core`**, and only there. If it needs the network, a browser or the
  filesystem, it belongs in `src/adapters` or `src/pipeline`.
- **Conventional Commits.** Explain _why_ in the body — the reasoning is the part that is
  expensive to reconstruct.
- Code, comments, tests and `docs/` are **English**. Everything a customer sees is **German**.

## Testing rules

- **No test may make a live network call.** Ever. Scan `test/fixtures/shop`, served on 127.0.0.1
  by `test/helpers/server.ts`.
- **Never point the crawler at a real third-party site during development.** The politeness rules
  exist precisely to prevent speculative crawling; violating them while developing the tool that
  enforces them would be absurd.
- **Verify rendered output, do not assert it.** `test/helpers/a11y.ts` loads a generated document
  in a real Chromium and runs axe. That check has already caught two genuine defects (duplicate
  element ids from a finding mapping to two criteria; a skipped heading level in the
  best-practice section).
- Coverage floor is **80% on `src/core/**`** and CI fails below it. It currently sits near 98%.
- New fixture defects get a comment at the top of the fixture file saying what was planted and
  why. A fixture nobody can read is a fixture nobody will maintain.

## Things that look like bugs and are not

| Looks wrong                                    | Is deliberate                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `robots.txt` 5xx blocks the whole crawl        | A server we cannot ask is a server we do not crawl.                                                 |
| `createPolicy` throws instead of defaulting    | An anonymous crawler is the failure mode, not a convenience.                                        |
| Report titles beginning `[EN] `                | A rule has no German copy yet, and that gap must be visible rather than silent.                     |
| Statement stamped ENTWURF                      | `meta.legalReviewConfirmed` is false. Only a human may set it, after a lawyer has read the wording. |
| `RdgBoundaryError` thrown at render time       | Something asserted or promised a legal position. Rewrite it as a technical fact.                    |
| Best-practice findings excluded from the score | They are not AA conformance failures and must not be counted as such.                               |
| `monitor` exits 2                              | That is the notification channel. There is no email.                                                |
| A navigation is aborted mid-redirect           | The redirect target failed the robots/same-site gate. Refusing the hop is the point.                |
| `loadScanResult` rejects a hand-edited file    | Its URLs would be rendered into `href` attributes. Validate, do not cast.                           |

## Adding a rule to the German catalogue

`src/core/wcag/rule-catalog.ts`. See `docs/MAINTENANCE.md` for the required fields and the
reasoning behind `mechanicallyFixable`, which feeds both the effort estimate and the pricing.

Two tests will hold you to it: every entry needs German copy of a minimum length, and no entry may
assert a legal consequence.

## Upgrading axe-core

Read `docs/MAINTENANCE.md` first. Short version: a finding count is only comparable within one
engine version, so re-baseline every monitored customer in the same commit, or their next report
shows a fabricated regression.

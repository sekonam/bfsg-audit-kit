# MAINTENANCE

One operator, one machine, no deployment. Maintenance here means keeping the measuring
instruments honest.

## Cadence

| When                 | Task                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Every scan           | Nothing. Tool versions are recorded in `scan.json` automatically.                                                                         |
| Monthly              | `pnpm outdated`; read the axe-core changelog before bumping it (see below).                                                               |
| Quarterly            | Re-run the full suite including the browser tests; re-read `docs/PRODUCT-SPEC.md` §2 and check whether the competitor prices still hold.  |
| Yearly               | Re-verify the market surveillance authority details used in statements; re-read the statement wording with a lawyer if the law changed.   |
| Five minutes a month | Watch for the **first published BFSG fine** and the **first § 3a UWG ruling**. Both are public and either would change demand materially. |

## Upgrading axe-core

**A finding count is only comparable within one engine version.** Bumping axe changes which rules
exist and how impacts are assigned, which moves every score.

Procedure:

1. Bump, run the full suite. The fixture-shop test asserts specific rule ids
   (`image-alt`, `button-name`, `link-name`, `color-contrast`, `label`, `meta-viewport`,
   `heading-order`); if any disappears, axe renamed or removed a rule.
2. Check for new rules that now fire on the fixture shop and have no German copy — they render as
   `[EN] …`. Add them to `src/core/wcag/rule-catalog.ts`.
3. **Re-baseline any customer on the Care retainer in the same run**, or their next monitoring
   report will show a fabricated regression caused by the upgrade rather than by their shop.
   Note the version change in the report you send them.

## Upgrading Lighthouse

Lower risk: it contributes a category score and a handful of audits axe does not expose. If the
CDP attach breaks, `test/lighthouse-integration.test.ts` fails — which is why that test exists,
since the adapter swallows Lighthouse errors by design and a permanently broken Lighthouse would
otherwise look identical to a working one.

## The Playwright pin — read before "just updating it"

```json
"dependencies": { "playwright": "1.54.2" },
"pnpm": { "overrides": { "playwright-core": "1.54.2" } }
```

Two reasons, both real:

1. **Playwright 1.55+ ships no `mac13-arm64` browser build.** `playwright install` fails outright
   on macOS 13 with _"Playwright does not support chromium on mac13-arm64"_ — and, unhelpfully, it
   deletes the previously cached browsers first.
2. `@axe-core/playwright` pulls its own `playwright-core`. Without the override the two `Page`
   types are structurally different and `new AxeBuilder({ page })` fails to typecheck.

If the development machine moves to macOS 14+, both pins can be lifted together. Bump them in one
commit and run the full suite; the browser tests will catch a mismatch immediately.

**⚠️ The pin carries an accepted advisory: GHSA-7mvr-c777-76hp (high), "Playwright downloads and
installs browsers without verifying the SSL certificate", fixed in 1.55.1.** The exposure is
`playwright install` — the browser _download_ path — not anything the scanner does at runtime.
It is accepted because 1.55.1 has no macOS 13 build at all, which would mean no browser and no
tool. Mitigations: install browsers on a trusted network, and note that CI installs on a
GitHub-hosted runner. **This is the single reason to move the dev machine to macOS 14+ and lift
the pin.** Re-check on every dependency review.

## Keeping the German rule catalogue useful

`src/core/wcag/rule-catalog.ts` is copy, not configuration. It is written for a merchant, not a
developer, and the test suite asserts that no entry asserts a legal consequence.

Add a rule when you see it fire on a real project. Each entry needs:

- `titleDe` — what is broken, in a noun phrase a merchant recognises;
- `descriptionDe` — what the shopper experiences, ideally naming where it usually appears in a
  shop ("typisch bei Icon-Buttons wie Warenkorb, Suche, Menü");
- `remediationDe` — what a theme developer changes;
- `mechanicallyFixable` — true only if one repeatable edit fixes every occurrence. This drives the
  effort estimate and the prospect score, so guessing here distorts pricing.

A `[EN] ` prefix in a report is the signal that a rule is missing. That prefix is deliberate: an
untranslated entry should be visible, not silently shipped to a customer.

## Recalibrating the score

`DECAY = 120` and the prospect curve's peak at 55 are calibrated against the Buzzmatic
distribution (19.7% of German shops at 90+, 80.1% at 50–89). After ten real projects, replace that
with your own data: if the shops you actually convert cluster somewhere other than 55, move the
peak. `test/score.test.ts` contains golden values that will fail loudly when you do — update them
deliberately, in the same commit, with the new calibration written into the docstring.

## The scanned shop is untrusted input

Worth restating because it is not obvious: **axe runs inside the shop's page.** A page can
predefine a non-writable `window.axe` and make the scan return whatever it likes — rule ids,
severities, node markup. Those values reach a filename, a CSS class attribute, and a document the
customer publishes on their own origin.

So four boundaries are enforced and must stay enforced:

| Boundary                                                                                        | Where                                                                                         |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Severity is validated, never cast, and never interpolated into markup                           | `isSeverity` in `src/core/types.ts`; the `BADGE_CLASS` lookups in both report renderers       |
| Rule ids are sanitised before touching the filesystem, with a containment check at the write    | `sanitiseRuleId` in `src/adapters/axe.ts`; `#captureScreenshots` in `src/adapters/browser.ts` |
| Patterns compiled from robots.txt are length- and wildcard-bounded, and the body is size-capped | `patternToRegExp`; `MAX_ROBOTS_BYTES`                                                         |
| Structural scanning of page HTML is linear and length-capped                                    | `stripNonStructural` is an index scan, not a regex, for exactly this reason                   |

If you add a field that comes from an engine or from a `scan.json`, assume it is hostile.

## Security and privacy

- No secrets in the repo; `.env` is gitignored and `.env.example` carries no real values.
- The crawler is read-only: it never submits a form, never clicks, never stores cookies between
  shops.
- `scan.json` contains URLs and markup snippets from a customer's public pages. It is business
  data, not personal data — but it is a customer artefact. Keep it in the customer's directory and
  delete it when the engagement ends.
- Run `pnpm audit` at merge. CI runs it non-blocking; a high-severity finding in a dependency used
  only at build time is not worth stopping delivery, but it is worth reading.

## Deliberate CI guards — do not "fix" these by removing them

| Guard                              | What it protects                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `scripts/guard-no-email.sh`        | § 7 Abs. 2 UWG. Fails the build if an email transport enters the codebase.      |
| RDG tests in `test/report.test.ts` | Every generated document is checked for legal claims in both directions.        |
| Browser a11y tests                 | The report and the statement must pass the standard they audit against.         |
| 80% coverage floor on `src/core`   | The scoring and rendering logic is the part that is silently wrong if untested. |

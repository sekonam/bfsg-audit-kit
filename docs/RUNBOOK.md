# RUNBOOK — running the practice with this toolkit

Everything below is what the tool does. Everything marked 🧑 is what a person has to do and
software cannot.

## 0. One-time setup

```bash
pnpm install
pnpm exec playwright install chromium
cp .env.example .env
```

Fill in `.env`:

| Variable                                     | Required | Notes                                                                                                                                  |
| -------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `BFSG_CONTACT_URL`                           | **yes**  | A real page saying who runs this bot and how to reach them. The crawler refuses to start without it and puts it in every `User-Agent`. |
| `BFSG_OPERATOR_NAME` / `BFSG_OPERATOR_EMAIL` | no       | Printed in report footers.                                                                                                             |
| `BFSG_DATA_DIR`                              | no       | Defaults to `./out`.                                                                                                                   |

```bash
pnpm run cli doctor      # must print "Konfiguration in Ordnung" and no ABWEICHUNGEN
```

🧑 **Publish the contact page first.** A bot pointing at a 404 is worse than an anonymous one.

## 1. Prospecting

```bash
bfsg scan https://shop.example --out out/shop.example
bfsg rank out
```

`rank` sorts stored scans by prospect score. High is not "worst shop" — it is "real, visible,
fixed-price-able defects on the journeys that matter". A shop at 95 has nothing to sell; a shop at
10 needs a rebuild that the €2,400 fixed price cannot absorb.

**Rules for this step:**

- Only scan shops you have a concrete reason to approach. The politeness settings exist to prevent
  speculative mass crawling; keeping them while crawling ten thousand shops would satisfy the
  letter and miss the point.
- 🧑 Check the shop is actually **in scope** before calling: German, consumer-facing, ≥10 employees
  or >€2M turnover. `docs/PRODUCT-SPEC.md` §7.
- 🧑 If you keep a prospect list, it is personal data. `docs/GDPR-ART30.md` and
  `docs/GDPR-ART14-NOTICE.md` are not optional paperwork.

## 2. First contact

**Telephone or post. Never email.** § 7 Abs. 2 UWG has no B2B exemption. See `docs/PROMOTION.md`
and the drafts in `outreach/`.

🧑 Both drafts in `outreach/` need a **native-German review before first use**. They were written
by a machine and read like it in places.

Message rules, which the report already respects and you must too:

- Lead with one concrete finding **from their own shop**, not with the law.
- Offer the full report free.
- **Never assert legal consequences.** "Ihr Bestellformular hat keine Feldbeschriftungen" is a
  fact. "Sie sind nicht BFSG-konform und riskieren eine Abmahnung" is legal advice you may not
  give.
- Never imply you might report them. It is coercion, it destroys conversion, and it destroys your
  position.

## 3. Audit (SKU B)

```bash
bfsg scan https://shop.example --out out/shop.example --report --pdf
```

Then the half that is actually billable, none of which is automated:

- 🧑 **Keyboard-only pass** over all five journeys. Can you complete an order without a mouse?
- 🧑 **NVDA + Firefox** and **VoiceOver + Safari** on the same journeys.
- 🧑 **320 px reflow** and **text spacing** check.
- 🧑 **Colour Contrast Analyser** for anything the scanner marked as needing review.
- 🧑 **Judgement calls**: is the alt text meaningful, is the focus order sensible, are error
  messages recoverable?

Add these findings to the report by hand. The generator produces the machine half; the manual half
is what the customer is paying €690 for.

⚠️ **The scanner accepts a placeholder as a field label** — axe's `label` rule passes when an input
has a `placeholder`. It is a real defect (3.3.2) and only the manual pass catches it. The fixture
shop contains exactly this case as a reminder.

## 4. Remediation (SKU C)

🧑 Everything. Theme edits, brand-vs-contrast negotiations, approving changes against a live shop.

Then re-scan and compare:

```bash
bfsg baseline out/shop.example/scan.json   # before the fixes
# ... do the work ...
bfsg monitor https://shop.example --out out/shop.example
```

🧑 Time every task. If real hours per project exceed ~35, the €2,400 fixed price is wrong — see
Gate 3 in `docs/PRODUCT-SPEC.md`.

## 5. Barrierefreiheitserklärung

```bash
cp data/erklaerung.beispiel.json out/shop.example/erklaerung.json
# fill it in — the generator refuses placeholders
bfsg statement out/shop.example/erklaerung.json --out out/shop.example --pdf
```

Two things only a person can do, and the tool will keep telling you so:

1. 🧑 **Verify the market surveillance authority's details** against the authority's own current
   page and set `authority.verifiedOn` to the date you checked. Nothing is pre-filled, on purpose.
   A wrong authority address in a legally required statement is a real defect.
2. 🧑 **Have a German lawyer read the wording once.** Until you set
   `meta.legalReviewConfirmed: true`, every statement is stamped **ENTWURF** and must not be
   published. The review is a one-off: once the template wording is approved it is reused.

The statement is verified accessible by the test suite, in both forms. That is a fact about the
generator, not a promise about the customer's site.

## 6. Care retainer (SKU E)

Monthly:

```bash
bfsg monitor https://shop.example --out out/shop.example --shop-name "Muster GmbH"
```

Exit code **2** means a regression. There is no email channel by design; wire the exit code into
whatever local notifier you use, then 🧑 read the report and send it yourself.

Quarterly: 🧑 one manual re-test, and 🧑 review whether the statement is still accurate (its
`lastReviewedOn` should not go stale — the generator warns after a year).

## 7. Things that will bite

| Symptom                                   | Cause                                                                 | Fix                                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Crawl reaches no cart or checkout         | The shop links them only from JavaScript, or requires a filled basket | Expected. The report names the unreached journeys explicitly; scan those pages manually. |
| `robots.txt` DENY ALL on a live shop      | The server returned 5xx                                               | Deliberate: a server we cannot ask is not crawled. Retry later.                          |
| Lighthouse warnings in the scan output    | CDP attach failed or the page never settled                           | Non-fatal. The report says the score is unavailable rather than inventing one.           |
| Every finding title starts `[EN]`         | The rule is not in the German catalogue                               | Add it to `src/core/wcag/rule-catalog.ts`; see `docs/MAINTENANCE.md`.                    |
| `RdgBoundaryError` on generating a report | Something in the text asserts or promises a legal position            | Working as intended. Rewrite the sentence as a technical fact.                           |

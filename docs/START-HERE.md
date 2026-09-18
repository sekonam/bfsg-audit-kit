# START HERE — what it takes to start, and in what order

> Read this first. It answers one question: **what is actually needed to start?**
> Everything else in `docs/` answers "how", once you have started.

**Where this stands.** The toolkit is built, reviewed and tested — 337 tests, 97.6% statements,
lint/typecheck/build green, a hostile-shop test suite, and CI guards that fail the build if an
email transport or a legal claim enters the code. **No real shop has ever been scanned, and no
customer has ever been contacted.**

**The blocker is not the tool and it is not money.** `docs/PRODUCT-SPEC.md` § 9 is explicit: this
repository is **Gate 4 work delivered before Gates 1–3**. What decides this business is whether
two German agencies will trial white-label capacity from a stranger — and that question is
answered by a telephone, in a week, for about €60.

> **If you read nothing else: do Gate 1 before you improve anything here.** No amount of polish in
> this repository changes the answer to it.

---

## 1. What you need

| Need                                                                    | Cost                      | Why it cannot be worked around                                                                                                                                                 |
| ----------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Business-fluent German**                                              | —                         | Calls, letters, reports, negotiation, and the objection handling. `PRODUCT-SPEC.md` § 8 states the spec is void without it.                                                    |
| **A telephone, and a number you are willing to publish**                | ~€0                       | Telephone and post are the only lawful cold channels. § 7 Abs. 2 UWG has no B2B exemption for email.                                                                           |
| **A domain and a live bot contact page** (`BFSG_CONTACT_URL`)           | ~€15/yr                   | The crawler **refuses to start without it**, and a bot pointing at a 404 is worse than an anonymous one.                                                                       |
| **Native-German review of the two outreach drafts**                     | a favour or a small fee   | `outreach/telefon-skript.md` and `outreach/brief-vorlage.md` were written by a machine and read like it in places.                                                             |
| **Native-German review of the report template copy**                    | same                      | Before the first _paid_ audit, not before the first free one.                                                                                                                  |
| **A German lawyer reading the Barrierefreiheitserklärung wording once** | one-off fee — get a quote | Until you set `meta.legalReviewConfirmed: true`, every statement renders stamped **ENTWURF** and must not be published. It is a one-off: the approved template is then reused. |
| **Gewerbeanmeldung, AGB, privacy policy, Steuerberater**                | local fees                | Before invoicing anyone. Not before Gate 1.                                                                                                                                    |
| **~€60 for Gate 1** (calls and postage)                                 | €60                       | The whole cost of finding out whether the channel exists.                                                                                                                      |
| **~€60 for Gate 2**                                                     | €60                       | 30 calls + 20 letters.                                                                                                                                                         |
| **Node 22, pnpm, a Chromium install**                                   | €0                        | `pnpm exec playwright install chromium`. See the macOS 13 pin in `MAINTENANCE.md`.                                                                                             |
| **~25–30 productive hours a week** if it works                          | your time                 | The ceiling is €8–10k/month at ~25 h per project. This is a freelance practice, not a product.                                                                                 |

**Not needed:** a website, a brand, a company before Gate 1, paid acquisition (there is none here),
an audience, or any further code.

---

## 2. Prerequisite checklist

```
[ ] node -v                                   → v22.x
[ ] pnpm install
[ ] pnpm exec playwright install chromium
[ ] cp .env.example .env  and fill BFSG_CONTACT_URL
[ ] pnpm run cli doctor                       → "Konfiguration in Ordnung", no ABWEICHUNGEN
[ ] pnpm run demo:screens                     → .artifacts/demo-screens — a full run on the fixture shop
[ ] pnpm run verify                           → green
────────────────────────────────────────────────────────────────────────────────────────────────
[ ] Bot contact page published at BFSG_CONTACT_URL          ← before any real crawl
[ ] outreach/ drafts reviewed by a native speaker           ← before first contact
[ ] Lawyer review of the statement wording                  ← before any statement is published
```

**The demo run is your sales sample.** `pnpm run demo:screens` produces a real report and a real
statement from the local fixture shop, with no live crawling. That is what you show an agency in
Gate 1 — you do not need to have scanned anyone to have something to show.

---

## 3. Next steps, in order — and the order is the point

### Week 1 — Gate 1: does the channel exist? (~€60)

**Target: 15 German Shopware and Shopify partner agencies.** They own the client relationships and
the theme access; what they lack is someone willing to spend twenty hours on WCAG remediation.
The offer is capacity under _their_ brand: their client, their contact, your hours, an unbranded
report.

**⚠️ Do not target the ~35 accessibility agencies on `barrierefreie-agenturen.de`.** They are
BITV/WCAG specialists — competitors who do not lack the capability being offered. Use that
directory for competitor intelligence instead.

Execution detail — list building, the call sequence, the tracker and what counts as a yes — is in
`PROMOTION.md` § 6.

```
≥ 2 agencies willing to trial  → proceed to Gate 2
1 agency                       → widen to 15 more before deciding
0 of 15                        → stop. The rest of this plan has no channel.
```

### Weeks 2–3 — Gate 2: is there direct demand? (~€60)

30 telephone calls and 20 postal letters to **in-scope** shops: German, consumer-facing, ≥ 10
employees **or** > €2M turnover (`PRODUCT-SPEC.md` § 7). Each contact references a report you
generated for _that_ shop.

Only now does the crawler run against real sites, which is why the contact page has to be live
first. Scan only shops you have a concrete reason to approach — the politeness settings exist to
prevent speculative mass crawling, and honouring them while crawling ten thousand shops would keep
the letter and miss the point.

```
≥ 5 of 50 asking for the full report or a quote → pass
```

### Weeks 4+ — Gate 3: does the delivery arithmetic hold?

Three real projects, **every task timed** (`RUNBOOK.md` §§ 3–5 for what is manual — the keyboard
pass, NVDA and VoiceOver, 320 px reflow, contrast review, the judgement calls).

```
> 35 h per project → the €2,400 fixed price is wrong. Reprice or stop.
```

### Then — Gate 4: extend this repository

Automate only what those three projects proved repetitive. Theme codemods come **from defects seen
twice in real projects**, never from imagination. `ROADMAP.md` § "Deliberately not built" records
what is being withheld and why.

---

## 4. The rules that apply from the first phone call

Six sentences that are cheaper to read now than to learn from a recipient's lawyer.

1. **Never email.** § 7 Abs. 2 UWG, no B2B exemption. The code has no email capability and CI
   fails if one is added.
2. **Lead with one concrete finding from their own shop**, not with the law.
3. **Never assert legal consequences.** "Ihr Bestellformular hat keine Feldbeschriftungen" is a
   fact. "Sie riskieren eine Abmahnung" is legal advice you may not give (RDG).
4. **Never promise legal compliance either.** You certify technical conformance to the criteria
   tested. Nothing else.
5. **Never imply you might report them** to the market surveillance authority. It is coercion, and
   it destroys both conversion and your standing.
6. **Log the source and date of every contact.** Art. 14 GDPR obliges you to tell people whose
   business contact data you collected from public sources — `docs/GDPR-ART14-NOTICE.md`.

---

## 5. Who does what

| ✅ Can be done for you                                          | 🧑 Needs you                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| All code, tests, docs, rule-catalogue German copy, CI, upgrades | Every telephone call, every letter, every customer conversation                |
| Report and statement generation, scoring, monitoring            | The manual audit half — keyboard, NVDA, VoiceOver, reflow, contrast, judgement |
| Drafts of scripts, letters and report copy                      | Native-German review of them; the lawyer review                                |
| Prospect scoring and ranking from stored scans                  | Deciding who is in scope and worth approaching                                 |
| Analysing gate outcomes                                         | Gewerbeanmeldung, invoicing, insurance, tax                                    |

The scarce resources are your **hours** and your **identity**. This business is linear in exactly
the hours that also deliver the work — which is why the agency channel is ranked first.

---

## 6. Stop rules, written down before it is emotionally expensive

| Gate | Fail condition                     | Then                                                                                                                                    |
| ---- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 0 of 15 agencies willing to trial  | Stop. There is no non-linear channel, and the linear one caps at €8–10k/month against competitors selling the automated half at €39–49. |
| 2    | < 5 of 50 direct contacts respond  | Stop, or return to Gate 1 with a different agency segment.                                                                              |
| 3    | > 35 h per project                 | Reprice, or stop. Do not absorb it three times to be sure.                                                                              |
| —    | The German prerequisite is not met | Stop before Gate 1. The spec is void without it.                                                                                        |

**And one watch item, five minutes a month:** the first published BFSG fine and the first § 3a UWG
ruling. **Update, 2026-09:** the first has happened — administrative fines (€10,000–100,000) began
in January 2026 and the first private Abmahnung was sent in August 2025. The second has not: courts
have not yet ruled whether BFSG duties are a `Marktverhaltensregel` under § 3a UWG, expected in the
second half of 2026 — that ruling, not the fines, is the single largest remaining reason demand
here is still partly a narrative rather than a demonstrated payment. See
`docs/MARKET-RESEARCH-2026-09.md` for detail.

---

## 7. Where everything else lives

| Question                                                    | Document                                |
| ----------------------------------------------------------- | --------------------------------------- |
| SKUs, prices, competitors, scope, the four gates            | `PRODUCT-SPEC.md`                       |
| Running an audit start to finish, incl. the manual half     | `RUNBOOK.md`                            |
| Approaching anyone — channels, Gate runbooks, message rules | `PROMOTION.md`                          |
| Crawler, scoring, generators, security boundaries           | `TECHNICAL-SPEC.md`                     |
| What exists, what is deliberately absent, known limitations | `ROADMAP.md`                            |
| Keeping the instruments honest; operating the practice      | `MAINTENANCE.md`                        |
| Before keeping any prospect data                            | `GDPR-ART30.md`, `GDPR-ART14-NOTICE.md` |

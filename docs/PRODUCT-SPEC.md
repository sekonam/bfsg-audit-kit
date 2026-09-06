# PRODUCT-SPEC — what this toolkit is for, and what it must never become

## 1. The one-sentence version

Internal delivery tooling for a one-person consulting practice that fixes WCAG 2.1 AA defects in
German Shopify and Shopware shops — **the manual half that scanners cannot do** — sold as a
subcontractor to agencies, and direct to shops with no agency.

## 2. What this is NOT, and why that is settled

**It is not a SaaS product, and building one would be a mistake with a name and a price.**

| Competitor                              | Price            | What they already sell                                                                                                                             |
| --------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BFSG-Guard** (`bfsg-software.de`, DE) | **€49–99/month** | automated WCAG scanning, **Anlage-3 Barrierefreiheitserklärung**, weekly monitoring with alerts, authority-ready PDF reports, remediation roadmaps |
| **AccessGO** (DE)                       | **€39/month**    | all-in-one, automatic Barrierefreiheitserklärung                                                                                                   |
| **Eye-Able / Web Inclusion GmbH** (DE)  | on request       | **3,000+ customers, €20M raised**, Telekom / Roche / HypoVereinsbank                                                                               |
| WAVE · axe DevTools · Lighthouse        | **free**         | the scanning engine itself                                                                                                                         |

That table _is_ the feature list of this repository. It is already sold, in German, by German
companies, at a price a solo operator cannot undercut and cannot out-market. **The software here
is internal efficiency only. It carries no differentiation and must never be listed, priced or
sold.**

Therefore this repo deliberately has:

- no multi-tenancy, no accounts, no billing, no subscriptions, no admin UI;
- no hosted service, no public endpoint;
- **no email capability at all** (see §5).

What it does have is the automation of the ~90% of a project that is not billable: finding
prospects, scanning, scoring, reporting, generating the statement and watching for regressions.

## 3. Where the money actually is

Automated testing decides roughly **57%** of WCAG success criteria (Deque). The other ~43% —
focus order, meaningful alt text, error recovery, custom widget semantics, 320 px reflow,
screen-reader verification — needs a person. That residue is simultaneously:

- the good news: **no competitor can productise it away**, and
- the bad news: **neither can you**. It is hours, and hours cap the business.

Plan for a revenue mix of roughly **85–90% project work, 10–15% recurring**. Anyone forecasting a
recurring-majority outcome inside twelve months is wrong.

## 4. Service catalogue — maximum return on minimum investment

| SKU                                              | Contents                                                                                                                     | Price                        | Delivery         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------- |
| **A. Quick-Check** _(door-opener, usually free)_ | Automated scan of the five key templates + a two-page German summary at a per-shop path                                      | **€0–190**                   | automated, < 1 h |
| **B. Audit**                                     | A + manual keyboard pass, NVDA verification, contrast/reflow review of the five critical journeys; prioritised German report | **€690**                     | 4–6 h            |
| **C. Remediation** ← _the core SKU_              | B + theme fixes to WCAG 2.1 AA on those journeys + re-test + **Barrierefreiheitserklärung**                                  | **€2,400 fixed**             | 20–30 h          |
| **D. Remediation XL**                            | C across all templates including custom plugins and merchant content                                                         | **€3,900–6,500 scoped**      | 40–70 h          |
| **E. Care** _(add-on to C/D only)_               | Monthly re-scan, regression report, statement kept current, one re-test per quarter, 2 h fix budget                          | **€59/month, 12-month term** | automated + 2 h  |
| **F. Agency white-label**                        | C or D delivered under the agency's brand, their client contact, unbranded report template                                   | **€1,600–2,900 per shop**    | as C/D           |

**The Care price was moved down from €79 to €59, and the reason should stay written down:**
BFSG-Guard sells _more_ automation for €49 and AccessGO for €39. €79 for a monthly re-scan is not
defensible against that. €59 works only because it is sold as a **retention add-on to a
remediation project**, never as a standalone product — the customer is paying to keep the fix
they already bought, not for a scanner.

**Ordering the SKUs by return per full-time month** — the scarce input is months, not euros:

1. **F (white-label)** — highest, because the agency supplies the customer. No acquisition cost.
2. **C (remediation)** — the core. Fixed price works because the median shop needs a handful of
   fixes, not a rebuild.
3. **B (audit)** — mainly a route into C.
4. **E (care)** — small, but the only compounding line.
5. **D (XL)** — rare; scope risk is real and it absorbs whole weeks.

**Calibrate ticket size down.** The Buzzmatic study of 2,446 German shops found ~1% fully
compliant, but also **19.7% scoring 90+/100 and 80.1% scoring 50–89**, with only 0.2% critical.
The median shop needs a handful of fixes. That is why C is the core SKU and D is rare — and why
the prospect score in `src/core/findings/score.ts` peaks in the middle of the range rather than
at the worst shops.

## 5. Hard constraints — product requirements, not preferences

### 5.1 Politeness

Honour `robots.txt`. One request per two seconds per host. Identify the bot in the `User-Agent`
with a contact URL. Cap at ~20 pages per shop. Public pages only, read-only rendering, no form
submissions.

These are **defaults that must be explicitly overridden with a written reason**, and the crawler
**refuses to start without a contact URL**. Implemented in `src/core/crawl/policy.ts`.

### 5.2 RDG boundary — technical conformance only

Reports state conformance with WCAG 2.1 AA / EN 301 549 **and nothing else**. They must never
assert that the operator is non-compliant, faces a fine, or risks an Abmahnung — that is legal
advice under the Rechtsdienstleistungsgesetz. They must equally never _promise_ legal compliance
("rechtssicher", "BFSG-konform").

**The most persuasive sentence available is the one you may not write.** Accept that; it is not
negotiable. `assertNoLegalClaims()` runs over every generated document and throws.

Keep a named lawyer to refer recipients to. That referral is allowed; the assessment is not.

### 5.3 § 7 Abs. 2 UWG — no cold email, ever

Unsolicited commercial email to German businesses requires prior express consent and has **no B2B
exemption**. Cold-emailing German shops to sell accessibility work would expose the practice to
the very mechanism it is selling protection against, enforced by the law firms already working
this niche.

**The toolkit therefore has no email capability at all.** `scripts/guard-no-email.sh` fails CI if
a mail transport package or a send-mail call appears. Outreach is telephone and post — see
`docs/PROMOTION.md`.

### 5.4 GDPR

Any prospect list holds business contact data. The paperwork is in `docs/GDPR-ART30.md`
(records of processing, Art. 6(1)(f) legitimate-interest basis) and `docs/GDPR-ART14-NOTICE.md`
(the notice owed to people whose data was collected from public sources). Art. 14 is the
obligation most outbound plans silently skip and the first thing a hostile recipient attacks.

## 6. Scope boundaries to put in writing on every quote

Excluded: PDF remediation, video captioning and audio description, third-party embeds outside the
customer's control (payment iframes, review widgets, map services), content authoring, WCAG 2.2,
legal representation, and **any warranty of legal compliance**. You certify technical conformance
to the criteria tested, nothing more.

## 7. Target segment

German B2C online shops with **≥10 employees OR >€2M turnover**. Micro-enterprises are exempt
only if **both** are below. Pure-B2B shops are out of scope — but the "B2B" label alone is not
enough: appearance, registration, ordering process and actual practice must demonstrably exclude
consumers. Hybrid shops are fully in scope.

Pool: ~125,000 Shopify-DE + ~20,000 Shopware-DE shops → roughly **4,500–6,000 in scope and not
already served by an agency**.

## 8. Honest expectations

| Scenario      | Projects/month | Avg ticket | Recurring at month 12 | Gross at month 12 |
| ------------- | -------------- | ---------- | --------------------- | ----------------- |
| Pessimistic   | 0.3            | €1,800     | ~€150                 | **~€700/month**   |
| **Realistic** | 1.2            | €2,200     | ~€400                 | **~€3,000/month** |
| Optimistic    | 2.5–3          | €2,600     | ~€900                 | **~€7,500/month** |

Ceiling ≈ **€8–10k/month gross** at ~25 h/project against 25–30 productive hours per week. This
is a freelance income, not a product business, and **even the optimistic case reaches only ~€900
of recurring revenue** — because the recurring half is the commoditised half.

**Business-fluent German is a hard prerequisite** for the calls, the letters, the reports and the
negotiation. Without it this specification is void.

## 9. Decision gates — do not skip, and keep them in this order

1. **Gate 1 — channel, week 1, ~€60, zero code.** Approach **15 Shopware/Shopify German partner
   agencies** offering white-label remediation capacity, by telephone or post. **Not** the ~35
   accessibility specialists on `barrierefreie-agenturen.de` — they are BITV/WCAG specialists,
   i.e. competitors, who do not lack the capability being offered. Use that list for competitor
   intelligence instead. → **≥2 willing to trial = proceed. 0 = stop.**
2. **Gate 2 — direct demand, weeks 2–3, ~€60.** 30 telephone calls + 20 postal letters to
   in-scope shops, each referencing a pre-generated report. → **≥5 of 50 requesting the full
   report or a quote = pass.**
3. **Gate 3 — delivery reality, first three clients.** Time every task. → **if real hours per
   project exceed ~35, the €2,400 fixed price is wrong. Reprice or stop.**
4. **Gate 4 — build.** Automate only what Gate 3 proved repetitive.

**This repository is Gate 4 work delivered early.** That is a deliberate, stated inversion of the
recommended order: the tooling exists, but it does not substitute for Gates 1–3, and no amount of
polish here changes the answer to "will an agency trial this?".

**Standing watch item, five minutes a month:** the first published BFSG fine and the first
§ 3a UWG ruling. Fourteen months in, neither exists. Either would change demand materially, and
both are public.

# PROMOTION — the channel plan

## The short version

**1. Agency white-label. 2. Telephone. 3. Post. Never email.**

Promotion, not engineering, is the binding constraint on this business. The build is easy — that
is precisely the problem, since two German companies already sell the automated half for
€39–49/month. What is scarce is a lawful, non-linear way to reach German shop operators, and
there is essentially one.

## ✗ Cold email is unlawful — this is not a risk assessment, it is a rule

**§ 7 Abs. 2 UWG requires prior express consent for commercial email and has no B2B exemption.**
Telephone outreach to businesses can rely on presumed consent where an objective recipient
interest exists; email cannot.

Cold-emailing German shops to sell accessibility compliance would expose the practice to exactly
the Abmahnung mechanism it is selling protection against, enforced by the law firms already
working this niche. It is the single most self-defeating action available.

**The toolkit therefore has no email capability**, and `scripts/guard-no-email.sh` fails CI if one
is added. This is not a placeholder for a feature that arrives later.

## 1. Agency white-label — the only channel that scales

This is the strongest asset in the plan. It sidesteps § 7 UWG entirely, solves the
no-references problem by borrowing the agency's trust, and has a public target list.

**Target: German Shopware and Shopify partner agencies.** They have the client relationships and
the theme access; what they usually lack is someone who wants to spend twenty hours on WCAG
remediation. Offer capacity under their brand: their client, their contact, your hours, an
unbranded report template.

**⚠️ Do NOT target the ~35 accessibility agencies on `barrierefreie-agenturen.de`.** Enumerating
that directory shows its members are BITV/WCAG specialists — i.e. competitors who do not lack the
capability being offered. Use it for **competitor intelligence** instead, and approach specialists
only as _overflow capacity for a busy firm_, never as expertise they need.

**Contact by telephone or post only.** These firms know § 7 UWG better than most; a cold email
would disqualify you in one sentence.

**Gate 1: 15 agencies. ≥2 willing to trial = proceed. 0 = stop the whole option.**

## 2. Telephone — lawful, effective, and linear in your hours

~30 dials/day is a realistic ceiling. Presumed consent applies where an objective recipient
interest exists, and a consumer-facing shop that measurably fails accessibility criteria is a
strong case.

Script: `outreach/telefon-skript.md` — **a draft that needs a native-German review before first
use.**

The pitch is one concrete finding from their own shop, then a free full report. Not the law.

**The limitation is structural: telephone and post are linear in exactly the hours that also
deliver the work.** That is why the agency channel is ranked first and why the ceiling on this
business is €8–10k/month.

## 3. Postal mail — no consent requirement

Slower, more expensive per contact, but genuinely unrestricted and it stands out. Send the printed
Quick-Check summary with a QR code to the full report.

Template: `outreach/brief-vorlage.md` — **also a draft needing native-German review.**

🧑 Postage, printing and posting are human steps. The toolkit produces the report; it does not
send anything.

## 4. Inbound / free checker — a long-horizon asset, not the acquisition plan

⚠️ **Contested by a giant.** The obvious inbound play — ranking for
_"Barrierefreiheitserklärung Generator"_ — is dominated by **e-Recht24**, a major German legal-SaaS
publisher for whom generators are a core product, with the rest of page one held by vendors selling
the same thing. Entering that SERP at zero authority is a multi-year project.

Treat inbound as something that may compound over years, and never as the plan for month one.

## 5. Gate 1 runbook — 15 agencies in one week, ~€60

The single most valuable week available. It costs telephone time and postage, needs no live
crawling, and it answers the only question that decides this business.

### 5.1 Build the list (half a day, 15 agencies)

| Source                                    | Filter for                                                       |
| ----------------------------------------- | ---------------------------------------------------------------- |
| Shopware partner directory                | German-speaking implementation partners, consumer-retail clients |
| Shopify partner directory                 | Same; agencies listing German shops in their portfolio           |
| Agency portfolios found from shop footers | The agency that actually built shops in your target segment      |

**Qualify on three things:** they build or maintain German B2C shops; they are small enough that
twenty hours of WCAG work is a burden (roughly 3–30 people — larger firms have it in-house); and
their Impressum carries a telephone number.

**Exclude the ~35 accessibility specialists on `barrierefreie-agenturen.de`** — § 1.

Record per row, and no more: `agency · city · platform · phone · source URL · date collected ·
attempts · outcome · next action`. A company's published business contact details are not personal
data; a **named employee's** direct line is. If you record a name, `docs/GDPR-ART14-NOTICE.md`
applies — so prefer the switchboard.

### 5.2 The call

Ask for **whoever owns delivery** — technical lead, project lead, owner. Not sales; sales will
route you to a partnership form.

The frame, in twenty seconds: _BFSG applies to your clients' shops since June 2025; you are
probably being asked about it; I do the WCAG remediation under your brand, fixed price, your
client never hears my name._ Then stop talking.

| Objection                     | Answer                                                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| "We do that ourselves."       | Then you know it is twenty hours a shop. I am overflow capacity for the weeks you do not have them.                                       |
| "Our clients are not asking." | Fair. May I send one sample report so it is on the shelf when they do?                                                                    |
| "Send me something by email." | **They may invite it — an invitation is consent.** Confirm on the call, note the date and wording in the tracker. Never send unsolicited. |
| "What does it cost?"          | €1,600–2,900 per shop white-label; you price to your client. `PRODUCT-SPEC.md` § 5.                                                       |

**Rules:** three dial attempts maximum, at different times of day, then post the letter instead.
Never leave a pitch on voicemail — leave a name and call back. Show the fixture-shop sample from
`pnpm run demo:screens` if they want to see the output; do not scan their client's shop to make a
point unless they ask you to.

### 5.3 Scoring the gate

**A yes is a named client shop and a date**, or an explicit "send it and we will trial it on the
next project". "Sounds interesting" is a no.

```
≥ 2 of 15 willing to trial → proceed to Gate 2
1 of 15                    → one more block of 15 before deciding
0 of 15                    → stop; there is no non-linear channel here
```

Timebox it to **five working days**. A gate that drifts for a month stops being a measurement.

---

## 6. Gate 2 runbook — 30 calls + 20 letters, ~€60

### 6.1 Who is in scope

German, consumer-facing, **≥ 10 employees OR > €2M turnover** — micro-enterprises are exempt and
selling to them is both pointless and unkind. `PRODUCT-SPEC.md` § 7. Check this **before**
scanning, not after.

### 6.2 Scan discipline

```bash
bfsg scan https://shop.example --out out/shop.example
bfsg rank out
```

- Scan only shops you have a **concrete reason to approach**. Fifty is the target, not five
  thousand.
- `rank` sorts by prospect score. **High is not "worst shop"** — a shop at 95 has nothing to sell,
  a shop at 10 needs a rebuild the fixed price cannot absorb. Work the middle.
- One shop per approach, ≤ 20 pages, the politeness defaults untouched.

### 6.3 The approach

Prepare **one finding, in the operator's language, with where it appears**: "Auf Ihrer
Produktseite haben die Icon-Buttons keine Beschriftung — Screenreader lesen dort nur _Button_."
Then offer the full report free.

| Channel   | Volume            | Notes                                                                            |
| --------- | ----------------- | -------------------------------------------------------------------------------- |
| Telephone | ~10/day × 3 days  | `outreach/telefon-skript.md`, native-reviewed first                              |
| Post      | 20 over the block | Printed Quick-Check summary + QR to the full report; `outreach/brief-vorlage.md` |

```
≥ 5 of 50 asking for the full report or a quote → pass
```

### 6.4 Follow-up, once

One follow-up per contact after 7–10 days, **on the same channel**. Never switch to email, never a
third contact. Record every "no" and honour it permanently — keep a do-not-contact list and check
it before every block.

---

## 7. The first 30 days, as a calendar

| Week  | Do                                                                                                                     | Spend |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | ----- |
| **0** | Contact page live; `bfsg doctor` clean; native review of both outreach drafts; lawyer briefed on the statement wording | ~€15  |
| **1** | Gate 1: build 15, call 15, log 15                                                                                      | ~€60  |
| **2** | Gate 2 part one: qualify 50 in-scope shops, scan the first 25, 10 calls/day                                            | ~€30  |
| **3** | Gate 2 part two: remaining scans, 20 letters, one follow-up round                                                      | ~€30  |
| **4** | Read both gates against the numbers, in writing, before deciding anything                                              | —     |

**Write the gate result down as a sentence with the counts in it** before you interpret it. The
predictable failure at week 4 is a plausible story about _why_ the numbers were low that quietly
replaces the decision rule.

---

## 8. Pipeline hygiene

| Rule                                                        | Why                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Source and date on every record, from the first row         | Art. 14 GDPR asks exactly this, and it is the first thing a hostile recipient attacks |
| A permanent do-not-contact list, checked before every block | One re-contact after a refusal is the cheapest way to earn an Abmahnung               |
| Prospect scans deleted when the prospect is closed out      | They are a customer artefact; `MAINTENANCE.md` § retention                            |
| Never scan to make a point                                  | The politeness policy is the licence to operate here                                  |
| One channel per contact, one follow-up, then stop           | Persistence past that converts nobody and costs standing                              |

---

## ~ LinkedIn / XING — warming only

Grey zone. Connecting and being visible is fine; pitching in a DM is the same problem as email
wearing a different hat.

## Message rules that apply to every channel

1. **Lead with one concrete finding from their own shop.** Specificity is the entire advantage a
   solo operator has over a €49/month product.
2. **Offer the full report for free.** It costs an hour of machine time.
3. **Never assert legal consequences.** RDG § 5 permits ancillary legal explanation; assessing
   someone's exposure is not ancillary. "Ihr Bestellformular hat keine Feldbeschriftungen" is
   allowed. "Sie riskieren eine Abmahnung" is not.
4. **Never promise legal compliance either.** You certify technical conformance to the criteria
   tested. Nothing else.
5. **Never imply you might report them to the authority.** It is coercion, it destroys conversion,
   and it destroys your standing.
6. **Log the source and date of every contact.** Art. 14 GDPR obliges you to tell people whose
   business contact data you collected from public sources; it is the first thing a hostile
   recipient attacks. Template: `docs/GDPR-ART14-NOTICE.md`.

## What is deliberately absent from this plan

- Paid acquisition. No budget, and the unit economics of a €2,400 project do not carry a CAC in a
  market where the buyer does not search.
- SEO as a primary channel. See §4.
- Any outbound at scale. Lawful channels here do not scale, and pretending otherwise is how this
  plan would fail.

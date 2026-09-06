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

# PRODUCT PERSPECTIVES — assumptions behind "this is not a product", and what would overturn them

`PRODUCT-SPEC.md` § 2 settles the question: this repo is internal tooling, not a product, because
the automatable half of this market is already sold cheaper than a solo operator can match. That
conclusion is correct given known facts and this file does not reopen it casually. What this file
does is different: it writes down, explicitly and separately from the operational spec, the
**assumptions that conclusion rests on** and the **conditions that would falsify each one** — so
that if one breaks, it is noticed on purpose instead of by drift. This is speculative reasoning by
design; keep it out of `PRODUCT-SPEC.md` so the operational document stays a settled decision, not
a running debate.

This file is living — edit it in place as assumptions are tested, unlike the dated snapshots in
`docs/MARKET-RESEARCH-*.md`, which it cites but does not duplicate.

## 1. The assumptions, stated so each one can be checked

| #   | Assumption                                                                                                                                                      | Why it currently holds                                                                                                                                                                                                | What would falsify it                                                                                                                                                                                                                                                                                | Where to look                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | The ~43% of WCAG criteria a machine cannot check does not scale without linear human hours                                                                      | True of every method available today — keyboard walk-throughs, NVDA/VoiceOver verification, judgment calls on alt text and focus order all require a person's time per shop                                           | A materially reliable LLM-assisted check for manual criteria (e.g. judging alt-text adequacy, reading-order sanity, error-recovery clarity) that a human only needs to _spot-check_ rather than perform                                                                                              | Track Deque/axe-core release notes and any peer-reviewed WCAG-conformance LLM benchmark; re-test manually against 5 real findings before trusting a claim |
| A2  | Competitor self-service pricing stays in the €20–80/month band                                                                                                  | `docs/MARKET-RESEARCH-2026-09.md` § 3: BFSG-Guard €19.99→49/mo, AccessGO €39/€79/mo, both funded and stable                                                                                                           | Either vendor moving upmarket to enterprise-only pricing (unlikely — both are volume plays), or a well-funded new entrant undercutting further                                                                                                                                                       | Re-run competitor pricing search quarterly, see `CLAUDE.md` cadence                                                                                       |
| A3  | Enforcement stays administrative and gradual rather than a compliance panic                                                                                     | `docs/MARKET-RESEARCH-2026-09.md` § 1: MLBF fines started Jan 2026 at €10k–100k; § 3a UWG basis for private Abmahnungen is still legally unsettled, first rulings expected H2 2026                                    | A **confirmed H2 2026 § 3a UWG ruling** that BFSG duties are a `Marktverhaltensregel` would legitimise mass private Abmahnungen at scale (the mechanism e-commerce law firms already use for Impressum/AGB defects) — that is the single highest-leverage external event this practice is waiting on | `docs/MARKET-RESEARCH-2026-09.md` § 1; `dejure.org` § 3a UWG case law; re-check before every Gate 1/2 decision                                            |
| A4  | No competitor sells an **agency-wholesale, white-label report/remediation API** — only direct-to-merchant self-service or enterprise-direct                     | Research on 2026-09-18 found nothing matching this shape among BFSG-Guard, AccessGO or Eye-Able — all three sell to the shop operator or an enterprise account, none sell _into_ the agency channel as infrastructure | A competitor launching a partner/reseller API aimed at Shopware/Shopify agencies specifically                                                                                                                                                                                                        | Re-check competitor "partner" / "agency" / "API" / "white-label" pages each refresh                                                                       |
| A5  | German-language, BFSG-specific compliance depth (Anlage-3 statement wording, RDG-safe copy, § 7 UWG-safe outreach) remains a moat against English-first players | accessiBe/UserWay/Siteimprove were not found competing directly on BFSG-specific German terms in this search                                                                                                          | Aggressive German localisation by an English-market incumbent, specifically producing an Anlage-3-conformant statement generator and BFSG-branded marketing                                                                                                                                          | Watch for English-market vendors appearing in German "Barrierefreiheitserklärung Generator" search results                                                |

## 2. The one genuine product wedge this research surfaced (A4)

If this practice ever needs a channel that is not linear in the operator's hours — which
`PRODUCT-SPEC.md` § 8 says the freelance ceiling (€8–10k/month) will eventually demand — the
**one gap no competitor currently fills** is not another merchant-facing scanner (that market is
sold three times over) but **wholesale report/statement generation sold _to_ agencies as
infrastructure**, distinct from SKU F (white-label _delivery_, i.e. the operator's own hours under
an agency's brand). This would mean an agency's own staff generating branded Quick-Check reports
and statement drafts against this practice's engine, self-serve, for a per-report or per-seat fee —
software sold B2B2B, never to the end merchant.

**This is not a recommendation to build it now.** It would still cross the line in
`PRODUCT-SPEC.md` § 2 ("no hosted service, no public endpoint") and none of Gates 1–3 have run yet.
It is recorded here because it is the one idea in this research that is genuinely differentiated
rather than a slower, worse version of what BFSG-Guard or AccessGO already sell — so if an agency
from Gate 1 ever asks for self-serve report generation instead of subcontracted hours, that
question should be treated as a live signal, not dismissed as "building a SaaS," and validated with
its own Gate-1-style test (does a _second_ agency ask for the same thing, unprompted) before any
code is written.

## 3. Recommended posture today (2026-09-18)

**Do nothing differently.** `PRODUCT-SPEC.md` § 2's conclusion stands; every assumption above still
holds as of this snapshot. The only actions this file recommends:

1. Keep this file and `docs/MARKET-RESEARCH-2026-09.md` in view before any pricing decision or
   before starting/re-starting Gates 1–2.
2. Treat **A3** (the § 3a UWG ruling) as the one external event worth actively watching — it is
   public, dated (H2 2026), and would change demand more than anything else on this list.
3. If Gate 1 or 2 fails and a pivot is being considered, re-read § 2 above before assuming the
   pivot must be "build a scanner" — it should not be; that market is sold. If a pivot is
   considered at all, the wedge is agency infrastructure (A4), not a merchant-facing product.
4. Final call on any of this stays with the operator, per the gate structure in `PRODUCT-SPEC.md`
   § 9. This file is an analysis aid, not a decision.

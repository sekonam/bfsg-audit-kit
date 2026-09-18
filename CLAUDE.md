# CLAUDE.md — instructions for an AI assistant working in this repository

Read `docs/PRODUCT-SPEC.md` §§ 2 and 5 and `CONTRIBUTING.md` before changing anything. This file
does not repeat their content — it adds the parts specific to working here as an assistant:
required tools, research cadence, and how to sequence work.

## The two lines that matter most

1. **Do not turn this into a product.** No accounts, billing, multi-tenancy, hosted service, or
   public endpoint. `PRODUCT-SPEC.md` § 2 explains why, with prices; `PRODUCT-PERSPECTIVES.md`
   explains the one condition that would legitimately reopen the question, and it isn't code.
2. **Do not add anything that can send a message to a third party.** No mail transport, no
   webhook-to-outside, nothing "just for notifications." § 7 Abs. 2 UWG has no B2B exemption for
   email; `scripts/guard-no-email.sh` enforces the obvious cases in CI, but the rule is broader
   than the script — judgement is still required for anything new that reaches outside the process.

## Required tooling

**No MCP server is required for this repository's own runtime.** Playwright, axe-core and
Lighthouse are npm dependencies invoked directly by `src/adapters/`, not external services — there
is nothing here for an MCP server to front. Do not add one "for the crawler"; that would itself be
the kind of surface `PRODUCT-SPEC.md` § 2 rules out.

Tools actually used, and when:

| Tool                                                                    | When                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Bash` (`pnpm run verify`, `pnpm run cli ...`, `pnpm run demo:screens`) | Every code change. `verify` = format:check + lint + typecheck + coverage + build; nothing is done until it is green.                                                                                                                                |
| `WebSearch` / `WebFetch`                                                | Refreshing `docs/MARKET-RESEARCH-*.md`, checking a competitor's current price, checking whether the § 3a UWG ruling named in `PRODUCT-PERSPECTIVES.md` A3 has landed. Not needed for ordinary code work.                                            |
| Skill `security-review`                                                 | Before or after any change to `src/core/crawl/`, `src/adapters/`, or anything that parses attacker-reachable input (page HTML, a hand-edited scan/statement JSON file). `test/hostile-shop.test.ts` is the existing pattern to extend, not replace. |
| Skill `code-review`                                                     | Before considering any non-trivial change finished, in addition to `pnpm run verify` — verify proves it runs and passes coverage, not that it is well-formed.                                                                                       |
| Skill `simplify`                                                        | If a change grew more surface than the task needed — this codebase's own convention (`CONTRIBUTING.md`) is small, pure `src/core`, impure edges kept thin.                                                                                          |
| `browser-automation` / `claude-in-chrome`                               | Not applicable. This is a CLI tool with generated-document output, not a web UI. Looking at output means `pnpm run demo:screens` and reading the screenshots it writes to `.artifacts/demo-screens/`, per `CONTRIBUTING.md`.                        |
| `Agent` (fork)                                                          | Fine for independent research sub-questions (e.g. "check three competitor pricing pages") that don't need to stay in context afterward. Not needed for code changes in a codebase this size — read the actual files.                                |

## Research cadence — keep the market picture from going stale silently

`docs/PRODUCT-SPEC.md` § 9 names a standing watch item: the first BFSG fine and the first § 3a UWG
ruling. As of `docs/MARKET-RESEARCH-2026-09.md`, the first has already happened (administrative
fines since January 2026) and the second is expected H2 2026 — **check whether it has landed before
treating that section as current**, since it is the single fact most likely to change this
business's demand picture.

- **Before any pricing or Gate 1/2 decision more than ~3 months old:** re-run the market research.
- **Format:** a new dated file `docs/MARKET-RESEARCH-YYYY-MM.md`. **Never edit an old snapshot in
  place** — the point of dating them is to preserve what was believed when, so `git blame` on a
  snapshot always means "this changed," never "the world changed and we silently rewrote history."
- Update the _living_ documents (`PRODUCT-SPEC.md`, `PRODUCT-PERSPECTIVES.md`) to cite the new
  snapshot and correct anything the new evidence contradicts. `PRODUCT-PERSPECTIVES.md` is edited
  in place over time by design — it is reasoning under revision, not a dated record.
- Run competitor-price and enforcement-status searches in parallel — they are independent
  questions; issue them as separate `WebSearch` calls in one message rather than sequentially.

## Workflow

Same as `CONTRIBUTING.md`: **specify → implement → test → review → fix → commit → push**, one
logical unit at a time. A step is not done until `pnpm run verify` is green (code changes) and the
work is pushed. For documentation-only changes, run `pnpm exec prettier --check <files>` at minimum
— `docs/` is not excluded from Prettier's formatting check in `.prettierignore`, and `format:check`
is the first thing `pnpm run verify` runs.

**Commit per logical step, not per session.** If a task naturally splits into independent
pieces — a research doc, a spec correction, a new instructions file — commit and push each as its
own commit with its own Conventional Commits message, rather than batching unrelated changes into
one commit. This mirrors `CONTRIBUTING.md`'s existing rule that every bug found in review gets its
own failing-test-then-fix commit.

**Parallelise independent work.** Independent research questions → parallel `WebSearch`/`WebFetch`
calls in a single message. Independent file reads or edits (files that don't depend on each other's
new content) → parallel tool calls in a single message. Do not parallelise steps that depend on a
prior step's output (e.g. don't write a spec correction before the research that justifies it has
returned).

## Things this file deliberately does not cover

Coding conventions, testing rules, and the "looks like a bug and isn't" table are in
`CONTRIBUTING.md` and are not duplicated here — duplicated rules drift out of sync. If something
here conflicts with `CONTRIBUTING.md`, `CONTRIBUTING.md` is authoritative for code and this file is
authoritative for research/process cadence.

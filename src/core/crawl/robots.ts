/**
 * robots.txt parsing and path matching.
 *
 * Implements the group/longest-match semantics of RFC 9309 as used by the
 * major crawlers: the most specific matching user-agent group wins, within a
 * group the longest matching rule wins, and Allow beats Disallow on a tie.
 * `*` and `$` wildcards are supported.
 *
 * Written rather than taken from a package because this is the single check
 * that keeps the crawler lawful and welcome, and it has to be test-covered
 * line by line.
 */

export interface RobotsGroup {
  readonly agents: readonly string[];
  readonly allow: readonly string[];
  readonly disallow: readonly string[];
  readonly crawlDelayMs: number | undefined;
}

export interface RobotsRules {
  readonly groups: readonly RobotsGroup[];
  readonly sitemaps: readonly string[];
  /** True when no robots.txt could be read and everything is allowed by default. */
  readonly permissiveDefault: boolean;
}

export const ALLOW_ALL: RobotsRules = { groups: [], sitemaps: [], permissiveDefault: true };
export const DENY_ALL: RobotsRules = {
  groups: [{ agents: ['*'], allow: [], disallow: ['/'], crawlDelayMs: undefined }],
  sitemaps: [],
  permissiveDefault: false,
};

export function parseRobots(text: string): RobotsRules {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];

  let agents: string[] = [];
  let allow: string[] = [];
  let disallow: string[] = [];
  let crawlDelayMs: number | undefined;
  let expectingAgents = false;

  const flush = (): void => {
    if (agents.length > 0) {
      groups.push({ agents, allow, disallow, crawlDelayMs });
    }
    agents = [];
    allow = [];
    disallow = [];
    crawlDelayMs = undefined;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0]!.trim();
    if (line === '') continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    switch (field) {
      case 'user-agent':
        // A new user-agent line after rules starts a new group; consecutive
        // user-agent lines share one group.
        if (!expectingAgents) flush();
        // An empty value is not an agent. Recording it would produce the token
        // "", which prefix-matches everything and would beat the real `*` group.
        if (value !== '') agents.push(value.toLowerCase());
        expectingAgents = true;
        break;
      case 'allow':
        if (value !== '') allow.push(value);
        expectingAgents = false;
        break;
      case 'disallow':
        // "Disallow:" with an empty value means "allow everything" and is
        // deliberately NOT recorded as a rule.
        if (value !== '') disallow.push(value);
        expectingAgents = false;
        break;
      case 'crawl-delay': {
        const seconds = Number.parseFloat(value);
        if (Number.isFinite(seconds) && seconds >= 0) crawlDelayMs = Math.round(seconds * 1000);
        expectingAgents = false;
        break;
      }
      default:
        // Only the group-member fields above end the agent list. Anything else
        // — Sitemap, Host, a vendor extension, a typo — is not part of a group
        // and must neither split one group in two nor merge two into one.
        if (field === 'sitemap') sitemaps.push(value);
        break;
    }
  }
  flush();

  return { groups, sitemaps, permissiveDefault: false };
}

/**
 * Build rules from an HTTP response to /robots.txt.
 *
 * - 2xx: parse the body.
 * - 4xx (including 404): no robots.txt, everything allowed.
 * - anything else (5xx, network error): treated as DENY ALL. A server we cannot
 *   ask is a server we do not crawl.
 */
export function robotsFromResponse(status: number, body: string): RobotsRules {
  if (status >= 200 && status < 300) return parseRobots(body);
  if (status >= 400 && status < 500) return ALLOW_ALL;
  return DENY_ALL;
}

/** The bare product token of a User-Agent string: "BfsgAuditBot/0.1 (+…)" → "bfsgauditbot". */
export function agentToken(userAgent: string): string {
  return (userAgent.split('/')[0] ?? userAgent).trim().toLowerCase();
}

function selectGroup(rules: RobotsRules, userAgent: string): RobotsGroup | undefined {
  const token = agentToken(userAgent);
  let specific: RobotsGroup | undefined;
  // Length of the agent token that actually MATCHED in the selected group.
  // Comparing against the longest token in the group — matching or not — let a
  // group that matched only by a short prefix outrank a group naming the bot
  // exactly, purely because it also listed some unrelated long agent name.
  let specificMatchLength = -1;
  let wildcard: RobotsGroup | undefined;

  for (const group of rules.groups) {
    for (const agent of group.agents) {
      if (agent === '*') {
        wildcard ??= group;
      } else if (token === agent || token.startsWith(agent)) {
        if (agent.length > specificMatchLength) {
          specific = group;
          specificMatchLength = agent.length;
        }
      }
    }
  }
  return specific ?? wildcard;
}

/**
 * Limits on patterns compiled from robots.txt.
 *
 * robots.txt is served by the party being audited, so its contents are
 * attacker-controlled. `*` → `.*` with no bound is catastrophic backtracking:
 * a measured 40-byte line — `Disallow: /a*a*a*…*b` with 20 wildcards — took
 * **101 seconds** for a single match and stalled the crawl with no watchdog.
 */
export const MAX_PATTERN_LENGTH = 500;
export const MAX_PATTERN_WILDCARDS = 5;

/** Compiled patterns are cached: matchLength is called per rule, per path. */
const patternCache = new Map<string, RegExp | null>();

/**
 * Convert a robots.txt path pattern into an anchored regular expression.
 * Returns null for a pattern too long or too wildcard-heavy to compile safely;
 * such a rule is treated as non-matching rather than risking the crawl.
 */
export function patternToRegExp(pattern: string): RegExp | null {
  const cached = patternCache.get(pattern);
  if (cached !== undefined) return cached;

  let compiled: RegExp | null = null;
  const wildcards = (pattern.match(/\*/g) ?? []).length;
  if (pattern.length <= MAX_PATTERN_LENGTH && wildcards <= MAX_PATTERN_WILDCARDS) {
    const anchored = pattern.endsWith('$');
    const body = anchored ? pattern.slice(0, -1) : pattern;
    const escaped = body
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      // `[^]*?` instead of `.*`: lazy and character-class based, which removes
      // the nested-quantifier backtracking that made this exploitable.
      .replace(/\*/g, '[^]*?');
    compiled = new RegExp(`^${escaped}${anchored ? '$' : ''}`);
  }
  if (patternCache.size < 2_000) patternCache.set(pattern, compiled);
  return compiled;
}

function matchLength(pattern: string, path: string): number {
  const re = patternToRegExp(pattern);
  if (!re) return -1;
  return re.test(path) ? pattern.replace(/\$$/, '').length : -1;
}

/**
 * Both spellings of a path: as given, and percent-decoded.
 *
 * A URL's `pathname` is percent-encoded, but robots.txt is written by hand and
 * a German shop writes `Disallow: /über-uns`, not `/%C3%BCber-uns`. Comparing
 * only the encoded form made every umlaut rule a no-op. Comparing both is the
 * permissive-to-the-site-owner reading: if either spelling matches a Disallow,
 * we stay out.
 */
function pathVariants(path: string): string[] {
  const variants = new Set<string>([path]);
  try {
    variants.add(decodeURIComponent(path));
  } catch {
    // Malformed escape sequence: the raw form is all we have.
  }
  try {
    variants.add(encodeURI(path));
  } catch {
    /* ignore */
  }
  return [...variants];
}

/**
 * Is `path` (a path + query, e.g. "/produkte?p=2") crawlable for this agent?
 *
 * Longest matching rule wins; Allow wins ties, which is what lets a site say
 * "Disallow: /admin" plus "Allow: /admin/public".
 */
export function isAllowed(rules: RobotsRules, userAgent: string, path: string): boolean {
  const group = selectGroup(rules, userAgent);
  if (!group) return true;

  const variants = pathVariants(path);
  let bestAllow = -1;
  let bestDisallow = -1;
  for (const candidate of variants) {
    for (const rule of group.allow) bestAllow = Math.max(bestAllow, matchLength(rule, candidate));
    for (const rule of group.disallow) {
      bestDisallow = Math.max(bestDisallow, matchLength(rule, candidate));
    }
  }

  if (bestDisallow === -1) return true;
  return bestAllow >= bestDisallow;
}

/** Crawl-delay declared for this agent, in milliseconds, if any. */
export function crawlDelayFor(rules: RobotsRules, userAgent: string): number | undefined {
  return selectGroup(rules, userAgent)?.crawlDelayMs;
}

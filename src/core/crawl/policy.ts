/**
 * Crawl politeness policy.
 *
 * This module exists to make impolite crawling hard rather than merely
 * discouraged. Three properties are load-bearing:
 *
 *  1. A contact URL is MANDATORY. Without it the bot is anonymous and a site
 *     operator has no way to reach us. `createPolicy` throws.
 *  2. The defaults are the polite values (robots.txt honoured, 1 request per
 *     2 seconds per host, 20 pages per shop).
 *  3. Any value LESS polite than the default is rejected unless the caller
 *     passes an explicit override with a written reason, which is then recorded
 *     on the policy and logged on every run.
 *
 * More polite values (slower, fewer pages) need no ceremony.
 */

export const BOT_NAME = 'BfsgAuditBot';
export const BOT_VERSION = '0.1';

export const POLICY_DEFAULTS = {
  /** Minimum delay between two requests to the same host. */
  minRequestIntervalMs: 2_000,
  /** Hard cap on pages fetched per shop. */
  maxPagesPerShop: 20,
  respectRobots: true,
  /** Per-navigation timeout. */
  timeoutMs: 30_000,
} as const;

export interface PolicyOverride {
  /** Written justification, e.g. "customer contract #12, written permission". */
  readonly reason: string;
}

export interface PolicyInput {
  readonly contactUrl?: string | undefined;
  readonly minRequestIntervalMs?: number | undefined;
  readonly maxPagesPerShop?: number | undefined;
  readonly respectRobots?: boolean | undefined;
  readonly timeoutMs?: number | undefined;
  /** Required to accept any value less polite than the default. */
  readonly override?: PolicyOverride | undefined;
}

export interface CrawlPolicy {
  readonly contactUrl: string;
  readonly userAgent: string;
  readonly minRequestIntervalMs: number;
  readonly maxPagesPerShop: number;
  readonly respectRobots: boolean;
  readonly timeoutMs: number;
  /** Human-readable list of settings that deviate from the polite defaults. */
  readonly overrides: readonly string[];
}

export class PolicyError extends Error {
  override readonly name = 'PolicyError';
}

function assertContactUrl(contactUrl: string | undefined): string {
  if (!contactUrl || contactUrl.trim() === '') {
    throw new PolicyError(
      'BFSG_CONTACT_URL is required. The crawler identifies itself in every request and must ' +
        'give site operators a way to reach you. Set BFSG_CONTACT_URL to an absolute http(s) URL.',
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(contactUrl);
  } catch {
    throw new PolicyError(`BFSG_CONTACT_URL must be an absolute URL, got: ${contactUrl}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new PolicyError(`BFSG_CONTACT_URL must be http or https, got: ${parsed.protocol}`);
  }
  return parsed.toString();
}

/**
 * Build a validated crawl policy. Throws `PolicyError` on a missing contact URL
 * or on an impolite setting without an explicit override.
 */
export function createPolicy(input: PolicyInput = {}): CrawlPolicy {
  const contactUrl = assertContactUrl(input.contactUrl);
  const overrides: string[] = [];

  const requireOverride = (what: string): void => {
    if (!input.override?.reason) {
      throw new PolicyError(
        `${what} is less polite than the default. Pass override: { reason: "…" } to accept it ` +
          'deliberately; the reason is recorded and logged on every run.',
      );
    }
    overrides.push(`${what} — Grund/reason: ${input.override.reason}`);
  };

  const interval = input.minRequestIntervalMs ?? POLICY_DEFAULTS.minRequestIntervalMs;
  if (!Number.isFinite(interval) || interval < 0) {
    throw new PolicyError(`minRequestIntervalMs must be a non-negative number, got: ${interval}`);
  }
  if (interval < POLICY_DEFAULTS.minRequestIntervalMs) {
    requireOverride(
      `Request interval ${interval} ms (default ${POLICY_DEFAULTS.minRequestIntervalMs} ms)`,
    );
  }

  const maxPages = input.maxPagesPerShop ?? POLICY_DEFAULTS.maxPagesPerShop;
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new PolicyError(`maxPagesPerShop must be a positive integer, got: ${maxPages}`);
  }
  if (maxPages > POLICY_DEFAULTS.maxPagesPerShop) {
    requireOverride(`Page cap ${maxPages} (default ${POLICY_DEFAULTS.maxPagesPerShop})`);
  }

  const respectRobots = input.respectRobots ?? POLICY_DEFAULTS.respectRobots;
  if (!respectRobots) {
    requireOverride('robots.txt ignored');
  }

  const timeoutMs = input.timeoutMs ?? POLICY_DEFAULTS.timeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new PolicyError(`timeoutMs must be a positive number, got: ${timeoutMs}`);
  }

  return {
    contactUrl,
    userAgent: `${BOT_NAME}/${BOT_VERSION} (+${contactUrl})`,
    minRequestIntervalMs: interval,
    maxPagesPerShop: maxPages,
    respectRobots,
    timeoutMs,
    overrides,
  };
}

/** One-line summary printed before every crawl so the settings are on the record. */
export function describePolicy(policy: CrawlPolicy): string {
  const lines = [
    `User-Agent: ${policy.userAgent}`,
    `robots.txt: ${policy.respectRobots ? 'wird befolgt' : 'IGNORIERT'}`,
    `Intervall:  ${policy.minRequestIntervalMs} ms pro Host`,
    `Seitenlimit: ${policy.maxPagesPerShop} pro Shop`,
  ];
  if (policy.overrides.length > 0) {
    lines.push('ABWEICHUNGEN VON DEN VOREINSTELLUNGEN:');
    for (const o of policy.overrides) lines.push(`  - ${o}`);
  }
  return lines.join('\n');
}

import { readFileSync } from 'node:fs';
import { createPolicy, type CrawlPolicy, type PolicyOverride } from '../core/crawl/policy.ts';

/**
 * Configuration.
 *
 * The only genuinely required value is `BFSG_CONTACT_URL`. It is required
 * because the crawler must be identifiable: a bot that hits a stranger's shop
 * without saying who it is and how to reach them is not acceptable, whatever
 * the rate limit says. `loadConfig` therefore fails loudly rather than
 * defaulting to something anonymous.
 */

export interface AppConfig {
  readonly policy: CrawlPolicy;
  readonly dataDir: string;
  readonly operatorName?: string | undefined;
  readonly operatorEmail?: string | undefined;
}

/** Minimal .env reader: KEY=VALUE lines, `#` comments, optional quotes. */
export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key !== '') out[key] = value;
  }
  return out;
}

/** Load .env into `env` without overwriting values already set. */
export function applyDotEnv(path: string, env: NodeJS.ProcessEnv = process.env): void {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const [key, value] of Object.entries(parseDotEnv(text))) {
    if (env[key] === undefined) env[key] = value;
  }
}

function optionalNumber(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} muss eine Zahl sein, ist aber: ${raw}`);
  return value;
}

export interface ConfigOverrides {
  readonly maxPages?: number | undefined;
  readonly minInterval?: number | undefined;
  readonly ignoreRobots?: boolean | undefined;
  readonly overrideReason?: string | undefined;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  cli: ConfigOverrides = {},
): AppConfig {
  const envOverrideReason = env['BFSG_POLITENESS_OVERRIDE_REASON'];
  const reason = cli.overrideReason ?? envOverrideReason;
  const override: PolicyOverride | undefined = reason ? { reason } : undefined;

  const ignoreRobots = cli.ignoreRobots ?? env['BFSG_IGNORE_ROBOTS'] === 'true';

  const policy = createPolicy({
    contactUrl: env['BFSG_CONTACT_URL'],
    minRequestIntervalMs:
      cli.minInterval ??
      optionalNumber(env['BFSG_MIN_REQUEST_INTERVAL_MS'], 'BFSG_MIN_REQUEST_INTERVAL_MS'),
    maxPagesPerShop:
      cli.maxPages ?? optionalNumber(env['BFSG_MAX_PAGES_PER_SHOP'], 'BFSG_MAX_PAGES_PER_SHOP'),
    respectRobots: !ignoreRobots,
    override,
  });

  return {
    policy,
    dataDir: env['BFSG_DATA_DIR'] ?? './out',
    operatorName: env['BFSG_OPERATOR_NAME'],
    operatorEmail: env['BFSG_OPERATOR_EMAIL'],
  };
}

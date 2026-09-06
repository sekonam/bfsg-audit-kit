import { describe, expect, it } from 'vitest';
import {
  BOT_NAME,
  createPolicy,
  describePolicy,
  POLICY_DEFAULTS,
  PolicyError,
} from '../src/core/crawl/policy.ts';

const CONTACT = 'https://beispiel.de/bot';

describe('createPolicy — contact URL is mandatory', () => {
  it('refuses to build a policy without a contact URL', () => {
    expect(() => createPolicy({})).toThrow(PolicyError);
    expect(() => createPolicy({ contactUrl: '' })).toThrow(/BFSG_CONTACT_URL is required/);
    expect(() => createPolicy({ contactUrl: '   ' })).toThrow(/BFSG_CONTACT_URL is required/);
  });

  it('refuses a relative or non-http contact URL', () => {
    expect(() => createPolicy({ contactUrl: '/bot' })).toThrow(/absolute URL/);
    expect(() => createPolicy({ contactUrl: 'mailto:me@example.de' })).toThrow(/http or https/);
    expect(() => createPolicy({ contactUrl: 'ftp://example.de' })).toThrow(/http or https/);
  });

  it('puts the contact URL into the User-Agent so operators can reach us', () => {
    const policy = createPolicy({ contactUrl: CONTACT });
    expect(policy.userAgent).toContain(BOT_NAME);
    expect(policy.userAgent).toContain(CONTACT);
    expect(policy.userAgent).toMatch(/^BfsgAuditBot\/[\d.]+ \(\+https:\/\//);
  });
});

describe('createPolicy — polite defaults', () => {
  it('defaults to robots.txt honoured, 2 s interval and 20 pages', () => {
    const policy = createPolicy({ contactUrl: CONTACT });
    expect(policy.respectRobots).toBe(true);
    expect(policy.minRequestIntervalMs).toBe(2000);
    expect(policy.maxPagesPerShop).toBe(20);
    expect(policy.overrides).toEqual([]);
    expect(POLICY_DEFAULTS.minRequestIntervalMs).toBe(2000);
    expect(POLICY_DEFAULTS.maxPagesPerShop).toBe(20);
  });

  it('accepts more polite values without ceremony', () => {
    const policy = createPolicy({
      contactUrl: CONTACT,
      minRequestIntervalMs: 5000,
      maxPagesPerShop: 5,
    });
    expect(policy.minRequestIntervalMs).toBe(5000);
    expect(policy.maxPagesPerShop).toBe(5);
    expect(policy.overrides).toEqual([]);
  });
});

describe('createPolicy — impolite settings require an explicit, recorded override', () => {
  it('rejects a faster request interval without an override', () => {
    expect(() => createPolicy({ contactUrl: CONTACT, minRequestIntervalMs: 200 })).toThrow(
      /less polite than the default/,
    );
  });

  it('rejects a higher page cap without an override', () => {
    expect(() => createPolicy({ contactUrl: CONTACT, maxPagesPerShop: 500 })).toThrow(
      /less polite than the default/,
    );
  });

  it('rejects ignoring robots.txt without an override', () => {
    expect(() => createPolicy({ contactUrl: CONTACT, respectRobots: false })).toThrow(
      /less polite than the default/,
    );
  });

  it('records the override reason so it appears in the run log', () => {
    const policy = createPolicy({
      contactUrl: CONTACT,
      respectRobots: false,
      maxPagesPerShop: 60,
      override: { reason: 'Auftrag 12, schriftliche Freigabe des Betreibers' },
    });
    expect(policy.overrides).toHaveLength(2);
    expect(policy.overrides.join('\n')).toContain('robots.txt ignored');
    expect(policy.overrides.join('\n')).toContain('schriftliche Freigabe');
    expect(describePolicy(policy)).toContain('ABWEICHUNGEN');
    expect(describePolicy(policy)).toContain('IGNORIERT');
  });

  it('rejects nonsensical values outright, override or not', () => {
    const override = { reason: 'x' };
    expect(() => createPolicy({ contactUrl: CONTACT, maxPagesPerShop: 0, override })).toThrow(
      /positive integer/,
    );
    expect(() => createPolicy({ contactUrl: CONTACT, maxPagesPerShop: 2.5, override })).toThrow(
      /positive integer/,
    );
    expect(() => createPolicy({ contactUrl: CONTACT, minRequestIntervalMs: -1, override })).toThrow(
      /non-negative/,
    );
    expect(() => createPolicy({ contactUrl: CONTACT, timeoutMs: 0, override })).toThrow(
      /positive number/,
    );
  });
});

describe('describePolicy', () => {
  it('states the settings in German for the run log', () => {
    const text = describePolicy(createPolicy({ contactUrl: CONTACT }));
    expect(text).toContain('robots.txt: wird befolgt');
    expect(text).toContain('2000 ms pro Host');
    expect(text).toContain('20 pro Shop');
  });
});

import { describe, expect, it } from 'vitest';
import {
  agentToken,
  crawlDelayFor,
  isAllowed,
  parseRobots,
  patternToRegExp,
  robotsFromResponse,
} from '../src/core/crawl/robots.ts';

const UA = 'BfsgAuditBot/0.1 (+https://beispiel.de/bot)';

describe('parseRobots', () => {
  it('parses groups, rules, crawl-delay and sitemaps', () => {
    const rules = parseRobots(`
# Kommentar
User-agent: *
Disallow: /admin
Allow: /admin/oeffentlich
Crawl-delay: 5

User-agent: BfsgAuditBot
Disallow: /intern

Sitemap: https://shop.de/sitemap.xml
`);
    expect(rules.groups).toHaveLength(2);
    expect(rules.groups[0]!.agents).toEqual(['*']);
    expect(rules.groups[0]!.disallow).toEqual(['/admin']);
    expect(rules.groups[0]!.allow).toEqual(['/admin/oeffentlich']);
    expect(rules.groups[0]!.crawlDelayMs).toBe(5000);
    expect(rules.sitemaps).toEqual(['https://shop.de/sitemap.xml']);
  });

  it('groups consecutive user-agent lines together', () => {
    const rules = parseRobots('User-agent: a\nUser-agent: b\nDisallow: /x');
    expect(rules.groups).toHaveLength(1);
    expect(rules.groups[0]!.agents).toEqual(['a', 'b']);
  });

  it('treats an empty Disallow as no restriction at all', () => {
    const rules = parseRobots('User-agent: *\nDisallow:');
    expect(rules.groups[0]!.disallow).toEqual([]);
    expect(isAllowed(rules, UA, '/anything')).toBe(true);
  });

  it('ignores comments and malformed lines', () => {
    const rules = parseRobots(
      '# nur ein Kommentar\ngarbage line\nUser-agent: *\nDisallow: /x # ok',
    );
    expect(rules.groups).toHaveLength(1);
    expect(isAllowed(rules, UA, '/x')).toBe(false);
  });
});

describe('isAllowed', () => {
  it('allows everything when robots.txt has no matching group', () => {
    const rules = parseRobots('User-agent: Googlebot\nDisallow: /');
    expect(isAllowed(rules, UA, '/produkte')).toBe(true);
  });

  it('honours a blanket disallow', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /');
    expect(isAllowed(rules, UA, '/')).toBe(false);
    expect(isAllowed(rules, UA, '/produkte')).toBe(false);
  });

  it('prefers the group naming our bot over the wildcard group', () => {
    const rules = parseRobots(
      'User-agent: *\nDisallow: /\n\nUser-agent: BfsgAuditBot\nDisallow: /intern',
    );
    expect(isAllowed(rules, UA, '/produkte')).toBe(true);
    expect(isAllowed(rules, UA, '/intern/x')).toBe(false);
  });

  it('lets the longest matching rule win, with Allow breaking ties', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /admin\nAllow: /admin/oeffentlich');
    expect(isAllowed(rules, UA, '/admin/geheim')).toBe(false);
    expect(isAllowed(rules, UA, '/admin/oeffentlich/seite')).toBe(true);
  });

  it('supports * and $ wildcards', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /suche?*');
    expect(isAllowed(rules, UA, '/handbuch.pdf')).toBe(false);
    expect(isAllowed(rules, UA, '/handbuch.pdf.html')).toBe(true);
    expect(isAllowed(rules, UA, '/suche?q=schuhe')).toBe(false);
    expect(isAllowed(rules, UA, '/produkte')).toBe(true);
  });

  it('matches on the bare product token of our User-Agent', () => {
    expect(agentToken(UA)).toBe('bfsgauditbot');
    const rules = parseRobots('User-agent: bfsgauditbot\nDisallow: /');
    expect(isAllowed(rules, UA, '/x')).toBe(false);
  });
});

describe('patternToRegExp', () => {
  it('anchors at the start and escapes regex metacharacters', () => {
    expect(patternToRegExp('/a+b').test('/a+b/c')).toBe(true);
    expect(patternToRegExp('/a+b').test('/x/a+b')).toBe(false);
  });

  it('anchors at the end for $ patterns', () => {
    expect(patternToRegExp('/x$').test('/x')).toBe(true);
    expect(patternToRegExp('/x$').test('/xy')).toBe(false);
  });
});

describe('robotsFromResponse — failure handling is conservative', () => {
  it('allows everything when robots.txt is absent (404)', () => {
    expect(robotsFromResponse(404, '').permissiveDefault).toBe(true);
    expect(isAllowed(robotsFromResponse(404, ''), UA, '/x')).toBe(true);
  });

  it('DISALLOWS everything when the server errors — a server we cannot ask is not crawled', () => {
    for (const status of [500, 502, 503, 0]) {
      expect(isAllowed(robotsFromResponse(status, ''), UA, '/x'), `status ${status}`).toBe(false);
    }
  });

  it('parses a 200 body', () => {
    expect(isAllowed(robotsFromResponse(200, 'User-agent: *\nDisallow: /x'), UA, '/x')).toBe(false);
  });
});

describe('crawlDelayFor', () => {
  it('returns the delay declared for the matching group', () => {
    const rules = parseRobots('User-agent: *\nCrawl-delay: 10');
    expect(crawlDelayFor(rules, UA)).toBe(10_000);
  });

  it('returns undefined when none is declared', () => {
    expect(crawlDelayFor(parseRobots('User-agent: *\nDisallow: /x'), UA)).toBeUndefined();
  });
});

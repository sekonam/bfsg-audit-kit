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

/**
 * Regression tests from the independent code review. Each of these reproduced a
 * real bypass of the robots.txt rules before the fix; the scenario is named in
 * the test so it cannot be "simplified" away later.
 */
describe('robots.txt — bypasses found in review', () => {
  it('picks the group whose agent actually matched, not the group with the longest agent line', () => {
    // The first group matches only via the 4-character prefix "bfsg" but also
    // carries a very long unrelated agent token. That token must not make the
    // group look more specific than the group naming our bot exactly.
    const rules = parseRobots(
      [
        'User-agent: bfsg',
        'User-agent: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'Disallow:',
        '',
        'User-agent: bfsgauditbot',
        'Disallow: /',
      ].join('\n'),
    );
    expect(isAllowed(rules, UA, '/geheim')).toBe(false);
  });

  it('matches percent-encoded paths against the rules a German shop actually writes', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /über-uns\nDisallow: /größen');
    expect(isAllowed(rules, UA, '/%C3%BCber-uns')).toBe(false);
    expect(isAllowed(rules, UA, '/gr%C3%B6%C3%9Fen/tabelle')).toBe(false);
    expect(isAllowed(rules, UA, '/produkte')).toBe(true);
  });

  it('matches an already-decoded path too', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /über-uns');
    expect(isAllowed(rules, UA, '/über-uns')).toBe(false);
  });

  it('does not let an unknown field split one group into two', () => {
    // "Host:" between two user-agent lines used to end the group, leaving an
    // empty rule set for our bot and silently discarding "Disallow: /".
    const rules = parseRobots(
      'User-agent: bfsgauditbot\nHost: shop.de\nUser-agent: *\nDisallow: /',
    );
    expect(isAllowed(rules, UA, '/x')).toBe(false);
  });

  it('does not let a Sitemap line merge two separate groups', () => {
    const rules = parseRobots(
      'User-agent: *\nDisallow: /\nSitemap: https://shop.de/s.xml\nUser-agent: googlebot\nDisallow:',
    );
    expect(isAllowed(rules, UA, '/x')).toBe(false);
  });

  it('ignores an empty User-agent value instead of treating it as a catch-all', () => {
    const rules = parseRobots('User-agent:\nDisallow:\n\nUser-agent: *\nDisallow: /');
    expect(isAllowed(rules, UA, '/x')).toBe(false);
  });
});

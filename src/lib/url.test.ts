import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type BaseMatch,
  type BasePattern,
  buildTargetUrl,
  matchBase,
  matchPatternFor,
  parseBase,
} from './url';

function base(raw: string): BasePattern {
  const parsed = parseBase(raw);
  if (!parsed) throw new Error(`expected ${raw} to parse`);
  return parsed;
}

function matched(url: URL, pattern: BasePattern): BaseMatch {
  const result = matchBase(url, pattern);
  if (!result) throw new Error(`expected ${url.href} to match`);
  return result;
}

test('parseBase reads scheme, port and path prefix', () => {
  assert.deepEqual(base('http://localhost:3000/app/'), {
    protocol: 'http:',
    hostPattern: 'localhost',
    port: '3000',
    pathPrefix: '/app',
    wildcards: 0,
  });
});

test('parseBase defaults to https and keeps wildcards', () => {
  assert.deepEqual(base('*.stage.example.com'), {
    protocol: 'https:',
    hostPattern: '*.stage.example.com',
    port: '',
    pathPrefix: '',
    wildcards: 1,
  });
});

test('parseBase rejects unusable input', () => {
  assert.equal(parseBase(''), null);
  assert.equal(parseBase('*'), null);
  assert.equal(parseBase('ftp://example.com'), null);
});

test('matchBase requires the same scheme and port', () => {
  const stage = base('https://stage.example.com');
  assert.ok(matchBase(new URL('https://stage.example.com/users/7'), stage));
  assert.equal(matchBase(new URL('http://stage.example.com/users/7'), stage), null);
  assert.equal(matchBase(new URL('https://stage.example.com:8443/'), stage), null);
});

test('matchBase honours path prefix boundaries', () => {
  const app = base('https://example.com/app');
  assert.deepEqual(matchBase(new URL('https://example.com/app/users'), app)?.rest, '/users');
  assert.deepEqual(matchBase(new URL('https://example.com/app'), app)?.rest, '/');
  assert.equal(matchBase(new URL('https://example.com/application'), app), null);
});

test('a wildcard label captures one or more labels', () => {
  const pattern = base('https://*.stage.example.com');
  assert.deepEqual(matchBase(new URL('https://billing.stage.example.com/x'), pattern)?.captures, [
    'billing',
  ]);
  assert.deepEqual(matchBase(new URL('https://eu.billing.stage.example.com/'), pattern)?.captures, [
    'eu.billing',
  ]);
  assert.equal(matchBase(new URL('https://stage.other.com/'), pattern), null);
});

test('a leading wildcard also matches the bare host', () => {
  const pattern = base('https://*.example.com');
  assert.deepEqual(matchBase(new URL('https://example.com/'), pattern)?.captures, ['']);
});

test('a wildcard inside a label stays within that label', () => {
  const pattern = base('https://app-*.example.com');
  assert.deepEqual(matchBase(new URL('https://app-42.example.com/'), pattern)?.captures, ['42']);
  assert.equal(matchBase(new URL('https://app-42.eu.example.com/'), pattern), null);
});

test('buildTargetUrl carries path, query, hash and wildcards over', () => {
  const from = base('https://*.stage.example.com');
  const to = base('https://*.example.com');
  const current = new URL('https://billing.stage.example.com/invoices/7?tab=lines#total');
  const match = matched(current, from);
  assert.equal(
    buildTargetUrl(current, match, to, true),
    'https://billing.example.com/invoices/7?tab=lines#total',
  );
});

test('buildTargetUrl swaps path prefixes', () => {
  const from = base('http://localhost:3000/app');
  const to = base('https://example.com');
  const current = new URL('http://localhost:3000/app/users/7');
  const match = matched(current, from);
  assert.equal(buildTargetUrl(current, match, to, true), 'https://example.com/users/7');
});

test('buildTargetUrl can drop the path entirely', () => {
  const from = base('https://stage.example.com');
  const to = base('https://example.com/app');
  const current = new URL('https://stage.example.com/users/7?q=1');
  const match = matched(current, from);
  assert.equal(buildTargetUrl(current, match, to, false), 'https://example.com/app');
});

test('an empty wildcard capture does not leave a stray dot', () => {
  const from = base('https://*.example.com');
  const to = base('https://*.stage.example.com');
  const current = new URL('https://example.com/orders');
  const match = matched(current, from);
  assert.equal(buildTargetUrl(current, match, to, true), 'https://stage.example.com/orders');
});

test('buildTargetUrl gives up when the target wildcard cannot be filled', () => {
  const from = base('https://example.com');
  const to = base('https://*.stage.example.com');
  const current = new URL('https://example.com/orders');
  const match = matched(current, from);
  assert.equal(buildTargetUrl(current, match, to, true), null);
});

test('match patterns drop ports and widen partial wildcards', () => {
  assert.equal(matchPatternFor(base('http://localhost:3000')), 'http://localhost/*');
  assert.equal(matchPatternFor(base('https://*.example.com')), 'https://*.example.com/*');
  assert.equal(matchPatternFor(base('https://app-*.example.com')), 'https://*.example.com/*');
});

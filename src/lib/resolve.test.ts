import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Resolution, candidatesFor, permissionPatterns, resolveUrl } from './resolve';
import { DEFAULT_SETTINGS, type EnvDef, type Settings } from './types';

function env(id: string, baseUrl: string, extra: Partial<EnvDef> = {}): EnvDef {
  return { id, label: id, badge: id.slice(0, 3).toUpperCase(), color: '#000000', baseUrl, guard: false, ...extra };
}

function resolved(settings: Settings, url: string): Resolution {
  const resolution = resolveUrl(settings, url);
  if (!resolution) throw new Error(`expected ${url} to resolve`);
  return resolution;
}

function settingsWith(...envs: EnvDef[]): Settings {
  return { ...DEFAULT_SETTINGS, projects: [{ id: 'prj', name: 'App', envs }] };
}

test('resolveUrl finds the environment serving a tab', () => {
  const settings = settingsWith(env('stage', 'https://stage.example.com'), env('prod', 'https://example.com'));
  const resolution = resolveUrl(settings, 'https://stage.example.com/users');
  assert.equal(resolution?.env.id, 'stage');
});

test('resolveUrl ignores pages that are not http(s)', () => {
  const settings = settingsWith(env('prod', 'https://example.com'));
  assert.equal(resolveUrl(settings, 'chrome://extensions'), null);
  assert.equal(resolveUrl(settings, 'not a url'), null);
});

test('resolveUrl prefers the most specific base URL', () => {
  const settings = settingsWith(env('site', 'https://example.com'), env('admin', 'https://example.com/admin'));
  assert.equal(resolveUrl(settings, 'https://example.com/admin/users')?.env.id, 'admin');
  assert.equal(resolveUrl(settings, 'https://example.com/users')?.env.id, 'site');
});

test('candidatesFor offers the other environments with rewritten URLs', () => {
  const settings = settingsWith(
    env('stage', 'https://stage.example.com'),
    env('prod', 'https://example.com'),
    env('regional', 'https://*.example.com'),
  );
  const resolution = resolved(settings, 'https://stage.example.com/users?page=2');
  const candidates = candidatesFor(resolution, settings);
  assert.deepEqual(
    candidates.map((candidate) => [candidate.env.id, candidate.url]),
    [
      ['prod', 'https://example.com/users?page=2'],
      // No wildcard was captured on the current page, so this one is out of reach.
      ['regional', null],
    ],
  );
});

test('candidatesFor drops the path when preservePath is off', () => {
  const settings: Settings = {
    ...settingsWith(env('stage', 'https://stage.example.com'), env('prod', 'https://example.com')),
    preservePath: false,
  };
  const resolution = resolved(settings, 'https://stage.example.com/users?page=2');
  assert.equal(candidatesFor(resolution, settings)[0]?.url, 'https://example.com/');
});

test('permissionPatterns deduplicates and covers every environment', () => {
  const settings = settingsWith(
    env('local', 'http://localhost:3000'),
    env('local-alt', 'http://localhost:4000'),
    env('prod', 'https://example.com'),
  );
  assert.deepEqual(permissionPatterns(settings), ['http://localhost/*', 'https://example.com/*']);
});

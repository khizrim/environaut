/**
 * Matching and rewriting of environment base URLs.
 *
 * A base URL is `scheme://host[:port][/path-prefix]`, where the host may
 * contain `*` wildcards. Whatever a wildcard matched on the current page is
 * carried over to the wildcards of the target environment, so
 * `https://*.dev.example.com` and `https://*.example.com` stay in sync.
 */

const MASK = 'wildcardmask';

export interface BasePattern {
  protocol: string;
  /** Host with `*` wildcards preserved. */
  hostPattern: string;
  /** Port, or '' for the scheme default. */
  port: string;
  /** Path prefix without a trailing slash, or ''. */
  pathPrefix: string;
  wildcards: number;
}

export interface BaseMatch {
  /** What each wildcard of the pattern matched, left to right. */
  captures: string[];
  /** Path after the prefix, always starting with '/'. */
  rest: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Parses a user-entered base URL. Returns null when it cannot be used. */
export function parseBase(raw: string): BasePattern | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    // `*` is not a valid host character everywhere, so it is masked for parsing.
    url = new URL(withScheme.replace(/\*/g, MASK));
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const hostPattern = url.hostname.split(MASK).join('*');
  if (!hostPattern || hostPattern === '*' || hostPattern === '.') return null;

  const pathPrefix = url.pathname.split(MASK).join('*').replace(/\/+$/, '');

  return {
    protocol: url.protocol,
    hostPattern,
    port: url.port,
    pathPrefix,
    wildcards: (hostPattern.match(/\*/g) ?? []).length,
  };
}

interface HostMatcher {
  re: RegExp;
  /** True when the pattern's leading `*.` was dropped, matching zero labels. */
  leadingEmpty: boolean;
}

function hostMatchers(hostPattern: string): HostMatcher[] {
  const toRegExp = (pattern: string): RegExp => {
    const labels = pattern.split('.').map((label) => {
      // A whole-label wildcard spans one or more labels, like Chrome match
      // patterns do; a wildcard inside a label stays within that label.
      if (label === '*') return '([^.]+(?:\\.[^.]+)*)';
      return label.split('*').map(escapeRegExp).join('([^.]*)');
    });
    return new RegExp(`^${labels.join('\\.')}$`, 'i');
  };

  const matchers: HostMatcher[] = [{ re: toRegExp(hostPattern), leadingEmpty: false }];
  if (hostPattern.startsWith('*.')) {
    matchers.push({ re: toRegExp(hostPattern.slice(2)), leadingEmpty: true });
  }
  return matchers;
}

function matchHost(hostname: string, hostPattern: string): string[] | null {
  for (const { re, leadingEmpty } of hostMatchers(hostPattern)) {
    const found = re.exec(hostname);
    if (!found) continue;
    const captures = found.slice(1).map((group) => group ?? '');
    return leadingEmpty ? ['', ...captures] : captures;
  }
  return null;
}

/** Tests a live URL against a base pattern. */
export function matchBase(url: URL, base: BasePattern): BaseMatch | null {
  if (url.protocol !== base.protocol) return null;
  if (url.port !== base.port) return null;

  const captures = matchHost(url.hostname, base.hostPattern);
  if (!captures) return null;

  const path = url.pathname || '/';
  if (!base.pathPrefix) return { captures, rest: path };
  if (path !== base.pathPrefix && !path.startsWith(`${base.pathPrefix}/`)) return null;

  return { captures, rest: path.slice(base.pathPrefix.length) || '/' };
}

/** Fills the wildcards of a host pattern. Returns null when captures run out. */
function fillHost(hostPattern: string, captures: string[]): string | null {
  const parts = hostPattern.split('*');
  let host = parts[0] ?? '';
  for (let i = 1; i < parts.length; i += 1) {
    const capture = captures[i - 1];
    if (capture === undefined) return null;
    host += capture + (parts[i] ?? '');
  }
  // A wildcard that matched zero labels leaves an empty label behind.
  return host.replace(/\.{2,}/g, '.').replace(/^\.|\.$/g, '');
}

/**
 * Builds the URL of the same page on another environment, or null when the
 * target has wildcards the current page cannot fill.
 */
export function buildTargetUrl(
  current: URL,
  match: BaseMatch,
  target: BasePattern,
  preservePath: boolean,
): string | null {
  const host = fillHost(target.hostPattern, match.captures);
  if (!host || host.includes('*')) return null;

  const origin = `${target.protocol}//${host}${target.port ? `:${target.port}` : ''}`;
  if (!preservePath) return `${origin}${target.pathPrefix || '/'}`;

  return `${origin}${target.pathPrefix}${match.rest}${current.search}${current.hash}`;
}

/**
 * Host permission pattern covering a base URL. Chrome match patterns ignore
 * ports and only allow `*` as the leading host label, so a wildcard inside a
 * label widens to the nearest whole label.
 */
export function matchPatternFor(base: BasePattern): string {
  let host = base.hostPattern;
  if (host.includes('*')) {
    const after = host.slice(host.lastIndexOf('*') + 1);
    const dot = after.indexOf('.');
    host = dot === -1 ? '*' : `*${after.slice(dot)}`;
  }
  return `${base.protocol}//${host}/*`;
}

/** Host and port of a base URL, for display. */
export function displayHost(base: BasePattern): string {
  return `${base.hostPattern}${base.port ? `:${base.port}` : ''}${base.pathPrefix}`;
}

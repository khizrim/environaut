import type { EnvDef, Project, Settings } from './types';
import {
  type BaseMatch,
  type BasePattern,
  buildTargetUrl,
  matchBase,
  matchPatternFor,
  parseBase,
} from './url';

export interface Resolution {
  project: Project;
  env: EnvDef;
  base: BasePattern;
  match: BaseMatch;
  url: URL;
}

export interface Candidate {
  env: EnvDef;
  /** Target URL, or null when the environment cannot be reached from here. */
  url: string | null;
}

function specificity(base: BasePattern): number {
  // Prefer the most specific environment: longer path prefixes first, then
  // fewer wildcards, so a bare host does not shadow a host plus path prefix.
  return base.pathPrefix.length * 10 - base.wildcards;
}

/** Finds the environment that serves `rawUrl`, if any. */
export function resolveUrl(settings: Settings, rawUrl: string): Resolution | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  let best: Resolution | null = null;
  let bestScore = -Infinity;

  for (const project of settings.projects) {
    for (const env of project.envs) {
      const base = parseBase(env.baseUrl);
      if (!base) continue;
      const match = matchBase(url, base);
      if (!match) continue;
      const score = specificity(base);
      if (score > bestScore) {
        best = { project, env, base, match, url };
        bestScore = score;
      }
    }
  }
  return best;
}

/** The other environments of the resolved project, with their target URLs. */
export function candidatesFor(resolution: Resolution, settings: Settings): Candidate[] {
  return resolution.project.envs
    .filter((env) => env.id !== resolution.env.id)
    .map((env) => {
      const base = parseBase(env.baseUrl);
      return {
        env,
        url: base ? buildTargetUrl(resolution.url, resolution.match, base, settings.preservePath) : null,
      };
    });
}

/** Host permission patterns covering every configured environment. */
export function permissionPatterns(settings: Settings): string[] {
  const patterns = new Set<string>();
  for (const project of settings.projects) {
    for (const env of project.envs) {
      const base = parseBase(env.baseUrl);
      if (base) patterns.add(matchPatternFor(base));
    }
  }
  return [...patterns];
}

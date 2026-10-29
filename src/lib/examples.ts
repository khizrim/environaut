import { newId } from './id';
import { ENV_COLORS, type Project } from './types';

/** A ready-made project, so the settings page is never a blank slate. */
export function exampleProject(): Project {
  return {
    id: newId('prj'),
    name: 'Example app',
    envs: [
      {
        id: newId('env'),
        label: 'Local',
        badge: 'LOC',
        color: ENV_COLORS[0],
        baseUrl: 'http://localhost:3000',
        guard: false,
      },
      {
        id: newId('env'),
        label: 'Staging',
        badge: 'STG',
        color: ENV_COLORS[3],
        baseUrl: 'https://stage.example.com',
        guard: false,
      },
      {
        id: newId('env'),
        label: 'Production',
        badge: 'PRD',
        color: ENV_COLORS[4],
        baseUrl: 'https://example.com',
        guard: true,
      },
    ],
  };
}

/** A project seeded from a tab the user is looking at. */
export function projectFromUrl(rawUrl: string): Project | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const name = url.hostname.replace(/^www\./, '');
  return {
    id: newId('prj'),
    name,
    envs: [
      {
        id: newId('env'),
        label: 'This site',
        badge: url.hostname.slice(0, 3).toUpperCase(),
        color: ENV_COLORS[1],
        baseUrl: url.origin,
        guard: false,
      },
    ],
  };
}

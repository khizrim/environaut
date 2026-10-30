export const SCHEMA_VERSION = 1;

/** One environment of a project, e.g. staging. */
export interface EnvDef {
  id: string;
  /** Full name shown in the popup, e.g. "Staging". */
  label: string;
  /** Up to four characters for the toolbar badge, e.g. "STG". */
  badge: string;
  /** Hex colour used for the badge and the on-page banner. */
  color: string;
  /**
   * Base URL of the environment: scheme, host, optional port and optional path
   * prefix. The host may contain `*`, e.g. `https://*.stage.example.com`.
   */
  baseUrl: string;
  /** Ask for confirmation in the popup before jumping here. */
  guard: boolean;
}

/** A set of environments that serve the same application. */
export interface Project {
  id: string;
  name: string;
  envs: EnvDef[];
}

export type BannerCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface Settings {
  version: number;
  projects: Project[];
  /** Colour the toolbar badge with the environment of the active tab. */
  showBadge: boolean;
  /** Show a small on-page banner. Needs host access for the matched sites. */
  showBanner: boolean;
  bannerCorner: BannerCorner;
  /** Carry path, query and hash over to the target environment. */
  preservePath: boolean;
  /** Open the target environment in a new tab instead of the current one. */
  openInNewTab: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  version: SCHEMA_VERSION,
  projects: [],
  showBadge: true,
  showBanner: false,
  bannerCorner: 'bottom-right',
  preservePath: true,
  openInNewTab: false,
};

export const ENV_COLORS = [
  '#64748b', // slate - local
  '#0ea5e9', // sky - dev
  '#a855f7', // purple - test
  '#f59e0b', // amber - stage
  '#dc2626', // red - prod
] as const;

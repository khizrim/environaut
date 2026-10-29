import { DEFAULT_SETTINGS, SCHEMA_VERSION, type Settings } from './types';

const KEY = 'settings';

function migrate(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const stored = raw as Partial<Settings>;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    version: SCHEMA_VERSION,
    projects: Array.isArray(stored.projects) ? stored.projects : [],
  };
}

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(KEY);
  return migrate(stored[KEY]);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ [KEY]: { ...settings, version: SCHEMA_VERSION } });
}

/** Calls `listener` whenever the settings change in any extension context. */
export function onSettingsChanged(listener: (settings: Settings) => void): () => void {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: chrome.storage.AreaName,
  ): void => {
    if (area !== 'sync' || !(KEY in changes)) return;
    listener(migrate(changes[KEY]?.newValue));
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

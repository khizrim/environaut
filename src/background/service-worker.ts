import { readableOn } from '../lib/color';
import { type Resolution, candidatesFor, permissionPatterns, resolveUrl } from '../lib/resolve';
import { loadSettings, onSettingsChanged } from '../lib/storage';
import type { Settings } from '../lib/types';

const BANNER_SCRIPT_ID = 'environaut-banner';
const MENU_ROOT = 'environaut-open-in';
const MENU_ENV_PREFIX = 'environaut-env:';

// The service worker is torn down after a few idle seconds, so nothing is kept
// in module scope: every listener reads the settings it needs.

async function resolveTab(tabId: number, settings: Settings): Promise<Resolution | null> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab.url ? resolveUrl(settings, tab.url) : null;
  } catch {
    return null;
  }
}

async function paintBadge(tabId: number, settings: Settings): Promise<void> {
  const resolution = settings.showBadge ? await resolveTab(tabId, settings) : null;
  try {
    if (!resolution) {
      await chrome.action.setBadgeText({ tabId, text: '' });
      await chrome.action.setTitle({ tabId, title: 'Environaut' });
      return;
    }
    await chrome.action.setBadgeText({ tabId, text: resolution.env.badge.slice(0, 4) });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: resolution.env.color });
    await chrome.action.setBadgeTextColor({ tabId, color: readableOn(resolution.env.color) });
    await chrome.action.setTitle({
      tabId,
      title: `${resolution.project.name} — ${resolution.env.label}`,
    });
  } catch {
    // The tab went away while we were painting; nothing to do.
  }
}

async function paintAllBadges(settings: Settings): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => (tab.id ? paintBadge(tab.id, settings) : undefined)));
}

/**
 * Rebuilds the page context menu for the project of the active tab. The
 * signature guard keeps us from tearing the menu down on every tab switch.
 */
async function syncMenus(tabId: number, settings: Settings): Promise<void> {
  const resolution = await resolveTab(tabId, settings);
  const signature = resolution
    ? `${resolution.project.id}:${resolution.env.id}:${settings.preservePath}`
    : 'none';

  const { menuSignature } = await chrome.storage.session.get('menuSignature');
  if (menuSignature === signature) return;
  await chrome.storage.session.set({ menuSignature: signature });

  await chrome.contextMenus.removeAll();
  if (!resolution) return;

  const candidates = candidatesFor(resolution, settings).filter((candidate) => candidate.url);
  if (candidates.length === 0) return;

  chrome.contextMenus.create({
    id: MENU_ROOT,
    title: `Open this page in… (${resolution.project.name})`,
    contexts: ['page'],
  });
  for (const candidate of candidates) {
    chrome.contextMenus.create({
      id: `${MENU_ENV_PREFIX}${candidate.env.id}`,
      parentId: MENU_ROOT,
      title: candidate.env.label,
      contexts: ['page'],
    });
  }
}

/**
 * Registers the on-page banner for the configured hosts we actually hold
 * permission for, and tears it down when the banner is switched off.
 */
async function syncBannerScript(settings: Settings): Promise<void> {
  try {
    const registered = await chrome.scripting.getRegisteredContentScripts({
      ids: [BANNER_SCRIPT_ID],
    });

    const granted: string[] = [];
    for (const pattern of permissionPatterns(settings)) {
      if (await chrome.permissions.contains({ origins: [pattern] })) granted.push(pattern);
    }

    if (!settings.showBanner || granted.length === 0) {
      if (registered.length > 0) {
        await chrome.scripting.unregisterContentScripts({ ids: [BANNER_SCRIPT_ID] });
      }
      return;
    }

    const script: chrome.scripting.RegisteredContentScript = {
      id: BANNER_SCRIPT_ID,
      js: ['content/banner.js'],
      matches: granted,
      runAt: 'document_end',
      allFrames: false,
      persistAcrossSessions: true,
    };
    if (registered.length > 0) await chrome.scripting.updateContentScripts([script]);
    else await chrome.scripting.registerContentScripts([script]);
  } catch (error) {
    console.error('Environaut: could not sync the page banner', error);
  }
}

async function openTarget(tab: chrome.tabs.Tab, url: string, settings: Settings): Promise<void> {
  if (settings.openInNewTab) {
    await chrome.tabs.create({ url, index: tab.index + 1, openerTabId: tab.id });
    return;
  }
  if (tab.id !== undefined) await chrome.tabs.update(tab.id, { url });
}

async function refreshActiveTab(): Promise<void> {
  const settings = await loadSettings();
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id !== undefined) {
    await paintBadge(tab.id, settings);
    await syncMenus(tab.id, settings);
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const settings = await loadSettings();
  await syncBannerScript(settings);
  await paintAllBadges(settings);
  if (details.reason === 'install') await chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await loadSettings();
  await syncBannerScript(settings);
  await paintAllBadges(settings);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const settings = await loadSettings();
  await paintBadge(tabId, settings);
  await syncMenus(tabId, settings);
});

chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (change.url === undefined && change.status !== 'complete') return;
  const settings = await loadSettings();
  await paintBadge(tabId, settings);
  if (tab.active) await syncMenus(tabId, settings);
});

onSettingsChanged(async (settings) => {
  await syncBannerScript(settings);
  await paintAllBadges(settings);
  await chrome.storage.session.remove('menuSignature');
  await refreshActiveTab();
});

chrome.permissions.onAdded.addListener(async () => {
  await syncBannerScript(await loadSettings());
});

chrome.permissions.onRemoved.addListener(async () => {
  await syncBannerScript(await loadSettings());
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const id = String(info.menuItemId);
  if (!id.startsWith(MENU_ENV_PREFIX) || !tab?.id || !tab.url) return;

  const settings = await loadSettings();
  const resolution = resolveUrl(settings, tab.url);
  if (!resolution) return;

  const envId = id.slice(MENU_ENV_PREFIX.length);
  const candidate = candidatesFor(resolution, settings).find((item) => item.env.id === envId);
  if (candidate?.url) await openTarget(tab, candidate.url, settings);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'next-env' && command !== 'prev-env') return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return;

  const settings = await loadSettings();
  const resolution = resolveUrl(settings, tab.url);
  if (!resolution) return;

  const envs = resolution.project.envs;
  const current = envs.findIndex((env) => env.id === resolution.env.id);
  const step = command === 'next-env' ? 1 : -1;
  const reachable = new Map(
    candidatesFor(resolution, settings).map((candidate) => [candidate.env.id, candidate.url]),
  );

  for (let offset = 1; offset < envs.length; offset += 1) {
    const index = (((current + step * offset) % envs.length) + envs.length) % envs.length;
    const env = envs[index];
    // A guarded environment asks for confirmation, which a keyboard shortcut
    // cannot give, so the shortcut skips it. The popup still offers it.
    if (!env || env.guard) continue;
    const url = reachable.get(env.id);
    if (url) {
      await openTarget(tab, url, settings);
      return;
    }
  }
});

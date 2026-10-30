import { readableOn } from '../lib/color';
import { type Resolution, resolveUrl } from '../lib/resolve';
import { loadSettings, onSettingsChanged } from '../lib/storage';
import type { Settings } from '../lib/types';

const HOST_ID = 'environaut-banner-host';
const DISMISS_PREFIX = 'environaut:dismissed:';

const CSS = `
  :host { all: initial; }
  .banner {
    position: fixed;
    z-index: 2147483000;
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 320px;
    padding: 6px 8px 6px 12px;
    border-radius: 999px;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
    font: 600 12px/1.3 system-ui, sans-serif;
    letter-spacing: 0.02em;
    animation: appear 160ms ease-out;
  }
  .banner[data-corner^="top"] { top: 12px; }
  .banner[data-corner^="bottom"] { bottom: 12px; }
  .banner[data-corner$="left"] { left: 12px; }
  .banner[data-corner$="right"] { right: 12px; }
  .label { white-space: nowrap; }
  .project {
    overflow: hidden;
    max-width: 150px;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.75;
    font-weight: 500;
  }
  .dismiss {
    all: unset;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    opacity: 0.7;
  }
  .dismiss:hover { opacity: 1; background: rgb(255 255 255 / 0.2); }
  .dismiss:focus-visible { outline: 2px solid currentColor; outline-offset: 1px; opacity: 1; }
  @keyframes appear { from { opacity: 0; transform: translateY(4px); } }
  @media (prefers-reduced-motion: reduce) {
    .banner { animation: none; }
  }
`;

function dismissKey(resolution: Resolution): string {
  return `${DISMISS_PREFIX}${resolution.project.id}:${resolution.env.id}`;
}

function isDismissed(resolution: Resolution): boolean {
  try {
    return sessionStorage.getItem(dismissKey(resolution)) === '1';
  } catch {
    return false;
  }
}

function remember(resolution: Resolution): void {
  try {
    sessionStorage.setItem(dismissKey(resolution), '1');
  } catch {
    // Storage can be blocked by the page; the banner then returns on reload.
  }
}

function teardown(): void {
  document.getElementById(HOST_ID)?.remove();
}

function render(resolution: Resolution, settings: Settings): void {
  teardown();

  const host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = CSS;

  const banner = document.createElement('div');
  banner.className = 'banner';
  banner.dataset.corner = settings.bannerCorner;
  banner.style.background = resolution.env.color;
  banner.style.color = readableOn(resolution.env.color);
  banner.setAttribute('role', 'status');

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = resolution.env.label;

  const project = document.createElement('span');
  project.className = 'project';
  project.textContent = resolution.project.name;

  const dismiss = document.createElement('button');
  dismiss.className = 'dismiss';
  dismiss.type = 'button';
  dismiss.textContent = '×';
  dismiss.title = 'Hide until this tab is reloaded';
  dismiss.setAttribute('aria-label', 'Hide the Environaut banner until this tab is reloaded');
  dismiss.addEventListener('click', () => {
    remember(resolution);
    teardown();
  });

  banner.append(label, project, dismiss);
  shadow.append(style, banner);
  document.documentElement.append(host);
}

async function update(settings?: Settings): Promise<void> {
  const current = settings ?? (await loadSettings());
  if (!current.showBanner) {
    teardown();
    return;
  }
  const resolution = resolveUrl(current, location.href);
  if (!resolution || isDismissed(resolution)) {
    teardown();
    return;
  }
  render(resolution, current);
}

void update();
onSettingsChanged((settings) => void update(settings));

// Single-page apps change the URL without a reload, which can move the tab to
// a different environment (or out of one).
const navigation = (window as unknown as { navigation?: EventTarget }).navigation;
navigation?.addEventListener('navigatesuccess', () => void update());

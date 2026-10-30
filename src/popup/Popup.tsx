import { useCallback, useEffect, useRef, useState } from 'react';
import { readableOn } from '../lib/color';
import { projectFromUrl } from '../lib/examples';
import { type Candidate, type Resolution, candidatesFor, resolveUrl } from '../lib/resolve';
import { loadSettings, saveSettings } from '../lib/storage';
import type { Settings } from '../lib/types';
import { displayHost, parseBase } from '../lib/url';

interface Loaded {
  settings: Settings;
  tab: chrome.tabs.Tab | undefined;
  resolution: Resolution | null;
  candidates: Candidate[];
}

async function read(): Promise<Loaded> {
  const [settings, tabs] = await Promise.all([
    loadSettings(),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ]);
  const tab = tabs[0];
  const resolution = tab?.url ? resolveUrl(settings, tab.url) : null;
  return {
    settings,
    tab,
    resolution,
    candidates: resolution ? candidatesFor(resolution, settings) : [],
  };
}

function hostOf(baseUrl: string): string {
  const base = parseBase(baseUrl);
  return base ? displayHost(base) : baseUrl;
}

function openOptions(hash = ''): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL(`options.html${hash}`) });
  window.close();
}

export function Popup(): React.JSX.Element {
  const [data, setData] = useState<Loaded | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    void read().then(setData);
  }, []);

  const go = useCallback(
    async (candidate: Candidate, inNewTab: boolean) => {
      if (!data?.tab || !candidate.url) return;
      if (inNewTab) {
        await chrome.tabs.create({
          url: candidate.url,
          index: data.tab.index + 1,
          openerTabId: data.tab.id,
        });
      } else if (data.tab.id !== undefined) {
        await chrome.tabs.update(data.tab.id, { url: candidate.url });
      }
      window.close();
    },
    [data],
  );

  const activate = useCallback(
    (candidate: Candidate, modifier: boolean) => {
      if (!candidate.url || !data) return;
      if (candidate.env.guard && confirming !== candidate.env.id) {
        setConfirming(candidate.env.id);
        return;
      }
      // A modifier inverts the configured default, the way links behave.
      void go(candidate, data.settings.openInNewTab !== modifier);
    },
    [confirming, data, go],
  );

  // Digits pick an environment, arrows move between them, Escape backs out.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!data) return;

      if (event.key === 'Escape') {
        if (confirming) {
          event.preventDefault();
          setConfirming(null);
        }
        return;
      }

      if (/^[1-9]$/.test(event.key)) {
        const candidate = data.candidates[Number(event.key) - 1];
        if (candidate?.url) {
          event.preventDefault();
          activate(candidate, event.shiftKey);
        }
        return;
      }

      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const rows = rowRefs.current.filter((row): row is HTMLButtonElement => row !== null);
      if (rows.length === 0) return;
      event.preventDefault();
      const current = rows.indexOf(document.activeElement as HTMLButtonElement);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = current === -1 ? 0 : (current + step + rows.length) % rows.length;
      rows[next]?.focus();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activate, confirming, data]);

  const toggleNewTab = useCallback(
    async (openInNewTab: boolean) => {
      if (!data) return;
      const settings: Settings = { ...data.settings, openInNewTab };
      setData({ ...data, settings });
      await saveSettings(settings);
    },
    [data],
  );

  const addThisSite = useCallback(async () => {
    if (!data?.tab?.url) return;
    const project = projectFromUrl(data.tab.url);
    if (!project) return;
    const settings: Settings = { ...data.settings, projects: [...data.settings.projects, project] };
    await saveSettings(settings);
    openOptions(`#${project.id}`);
  }, [data]);

  if (!data) {
    return (
      <div className="popup-shell">
        <p className="note">Loading…</p>
      </div>
    );
  }

  const { resolution, candidates, settings, tab } = data;
  const isWebPage = Boolean(tab?.url && /^https?:/.test(tab.url));

  return (
    <div className="popup-shell">
      {resolution ? (
        <>
          <div className="popup-head">
            <span
              className="chip"
              style={{ background: resolution.env.color, color: readableOn(resolution.env.color) }}
            >
              {resolution.env.badge}
            </span>
            <span className="project truncate">{resolution.project.name}</span>
            <span className="muted">{resolution.env.label}</span>
          </div>

          {candidates.length === 0 ? (
            <p className="note">
              This project has no other environment yet. Add one in the settings.
            </p>
          ) : (
            <ul className="env-list">
              {candidates.map((candidate, index) => {
                const isConfirming = confirming === candidate.env.id;
                return (
                  <li key={candidate.env.id}>
                    <button
                      className="env-row"
                      type="button"
                      ref={(node) => {
                        rowRefs.current[index] = node;
                      }}
                      data-confirming={isConfirming}
                      disabled={!candidate.url}
                      title={
                        candidate.url ??
                        'This environment uses a wildcard the current page cannot fill in.'
                      }
                      onClick={(event) =>
                        activate(candidate, event.metaKey || event.ctrlKey || event.shiftKey)
                      }
                    >
                      <span
                        className="chip"
                        style={{
                          background: candidate.env.color,
                          color: readableOn(candidate.env.color),
                        }}
                      >
                        {candidate.env.badge}
                      </span>
                      <span className="name">
                        <span className="truncate">
                          {isConfirming ? `Confirm: open ${candidate.env.label}` : candidate.env.label}
                        </span>
                        <span className="host truncate">{hostOf(candidate.env.baseUrl)}</span>
                      </span>
                      {index < 9 && <kbd>{index + 1}</kbd>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {confirming && (
            <p className="note" role="status">
              Press the row again to open it, or Escape to cancel.
            </p>
          )}
        </>
      ) : (
        <div className="popup-empty">
          <h1>No environment matches this tab</h1>
          {isWebPage ? (
            <>
              <p className="note truncate">{tab?.url}</p>
              <button className="btn btn-primary" type="button" onClick={() => void addThisSite()}>
                Add this site as a project
              </button>
            </>
          ) : (
            <p className="note">Environaut works on http and https pages.</p>
          )}
          {settings.projects.length > 0 && (
            <button className="btn" type="button" onClick={() => openOptions()}>
              Open settings
            </button>
          )}
        </div>
      )}

      <div className="popup-foot">
        <label className="newtab-toggle">
          <input
            type="checkbox"
            checked={settings.openInNewTab}
            onChange={(event) => void toggleNewTab(event.target.checked)}
          />
          New tab
        </label>
        <span className="spacer" />
        <button className="btn btn-quiet" type="button" onClick={() => openOptions()}>
          Settings
        </button>
      </div>
    </div>
  );
}

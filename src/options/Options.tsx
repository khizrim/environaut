import { useCallback, useEffect, useRef, useState } from 'react';
import { exampleProject } from '../lib/examples';
import { newId } from '../lib/id';
import { permissionPatterns } from '../lib/resolve';
import { loadSettings, saveSettings } from '../lib/storage';
import {
  type BannerCorner,
  DEFAULT_SETTINGS,
  ENV_COLORS,
  type EnvDef,
  type Project,
  SCHEMA_VERSION,
  type Settings,
} from '../lib/types';

const BASE_URL_PATTERN = 'https?://[^\\s/:]+(:[0-9]+)?(/[^\\s]*)?';
const CORNERS: BannerCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

function newEnv(index: number): EnvDef {
  return {
    id: newId('env'),
    label: '',
    badge: '',
    color: ENV_COLORS[index % ENV_COLORS.length] ?? ENV_COLORS[0],
    baseUrl: '',
    guard: false,
  };
}

/** Accepts only the shape we wrote ourselves; anything else is rejected. */
function parseBackup(raw: string): Settings | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const candidate = data as Partial<Settings>;
  if (!Array.isArray(candidate.projects)) return null;

  const projects: Project[] = [];
  for (const project of candidate.projects) {
    if (!project || typeof project !== 'object') return null;
    const { name, envs } = project as Partial<Project>;
    if (typeof name !== 'string' || !Array.isArray(envs)) return null;
    projects.push({
      id: typeof project.id === 'string' ? project.id : newId('prj'),
      name,
      envs: envs.map((env, index) => ({
        ...newEnv(index),
        ...env,
        id: typeof env?.id === 'string' ? env.id : newId('env'),
      })),
    });
  }

  return { ...DEFAULT_SETTINGS, ...candidate, version: SCHEMA_VERSION, projects };
}

export function Options(): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState('');
  const [importError, setImportError] = useState('');
  const [hostAccess, setHostAccess] = useState<'granted' | 'partial' | 'none'>('none');
  const saveTimer = useRef<number | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void loadSettings().then((loaded) => {
      setSettings(loaded);
      const target = location.hash.slice(1);
      if (target) {
        requestAnimationFrame(() => {
          document.getElementById(`name-${target}`)?.focus();
        });
      }
    });
  }, []);

  const refreshHostAccess = useCallback(async (current: Settings) => {
    const patterns = permissionPatterns(current);
    if (patterns.length === 0) {
      setHostAccess('none');
      return;
    }
    const checks = await Promise.all(
      patterns.map((pattern) => chrome.permissions.contains({ origins: [pattern] })),
    );
    const granted = checks.filter(Boolean).length;
    setHostAccess(granted === patterns.length ? 'granted' : granted === 0 ? 'none' : 'partial');
  }, []);

  useEffect(() => {
    if (settings) void refreshHostAccess(settings);
  }, [refreshHostAccess, settings]);

  // Everything autosaves; the write is debounced so typing does not hammer
  // chrome.storage.sync, which rate-limits writes.
  const update = useCallback((next: Settings) => {
    setSettings(next);
    setStatus('Saving…');
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveSettings(next).then(
        () => setStatus('Saved'),
        (error: unknown) => setStatus(`Could not save: ${String(error)}`),
      );
    }, 400);
  }, []);

  const updateProject = useCallback(
    (projectId: string, change: (project: Project) => Project) => {
      if (!settings) return;
      update({
        ...settings,
        projects: settings.projects.map((project) =>
          project.id === projectId ? change(project) : project,
        ),
      });
    },
    [settings, update],
  );

  const grantHostAccess = useCallback(async () => {
    if (!settings) return;
    // chrome.permissions.request must run on the click itself, with nothing
    // awaited before it, or Chrome drops the user gesture.
    const granted = await chrome.permissions.request({ origins: permissionPatterns(settings) });
    await refreshHostAccess(settings);
    setStatus(granted ? 'Host access granted' : 'Host access was declined');
  }, [refreshHostAccess, settings]);

  const revokeHostAccess = useCallback(async () => {
    if (!settings) return;
    await chrome.permissions.remove({ origins: permissionPatterns(settings) });
    await refreshHostAccess(settings);
    setStatus('Host access removed');
  }, [refreshHostAccess, settings]);

  const exportBackup = useCallback(() => {
    if (!settings) return;
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'environaut-settings.json';
    link.click();
    URL.revokeObjectURL(link.href);
  }, [settings]);

  const importBackup = useCallback(
    async (file: File) => {
      const parsed = parseBackup(await file.text());
      if (!parsed) {
        setImportError('That file is not an Environaut backup.');
        return;
      }
      setImportError('');
      update(parsed);
    },
    [update],
  );

  if (!settings) {
    return (
      <div className="options-shell">
        <p className="hint">Loading…</p>
      </div>
    );
  }

  const patterns = permissionPatterns(settings);

  return (
    <div className="options-shell">
      <header className="options-head">
        <h1>Environaut</h1>
        <p className="status" role="status">
          {status}
        </p>
      </header>

      <section>
        <h2>Projects</h2>
        <p className="section-note">
          A project is one application and its environments. Environaut matches the tab you are on
          against these base URLs, then rewrites the address for the environment you pick. A base
          URL may use <code>*</code> in the host, and whatever it matches is carried over, so{' '}
          <code>https://*.stage.example.com</code> and <code>https://*.example.com</code> stay in
          step.
        </p>

        {settings.projects.length === 0 && (
          <div className="actions">
            <button
              className="btn btn-primary"
              type="button"
              onClick={() =>
                update({ ...settings, projects: [{ id: newId('prj'), name: '', envs: [newEnv(0)] }] })
              }
            >
              Add a project
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => update({ ...settings, projects: [exampleProject()] })}
            >
              Start from an example
            </button>
          </div>
        )}

        {settings.projects.map((project) => (
          <article className="project" key={project.id} id={project.id}>
            <div className="project-head">
              <div className="field">
                <label htmlFor={`name-${project.id}`}>Project name</label>
                <input
                  id={`name-${project.id}`}
                  type="text"
                  value={project.name}
                  placeholder="Billing app"
                  onChange={(event) =>
                    updateProject(project.id, (current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </div>
              <button
                className="btn btn-danger"
                type="button"
                onClick={() =>
                  update({
                    ...settings,
                    projects: settings.projects.filter((item) => item.id !== project.id),
                  })
                }
              >
                Delete project
              </button>
            </div>

            <div className="env-table">
              <div className="env-head" aria-hidden="true">
                <span>Environment</span>
                <span>Badge</span>
                <span>Colour</span>
                <span>Base URL</span>
                <span>Confirm</span>
                <span />
              </div>

              {project.envs.map((env, index) => (
                <div className="env-edit" key={env.id}>
                  <input
                    type="text"
                    value={env.label}
                    placeholder="Staging"
                    aria-label="Environment name"
                    onChange={(event) =>
                      updateProject(project.id, (current) => ({
                        ...current,
                        envs: current.envs.map((item) =>
                          item.id === env.id ? { ...item, label: event.target.value } : item,
                        ),
                      }))
                    }
                  />
                  <input
                    type="text"
                    value={env.badge}
                    maxLength={4}
                    placeholder="STG"
                    aria-label="Badge text, up to four characters"
                    onChange={(event) =>
                      updateProject(project.id, (current) => ({
                        ...current,
                        envs: current.envs.map((item) =>
                          item.id === env.id ? { ...item, badge: event.target.value } : item,
                        ),
                      }))
                    }
                  />
                  <input
                    type="color"
                    value={env.color}
                    list="env-colors"
                    aria-label="Badge colour"
                    onChange={(event) =>
                      updateProject(project.id, (current) => ({
                        ...current,
                        envs: current.envs.map((item) =>
                          item.id === env.id ? { ...item, color: event.target.value } : item,
                        ),
                      }))
                    }
                  />
                  <input
                    type="text"
                    value={env.baseUrl}
                    required
                    pattern={BASE_URL_PATTERN}
                    spellCheck={false}
                    placeholder="https://stage.example.com"
                    aria-label="Base URL"
                    onChange={(event) =>
                      updateProject(project.id, (current) => ({
                        ...current,
                        envs: current.envs.map((item) =>
                          item.id === env.id ? { ...item, baseUrl: event.target.value } : item,
                        ),
                      }))
                    }
                  />
                  <label className="guard-cell">
                    <input
                      type="checkbox"
                      checked={env.guard}
                      onChange={(event) =>
                        updateProject(project.id, (current) => ({
                          ...current,
                          envs: current.envs.map((item) =>
                            item.id === env.id ? { ...item, guard: event.target.checked } : item,
                          ),
                        }))
                      }
                    />
                    Ask
                  </label>
                  <span className="row-actions">
                    <button
                      className="btn btn-quiet"
                      type="button"
                      disabled={index === 0}
                      aria-label={`Move ${env.label || 'environment'} up`}
                      onClick={() =>
                        updateProject(project.id, (current) => {
                          const envs = [...current.envs];
                          const previous = envs[index - 1];
                          const target = envs[index];
                          if (!previous || !target) return current;
                          envs[index - 1] = target;
                          envs[index] = previous;
                          return { ...current, envs };
                        })
                      }
                    >
                      ↑
                    </button>
                    <button
                      className="btn btn-quiet"
                      type="button"
                      disabled={index === project.envs.length - 1}
                      aria-label={`Move ${env.label || 'environment'} down`}
                      onClick={() =>
                        updateProject(project.id, (current) => {
                          const envs = [...current.envs];
                          const next = envs[index + 1];
                          const target = envs[index];
                          if (!next || !target) return current;
                          envs[index + 1] = target;
                          envs[index] = next;
                          return { ...current, envs };
                        })
                      }
                    >
                      ↓
                    </button>
                    <button
                      className="btn btn-quiet btn-danger"
                      type="button"
                      aria-label={`Remove ${env.label || 'environment'}`}
                      onClick={() =>
                        updateProject(project.id, (current) => ({
                          ...current,
                          envs: current.envs.filter((item) => item.id !== env.id),
                        }))
                      }
                    >
                      ✕
                    </button>
                  </span>
                </div>
              ))}
            </div>

            <div className="actions">
              <button
                className="btn"
                type="button"
                onClick={() =>
                  updateProject(project.id, (current) => ({
                    ...current,
                    envs: [...current.envs, newEnv(current.envs.length)],
                  }))
                }
              >
                Add an environment
              </button>
            </div>
          </article>
        ))}

        {settings.projects.length > 0 && (
          <div className="actions">
            <button
              className="btn"
              type="button"
              onClick={() =>
                update({
                  ...settings,
                  projects: [...settings.projects, { id: newId('prj'), name: '', envs: [newEnv(0)] }],
                })
              }
            >
              Add a project
            </button>
          </div>
        )}

        <datalist id="env-colors">
          {ENV_COLORS.map((color) => (
            <option key={color} value={color} />
          ))}
        </datalist>
      </section>

      <section>
        <h2>Behaviour</h2>
        <div className="toggles">
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.showBadge}
              onChange={(event) => update({ ...settings, showBadge: event.target.checked })}
            />
            <span>Colour the toolbar icon with the environment of the active tab</span>
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.preservePath}
              onChange={(event) => update({ ...settings, preservePath: event.target.checked })}
            />
            <span>Keep the path, query and fragment when switching</span>
            <p className="hint">Off means every jump lands on the root of the environment.</p>
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.openInNewTab}
              onChange={(event) => update({ ...settings, openInNewTab: event.target.checked })}
            />
            <span>Open the target environment in a new tab</span>
            <p className="hint">
              Hold Shift, Ctrl or Cmd while picking an environment to do the opposite once.
            </p>
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.showBanner}
              onChange={(event) => update({ ...settings, showBanner: event.target.checked })}
            />
            <span>Show a small banner on the page itself</span>
            <p className="hint">Needs host access, below. Each banner can be hidden per tab.</p>
          </label>

          <div className="inline-field">
            <label htmlFor="corner">Banner corner</label>
            <select
              id="corner"
              value={settings.bannerCorner}
              disabled={!settings.showBanner}
              onChange={(event) =>
                update({ ...settings, bannerCorner: event.target.value as BannerCorner })
              }
            >
              {CORNERS.map((corner) => (
                <option key={corner} value={corner}>
                  {corner.replace('-', ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section>
        <h2>Host access</h2>
        <p className="section-note">
          Switching environments and the toolbar badge work without access to page content. The
          on-page banner has to run on the page, so it needs permission for the hosts below.
        </p>
        {patterns.length === 0 ? (
          <p className="hint">Add an environment first.</p>
        ) : (
          <>
            <ul className="patterns">
              {patterns.map((pattern) => (
                <li key={pattern}>{pattern}</li>
              ))}
            </ul>
            <p className="hint">
              Current access:{' '}
              {hostAccess === 'granted'
                ? 'granted for every host above'
                : hostAccess === 'partial'
                  ? 'granted for some of the hosts above'
                  : 'not granted'}
            </p>
            <div className="actions">
              <button className="btn btn-primary" type="button" onClick={() => void grantHostAccess()}>
                Grant host access
              </button>
              <button className="btn" type="button" onClick={() => void revokeHostAccess()}>
                Remove host access
              </button>
            </div>
          </>
        )}
      </section>

      <section>
        <h2>Backup</h2>
        <p className="section-note">
          Settings sync through your Chrome profile. Export a file to share a project list with
          someone else or to keep a copy.
        </p>
        <div className="actions">
          <button className="btn" type="button" onClick={exportBackup}>
            Export settings
          </button>
          <button className="btn" type="button" onClick={() => fileInput.current?.click()}>
            Import settings
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void importBackup(file);
            }}
          />
        </div>
        {importError && <p className="error">{importError}</p>}
      </section>
    </div>
  );
}

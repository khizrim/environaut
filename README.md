# Environaut

A Chrome extension for people who keep several environments of the same
application open: it shows which one a tab is on, and moves the page you are
looking at to another environment without you editing the address bar.

- **Badge** — the toolbar icon carries the environment of the active tab
  (`PRD`, `STG`, `LOC`…) in the colour you picked for it.
- **Switch** — the popup lists the other environments of the same project and
  jumps to the same path, query and fragment on the one you choose.
- **Guard** — environments can be marked so that production needs one extra
  click before it opens.
- **Banner** — optionally, a small pill in the corner of the page itself.
- **Keyboard** — `Alt+E` opens the popup, `1`–`9` pick an environment, arrows
  move between them, `Alt+Shift+.` and `Alt+Shift+,` step to the next and
  previous environment without opening anything.

## Install from source

```sh
npm install
npm run build
```

Then open `chrome://extensions`, turn on **Developer mode**, choose **Load
unpacked** and pick the `dist` folder. The settings page opens on the first
install; `npm run dev` rebuilds on change (reload the extension in Chrome to
pick a rebuild up).

## Setting up a project

A *project* is one application, and its *environments* are the places it runs.
Each environment has a base URL: scheme, host, an optional port and an optional
path prefix.

| Environment | Base URL |
| --- | --- |
| Local | `http://localhost:3000` |
| Staging | `https://stage.example.com` |
| Production | `https://example.com` |

With that in place, `https://stage.example.com/invoices/7?tab=lines` is one
click away from `https://example.com/invoices/7?tab=lines`.

**Wildcards.** The host may contain `*`, and whatever it matched is carried
over to the target environment. With `https://*.stage.example.com` and
`https://*.example.com`, the tab on `billing.stage.example.com` moves to
`billing.example.com`. A `*` standing on its own as a label matches one or more
labels; a `*` inside a label stays within it, so `https://app-*.example.com`
matches `app-42.example.com` but not `app-42.eu.example.com`. A leading `*.`
also matches the bare host.

**Path prefixes.** If one environment lives under a prefix, say
`http://localhost:3000/app`, the prefix is swapped rather than appended:
`/app/users/7` locally becomes `/users/7` on an environment without a prefix.

**Specificity.** When two environments could both claim a URL, the one with the
longer path prefix and fewer wildcards wins, so `https://example.com/admin` is
not shadowed by `https://example.com`.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Keeps your projects in your Chrome profile and syncs them. |
| `tabs` | Reads the URL of the active tab to work out which environment it is. |
| `contextMenus` | Offers "Open this page in…" on the page menu. |
| `scripting` | Registers the on-page banner for the hosts you allow. |
| host access | Optional, and only for the hosts in your own projects. Asked for when you switch the on-page banner on; everything else works without it. |

Environaut sends nothing anywhere: there is no server, no analytics and no
network traffic of its own. Your project list lives in `chrome.storage.sync`,
and the **Backup** section of the settings page exports it as a file.

## Development

| Command | What it does |
| --- | --- |
| `npm run build` | Icons, type check, unit tests, then the production bundle in `dist`. |
| `npm run dev` | Same bundle, rebuilt on change. |
| `npm test` | Unit tests for URL matching and resolution (`node:test`). |
| `npm run typecheck` | TypeScript across the extension, the tests and the build config. |
| `npm run smoke` | Loads `dist` into Chromium and checks the badge, popup and banner end to end. Needs Playwright: `npm install --no-save playwright && npx playwright install chromium`. |
| `npm run zip` | A `dist` archive, ready to upload. |

### Layout

```
src/background/service-worker.ts  badge, context menu, shortcuts, banner registration
src/content/banner.ts             the on-page pill, in a shadow root
src/popup/                        the environment switcher
src/options/                      projects, behaviour, host access, backup
src/lib/                          matching, rewriting, storage (with the unit tests)
```

The popup and the settings page are built by Vite as ES modules; the content
script is bundled separately because content scripts must be classic scripts.
Chrome 123 is the minimum version, which is what lets the UI use `light-dark()`
without a fallback.

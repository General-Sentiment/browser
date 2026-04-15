const { app, BrowserWindow, WebContentsView, ipcMain, nativeTheme, Menu, shell } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const yaml = require('js-yaml')

// ── Protocol registration ────────────────────────────────────────────────────
// Register in packaged builds so macOS lists the app in default browser settings.
// process.defaultApp is true during `electron .` dev runs — skip there to avoid
// the "switch default browser?" prompt.
if (!process.defaultApp) {
  app.setAsDefaultProtocolClient('http')
  app.setAsDefaultProtocolClient('https')
}

// Buffer for URLs received before the app is ready
let pendingUrl = null

// macOS: open-url fires when the OS asks us to handle a URL
app.on('open-url', (event, url) => {
  event.preventDefault()
  if (!app.isReady()) {
    pendingUrl = url
    return
  }
  openUrlInBrowser(url)
})

function openUrlInBrowser(url) {
  // External URLs (Mail, other apps, x-callback) always get a fresh window
  // rather than clobbering whatever the user is currently looking at.
  const state = openNewWindow(url)
  if (state?.win) {
    state.win.show()
    state.win.focus()
  }
}

// ── Paths ──────────────────────────────────────────────────────────────────────
const HOME = require('os').homedir()
const LEGACY_DATA_DIR = path.join(HOME, '.browser')
const DATA_DIR = path.join(HOME, '.general-browser')
const SITES_DIR = path.join(DATA_DIR, 'sites')
const SOURCES_DIR = path.join(DATA_DIR, 'sources')
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.yml')
const HISTORY_PATH = path.join(DATA_DIR, 'history.json')
const MANIFEST_PATH = path.join(DATA_DIR, 'ui-manifest.json')
const PENDING_UPDATE_PATH = path.join(DATA_DIR, 'pending-update.yml')
const WINDOW_STATE_PATH = path.join(DATA_DIR, 'window-state.json')
const ROOT_AGENTS_PATH = path.join(DATA_DIR, 'AGENTS.md')
const SITES_AGENTS_PATH = path.join(SITES_DIR, 'AGENTS.md')
const SOURCES_AGENTS_PATH = path.join(SOURCES_DIR, 'AGENTS.md')
const BUILTIN_UI = path.join(__dirname, 'ui')
const BUILTIN_SITES = path.join(__dirname, 'sites')

// ── Settings ───────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS_YML = `# ~/.general-browser/settings.yml

# Start page (blank if omitted)
# home: https://example.com

# Default search engine ($s = search terms)
search: https://www.google.com/search?q=$s

# Color mode: system, light, or dark
# color_mode: system
`

const ROOT_AGENTS_MD = `# General Browser — User Data

This directory holds your General Browser configuration, site rules, and (optionally) the ejected browser UI source.

The browser is a minimal, fully modifiable shell. Everything the user can customize lives here.

## Structure

- [sites/](sites/AGENTS.md) — site rules: custom CSS/JS injected into pages by URL pattern.
- [sources/](sources/AGENTS.md) — ejected browser UI source (empty until ejected from Settings).
- \`settings.yml\` — browser preferences (start page, search engine, color mode).
- \`history.json\` — recent browsing history (up to 1000 entries).
- \`window-state.json\` — last window size and position.

When editing anything in this directory, read the AGENTS.md in the relevant subdirectory first.
`

const SITES_AGENTS_MD = `# Site Rules

This directory holds site rules: custom CSS and JS that General Browser injects into pages matched by URL pattern.

## sites.yaml

Rules live in \`sites.yaml\`:

\`\`\`yaml
rules:
  - name: YouTube
    enabled: true
    matches:
      - "*://www.youtube.com/*"
    css:
      - sites/youtube/style.css
    js:
      - sites/youtube/script.js
\`\`\`

- \`matches\` use glob patterns; \`*\` matches any characters.
- \`css\` / \`js\` paths are relative to \`~/.general-browser/\` (so they begin with \`sites/\`).
- CSS is injected after page load. Use \`!important\` to override site styles.
- JS runs in the page's main world with full DOM access.
- For SPAs, listen for navigation events — pages don't fully reload.
- Prefer CSS-only solutions when possible.

## Adding or editing a rule

1. Read \`sites.yaml\` to check whether a rule for the site already exists.
2. If not, create \`<sitename>/style.css\` and/or \`script.js\` in this directory.
3. Add an entry to \`sites.yaml\` with the correct matches and file paths.
4. If the rule exists, edit its CSS/JS files in place.

Changes are picked up automatically — no restart needed.
`

const SOURCES_AGENTS_MD = `# Sources

This directory holds the ejected browser UI source. It is empty until you eject from the browser's Settings view.

When populated, the browser loads its UI from here instead of the copy bundled with the app. Edit the files directly; reload the window to see changes.

## Structure

\`\`\`
ui/
  index.html     Shell
  app.js         Preact overlay app (address bar, history)
  settings.js    Settings view
  error.html     Error page for failed loads
  style.css      Styles (light/dark, oklch)
  lib/           Vendored Preact + htm + hooks
\`\`\`

- No build step, no transpiler. Plain ES modules using Preact + htm.
- Use the \`html\` tagged template literal (htm) instead of JSX.
- Keep it small.

## Applying Updates (/update-ui)

When \`UPDATE.md\` appears in this directory, the browser's built-in UI has changed since the user ejected. A machine-readable manifest is also written to \`~/.general-browser/pending-update.yml\`:

\`\`\`yaml
source_dir: /path/to/sources
builtin_dir: /path/to/app
files:
  - path: ui/app.js
    status: modified
    user_modified: true
\`\`\`

### For files the user has NOT modified (\`user_modified: false\`)

- **modified**: copy from \`builtin_dir\` to \`source_dir\`. Safe to overwrite.
- **added**: copy the new file from \`builtin_dir\`.
- **deleted**: delete the file from \`source_dir\`.

### For files the user HAS modified (\`user_modified: true\`)

Read both the built-in (new upstream) version and the user's current version. Apply upstream changes while preserving the user's customizations.

- User changes always take priority.
- If both sides changed the same region, keep the user's version and add a comment noting what upstream intended.
- If upstream deleted it but the user modified it, keep the user's file with a comment.

After applying, tell the user to click "Mark as Resolved" in browser Settings. This re-baselines the manifest and removes \`UPDATE.md\`.
`

function writeIfMissing(filePath, contents) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, contents)
}

function migrateLegacyDataDir() {
  // One-time move from ~/.browser to ~/.general-browser
  if (fs.existsSync(LEGACY_DATA_DIR) && !fs.existsSync(DATA_DIR)) {
    try {
      fs.renameSync(LEGACY_DATA_DIR, DATA_DIR)
    } catch {
      // Fall through — we'll just create a fresh data dir
    }
  }
}

function ensureDataDir() {
  migrateLegacyDataDir()
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.mkdirSync(SOURCES_DIR, { recursive: true })

  // Seed SITES_DIR from the built-in sites the first time we run
  if (!fs.existsSync(SITES_DIR)) {
    copyDirRecursive(BUILTIN_SITES, SITES_DIR)
  }

  writeIfMissing(SETTINGS_PATH, DEFAULT_SETTINGS_YML)
  writeIfMissing(ROOT_AGENTS_PATH, ROOT_AGENTS_MD)
  writeIfMissing(SITES_AGENTS_PATH, SITES_AGENTS_MD)
  writeIfMissing(SOURCES_AGENTS_PATH, SOURCES_AGENTS_MD)
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8')
    const loaded = yaml.load(raw) || {}
    // Legacy: old installs stored a user-picked source_dir in settings.yml
    if (loaded.source_dir !== undefined) delete loaded.source_dir
    return loaded
  } catch {
    return {}
  }
}

// ── Shared state ───────────────────────────────────────────────────────────────
let history = []
let settings = {}
let lastWindowBounds = null
const windows = new Map()  // webContentsId -> WindowState

function loadWindowState() {
  try { return JSON.parse(fs.readFileSync(WINDOW_STATE_PATH, 'utf8')) } catch { return null }
}

function saveWindowState(bounds) {
  lastWindowBounds = bounds
  fs.writeFileSync(WINDOW_STATE_PATH, JSON.stringify(bounds))
}

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'))
  } catch {
    return []
  }
}

function saveHistory() {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history.slice(0, 1000), null, 2))
}

function addToHistory(url, title) {
  history = history.filter(h => h.url !== url)
  history.unshift({ url, title, time: Date.now() })
  history = history.slice(0, 1000)
  saveHistory()
}

// ── UI resolution chain ────────────────────────────────────────────────────────
function hasEjectedUI() {
  return fs.existsSync(path.join(SOURCES_DIR, 'ui', 'index.html'))
}

function getUIPath() {
  return hasEjectedUI() ? path.join(SOURCES_DIR, 'ui') : BUILTIN_UI
}

function getSitesPath() {
  return SITES_DIR
}

function getSitesConfigPath() {
  const custom = path.join(SITES_DIR, 'sites.yaml')
  if (fs.existsSync(custom)) return custom
  return path.join(BUILTIN_SITES, 'sites.yaml')
}

function hashFile(filePath) {
  const data = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(data).digest('hex')
}

function walkDir(dir, prefix = '') {
  const results = {}
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? prefix + '/' + entry.name : entry.name
    if (entry.isDirectory()) {
      Object.assign(results, walkDir(path.join(dir, entry.name), rel))
    } else {
      results[rel] = hashFile(path.join(dir, entry.name))
    }
  }
  return results
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(s, d)
    } else {
      fs.copyFileSync(s, d)
    }
  }
}

function checkForUIUpdates() {
  if (!hasEjectedUI() || !fs.existsSync(MANIFEST_PATH)) {
    return { pending: false }
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
    const builtinHashes = walkDir(BUILTIN_UI, 'ui')
    const files = []

    for (const [rel, hash] of Object.entries(builtinHashes)) {
      const manifestHash = manifest.files?.[rel]
      if (!manifestHash) {
        files.push({ path: rel, status: 'added', user_modified: false })
      } else if (hash !== manifestHash) {
        const userFile = path.join(SOURCES_DIR, rel)
        let userModified = false
        if (fs.existsSync(userFile)) {
          userModified = hashFile(userFile) !== manifestHash
        }
        files.push({ path: rel, status: 'modified', user_modified: userModified })
      }
    }

    for (const rel of Object.keys(manifest.files || {})) {
      if (!builtinHashes[rel]) {
        const userFile = path.join(SOURCES_DIR, rel)
        const userModified = fs.existsSync(userFile) && hashFile(userFile) !== manifest.files[rel]
        files.push({ path: rel, status: 'deleted', user_modified: userModified })
      }
    }

    return { pending: files.length > 0, files }
  } catch {
    return { pending: false }
  }
}

function applyColorMode() {
  const mode = settings.color_mode || 'system'
  nativeTheme.themeSource = mode === 'light' ? 'light' : mode === 'dark' ? 'dark' : 'system'
}

function saveSettings(newSettings) {
  fs.writeFileSync(SETTINGS_PATH, yaml.dump(newSettings))
  settings = newSettings
  applyColorMode()
}

// ── Site rules (user styles & scripts) ─────────────────────────────────────────
function loadSitesConfig() {
  try {
    return yaml.load(fs.readFileSync(getSitesConfigPath(), 'utf8')) || { rules: [] }
  } catch {
    return { rules: [] }
  }
}

function saveSitesConfig(config) {
  const configPath = getSitesConfigPath()
  fs.writeFileSync(configPath, yaml.dump(config))
}

function urlMatchesPattern(url, pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
  return new RegExp('^' + escaped + '$').test(url)
}

function resolveSiteFile(relativePath) {
  // Rule paths are relative to DATA_DIR (they begin with "sites/...").
  // Resolution chain: user's sites dir -> built-in (as a fallback for refs the user deleted).
  const custom = path.join(DATA_DIR, relativePath)
  if (fs.existsSync(custom)) return custom
  const builtin = path.join(__dirname, relativePath)
  if (fs.existsSync(builtin)) return builtin
  return null
}

function injectSiteRules(webContents, url) {
  const config = loadSitesConfig()
  for (const rule of config.rules) {
    if (!rule.enabled) continue
    const matched = rule.matches.some(p => urlMatchesPattern(url, p))
    if (!matched) continue

    if (Array.isArray(rule.css)) {
      for (const cssPath of rule.css) {
        const full = resolveSiteFile(cssPath)
        if (full) {
          const css = fs.readFileSync(full, 'utf8')
          webContents.insertCSS(css).catch(() => {})
        }
      }
    }

    if (Array.isArray(rule.js)) {
      for (const jsPath of rule.js) {
        const full = resolveSiteFile(jsPath)
        if (full) {
          const code = fs.readFileSync(full, 'utf8')
          webContents.executeJavaScript(code).catch(() => {})
        }
      }
    }
  }
}

// ── Per-window state ───────────────────────────────────────────────────────────
// ── Keyboard shortcuts (per-webContents, not global) ───────────────────────
function registerShortcuts(contents, getState) {
  contents.on('before-input-event', (event, input) => {
    if (!input.meta && !input.control) return
    const state = getState()
    if (!state) return
    const key = input.key?.toLowerCase()

    if (key === ',' && input.type === 'keyDown') {
      event.preventDefault()
      if (state.overlayView) {
        fitOverlay(state)
        state.overlayView.webContents.focus()
        state.win.setWindowButtonPosition({ x: 12, y: 12 })
        state.overlayView.webContents.send('show-settings')
      }
    } else if ((key === 'k' || key === 'l' || key === ';') && input.type === 'keyDown') {
      event.preventDefault()
      if (state.overlayView) state.overlayView.webContents.send('toggle-overlay')
    } else if ((key === 't' || key === 'n') && !input.shift && input.type === 'keyDown') {
      event.preventDefault()
      openNewWindow()
    } else if (key === 'r' && !input.shift && input.type === 'keyDown') {
      event.preventDefault()
      const overlayBounds = state.overlayView?.getBounds()
      if (overlayBounds && overlayBounds.width > 0) {
        state.overlayView.webContents.reload()
      } else if (state.view?.webContents) {
        state.view.webContents.reload()
      }
    } else if (key === 'w' && !input.shift && input.type === 'keyDown') {
      event.preventDefault()
      state.win.close()
    } else if (key === '[' && !input.shift && input.type === 'keyDown') {
      event.preventDefault()
      if (state.view?.webContents.navigationHistory.canGoBack()) state.view.webContents.navigationHistory.goBack()
    } else if (key === ']' && !input.shift && input.type === 'keyDown') {
      event.preventDefault()
      if (state.view?.webContents.navigationHistory.canGoForward()) state.view.webContents.navigationHistory.goForward()
    }
  })
}

function createWindowState() {
  const state = {
    win: null,
    overlayView: null,
    view: null,
    url: '',
    title: '',
  }

  // ── Window ─────────────────────────────────────────────────────────────────
  const saved = lastWindowBounds || loadWindowState()
  state.win = new BrowserWindow({
    width: saved?.width || 1200,
    height: saved?.height || 800,
    minWidth: 414,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    windowButtonPosition: { x: -20, y: -20 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#000' : '#fff',
    icon: path.join(__dirname, 'assets', 'icon.png'),
  })

  // ── Page view ──────────────────────────────────────────────────────────────
  state.view = new WebContentsView({
    webPreferences: { contextIsolation: true, sandbox: true },
  })
  state.view.setBackgroundColor('#ffffff')
  state.win.contentView.addChildView(state.view)
  fitView(state, state.view)
  registerShortcuts(state.view.webContents, () => state)

  state.view.webContents.on('did-navigate', (_e, navUrl) => {
    state.url = navUrl
    state.title = state.view.webContents.getTitle() || navUrl
    addToHistory(navUrl, state.title)
    notifyUI(state)
  })
  state.view.webContents.on('did-finish-load', () => {
    const url = state.view.webContents.getURL()
    if (url) injectSiteRules(state.view.webContents, url)
  })
  state.view.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // ERR_ABORTED (-3) fires during normal navigation; ignore it.
    if (!isMainFrame || errorCode === -3) return
    const errorPage = path.join(getUIPath(), 'error.html')
    const params = new URLSearchParams({
      url: validatedURL || '',
      code: String(errorCode),
      desc: errorDescription || '',
    })
    state.view.webContents.loadURL('file://' + errorPage + '?' + params.toString())
  })
  state.view.webContents.on('did-navigate-in-page', (_e, navUrl) => {
    state.url = navUrl
    notifyUI(state)
  })
  state.view.webContents.on('page-title-updated', (_e, title) => {
    state.title = title
    notifyUI(state)
  })

  // ── Overlay ────────────────────────────────────────────────────────────────
  state.overlayView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      allowFileAccessFromFileUrls: true,
    },
  })
  state.win.contentView.addChildView(state.overlayView)
  state.overlayView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
  state.overlayView.webContents.loadFile(path.join(getUIPath(), 'index.html'))
  state.overlayView.setBackgroundColor('#00000000')

  registerShortcuts(state.overlayView.webContents, () => state)
  windows.set(state.overlayView.webContents.id, state)

  const saveBounds = debounce(() => {
    if (state.win && !state.win.isDestroyed()) saveWindowState(state.win.getBounds())
  }, 500)

  state.win.on('resize', () => {
    fitView(state, state.view)
    const ob = state.overlayView?.getBounds()
    if (ob && ob.width > 0 && ob.height > 0) {
      const wb = state.win.contentView.getBounds()
      if (ob.width >= wb.width - 20 || ob.height >= wb.height - 20) {
        fitOverlay(state)
      }
    }
    saveBounds()
  })

  state.win.on('move', saveBounds)

  state.win.on('focus', () => {
    if (state.url && state.overlayView) {
      const ob = state.overlayView.getBounds()
      const wb = state.win.contentView.getBounds()
      if (ob.width === wb.width && ob.height === wb.height) {
        // Overlay is full-size — leave it
      } else if (ob.width > 0) {
        state.overlayView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      }
      state.view.webContents.focus()
    }
  })

  state.win.on('closed', () => {
    windows.delete(state.overlayView.webContents.id)
    state.win = null
  })

  state.overlayView.webContents.on('did-finish-load', () => {
    setTimeout(() => showOverlayIfBlank(state), 100)
  })

  return state
}

function fitView(state, view) {
  if (!state.win || !view || typeof view.setBounds !== 'function') return
  const bounds = state.win.contentView.getBounds()
  view.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height })
}

function fitOverlay(state) {
  if (!state.win || !state.overlayView) return
  const bounds = state.win.contentView.getBounds()
  state.overlayView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height })
}

function notifyUI(state) {
  if (!state.overlayView) return
  state.overlayView.webContents.send('state-update', {
    url: state.url,
    title: state.title,
  })
}

function showOverlayIfBlank(state) {
  if (!state.url) {
    if (state.overlayView) {
      fitOverlay(state)
      state.overlayView.webContents.focus()
      state.win.setWindowButtonPosition({ x: 12, y: 12 })
      state.overlayView.webContents.send('show-overlay')
    }
  } else {
    if (state.overlayView) {
      state.overlayView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      state.win.setWindowButtonPosition({ x: -20, y: -20 })
      state.overlayView.webContents.send('hide-overlay')
      state.view.webContents.focus()
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function stateFromEvent(event) {
  return windows.get(event.sender.id)
}

function focusedState() {
  for (const state of windows.values()) {
    if (state.win && state.win.isFocused()) return state
  }
  return windows.values().next().value || null
}

function openNewWindow(url) {
  const focused = BrowserWindow.getFocusedWindow()
  const state = createWindowState()
  if (focused) {
    const [x, y] = focused.getPosition()
    state.win.setPosition(x + 20, y + 20)
  } else if (lastWindowBounds) {
    state.win.setPosition(lastWindowBounds.x, lastWindowBounds.y)
  }
  const target = url ?? settings.home ?? ''
  if (target) {
    state.view.webContents.loadURL(target)
    state.url = target
  }
  return state
}

// ── IPC ────────────────────────────────────────────────────────────────────────
ipcMain.handle('navigate', (e, url) => {
  const state = stateFromEvent(e)
  if (!state) return
  let target = url.trim()
  if (!/^https?:\/\//i.test(target) && !target.includes('localhost')) {
    if (!target.includes(' ') && /^[a-z0-9-]+\.[a-z]{2,}/i.test(target)) {
      target = 'https://' + target
    } else {
      const searchUrl = (settings.search || 'https://www.google.com/search?q=$s')
      target = searchUrl.replace('$s', encodeURIComponent(target))
    }
  }
  state.view.webContents.loadURL(target)
})

ipcMain.handle('go-back', (e) => {
  const state = stateFromEvent(e)
  if (!state) return
  if (state.view.webContents.navigationHistory.canGoBack()) state.view.webContents.navigationHistory.goBack()
})

ipcMain.handle('go-forward', (e) => {
  const state = stateFromEvent(e)
  if (!state) return
  if (state.view.webContents.navigationHistory.canGoForward()) state.view.webContents.navigationHistory.goForward()
})

ipcMain.handle('get-history', () => history)

ipcMain.handle('reload-ui', (e, restoreView) => {
  const state = stateFromEvent(e)
  if (!state?.overlayView) return
  state.overlayView.webContents.once('did-finish-load', () => {
    if (restoreView) state.overlayView.webContents.send('restore-view', restoreView)
  })
  state.overlayView.webContents.loadFile(path.join(getUIPath(), 'index.html'))
})

ipcMain.handle('set-overlay-visible', (e, visible) => {
  const state = stateFromEvent(e)
  if (!state || !state.win || !state.overlayView) return
  if (visible) {
    fitOverlay(state)
    state.overlayView.webContents.focus()
    state.win.setWindowButtonPosition({ x: 12, y: 12 })
  } else {
    state.overlayView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    state.win.setWindowButtonPosition({ x: -20, y: -20 })
    state.view.webContents.focus()
  }
})

ipcMain.handle('get-settings', () => settings)

ipcMain.handle('save-settings', (e, newSettings) => {
  saveSettings(newSettings)
})

ipcMain.handle('eject', () => {
  try {
    // Copy the built-in UI into ~/.general-browser/sources/ui.
    // Sites already live at ~/.general-browser/sites and are edited in place.
    copyDirRecursive(BUILTIN_UI, path.join(SOURCES_DIR, 'ui'))
    const manifest = {
      ejected_at: new Date().toISOString(),
      builtin_version: require('./package.json').version,
      files: walkDir(BUILTIN_UI, 'ui'),
    }
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
    startWatchers()
    for (const state of windows.values()) {
      if (state.overlayView) {
        state.overlayView.webContents.loadFile(path.join(getUIPath(), 'index.html'))
      }
    }
    return { success: true, fileCount: Object.keys(manifest.files).length }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('get-update-status', () => checkForUIUpdates())

ipcMain.handle('prepare-update', () => {
  const status = checkForUIUpdates()
  if (!status.pending || !hasEjectedUI()) return { success: false, error: 'No updates' }
  const updatePath = path.join(SOURCES_DIR, 'UPDATE.md')
  const lines = [
    '# Pending Update',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Version: ${require('./package.json').version}`,
    `Source: ${SOURCES_DIR}`,
    `Built-in: ${path.join(__dirname)}`,
    '',
    '## Changed Files',
    '',
    '| File | Status | You Modified |',
    '|------|--------|--------------|',
  ]
  for (const f of status.files) {
    lines.push(`| ${f.path} | ${f.status} | ${f.user_modified ? 'yes' : 'no'} |`)
  }
  lines.push('')
  lines.push('## How to apply')
  lines.push('')
  lines.push('Run `/update-ui` in Claude Code from this directory, or apply manually.')
  lines.push('After applying, click "Mark as Resolved" in browser settings.')
  lines.push('')
  fs.writeFileSync(updatePath, lines.join('\n'))
  // Also write the machine-readable version for the skill
  fs.writeFileSync(PENDING_UPDATE_PATH, yaml.dump({
    from_version: require('./package.json').version,
    source_dir: SOURCES_DIR,
    builtin_dir: path.join(__dirname),
    files: status.files,
  }))
  return { success: true, path: updatePath }
})

ipcMain.handle('finalize-update', () => {
  try {
    const manifest = {
      ejected_at: new Date().toISOString(),
      builtin_version: require('./package.json').version,
      files: walkDir(BUILTIN_UI, 'ui'),
    }
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
    if (fs.existsSync(PENDING_UPDATE_PATH)) fs.unlinkSync(PENDING_UPDATE_PATH)
    const updateMd = path.join(SOURCES_DIR, 'UPDATE.md')
    if (fs.existsSync(updateMd)) fs.unlinkSync(updateMd)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ── App (shell) auto-update IPC ──────────────────────────────────────────────
ipcMain.handle('check-for-app-update', async () => {
  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result?.updateInfo) return { available: false }
    return {
      available: result.updateInfo.version !== app.getVersion(),
      version: result.updateInfo.version,
      currentVersion: app.getVersion(),
    }
  } catch (err) {
    return { available: false, error: err.message }
  }
})

ipcMain.handle('download-app-update', async () => {
  try {
    await autoUpdater.downloadUpdate()
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('install-app-update', () => {
  autoUpdater.quitAndInstall(false, true)
})

ipcMain.handle('get-app-version', () => app.getVersion())
ipcMain.handle('is-dev-mode', () => !app.isPackaged)

ipcMain.handle('get-site-rules', () => loadSitesConfig())

ipcMain.handle('save-site-rules', (_e, config) => {
  saveSitesConfig(config)
  return { success: true }
})

// In packaged builds, paths inside the .asar can't be opened by the OS.
// Resolve to the .asar.unpacked equivalent when needed.
function resolveForShell(p) {
  return p.replace(/\.asar([\\/])/, '.asar.unpacked$1')
}

ipcMain.handle('open-site-rule-dir', (_e, filePath) => {
  // Rule paths start with "sites/..." and are resolved against DATA_DIR
  const dir = path.dirname(path.resolve(DATA_DIR, filePath))
  shell.openPath(resolveForShell(dir))
})

ipcMain.handle('open-sites-config', () => {
  shell.showItemInFolder(resolveForShell(getSitesConfigPath()))
})

ipcMain.handle('open-sites-dir', () => {
  shell.openPath(resolveForShell(getSitesPath()))
})

ipcMain.handle('open-path', async (_e, p) => {
  const err = await shell.openPath(resolveForShell(p))
  if (err) console.error('open-path failed:', err, 'path:', p, 'resolved:', resolveForShell(p))
})

ipcMain.handle('reset-source-dir', () => {
  // Remove the ejected UI copy so the browser reverts to the built-in shell.
  // The sites directory is left alone.
  const ejectedUI = path.join(SOURCES_DIR, 'ui')
  if (fs.existsSync(ejectedUI)) fs.rmSync(ejectedUI, { recursive: true, force: true })
  if (fs.existsSync(MANIFEST_PATH)) fs.unlinkSync(MANIFEST_PATH)
  if (fs.existsSync(PENDING_UPDATE_PATH)) fs.unlinkSync(PENDING_UPDATE_PATH)
  const updateMd = path.join(SOURCES_DIR, 'UPDATE.md')
  if (fs.existsSync(updateMd)) fs.unlinkSync(updateMd)
  startWatchers()
  for (const state of windows.values()) {
    if (state.overlayView) {
      state.overlayView.webContents.loadFile(path.join(BUILTIN_UI, 'index.html'))
    }
  }
  return { success: true }
})

ipcMain.handle('is-default-browser', () => {
  return app.isDefaultProtocolClient('https')
})

ipcMain.handle('set-default-browser', () => {
  if (process.platform === 'darwin') {
    // On macOS, open the Default Browser system preference pane
    shell.openExternal('x-apple.systempreferences:com.apple.Desktop-Settings.extension?Defaults')
  }
  return { success: true }
})

ipcMain.handle('get-ui-paths', () => ({
  builtin: BUILTIN_UI,
  active: getUIPath(),
  sources: SOURCES_DIR,
  isCustom: hasEjectedUI(),
}))

// ── Catch-all: redirect window.open into a new window ───────────────────────
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (targetUrl) openNewWindow(targetUrl)
    return { action: 'deny' }
  })
})

// ── Live-reload watcher ─────────────────────────────────────────────────────
let watchers = []

function stopWatchers() {
  for (const w of watchers) w.close()
  watchers = []
}

function startWatchers() {
  stopWatchers()
  const dirs = []
  const uiPath = getUIPath()
  const sitesPath = getSitesPath()
  if (uiPath) dirs.push({ dir: uiPath, type: 'ui' })
  if (sitesPath) dirs.push({ dir: sitesPath, type: 'sites' })

  for (const { dir, type } of dirs) {
    if (!fs.existsSync(dir)) continue
    try {
      const watcher = fs.watch(dir, { recursive: true }, debounce(() => {
        if (type === 'ui') {
          for (const state of windows.values()) {
            if (!state.overlayView) continue
            // If the overlay isn't fully shown, position a small region for the toast
            const winBounds = state.win.contentView.getBounds()
            const cur = state.overlayView.getBounds()
            if (cur.width < winBounds.width) {
              const toastW = 250, toastH = 64
              state.overlayView.setBounds({
                x: winBounds.width - toastW,
                y: winBounds.height - toastH,
                width: toastW,
                height: toastH,
              })
            }
            state.overlayView.webContents.send('source-changed')
          }
        } else {
          // sites changed — re-inject CSS/JS on all windows
          for (const state of windows.values()) {
            const url = state.view?.webContents.getURL()
            if (url) injectSiteRules(state.view.webContents, url)
          }
        }
      }, 300))
      watchers.push(watcher)
    } catch {}
  }
}

function debounce(fn, ms) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Remove default menu so its accelerators (Cmd+N, etc.) don't intercept our shortcuts
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        { label: 'New Window', accelerator: 'CmdOrCtrl+N', click: () => openNewWindow() },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Address Bar',
          accelerator: 'CmdOrCtrl+K',
          click: () => {
            const state = focusedState()
            if (state?.overlayView) state.overlayView.webContents.send('toggle-overlay')
          },
        },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            const state = focusedState()
            if (state?.overlayView) {
              fitOverlay(state)
              state.overlayView.webContents.focus()
              state.win.setWindowButtonPosition({ x: 12, y: 12 })
              state.overlayView.webContents.send('show-settings')
            }
          },
        },
      ],
    },
  ]))
  ensureDataDir()
  settings = loadSettings()
  history = loadHistory()
  applyColorMode()
  startWatchers()

  // If the OS launched us to handle a URL (click from Mail etc.), open only
  // that window. Otherwise open a fresh home window.
  if (pendingUrl) {
    openNewWindow(pendingUrl)
    pendingUrl = null
  } else {
    openNewWindow()
  }

  // ── Auto-update (shell updates via GitHub Releases) ───────────────────────────
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = null

  autoUpdater.on('error', (err) => {
    console.error('Auto-update error:', err)
  })

  // Check on launch, then every 4 hours
  autoUpdater.checkForUpdates().catch(() => {})
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000)
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (windows.size === 0) openNewWindow() })

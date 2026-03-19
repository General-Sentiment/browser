const { app, BrowserWindow, WebContentsView, ipcMain, dialog, nativeTheme } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const yaml = require('js-yaml')

// ── Paths ──────────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(require('os').homedir(), '.browser')
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.yml')
const HISTORY_PATH = path.join(DATA_DIR, 'history.json')
const SITES_DIR = path.join(DATA_DIR, 'sites')
const SITES_CONFIG = path.join(DATA_DIR, 'sites.json')
const MANIFEST_PATH = path.join(DATA_DIR, 'ui-manifest.json')
const PENDING_UPDATE_PATH = path.join(DATA_DIR, 'pending-update.yml')
const BUILTIN_UI = path.join(__dirname, 'ui')

// ── Settings ───────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS_YML = `# ~/.browser/settings.yml

# Start page (blank if omitted)
# home: https://example.com

# Default search engine ($s = search terms)
search: https://www.google.com/search?q=$s

# Source directory — eject ui/ here to customize the overlay
# source_dir: /path/to/my-browser-ui
`

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.mkdirSync(SITES_DIR, { recursive: true })
  if (!fs.existsSync(SETTINGS_PATH)) {
    fs.writeFileSync(SETTINGS_PATH, DEFAULT_SETTINGS_YML)
  }
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8')
    return yaml.load(raw) || {}
  } catch {
    return {}
  }
}

// ── Shared state ───────────────────────────────────────────────────────────────
let history = []
let settings = {}
let nextTabId = 1
const windows = new Map()  // webContentsId -> WindowState

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
function getUIPath() {
  if (settings.source_dir && fs.existsSync(path.join(settings.source_dir, 'index.html'))) {
    return settings.source_dir
  }
  return BUILTIN_UI
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
  if (!settings.source_dir || !fs.existsSync(MANIFEST_PATH)) {
    return { pending: false }
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
    const builtinHashes = walkDir(BUILTIN_UI)
    const files = []

    // Check for modified and added files
    for (const [rel, hash] of Object.entries(builtinHashes)) {
      const manifestHash = manifest.files?.[rel]
      if (!manifestHash) {
        files.push({ path: rel, status: 'added', user_modified: false })
      } else if (hash !== manifestHash) {
        // Built-in changed since eject — check if user also modified
        const userFile = path.join(settings.source_dir, rel)
        let userModified = false
        if (fs.existsSync(userFile)) {
          userModified = hashFile(userFile) !== manifestHash
        }
        files.push({ path: rel, status: 'modified', user_modified: userModified })
      }
    }

    // Check for deleted files
    for (const rel of Object.keys(manifest.files || {})) {
      if (!builtinHashes[rel]) {
        const userFile = path.join(settings.source_dir, rel)
        const userModified = fs.existsSync(userFile) && hashFile(userFile) !== manifest.files[rel]
        files.push({ path: rel, status: 'deleted', user_modified: userModified })
      }
    }

    return { pending: files.length > 0, files }
  } catch {
    return { pending: false }
  }
}

function saveSettings(newSettings) {
  // Preserve comments by rewriting the full YAML
  fs.writeFileSync(SETTINGS_PATH, yaml.dump(newSettings))
  settings = newSettings
}

// ── Site rules (user styles & scripts) ─────────────────────────────────────────
const DEFAULT_SITES_CONFIG = {
  rules: [
    // {
    //   name: "Example",
    //   enabled: true,
    //   matches: ["*://example.com/*"],
    //   css: ["sites/example/style.css"],
    //   js: ["sites/example/script.js"]
    // }
  ]
}

function loadSitesConfig() {
  try {
    if (fs.existsSync(SITES_CONFIG)) {
      return JSON.parse(fs.readFileSync(SITES_CONFIG, 'utf8'))
    }
  } catch {}
  // Write default on first run
  fs.writeFileSync(SITES_CONFIG, JSON.stringify(DEFAULT_SITES_CONFIG, null, 2))
  return DEFAULT_SITES_CONFIG
}

function saveSitesConfig(config) {
  fs.writeFileSync(SITES_CONFIG, JSON.stringify(config, null, 2))
}

function urlMatchesPattern(url, pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
  return new RegExp('^' + escaped + '$').test(url)
}

function injectSiteRules(webContents, url) {
  const config = loadSitesConfig()
  for (const rule of config.rules) {
    if (!rule.enabled) continue
    const matched = rule.matches.some(p => urlMatchesPattern(url, p))
    if (!matched) continue

    // Inject CSS
    if (Array.isArray(rule.css)) {
      for (const cssPath of rule.css) {
        const full = path.resolve(DATA_DIR, cssPath)
        if (fs.existsSync(full)) {
          const css = fs.readFileSync(full, 'utf8')
          webContents.insertCSS(css).catch(() => {})
        }
      }
    }

    // Inject JS in the main world
    if (Array.isArray(rule.js)) {
      for (const jsPath of rule.js) {
        const full = path.resolve(DATA_DIR, jsPath)
        if (fs.existsSync(full)) {
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
    const key = input.key.toLowerCase()

    if ((key === 'k' || key === 'l') && input.type === 'keyDown') {
      event.preventDefault()
      if (state.overlayView) state.overlayView.webContents.send('toggle-overlay')
    } else if (key === 't' && !input.shift && input.type === 'keyDown') {
      event.preventDefault()
      createTab(state, '')
      if (state.overlayView) state.overlayView.webContents.send('toggle-overlay')
    } else if (key === 'n' && !input.shift && input.type === 'keyDown') {
      event.preventDefault()
      openNewWindow()
    } else if (key === 'w' && !input.shift && input.type === 'keyDown') {
      event.preventDefault()
      closeTab(state, state.activeTabId)
    } else if (key === '[' && input.shift && input.type === 'keyDown') {
      event.preventDefault()
      const idx = state.tabs.findIndex(t => t.id === state.activeTabId)
      if (idx > 0) switchToTab(state, state.tabs[idx - 1].id)
    } else if (key === ']' && input.shift && input.type === 'keyDown') {
      event.preventDefault()
      const idx = state.tabs.findIndex(t => t.id === state.activeTabId)
      if (idx < state.tabs.length - 1) switchToTab(state, state.tabs[idx + 1].id)
    }
  })
}

function createWindowState() {
  const state = {
    win: null,
    overlayView: null,
    tabs: [],
    activeTabId: 0,
  }

  // ── Window ─────────────────────────────────────────────────────────────────
  state.win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 414,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    windowButtonPosition: { x: -20, y: -20 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#000' : '#fff',
  })

  state.overlayView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  state.win.contentView.addChildView(state.overlayView)
  state.overlayView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
  state.overlayView.webContents.loadFile(path.join(getUIPath(), 'index.html'))
  state.overlayView.setBackgroundColor('#00000000')

  // Register shortcuts on the overlay webContents
  registerShortcuts(state.overlayView.webContents, () => state)

  // Register this window's overlay webContents for IPC lookup
  windows.set(state.overlayView.webContents.id, state)

  state.win.on('resize', () => {
    for (const tab of state.tabs) fitView(state, tab.view)
    fitOverlay(state)
  })

  state.win.on('focus', () => {
    const tab = activeTab(state)
    if (tab) tab.view.webContents.focus()
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

// ── Tab operations (scoped to a window state) ────────────────────────────────
function createTab(state, url) {
  const id = nextTabId++
  const view = new WebContentsView({
    webPreferences: { contextIsolation: true, sandbox: true },
  })
  state.win.contentView.addChildView(view)
  fitView(state, view)
  if (state.overlayView) state.win.contentView.addChildView(state.overlayView)
  registerShortcuts(view.webContents, () => state)

  const tab = { id, view, title: 'New Tab', url: url || '', favicon: '' }
  state.tabs.push(tab)

  view.webContents.on('did-navigate', (_e, navUrl) => {
    tab.url = navUrl
    tab.title = view.webContents.getTitle() || navUrl
    addToHistory(navUrl, tab.title)
    notifyUI(state)
  })
  view.webContents.on('did-finish-load', () => {
    const url = view.webContents.getURL()
    if (url) injectSiteRules(view.webContents, url)
  })
  view.webContents.on('did-navigate-in-page', (_e, navUrl) => {
    tab.url = navUrl
    notifyUI(state)
  })
  view.webContents.on('page-title-updated', (_e, title) => {
    tab.title = title
    notifyUI(state)
  })
  view.webContents.on('page-favicon-updated', (_e, favicons) => {
    tab.favicon = favicons[0] || ''
    notifyUI(state)
  })

  if (url) view.webContents.loadURL(url)

  switchToTab(state, id)
  showOverlayIfBlank(state)
  return id
}

function switchToTab(state, id) {
  const tab = state.tabs.find(t => t.id === id)
  if (!tab) return
  state.activeTabId = id
  for (const t of state.tabs) t.view.setVisible(t.id === id)
  fitView(state, tab.view)
  notifyUI(state)
  showOverlayIfBlank(state)
}

function closeTab(state, id) {
  const idx = state.tabs.findIndex(t => t.id === id)
  if (idx === -1) return
  const [removed] = state.tabs.splice(idx, 1)
  state.win.contentView.removeChildView(removed.view)
  removed.view.webContents.close()

  if (state.tabs.length === 0) {
    createTab(state, settings.home || '')
  } else if (state.activeTabId === id) {
    switchToTab(state, state.tabs[Math.min(idx, state.tabs.length - 1)].id)
  }
  notifyUI(state)
}

function fitView(state, view) {
  if (!state.win) return
  const bounds = state.win.contentView.getBounds()
  view.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height })
}

function fitOverlay(state) {
  if (!state.win || !state.overlayView) return
  const bounds = state.win.contentView.getBounds()
  state.overlayView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height })
}

function activeTab(state) {
  return state.tabs.find(t => t.id === state.activeTabId)
}

function notifyUI(state) {
  if (!state.overlayView) return
  state.overlayView.webContents.send('state-update', {
    tabs: state.tabs.map(t => ({ id: t.id, title: t.title, url: t.url, favicon: t.favicon })),
    activeTabId: state.activeTabId,
  })
}

function showOverlayIfBlank(state) {
  const tab = activeTab(state)
  if (!tab || !tab.url) {
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
      if (tab) tab.view.webContents.focus()
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

function openNewWindow() {
  const state = createWindowState()
  createTab(state, settings.home || '')
  return state
}

// ── IPC ────────────────────────────────────────────────────────────────────────
ipcMain.handle('navigate', (e, url) => {
  const state = stateFromEvent(e)
  if (!state) return
  const tab = activeTab(state)
  if (!tab) return
  let target = url.trim()
  if (!/^https?:\/\//i.test(target) && !target.includes('localhost')) {
    if (/^[a-z0-9-]+\.[a-z]{2,}/i.test(target)) {
      target = 'https://' + target
    } else {
      const searchUrl = (settings.search || 'https://www.google.com/search?q=$s')
      target = searchUrl.replace('$s', encodeURIComponent(target))
    }
  }
  tab.view.webContents.loadURL(target)
})

ipcMain.handle('go-back', (e) => {
  const state = stateFromEvent(e)
  if (!state) return
  const tab = activeTab(state)
  if (tab?.view.webContents.canGoBack()) tab.view.webContents.goBack()
})

ipcMain.handle('go-forward', (e) => {
  const state = stateFromEvent(e)
  if (!state) return
  const tab = activeTab(state)
  if (tab?.view.webContents.canGoForward()) tab.view.webContents.goForward()
})

ipcMain.handle('new-tab', (e, url) => {
  const state = stateFromEvent(e)
  if (state) createTab(state, url || '')
})

ipcMain.handle('close-tab', (e, id) => {
  const state = stateFromEvent(e)
  if (state) closeTab(state, id ?? state.activeTabId)
})

ipcMain.handle('switch-tab', (e, id) => {
  const state = stateFromEvent(e)
  if (state) switchToTab(state, id)
})

ipcMain.handle('get-tabs', (e) => {
  const state = stateFromEvent(e)
  if (!state) return { tabs: [], activeTabId: 0 }
  return {
    tabs: state.tabs.map(t => ({ id: t.id, title: t.title, url: t.url, favicon: t.favicon })),
    activeTabId: state.activeTabId,
  }
})

ipcMain.handle('get-history', () => history)

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
    const tab = activeTab(state)
    if (tab) tab.view.webContents.focus()
  }
})

ipcMain.handle('get-settings', () => settings)

ipcMain.handle('save-settings', (e, newSettings) => {
  saveSettings(newSettings)
  // Reload overlay in all windows to pick up source_dir change
  for (const state of windows.values()) {
    if (state.overlayView) {
      state.overlayView.webContents.loadFile(path.join(getUIPath(), 'index.html'))
    }
  }
})

ipcMain.handle('pick-directory', async () => {
  const focused = BrowserWindow.getFocusedWindow()
  const result = await dialog.showOpenDialog(focused, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose source directory',
  })
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]
})

ipcMain.handle('eject-ui', (e, targetDir) => {
  try {
    copyDirRecursive(BUILTIN_UI, targetDir)
    // Write manifest recording built-in hashes at eject time
    const hashes = walkDir(BUILTIN_UI)
    const manifest = {
      ejected_at: new Date().toISOString(),
      builtin_version: require('./package.json').version,
      files: hashes,
    }
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
    // Update settings
    settings.source_dir = targetDir
    saveSettings(settings)
    return { success: true, fileCount: Object.keys(hashes).length }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('get-update-status', () => checkForUIUpdates())

ipcMain.handle('prepare-update', () => {
  const status = checkForUIUpdates()
  if (!status.pending) return { success: false, error: 'No updates' }
  const manifest = {
    from_version: require('./package.json').version,
    source_dir: settings.source_dir,
    builtin_dir: BUILTIN_UI,
    files: status.files,
  }
  fs.writeFileSync(PENDING_UPDATE_PATH, yaml.dump(manifest))
  return { success: true, path: PENDING_UPDATE_PATH }
})

ipcMain.handle('finalize-update', () => {
  try {
    const hashes = walkDir(BUILTIN_UI)
    const manifest = {
      ejected_at: new Date().toISOString(),
      builtin_version: require('./package.json').version,
      files: hashes,
    }
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
    if (fs.existsSync(PENDING_UPDATE_PATH)) fs.unlinkSync(PENDING_UPDATE_PATH)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('get-site-rules', () => loadSitesConfig())

ipcMain.handle('save-site-rules', (_e, config) => {
  saveSitesConfig(config)
  return { success: true }
})

ipcMain.handle('open-sites-config', () => {
  const { shell } = require('electron')
  shell.openPath(SITES_CONFIG)
})

ipcMain.handle('open-sites-dir', () => {
  const { shell } = require('electron')
  fs.mkdirSync(SITES_DIR, { recursive: true })
  shell.openPath(SITES_DIR)
})

ipcMain.handle('open-path', (_e, p) => {
  const { shell } = require('electron')
  shell.openPath(p)
})

ipcMain.handle('reset-source-dir', () => {
  delete settings.source_dir
  saveSettings(settings)
  // Clean up manifest
  if (fs.existsSync(MANIFEST_PATH)) fs.unlinkSync(MANIFEST_PATH)
  if (fs.existsSync(PENDING_UPDATE_PATH)) fs.unlinkSync(PENDING_UPDATE_PATH)
  // Reload overlay in all windows from built-in
  for (const state of windows.values()) {
    if (state.overlayView) {
      state.overlayView.webContents.loadFile(path.join(BUILTIN_UI, 'index.html'))
    }
  }
  return { success: true }
})

ipcMain.handle('get-ui-paths', () => ({
  builtin: BUILTIN_UI,
  active: getUIPath(),
  isCustom: !!settings.source_dir,
}))

ipcMain.handle('open-ui-dir', () => {
  const { shell } = require('electron')
  if (settings.source_dir && fs.existsSync(settings.source_dir)) {
    shell.openPath(settings.source_dir)
  }
  // Always open the built-in too so user can compare
  shell.openPath(BUILTIN_UI)
})

// ── Catch-all: redirect any new window into a tab ─────────────────────────────
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url: targetUrl }) => {
    // Find which window state owns this webContents
    let owner = null
    for (const state of windows.values()) {
      if (state.tabs.some(t => t.view.webContents.id === contents.id)) {
        owner = state
        break
      }
    }
    if (!owner) owner = focusedState()
    if (owner && targetUrl) createTab(owner, targetUrl)
    return { action: 'deny' }
  })
})

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  ensureDataDir()
  settings = loadSettings()
  history = loadHistory()
  openNewWindow()
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (windows.size === 0) openNewWindow() })

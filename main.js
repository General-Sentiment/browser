const { app, BrowserWindow, WebContentsView, ipcMain, dialog, nativeTheme, Menu, shell } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const yaml = require('js-yaml')

// ── Protocol registration (for open-url events when already default) ────────
// Does NOT prompt the user or steal default browser status — just registers
// the app so macOS delivers open-url events if the user has already chosen it.
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
  const state = focusedState() || (windows.size > 0 ? windows.values().next().value : null)
  if (state) {
    createTab(state, url)
    state.win.show()
    state.win.focus()
  } else {
    const newState = openNewWindow()
    // Replace the default home tab with the requested URL
    const tab = newState.tabs[0]
    if (tab) tab.view.webContents.loadURL(url)
  }
}

// ── Paths ──────────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(require('os').homedir(), '.browser')
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.yml')
const HISTORY_PATH = path.join(DATA_DIR, 'history.json')
const MANIFEST_PATH = path.join(DATA_DIR, 'ui-manifest.json')
const PENDING_UPDATE_PATH = path.join(DATA_DIR, 'pending-update.yml')
const BUILTIN_UI = path.join(__dirname, 'ui')
const BUILTIN_SITES = path.join(__dirname, 'sites')

// ── Settings ───────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS_YML = `# ~/.browser/settings.yml

# Start page (blank if omitted)
# home: https://example.com

# Default search engine ($s = search terms)
search: https://www.google.com/search?q=$s

# Color mode: system, light, or dark
# color_mode: system

# Source directory — eject here to customize the browser
# Copies both ui/ and sites/ into your directory
# source_dir: /path/to/my-browser
`

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
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
  if (settings.source_dir && fs.existsSync(path.join(settings.source_dir, 'ui', 'index.html'))) {
    return path.join(settings.source_dir, 'ui')
  }
  return BUILTIN_UI
}

function getSitesPath() {
  if (settings.source_dir && fs.existsSync(path.join(settings.source_dir, 'sites'))) {
    return path.join(settings.source_dir, 'sites')
  }
  return BUILTIN_SITES
}

function getSitesConfigPath() {
  const custom = path.join(getSitesPath(), 'sites.yaml')
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
  if (!settings.source_dir || !fs.existsSync(MANIFEST_PATH)) {
    return { pending: false }
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
    const builtinHashes = {
      ...walkDir(BUILTIN_UI, 'ui'),
      ...walkDir(BUILTIN_SITES, 'sites'),
    }
    const agentsSrc = path.join(__dirname, 'AGENTS.md')
    if (fs.existsSync(agentsSrc)) builtinHashes['AGENTS.md'] = hashFile(agentsSrc)
    const files = []

    for (const [rel, hash] of Object.entries(builtinHashes)) {
      const manifestHash = manifest.files?.[rel]
      if (!manifestHash) {
        files.push({ path: rel, status: 'added', user_modified: false })
      } else if (hash !== manifestHash) {
        const userFile = path.join(settings.source_dir, rel)
        let userModified = false
        if (fs.existsSync(userFile)) {
          userModified = hashFile(userFile) !== manifestHash
        }
        files.push({ path: rel, status: 'modified', user_modified: userModified })
      }
    }

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
  // Resolution chain: ejected sites dir -> built-in sites dir
  if (settings.source_dir) {
    const custom = path.join(settings.source_dir, relativePath)
    if (fs.existsSync(custom)) return custom
  }
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
    } else if (key === 't' && !input.shift && input.type === 'keyDown') {
      event.preventDefault()
      createTab(state, '')
    } else if (key === 'n' && !input.shift && input.type === 'keyDown') {
      event.preventDefault()
      openNewWindow()
    } else if (key === 'r' && !input.shift && input.type === 'keyDown') {
      event.preventDefault()
      const overlayBounds = state.overlayView?.getBounds()
      if (overlayBounds && overlayBounds.width > 0) {
        state.overlayView.webContents.reload()
      } else {
        const tab = activeTab(state)
        if (tab?.view.webContents) tab.view.webContents.reload()
      }
    } else if (key === 'w' && !input.shift && input.type === 'keyDown') {
      event.preventDefault()
      closeTab(state, state.activeTabId)
    } else if (key === '[' && !input.shift && input.type === 'keyDown') {
      event.preventDefault()
      const tab = activeTab(state)
      if (tab?.view.webContents.navigationHistory.canGoBack()) tab.view.webContents.navigationHistory.goBack()
    } else if (key === ']' && !input.shift && input.type === 'keyDown') {
      event.preventDefault()
      const tab = activeTab(state)
      if (tab?.view.webContents.navigationHistory.canGoForward()) tab.view.webContents.navigationHistory.goForward()
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
    icon: path.join(__dirname, 'build', 'icon.png'),
  })

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

  // Register shortcuts on the overlay webContents
  registerShortcuts(state.overlayView.webContents, () => state)

  // Register this window's overlay webContents for IPC lookup
  windows.set(state.overlayView.webContents.id, state)

  state.win.on('resize', () => {
    for (const tab of state.tabs) fitView(state, tab.view)
    // Only resize overlay if it's currently shown (non-zero bounds)
    const ob = state.overlayView?.getBounds()
    if (ob && ob.width > 0 && ob.height > 0) {
      const wb = state.win.contentView.getBounds()
      // Full-size overlay (cmd+k open) — resize to match
      if (ob.width >= wb.width - 20 || ob.height >= wb.height - 20) {
        fitOverlay(state)
      }
      // Small overlay (toast) — leave it, it'll collapse on its own
    }
  })

  state.win.on('focus', () => {
    const tab = activeTab(state)
    // If the overlay is expanded but shouldn't be (e.g. stale toast), collapse it
    if (tab?.url && state.overlayView) {
      const ob = state.overlayView.getBounds()
      const wb = state.win.contentView.getBounds()
      if (ob.width === wb.width && ob.height === wb.height) {
        // Overlay is full-size — leave it (user may have cmd+k open)
      } else if (ob.width > 0) {
        // Overlay is partially expanded (toast remnant) — collapse
        state.overlayView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      }
      tab.view.webContents.focus()
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

// ── Tab operations (scoped to a window state) ────────────────────────────────
function createTab(state, url) {
  const id = nextTabId++
  const view = new WebContentsView({
    webPreferences: { contextIsolation: true, sandbox: true },
  })
  view.setBackgroundColor('#ffffff')
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

  if (url) {
    view.webContents.loadURL(url)
    // Switch without showing overlay since page is loading
    state.activeTabId = id
    for (const t of state.tabs) t.view.setVisible(t.id === id)
    fitView(state, view)
    notifyUI(state)
    // Hide overlay if it was open
    if (state.overlayView) {
      state.overlayView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      state.win.setWindowButtonPosition({ x: -20, y: -20 })
      state.overlayView.webContents.send('hide-overlay')
      view.webContents.focus()
    }
  } else {
    switchToTab(state, id)
    showOverlayIfBlank(state)
  }
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

  // Last tab: close the window
  if (state.tabs.length === 1) {
    state.win.close()
    return
  }

  const [removed] = state.tabs.splice(idx, 1)
  state.win.contentView.removeChildView(removed.view)

  if (state.activeTabId === id) {
    const newId = state.tabs[Math.min(idx, state.tabs.length - 1)].id
    const tab = state.tabs.find(t => t.id === newId)
    state.activeTabId = newId
    for (const t of state.tabs) t.view.setVisible(t.id === newId)
    if (tab) fitView(state, tab.view)
  }
  notifyUI(state)

  // Destroy after notifying UI to avoid race conditions
  removed.view.webContents.removeAllListeners()
  removed.view.webContents.close()
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

let toastTimers = new WeakMap()

function showToast(state, msg) {
  if (!state?.overlayView || !state.win) return
  // Position a small overlay region in the bottom-left for the toast
  const bounds = state.win.contentView.getBounds()
  const toastW = 250, toastH = 64
  state.overlayView.setBounds({
    x: 0,
    y: bounds.height - toastH,
    width: toastW,
    height: toastH,
  })
  state.overlayView.webContents.send('show-toast', msg)
  // Collapse after toast fades
  const prev = toastTimers.get(state)
  if (prev) clearTimeout(prev)
  toastTimers.set(state, setTimeout(() => {
    // Only collapse if the overlay isn't actively shown
    const tab = activeTab(state)
    if (tab?.url && state.overlayView.getBounds().width < bounds.width) {
      state.overlayView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    }
  }, 2200))
}

function openNewWindow() {
  const focused = BrowserWindow.getFocusedWindow()
  const state = createWindowState()
  if (focused) {
    const [x, y] = focused.getPosition()
    state.win.setPosition(x + 20, y + 20)
  }
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
    if (!target.includes(' ') && /^[a-z0-9-]+\.[a-z]{2,}/i.test(target)) {
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
  if (tab?.view.webContents.navigationHistory.canGoBack()) tab.view.webContents.navigationHistory.goBack()
})

ipcMain.handle('go-forward', (e) => {
  const state = stateFromEvent(e)
  if (!state) return
  const tab = activeTab(state)
  if (tab?.view.webContents.navigationHistory.canGoForward()) tab.view.webContents.navigationHistory.goForward()
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
  const sourceDirChanged = newSettings.source_dir !== settings.source_dir
  saveSettings(newSettings)
  // Only reload overlay if source_dir changed
  if (sourceDirChanged) {
    for (const state of windows.values()) {
      if (state.overlayView) {
        state.overlayView.webContents.loadFile(path.join(getUIPath(), 'index.html'))
      }
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

ipcMain.handle('eject', (e, targetDir) => {
  try {
    // Copy ui/, sites/, and AGENTS.md into the target directory
    copyDirRecursive(BUILTIN_UI, path.join(targetDir, 'ui'))
    copyDirRecursive(BUILTIN_SITES, path.join(targetDir, 'sites'))
    const agentsSrc = path.join(__dirname, 'AGENTS.md')
    if (fs.existsSync(agentsSrc)) fs.copyFileSync(agentsSrc, path.join(targetDir, 'AGENTS.md'))
    // Write manifest recording built-in hashes at eject time
    const uiHashes = walkDir(BUILTIN_UI, 'ui')
    const sitesHashes = walkDir(BUILTIN_SITES, 'sites')
    const allHashes = { ...uiHashes, ...sitesHashes }
    if (fs.existsSync(agentsSrc)) allHashes['AGENTS.md'] = hashFile(agentsSrc)
    const manifest = {
      ejected_at: new Date().toISOString(),
      builtin_version: require('./package.json').version,
      files: allHashes,
    }
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
    // Update settings
    settings.source_dir = targetDir
    saveSettings(settings)
    return { success: true, fileCount: Object.keys(allHashes).length }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('get-update-status', () => checkForUIUpdates())

ipcMain.handle('prepare-update', () => {
  const status = checkForUIUpdates()
  if (!status.pending || !settings.source_dir) return { success: false, error: 'No updates' }
  const updatePath = path.join(settings.source_dir, 'UPDATE.md')
  const lines = [
    '# Pending Update',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Version: ${require('./package.json').version}`,
    `Source: ${settings.source_dir}`,
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
    source_dir: settings.source_dir,
    builtin_dir: path.join(__dirname),
    files: status.files,
  }))
  return { success: true, path: updatePath }
})

ipcMain.handle('finalize-update', () => {
  try {
    const hashes = { ...walkDir(BUILTIN_UI, 'ui'), ...walkDir(BUILTIN_SITES, 'sites') }
    const agentsSrc = path.join(__dirname, 'AGENTS.md')
    if (fs.existsSync(agentsSrc)) hashes['AGENTS.md'] = hashFile(agentsSrc)
    const manifest = {
      ejected_at: new Date().toISOString(),
      builtin_version: require('./package.json').version,
      files: hashes,
    }
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
    if (fs.existsSync(PENDING_UPDATE_PATH)) fs.unlinkSync(PENDING_UPDATE_PATH)
    if (settings.source_dir) {
      const updateMd = path.join(settings.source_dir, 'UPDATE.md')
      if (fs.existsSync(updateMd)) fs.unlinkSync(updateMd)
    }
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
  const dir = path.dirname(path.resolve(getSitesPath(), '..', filePath))
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
  isCustom: !!settings.source_dir,
}))

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
    if (owner && targetUrl) {
      createTab(owner, targetUrl)
      showToast(owner, 'New tab')
    }
    return { action: 'deny' }
  })
})

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
  openNewWindow()

  // Handle any URL that arrived before the app was ready
  if (pendingUrl) {
    openUrlInBrowser(pendingUrl)
    pendingUrl = null
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

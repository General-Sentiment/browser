const { contextBridge, ipcRenderer } = require('electron')
const yaml = require('js-yaml')

// Two CRUD namespaces, same surface, different scope:
//   data.*  scoped to ~/.general-browser/  (relative paths only)
//   fs.*    unscoped                       (absolute paths or ~/...)
// Use to persist feature state without reaching for localStorage or a
// separate DB. Page webviews have no preload, so no access.

// YAML frontmatter: `---\n<yaml>\n---\n<body>`. Matches Jekyll / Hugo /
// Obsidian conventions. An empty or missing block writes no fence. The YAML
// block is rewritten via js-yaml on write, so comments inside the YAML are
// not preserved across a round-trip.
const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

function parseMarkdown(text) {
  const m = FM_RE.exec(text)
  if (!m) return { frontmatter: {}, body: text }
  let frontmatter = {}
  try { frontmatter = yaml.load(m[1]) || {} } catch { frontmatter = {} }
  return { frontmatter, body: m[2] }
}

function stringifyMarkdown(doc) {
  const { frontmatter, body } = doc || {}
  const hasFm = frontmatter && typeof frontmatter === 'object' && Object.keys(frontmatter).length > 0
  const fence = hasFm ? `---\n${yaml.dump(frontmatter).trimEnd()}\n---\n` : ''
  return fence + (body ?? '')
}

function makeApi(prefix) {
  const defaultList = prefix === 'data' ? '' : '~'
  return {
    read:       (name)       => ipcRenderer.invoke(`${prefix}-read`, name),
    write:      (name, text) => ipcRenderer.invoke(`${prefix}-write`, name, text),

    readBytes:  (name)        => ipcRenderer.invoke(`${prefix}-read-bytes`, name),
    writeBytes: (name, bytes) => ipcRenderer.invoke(`${prefix}-write-bytes`, name, bytes),

    readJSON: async (name) => {
      const r = await ipcRenderer.invoke(`${prefix}-read`, name)
      if (!r.ok) return r
      try { return { ok: true, data: JSON.parse(r.data) } }
      catch (err) { return { ok: false, error: err.message } }
    },
    writeJSON: (name, obj) => ipcRenderer.invoke(`${prefix}-write`, name, JSON.stringify(obj, null, 2)),

    readBlob: async (name, type) => {
      const r = await ipcRenderer.invoke(`${prefix}-read-bytes`, name)
      if (!r.ok) return r
      return { ok: true, data: new Blob([r.data], type ? { type } : undefined) }
    },
    writeBlob: async (name, blob) => {
      const buf = await blob.arrayBuffer()
      return ipcRenderer.invoke(`${prefix}-write-bytes`, name, buf)
    },

    readMarkdown: async (name) => {
      const r = await ipcRenderer.invoke(`${prefix}-read`, name)
      if (!r.ok) return r
      try { return { ok: true, data: parseMarkdown(r.data) } }
      catch (err) { return { ok: false, error: err.message } }
    },
    writeMarkdown: (name, doc) => {
      try { return ipcRenderer.invoke(`${prefix}-write`, name, stringifyMarkdown(doc)) }
      catch (err) { return Promise.resolve({ ok: false, error: err.message }) }
    },

    delete: (name)    => ipcRenderer.invoke(`${prefix}-delete`, name),
    exists: (name)    => ipcRenderer.invoke(`${prefix}-exists`, name),
    list:   (subpath) => ipcRenderer.invoke(`${prefix}-list`, subpath || defaultList),
  }
}

const data = makeApi('data')
const fs   = makeApi('fs')

contextBridge.exposeInMainWorld('browser', {
  navigate:   (url) => ipcRenderer.invoke('navigate', url),
  back:       ()    => ipcRenderer.invoke('go-back'),
  forward:    ()    => ipcRenderer.invoke('go-forward'),
  getHistory: ()    => ipcRenderer.invoke('get-history'),

  setOverlayVisible: (v) => ipcRenderer.invoke('set-overlay-visible', v),
  onToggleOverlay: (cb) => { ipcRenderer.removeAllListeners('toggle-overlay'); ipcRenderer.on('toggle-overlay', cb) },
  onShowOverlay:   (cb) => { ipcRenderer.removeAllListeners('show-overlay'); ipcRenderer.on('show-overlay', cb) },
  onHideOverlay:   (cb) => { ipcRenderer.removeAllListeners('hide-overlay'); ipcRenderer.on('hide-overlay', cb) },
  onStateUpdate:   (cb) => { ipcRenderer.removeAllListeners('state-update'); ipcRenderer.on('state-update', (_e, state) => cb(state)) },
  onToast:         (cb) => { ipcRenderer.removeAllListeners('show-toast'); ipcRenderer.on('show-toast', (_e, msg) => cb(msg)) },
  onShowSettings:  (cb) => { ipcRenderer.removeAllListeners('show-settings'); ipcRenderer.on('show-settings', cb) },
  onSourceChanged: (cb) => { ipcRenderer.removeAllListeners('source-changed'); ipcRenderer.on('source-changed', cb) },
  onRestoreView:   (cb) => { ipcRenderer.removeAllListeners('restore-view'); ipcRenderer.on('restore-view', (_e, view) => cb(view)) },
  reloadUI:        (restoreView) => ipcRenderer.invoke('reload-ui', restoreView),

  getSettings:     ()    => ipcRenderer.invoke('get-settings'),
  saveSettings:    (s)   => ipcRenderer.invoke('save-settings', s),
  getUpdateStatus: ()    => ipcRenderer.invoke('get-update-status'),
  prepareUpdate:   ()    => ipcRenderer.invoke('prepare-update'),
  finalizeUpdate:  ()    => ipcRenderer.invoke('finalize-update'),
  getSiteRules:    ()    => ipcRenderer.invoke('get-site-rules'),
  saveSiteRules:   (c)   => ipcRenderer.invoke('save-site-rules', c),
  openSiteRuleDir: (f)   => ipcRenderer.invoke('open-site-rule-dir', f),
  openSitesConfig: ()    => ipcRenderer.invoke('open-sites-config'),
  openSitesDir:    ()    => ipcRenderer.invoke('open-sites-dir'),
  openPath:        (p)   => ipcRenderer.invoke('open-path', p),
  resetUI:         ()    => ipcRenderer.invoke('reset-ui'),
  isDefaultBrowser: ()   => ipcRenderer.invoke('is-default-browser'),
  setDefaultBrowser: ()  => ipcRenderer.invoke('set-default-browser'),
  getUIPaths:      ()    => ipcRenderer.invoke('get-ui-paths'),

  // App (shell) auto-update
  checkForAppUpdate:  () => ipcRenderer.invoke('check-for-app-update'),
  downloadAppUpdate:  () => ipcRenderer.invoke('download-app-update'),
  installAppUpdate:   () => ipcRenderer.invoke('install-app-update'),
  getAppUpdateState:  () => ipcRenderer.invoke('get-app-update-state'),
  onAppUpdateState:   (cb) => { ipcRenderer.removeAllListeners('app-update-state'); ipcRenderer.on('app-update-state', (_e, s) => cb(s)) },
  getAppVersion:      () => ipcRenderer.invoke('get-app-version'),
  isDevMode:          () => ipcRenderer.invoke('is-dev-mode'),

  data,
  fs,
})

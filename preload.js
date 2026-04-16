const { contextBridge, ipcRenderer } = require('electron')

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
  getAppVersion:      () => ipcRenderer.invoke('get-app-version'),
  isDevMode:          () => ipcRenderer.invoke('is-dev-mode'),
})

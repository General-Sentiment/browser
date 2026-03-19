const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('browser', {
  navigate:   (url) => ipcRenderer.invoke('navigate', url),
  back:       ()    => ipcRenderer.invoke('go-back'),
  forward:    ()    => ipcRenderer.invoke('go-forward'),
  newTab:     (url) => ipcRenderer.invoke('new-tab', url),
  closeTab:   (id)  => ipcRenderer.invoke('close-tab', id),
  switchTab:  (id)  => ipcRenderer.invoke('switch-tab', id),
  getTabs:    ()    => ipcRenderer.invoke('get-tabs'),
  getHistory: ()    => ipcRenderer.invoke('get-history'),

  setOverlayVisible: (v) => ipcRenderer.invoke('set-overlay-visible', v),
  onToggleOverlay: (cb) => ipcRenderer.on('toggle-overlay', cb),
  onShowOverlay:   (cb) => ipcRenderer.on('show-overlay', cb),
  onHideOverlay:   (cb) => ipcRenderer.on('hide-overlay', cb),
  onStateUpdate:   (cb) => ipcRenderer.on('state-update', (_e, state) => cb(state)),

  getSettings:     ()    => ipcRenderer.invoke('get-settings'),
  saveSettings:    (s)   => ipcRenderer.invoke('save-settings', s),
  pickDirectory:   ()    => ipcRenderer.invoke('pick-directory'),
  ejectUI:         (dir) => ipcRenderer.invoke('eject-ui', dir),
  getUpdateStatus: ()    => ipcRenderer.invoke('get-update-status'),
  prepareUpdate:   ()    => ipcRenderer.invoke('prepare-update'),
  finalizeUpdate:  ()    => ipcRenderer.invoke('finalize-update'),
  getSiteRules:    ()    => ipcRenderer.invoke('get-site-rules'),
  saveSiteRules:   (c)   => ipcRenderer.invoke('save-site-rules', c),
  openSitesConfig: ()    => ipcRenderer.invoke('open-sites-config'),
  openSitesDir:    ()    => ipcRenderer.invoke('open-sites-dir'),
  openPath:        (p)   => ipcRenderer.invoke('open-path', p),
  resetSourceDir:  ()    => ipcRenderer.invoke('reset-source-dir'),
  getUIPaths:      ()    => ipcRenderer.invoke('get-ui-paths'),
  openUIDir:       ()    => ipcRenderer.invoke('open-ui-dir'),
})

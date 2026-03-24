import { html, useState, useEffect } from './lib/preact.js'

export function SettingsView({ onBack }) {
  const [settings, setSettings] = useState(null)
  const [uiPaths, setUIPaths] = useState(null)
  const [updateStatus, setUpdateStatus] = useState(null)
  const [siteRules, setSiteRules] = useState(null)
  const [isDefault, setIsDefault] = useState(null)
  const [message, setMessage] = useState('')
  const [appUpdate, setAppUpdate] = useState(null) // { available, version, downloading, ready }
  const [appVersion, setAppVersion] = useState('')
  const [devMode, setDevMode] = useState(false)

  function refresh() {
    window.browser.getSettings().then(setSettings)
    window.browser.getUIPaths().then(setUIPaths)
    window.browser.getUpdateStatus().then(setUpdateStatus)
    window.browser.getSiteRules().then(setSiteRules)
    window.browser.isDefaultBrowser().then(setIsDefault)
    window.browser.getAppVersion().then(setAppVersion)
    window.browser.isDevMode().then(setDevMode)
    window.browser.checkForAppUpdate().then(r => {
      if (r.available) setAppUpdate({ available: true, version: r.version })
    })
  }

  useEffect(() => { refresh() }, [])

  const pickAndEject = async () => {
    const dir = await window.browser.pickDirectory()
    if (!dir) return
    setMessage('Ejecting...')
    const result = await window.browser.eject(dir)
    if (result.success) {
      setMessage(`Ejected ${result.fileCount} files. Reloading...`)
      refresh()
    } else {
      setMessage('Error: ' + result.error)
    }
  }

  const resetToDefault = async () => {
    const result = await window.browser.resetSourceDir()
    if (result.success) {
      setMessage('Reset to defaults. Reloading...')
      refresh()
    }
  }

  const prepareUpdate = async () => {
    const result = await window.browser.prepareUpdate()
    if (result.success) {
      setMessage('UPDATE.md written to your source directory. Open Claude Code there and run /update-ui')
    } else {
      setMessage(result.error)
    }
  }

  const finalizeUpdate = async () => {
    const result = await window.browser.finalizeUpdate()
    if (result.success) {
      setMessage('Update finalized.')
      setUpdateStatus({ pending: false })
    }
  }

  const toggleRule = async (i) => {
    const updated = { ...siteRules, rules: siteRules.rules.map((r, j) =>
      j === i ? { ...r, enabled: !r.enabled } : r
    )}
    await window.browser.saveSiteRules(updated)
    setSiteRules(updated)
  }

  const removeRule = async (i) => {
    const updated = { ...siteRules, rules: siteRules.rules.filter((_, j) => j !== i) }
    await window.browser.saveSiteRules(updated)
    setSiteRules(updated)
  }

  if (!settings || !uiPaths) return html`<div class="settings-view"><div class="settings-loading">Loading...</div></div>`

  return html`
    <div class="settings-view">
      <div class="settings-header">
        <span class="settings-title">Settings</span>
        <button class="settings-close" onClick=${onBack} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      <div class="settings-body">

        ${appUpdate?.available && html`
          <div class="settings-update-banner">
            <span class="settings-update-text">v${appUpdate.version} is available</span>
            ${appUpdate.ready
              ? html`<button class="settings-btn settings-btn-primary" onClick=${() => window.browser.installAppUpdate()}>Restart to Update</button>`
              : appUpdate.downloading
                ? html`<button class="settings-btn" disabled>Downloading...</button>`
                : html`<button class="settings-btn settings-btn-primary" onClick=${async () => {
                    setAppUpdate(u => ({ ...u, downloading: true }))
                    const result = await window.browser.downloadAppUpdate()
                    if (result.success) setAppUpdate(u => ({ ...u, downloading: false, ready: true }))
                    else setAppUpdate(u => ({ ...u, downloading: false }))
                  }}>Update</button>`
            }
          </div>
        `}

        <div class="settings-field">
          <label class="settings-label">Appearance</label>
          <p class="settings-hint">Choose a color mode for the interface.</p>
          <div class="settings-segmented">
            ${['system', 'light', 'dark'].map(mode => html`
              <button
                class="settings-segment ${(settings.color_mode || 'system') === mode ? 'active' : ''}"
                onClick=${async () => {
                  const updated = { ...settings, color_mode: mode }
                  await window.browser.saveSettings(updated)
                  setSettings(updated)
                }}
              >${mode}</button>
            `)}
          </div>
        </div>

        <hr class="settings-divider" />

        <div class="settings-field">
          <label class="settings-label">Source Directory</label>
          <p class="settings-hint">${uiPaths.isCustom
            ? 'Ejected. The app is loading your customized copy.'
            : 'Eject to copy the UI and site rules to a directory you control. Edit the files directly or open the folder in Claude Code. Want a feature? Ask for it. Unhappy with something? Ask for it to be changed.'
          }</p>

          ${uiPaths.isCustom && html`<div class="settings-value">${settings.source_dir}</div>`}

          <div class="settings-actions">
            <button class="settings-btn settings-btn-primary" onClick=${() => window.browser.openPath(uiPaths.isCustom ? settings.source_dir : uiPaths.builtin)}>Open</button>
            ${!uiPaths.isCustom && html`
              <button class="settings-btn settings-btn-primary" onClick=${pickAndEject}>Eject</button>
            `}
            ${uiPaths.isCustom && html`
              <button class="settings-btn" onClick=${resetToDefault}>Reset to Default</button>
            `}
          </div>
        </div>

        ${updateStatus?.pending && html`
          <div class="settings-field">
            <label class="settings-label">Update Available</label>
            <p class="settings-hint">Built-in files have changed since you ejected. Files you modified will need merging.</p>
            <ul class="update-file-list">
              ${updateStatus.files.map(f => html`
                <li class="update-file-item">
                  <span class="update-file-path">${f.path}</span>
                  <span class="update-file-status ${f.status}">${f.status}</span>
                  ${f.user_modified && html`<span class="update-file-badge">you modified</span>`}
                </li>
              `)}
            </ul>
            <div class="settings-actions">
              <button class="settings-btn settings-btn-primary" onClick=${prepareUpdate}>Prepare Update</button>
              <button class="settings-btn" onClick=${finalizeUpdate}>Mark as Resolved</button>
            </div>
          </div>
        `}

        ${message && html`<div class="settings-message">${message}</div>`}

        <hr class="settings-divider" />

        <div class="settings-field">
          <label class="settings-label">Default Browser</label>
          <p class="settings-hint">${isDefault
            ? 'This is your default browser. Links from other apps will open here.'
            : 'Set as default to open links from other apps in this browser.'
          }</p>
          <div class="settings-actions">
            ${isDefault
              ? html`<button class="settings-btn" disabled>Default</button>`
              : html`<button class="settings-btn settings-btn-primary" onClick=${async () => {
                  await window.browser.setDefaultBrowser()
                  setTimeout(() => window.browser.isDefaultBrowser().then(setIsDefault), 1000)
                }}>Set as Default</button>`
            }
          </div>
        </div>

        <hr class="settings-divider" />

        <div class="settings-field">
          <label class="settings-label">Site Rules</label>
          <p class="settings-hint">Custom CSS and JS injected into sites by URL pattern.</p>

          ${siteRules?.rules?.length > 0
            ? html`
              <ul class="rules-list">
                ${siteRules.rules.map((rule, i) => html`
                  <li class="rule-item ${rule.enabled ? '' : 'disabled'}" onClick=${() => {
                    const file = (rule.css?.[0] || rule.js?.[0])
                    if (file) window.browser.openSiteRuleDir(file)
                  }}>
                    <button class="rule-check ${rule.enabled ? 'checked' : ''}" onClick=${e => { e.stopPropagation(); toggleRule(i) }} aria-label="Toggle rule">
                      ${rule.enabled && html`
                        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                          <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" />
                        </svg>
                      `}
                    </button>
                    <span class="rule-info">
                      <span class="rule-name">${rule.name}</span>
                      <span class="rule-matches">${rule.matches.join(', ')}</span>
                    </span>
                    <span class="rule-remove" onClick=${(e) => { e.stopPropagation(); removeRule(i) }} aria-label="Remove">
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                      </svg>
                    </span>
                  </li>
                `)}
              </ul>
            `
            : html`<div class="settings-value-default">No site rules configured</div>`
          }

          <div class="settings-actions">
            <button class="settings-btn settings-btn-primary" onClick=${() => window.browser.openSitesDir()}>Open Sites Folder</button>
            <button class="settings-btn settings-btn-primary" onClick=${() => window.browser.openSitesConfig()}>Edit Config</button>
          </div>
        </div>

        ${devMode && html`
          <hr class="settings-divider" />

          <div class="settings-field dev-tools">
            <label class="settings-label">Dev Tools</label>
            <p class="settings-hint">Preview UI states. These overrides are local to this session.</p>

            <div class="dev-tools-group">
              <span class="dev-tools-label">App Update Banner</span>
              <div class="settings-segmented">
                ${[
                  ['Hidden', () => setAppUpdate(null)],
                  ['Available', () => setAppUpdate({ available: true, version: '1.0.0' })],
                  ['Downloading', () => setAppUpdate({ available: true, version: '1.0.0', downloading: true })],
                  ['Ready', () => setAppUpdate({ available: true, version: '1.0.0', ready: true })],
                ].map(([label, action]) => html`
                  <button class="settings-segment ${
                    label === 'Hidden' && !appUpdate?.available ? 'active' :
                    label === 'Available' && appUpdate?.available && !appUpdate?.downloading && !appUpdate?.ready ? 'active' :
                    label === 'Downloading' && appUpdate?.downloading ? 'active' :
                    label === 'Ready' && appUpdate?.ready ? 'active' : ''
                  }" onClick=${action}>${label}</button>
                `)}
              </div>
            </div>

            <div class="dev-tools-group">
              <span class="dev-tools-label">UI Update Status</span>
              <div class="settings-segmented">
                ${[
                  ['None', () => setUpdateStatus({ pending: false })],
                  ['Pending', () => setUpdateStatus({ pending: true, files: [
                    { path: 'ui/app.js', status: 'changed', user_modified: false },
                    { path: 'ui/style.css', status: 'changed', user_modified: true },
                    { path: 'ui/components/toast.js', status: 'added', user_modified: false },
                  ]})],
                ].map(([label, action]) => html`
                  <button class="settings-segment ${
                    label === 'None' && !updateStatus?.pending ? 'active' :
                    label === 'Pending' && updateStatus?.pending ? 'active' : ''
                  }" onClick=${action}>${label}</button>
                `)}
              </div>
            </div>

            <div class="dev-tools-group">
              <span class="dev-tools-label">Default Browser</span>
              <div class="settings-segmented">
                ${[
                  ['Yes', () => setIsDefault(true)],
                  ['No', () => setIsDefault(false)],
                ].map(([label, action]) => html`
                  <button class="settings-segment ${
                    label === 'Yes' && isDefault ? 'active' :
                    label === 'No' && !isDefault ? 'active' : ''
                  }" onClick=${action}>${label}</button>
                `)}
              </div>
            </div>
          </div>
        `}

        <div class="settings-footer">
          <a class="settings-footer-title" onClick=${(e) => { e.preventDefault(); window.browser.newTab('https://generalsentiment.co/browser'); onBack() }}>General Browser</a>
          <span class="settings-footer-credit">by <a onClick=${(e) => { e.preventDefault(); window.browser.newTab('https://generalsentiment.co'); onBack() }}>General Sentiment</a></span>
          ${appVersion && html`<span class="settings-footer-version">v${appVersion}</span>`}
        </div>
      </div>
    </div>
  `
}

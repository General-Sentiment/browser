import { html, useState, useEffect } from './lib/preact.js'

export function SettingsView({ onBack }) {
  const [settings, setSettings] = useState(null)
  const [uiPaths, setUIPaths] = useState(null)
  const [updateStatus, setUpdateStatus] = useState(null)
  const [siteRules, setSiteRules] = useState(null)
  const [isDefault, setIsDefault] = useState(null)
  const [message, setMessage] = useState('')
  // { status: 'idle' | 'available' | 'downloading' | 'ready' | 'error', version?, percent?, error? }
  const [appUpdate, setAppUpdate] = useState({ status: 'idle' })
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
    window.browser.getAppUpdateState().then(s => { if (s) setAppUpdate(s) })
    window.browser.checkForAppUpdate().then(r => {
      if (r.available) setAppUpdate(u => u.status === 'ready' ? u : { status: 'available', version: r.version })
    })
  }

  useEffect(() => {
    refresh()
    window.browser.onAppUpdateState(setAppUpdate)
  }, [])

  const resetToDefault = async () => {
    const result = await window.browser.resetUI()
    if (result.success) {
      setMessage('Reset to defaults. Reloading...')
      refresh()
    } else {
      setMessage('Error: ' + (result.error || 'reset failed'))
    }
  }

  const toggleRule = async (i) => {
    const updated = { ...siteRules, rules: siteRules.rules.map((r, j) =>
      j === i ? { ...r, enabled: !r.enabled } : r
    )}
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

        ${appUpdate.status !== 'idle' && appUpdate.status !== 'error' && html`
          <div class="settings-update-banner">
            <span class="settings-update-text">${appUpdate.status === 'ready'
              ? `v${appUpdate.version} ready to install`
              : `v${appUpdate.version || ''} is available`}</span>
            ${appUpdate.status === 'ready'
              ? html`<button class="settings-btn settings-btn-primary" onClick=${async () => {
                  const r = await window.browser.installAppUpdate()
                  if (r && !r.success) setAppUpdate({ status: 'error', error: r.error })
                }}>Restart to Update</button>`
              : appUpdate.status === 'downloading'
                ? html`<button class="settings-btn" disabled>${appUpdate.percent
                    ? `Downloading ${Math.round(appUpdate.percent)}%`
                    : 'Downloading...'}</button>`
                : html`<button class="settings-btn settings-btn-primary" onClick=${async () => {
                    const result = await window.browser.downloadAppUpdate()
                    if (!result.success) setAppUpdate({ status: 'error', error: result.error })
                  }}>Update</button>`
            }
          </div>
        `}
        ${appUpdate.status === 'error' && html`
          <div class="settings-update-banner">
            <span class="settings-update-text">Update failed</span>
            <button class="settings-btn settings-btn-primary" onClick=${async () => {
              setAppUpdate({ status: 'idle' })
              const r = await window.browser.checkForAppUpdate()
              if (r.available) setAppUpdate({ status: 'available', version: r.version })
            }}>Retry</button>
          </div>
          ${appUpdate.error && html`<p class="settings-hint settings-update-hint">${appUpdate.error}</p>`}
        `}

        ${updateStatus?.pending && html`
          <div class="settings-update-banner">
            <span class="settings-update-text">UI Update Available</span>
            <button class="settings-btn settings-btn-primary" onClick=${async () => {
              await window.browser.prepareUpdate()
              window.browser.openPath(uiPaths.dataDir)
            }}>Open</button>
          </div>
          <p class="settings-hint settings-update-hint">The built-in UI has changed upstream. Open <code>~/.general-browser</code> in Claude Code, Codex, or your agent of choice and ask it to merge the update.</p>
        `}

        ${(appUpdate.status !== 'idle' || updateStatus?.pending) && html`
          <hr class="settings-divider" />
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
          <label class="settings-label">UI Source</label>
          <p class="settings-hint">${uiPaths.isDev
            ? 'Dev mode: the app is reading the UI from this repo. Edits to the repo render live.'
            : 'The app reads its overlay UI from this directory. Edit the files directly, or open the folder in Claude Code and tell it what you want to change.'
          }</p>

          <div class="settings-value">${uiPaths.active}</div>

          <div class="settings-actions">
            <button class="settings-btn settings-btn-primary" onClick=${() => window.browser.openPath(uiPaths.active)}>Open</button>
            ${!uiPaths.isDev && html`
              <button class="settings-btn" onClick=${resetToDefault}>Reset to Default</button>
            `}
          </div>
        </div>

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
                    <span class="rule-info">
                      <span class="rule-name">${rule.name}</span>
                      <span class="rule-matches">${rule.matches.join(', ')}</span>
                    </span>
                    <button class="rule-check ${rule.enabled ? 'checked' : ''}" onClick=${e => { e.stopPropagation(); toggleRule(i) }} aria-label="Toggle rule">
                      ${rule.enabled && html`
                        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                          <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" />
                        </svg>
                      `}
                    </button>
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
                  ['Pending', () => setUpdateStatus({ pending: true })],
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

        <details class="settings-details">
          <summary class="settings-details-summary">How to install updates</summary>
          <div class="settings-details-body">
            <p>When the built-in UI changes, open <code>~/.general-browser</code> in an AI coding agent:</p>
            <ul>
              <li><strong>Claude Code</strong>: run <code>/update-ui</code></li>
              <li><strong>Codex</strong>: ask it to merge upstream changes from the built-in UI</li>
              <li><strong>Any agent</strong>: point it at the directory and ask it to apply <code>UPDATE.md</code></li>
            </ul>
            <p>The agent diffs the built-in files against your copies and merges changes, preserving your modifications.</p>
          </div>
        </details>

        <div class="settings-footer">
          <a class="settings-footer-title" onClick=${(e) => { e.preventDefault(); window.browser.navigate('https://generalsentiment.co/browser'); onBack() }}>General Browser</a>
          <span class="settings-footer-credit">by <a onClick=${(e) => { e.preventDefault(); window.browser.navigate('https://generalsentiment.co'); onBack() }}>General Sentiment</a></span>
          ${appVersion && html`<span class="settings-footer-version">v${appVersion}</span>`}
        </div>
      </div>
    </div>
  `
}

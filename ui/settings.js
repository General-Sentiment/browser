import { html, useState, useEffect } from './lib/preact.js'

export function SettingsView({ onBack }) {
  const [settings, setSettings] = useState(null)
  const [uiPaths, setUIPaths] = useState(null)
  const [updateStatus, setUpdateStatus] = useState(null)
  const [siteRules, setSiteRules] = useState(null)
  const [message, setMessage] = useState('')

  function refresh() {
    window.browser.getSettings().then(setSettings)
    window.browser.getUIPaths().then(setUIPaths)
    window.browser.getUpdateStatus().then(setUpdateStatus)
    window.browser.getSiteRules().then(setSiteRules)
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

        <div class="settings-field">
          <label class="settings-label">Appearance</label>
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
          <label class="settings-label">Site Rules</label>
          <p class="settings-hint">Custom CSS and JS injected into sites by URL pattern.</p>

          ${siteRules?.rules?.length > 0
            ? html`
              <ul class="rules-list">
                ${siteRules.rules.map((rule, i) => html`
                  <li class="rule-item" onClick=${() => {
                    const file = (rule.css?.[0] || rule.js?.[0])
                    if (file) window.browser.openSiteRuleDir(file)
                  }}>
                    <label class="rule-toggle" onClick=${e => e.stopPropagation()}>
                      <input type="checkbox" checked=${rule.enabled} onChange=${() => toggleRule(i)} />
                    </label>
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
            <button class="settings-btn" onClick=${() => window.browser.openSitesDir()}>Open Sites Folder</button>
            <button class="settings-btn" onClick=${() => window.browser.openSitesConfig()}>Edit Config</button>
          </div>
        </div>

        <hr class="settings-divider" />

        <div class="settings-field">
          <label class="settings-label">Source Directory</label>
          <p class="settings-hint">${uiPaths.isCustom
            ? 'Ejected. The app is loading your customized copy.'
            : 'Using the built-in package. Eject to customize.'
          }</p>

          ${uiPaths.isCustom && html`<div class="settings-value">${settings.source_dir}</div>`}

          <div class="settings-actions">
            <button class="settings-btn" onClick=${() => window.browser.openPath(uiPaths.isCustom ? settings.source_dir : uiPaths.builtin)}>Open</button>
            ${!uiPaths.isCustom && html`
              <button class="settings-btn settings-btn-primary" onClick=${pickAndEject}>Eject...</button>
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
      </div>
    </div>
  `
}

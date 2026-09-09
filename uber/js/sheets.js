// Optional Google Sheets sync. Requires the driver to supply their own
// Google OAuth Client ID (created in their own Google Cloud project) --
// this app never ships or stores anyone else's credentials, and no Uber
// login is ever touched by this file.
window.UberTracker = window.UberTracker || {};
window.UberTracker.sheets = (() => {
  const SETTINGS_KEY = 'uber_financials_settings_v1';
  const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
  const SHEET_TAB = 'Entries';
  const HEADER = [
    'Date', 'Start Mileage', 'End Mileage', 'Miles Driven', 'Gross Profit (incl. tip)',
    'Gas', 'Snacks', 'Maintenance', 'Other Expenses', 'Total Expenses', 'Net Profit',
  ];

  let tokenClient = null;
  let accessToken = null;
  let gisLoadPromise = null;

  function getSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; }
  }

  function saveSettings(patch) {
    const merged = { ...getSettings(), ...patch };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    return merged;
  }

  function loadGis() {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      return Promise.resolve();
    }
    if (gisLoadPromise) return gisLoadPromise;
    gisLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Could not reach Google (are you offline?)'));
      document.head.appendChild(script);
    });
    return gisLoadPromise;
  }

  async function connect() {
    const { clientId } = getSettings();
    if (!clientId) throw new Error('Add your Google OAuth Client ID in Settings first.');
    await loadGis();
    return new Promise((resolve, reject) => {
      try {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPE,
          callback: (resp) => {
            if (resp.error) { reject(new Error(resp.error)); return; }
            accessToken = resp.access_token;
            resolve(accessToken);
          },
          error_callback: (err) => reject(new Error(err && err.message ? err.message : 'Google sign-in was cancelled or blocked.')),
        });
        tokenClient.requestAccessToken({ prompt: 'consent' });
      } catch (e) {
        reject(e);
      }
    });
  }

  function disconnect() {
    if (accessToken && window.google && google.accounts && google.accounts.oauth2) {
      google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
  }

  function isConnected() {
    return !!accessToken;
  }

  async function apiFetch(url, options = {}) {
    if (!accessToken) throw new Error('Not connected to Google. Tap "Connect Google Account" first.');
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (res.status === 401) {
      accessToken = null;
      throw new Error('Your Google session expired. Tap "Connect Google Account" to reconnect.');
    }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error?.message || ''; } catch {}
      throw new Error(`Google Sheets error (${res.status})${detail ? ': ' + detail : ''}`);
    }
    return res.status === 204 ? null : res.json();
  }

  async function ensureSpreadsheet() {
    const settings = getSettings();
    let { spreadsheetId } = settings;

    if (spreadsheetId) {
      try {
        await apiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId`);
        return spreadsheetId;
      } catch (e) {
        if (/expired|Connect Google/.test(e.message)) throw e; // auth problem, don't silently create a new sheet
        // otherwise (404/403 - sheet deleted or inaccessible): fall through and create a fresh one
      }
    }

    const created = await apiFetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      body: JSON.stringify({
        properties: { title: 'Uber Financials Tracker' },
        sheets: [{ properties: { title: SHEET_TAB } }],
      }),
    });
    spreadsheetId = created.spreadsheetId;
    saveSettings({ spreadsheetId });
    return spreadsheetId;
  }

  function entryToRow(entry) {
    const t = window.UberTracker.db.computeTotals(entry);
    return [
      entry.date, entry.startMileage, entry.endMileage, t.miles, t.grossProfit,
      t.gas, t.snacks, t.maintenance, t.other, t.totalExpenses, t.netProfit,
    ];
  }

  async function syncAll(entries) {
    const spreadsheetId = await ensureSpreadsheet();
    const sorted = entries.slice().sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt));
    const rows = [HEADER, ...sorted.map(entryToRow)];
    const lastCol = 'K';
    // Clear first so a shrinking dataset (after deletes) doesn't leave stale trailing rows.
    await apiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_TAB}!A1:${lastCol}10000:clear`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    await apiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_TAB}!A1:${lastCol}${rows.length}?valueInputOption=USER_ENTERED`,
      { method: 'PUT', body: JSON.stringify({ range: `${SHEET_TAB}!A1:${lastCol}${rows.length}`, majorDimension: 'ROWS', values: rows }) }
    );
    saveSettings({ lastSyncedAt: new Date().toISOString() });
    return spreadsheetId;
  }

  function sheetUrl() {
    const { spreadsheetId } = getSettings();
    return spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : null;
  }

  return { getSettings, saveSettings, connect, disconnect, isConnected, syncAll, sheetUrl, ensureSpreadsheet };
})();

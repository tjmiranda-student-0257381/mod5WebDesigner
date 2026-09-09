(() => {
  const db = window.UberTracker.db;
  const sheets = window.UberTracker.sheets;
  const profile = window.UberTracker.profile;
  const backup = window.UberTracker.backup;

  // Registered as an absolute path since this app is entered from a
  // root-level page (/uber.html) as well as this subfolder (reports.html).
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').catch((e) => console.warn('SW registration failed', e));
    });
  }

  const form = document.getElementById('entryForm');
  const entryIdInput = document.getElementById('entryId');
  const dateInput = document.getElementById('date');
  const startInput = document.getElementById('startMileage');
  const endInput = document.getElementById('endMileage');
  const grossInput = document.getElementById('grossProfit');
  const gasInput = document.getElementById('expGas');
  const snacksInput = document.getElementById('expSnacks');
  const maintenanceInput = document.getElementById('expMaintenance');
  const otherInput = document.getElementById('expOther');
  const netPreview = document.getElementById('netProfitPreview');
  const formTitle = document.getElementById('formTitle');
  const submitBtn = document.getElementById('submitBtn');
  const cancelEditBtn = document.getElementById('cancelEdit');
  const entryList = document.getElementById('entryList');
  const emptyState = document.getElementById('emptyState');
  const statusBanner = document.getElementById('statusBanner');
  const syncPill = document.getElementById('syncPill');

  const settingsDialog = document.getElementById('settingsDialog');
  const settingsBanner = document.getElementById('settingsBanner');
  const clientIdInput = document.getElementById('clientIdInput');
  const sheetLinkRow = document.getElementById('sheetLinkRow');
  const sheetLink = document.getElementById('sheetLink');
  const lastSyncRow = document.getElementById('lastSyncRow');
  const lastSyncTime = document.getElementById('lastSyncTime');

  const profileNameInput = document.getElementById('profileName');
  const profileEmailInput = document.getElementById('profileEmail');
  const lastBackupTime = document.getElementById('lastBackupTime');
  const restoreFileInput = document.getElementById('restoreFile');

  const backupReminder = document.getElementById('backupReminder');
  const backupReminderText = document.getElementById('backupReminderText');

  function showBanner(el, message, kind) {
    el.textContent = message;
    el.className = `status-banner show ${kind}`;
    if (kind !== 'err') {
      clearTimeout(el._timer);
      el._timer = setTimeout(() => el.classList.remove('show'), 4000);
    }
  }

  function todayISO() {
    const d = new Date();
    const tz = d.getTimezoneOffset();
    return new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10);
  }

  function readExpenses() {
    return {
      gas: parseFloat(gasInput.value) || 0,
      snacks: parseFloat(snacksInput.value) || 0,
      maintenance: parseFloat(maintenanceInput.value) || 0,
      other: parseFloat(otherInput.value) || 0,
    };
  }

  function updatePreview() {
    const draft = {
      grossProfit: parseFloat(grossInput.value) || 0,
      expenses: readExpenses(),
    };
    const { netProfit } = db.computeTotals(draft);
    netPreview.textContent = db.money(netProfit);
    netPreview.classList.toggle('negative', netProfit < 0);
  }

  [grossInput, gasInput, snacksInput, maintenanceInput, otherInput].forEach((el) =>
    el.addEventListener('input', updatePreview)
  );

  function clearFieldErrors() {
    document.querySelectorAll('.field.invalid').forEach((f) => f.classList.remove('invalid'));
  }

  function setFieldError(fieldId) {
    document.getElementById(fieldId).classList.add('invalid');
  }

  function validate() {
    clearFieldErrors();
    let ok = true;
    if (!dateInput.value) { setFieldError('field-date'); ok = false; }
    const start = parseFloat(startInput.value);
    const end = parseFloat(endInput.value);
    if (startInput.value === '' || isNaN(start) || start < 0) { setFieldError('field-startMileage'); ok = false; }
    if (endInput.value === '' || isNaN(end) || end < start) { setFieldError('field-endMileage'); ok = false; }
    if (grossInput.value === '' || isNaN(parseFloat(grossInput.value))) { setFieldError('field-grossProfit'); ok = false; }
    return ok;
  }

  function resetForm() {
    form.reset();
    entryIdInput.value = '';
    dateInput.value = todayISO();
    formTitle.textContent = 'Add a Drive';
    submitBtn.textContent = 'Save Drive';
    cancelEditBtn.style.display = 'none';
    clearFieldErrors();
    updatePreview();
  }

  function startEdit(entry) {
    entryIdInput.value = entry.id;
    dateInput.value = entry.date;
    startInput.value = entry.startMileage;
    endInput.value = entry.endMileage;
    grossInput.value = entry.grossProfit;
    gasInput.value = entry.expenses.gas || '';
    snacksInput.value = entry.expenses.snacks || '';
    maintenanceInput.value = entry.expenses.maintenance || '';
    otherInput.value = entry.expenses.other || '';
    formTitle.textContent = 'Edit Drive';
    submitBtn.textContent = 'Update Drive';
    cancelEditBtn.style.display = '';
    clearFieldErrors();
    updatePreview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function maybeAutoSync() {
    if (!sheets.isConnected()) return;
    try {
      await sheets.syncAll(db.getAll());
      showBanner(statusBanner, 'Saved and synced to Google Sheets.', 'ok');
    } catch (e) {
      showBanner(statusBanner, `Saved locally. Sync failed: ${e.message}`, 'err');
    }
    refreshSyncPill();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      date: dateInput.value,
      startMileage: parseFloat(startInput.value),
      endMileage: parseFloat(endInput.value),
      grossProfit: parseFloat(grossInput.value),
      expenses: readExpenses(),
    };

    if (entryIdInput.value) {
      db.update(entryIdInput.value, payload);
      showBanner(statusBanner, 'Drive updated.', 'ok');
    } else {
      payload.id = db.newId();
      payload.createdAt = new Date().toISOString();
      db.add(payload);
      showBanner(statusBanner, 'Drive saved.', 'ok');
    }

    resetForm();
    renderList();
    maybeAutoSync();
  });

  cancelEditBtn.addEventListener('click', resetForm);

  function renderList() {
    const entries = db.getAll();
    entryList.innerHTML = '';
    emptyState.style.display = entries.length ? 'none' : '';

    entries.forEach((entry) => {
      const t = db.computeTotals(entry);
      const item = document.createElement('div');
      item.className = 'entry-item';
      item.innerHTML = `
        <div class="entry-main">
          <div class="entry-date">${entry.date}</div>
          <div class="entry-meta">${t.miles.toFixed(1)} mi &middot; gross ${db.money(t.grossProfit)} &middot; exp ${db.money(t.totalExpenses)}</div>
        </div>
        <div class="entry-net ${t.netProfit < 0 ? 'negative' : 'positive'}">${db.money(t.netProfit)}</div>
        <div class="entry-actions">
          <button data-action="edit" aria-label="Edit">&#9998;</button>
          <button data-action="delete" aria-label="Delete">&#128465;</button>
        </div>
      `;
      item.querySelector('[data-action="edit"]').addEventListener('click', () => startEdit(entry));
      item.querySelector('[data-action="delete"]').addEventListener('click', () => {
        if (confirm(`Delete the drive from ${entry.date}?`)) {
          db.remove(entry.id);
          renderList();
          maybeAutoSync();
        }
      });
      entryList.appendChild(item);
    });
  }

  function refreshSyncPill() {
    if (sheets.isConnected()) {
      syncPill.textContent = 'Connected';
      syncPill.classList.remove('off');
    } else {
      syncPill.textContent = 'Not connected';
      syncPill.classList.add('off');
    }
  }

  // --- Settings dialog ---
  function openSettingsDialog() {
    clientIdInput.value = sheets.getSettings().clientId || '';
    const p = profile.get();
    profileNameInput.value = p.name || '';
    profileEmailInput.value = p.email || '';
    refreshSettingsLinks();
    refreshBackupInfo();
    settingsDialog.showModal();
  }
  document.getElementById('openSettings').addEventListener('click', openSettingsDialog);
  document.getElementById('closeSettings').addEventListener('click', () => settingsDialog.close());
  settingsDialog.addEventListener('close', () => profile.markPromptSeen());

  // --- Your Info (local-only, not a real account) ---
  document.getElementById('saveProfile').addEventListener('click', () => {
    const name = profileNameInput.value.trim();
    const email = profileEmailInput.value.trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      showBanner(settingsBanner, 'That email address doesn\'t look right.', 'err');
      return;
    }
    profile.save({ name, email });
    profile.markPromptSeen();
    showBanner(settingsBanner, 'Saved on this device.', 'ok');
  });

  // --- Backup & Restore ---
  function refreshBackupInfo() {
    const { lastBackupAt } = backup.getMeta();
    lastBackupTime.textContent = lastBackupAt ? new Date(lastBackupAt).toLocaleString() : 'Never';
  }

  async function runBackup(bannerEl) {
    const result = await backup.backupNow();
    refreshBackupInfo();
    refreshReminder();

    if (result.method === 'shared') {
      showBanner(bannerEl, 'Backup shared.', 'ok');
    } else if (result.method === 'downloaded') {
      const email = profile.get().email;
      if (email) {
        showBanner(bannerEl, `Backup file saved (${result.fileName}). Opening your mail app to send it to ${email}...`, 'ok');
        setTimeout(() => { window.location.href = backup.buildReminderMailto(email, result.fileName); }, 600);
      } else {
        showBanner(bannerEl, `Backup file saved (${result.fileName}). Attach it to an email yourself, or set your email in Settings to speed this up next time.`, 'ok');
      }
    }
    return result;
  }

  document.getElementById('backupNowBtn').addEventListener('click', () => runBackup(settingsBanner));

  document.getElementById('restoreBtn').addEventListener('click', async () => {
    const file = restoreFileInput.files[0];
    if (!file) { showBanner(settingsBanner, 'Choose a backup file first.', 'err'); return; }
    try {
      const { added, updated, total } = await backup.restoreFromFile(file);
      showBanner(settingsBanner, `Restored ${total} drive(s): ${added} new, ${updated} updated.`, 'ok');
      restoreFileInput.value = '';
      renderList();
      refreshReminder();
      maybeAutoSync();
    } catch (e) {
      showBanner(settingsBanner, e.message, 'err');
    }
  });

  // --- Daily backup reminder ---
  function refreshReminder() {
    if (!backup.shouldRemindToday()) {
      backupReminder.style.display = 'none';
      return;
    }
    const days = backup.daysSinceLastBackup();
    backupReminderText.textContent = days === Infinity
      ? 'You haven\'t backed up your drive history yet.'
      : `It's been ${Math.floor(days)} day(s) since your last backup.`;
    backupReminder.style.display = '';
  }

  document.getElementById('reminderBackupBtn').addEventListener('click', () => {
    runBackup(statusBanner);
    backupReminder.style.display = 'none';
  });

  document.getElementById('reminderDismissBtn').addEventListener('click', () => {
    backup.dismissReminderToday();
    backupReminder.style.display = 'none';
  });

  document.getElementById('saveClientId').addEventListener('click', () => {
    const value = clientIdInput.value.trim();
    if (!value) { showBanner(settingsBanner, 'Enter a Client ID first.', 'err'); return; }
    sheets.saveSettings({ clientId: value });
    showBanner(settingsBanner, 'Client ID saved.', 'ok');
  });

  document.getElementById('connectGoogle').addEventListener('click', async () => {
    try {
      showBanner(settingsBanner, 'Opening Google sign-in...', 'info');
      await sheets.connect();
      showBanner(settingsBanner, 'Connected. Syncing your drives now...', 'ok');
      await sheets.syncAll(db.getAll());
      showBanner(settingsBanner, 'Connected and synced!', 'ok');
    } catch (e) {
      showBanner(settingsBanner, e.message, 'err');
    }
    refreshSyncPill();
    refreshSettingsLinks();
  });

  document.getElementById('syncNow').addEventListener('click', async () => {
    try {
      showBanner(settingsBanner, 'Syncing...', 'info');
      await sheets.syncAll(db.getAll());
      showBanner(settingsBanner, 'Synced to Google Sheets.', 'ok');
    } catch (e) {
      showBanner(settingsBanner, e.message, 'err');
    }
    refreshSettingsLinks();
  });

  document.getElementById('disconnectGoogle').addEventListener('click', () => {
    sheets.disconnect();
    refreshSyncPill();
    showBanner(settingsBanner, 'Disconnected from Google. Your data is still saved on this device.', 'info');
  });

  function refreshSettingsLinks() {
    const url = sheets.sheetUrl();
    sheetLinkRow.style.display = url ? '' : 'none';
    if (url) sheetLink.href = url;

    const { lastSyncedAt } = sheets.getSettings();
    lastSyncRow.style.display = lastSyncedAt ? '' : 'none';
    if (lastSyncedAt) lastSyncTime.textContent = new Date(lastSyncedAt).toLocaleString();
  }

  // Init
  resetForm();
  renderList();
  refreshSyncPill();
  refreshReminder();

  if (!profile.get().promptSeen) {
    openSettingsDialog();
    showBanner(settingsBanner, 'Welcome! Add your backup email below if you\'d like (optional), then explore the rest of Settings anytime.', 'info');
  }
})();

// Local, no-account backup/restore. This is the primary way to move data
// to a new phone: export a JSON file on the old phone, import it on the
// new one. Works fully offline. No Google account or internet required.
window.UberTracker = window.UberTracker || {};
window.UberTracker.backup = (() => {
  const db = window.UberTracker.db;
  const META_KEY = 'uber_financials_backup_meta_v1';
  const APP_TAG = 'uber-financials-tracker';

  function getMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch { return {}; }
  }

  function saveMeta(patch) {
    const merged = { ...getMeta(), ...patch };
    localStorage.setItem(META_KEY, JSON.stringify(merged));
    return merged;
  }

  function fileName() {
    return `uber-financials-backup-${new Date().toISOString().slice(0, 10)}.json`;
  }

  function buildBackupBlob() {
    const payload = {
      app: APP_TAG,
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      entries: db.getAll(),
    };
    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // Tries the native share sheet first (lets the user pick Mail, Drive,
  // AirDrop, etc. with the file already attached); falls back to a plain
  // file download the user can attach to an email themselves.
  async function backupNow() {
    const blob = buildBackupBlob();
    const name = fileName();

    if (navigator.share && navigator.canShare) {
      try {
        const file = new File([blob], name, { type: 'application/json' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Uber Financials backup',
            text: 'Drive tracker backup file. Save it, or send it to yourself by email.',
          });
          saveMeta({ lastBackupAt: new Date().toISOString() });
          return { method: 'shared', fileName: name };
        }
      } catch (e) {
        if (e && e.name === 'AbortError') return { method: 'cancelled', fileName: name };
        // fall through to plain download on any other share failure
      }
    }

    downloadBlob(blob, name);
    saveMeta({ lastBackupAt: new Date().toISOString() });
    return { method: 'downloaded', fileName: name };
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read that file.'));
      reader.readAsText(file);
    });
  }

  // Upserts by id -- never deletes anything already on this device, so
  // restoring on a phone that already has some entries just fills in the
  // rest rather than wiping local data.
  async function restoreFromFile(file) {
    const text = await readFile(file);
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('That file is not a valid backup (not JSON).');
    }
    if (!data || data.app !== APP_TAG || !Array.isArray(data.entries)) {
      throw new Error('That file does not look like a Uber Financials Tracker backup.');
    }

    const byId = new Map(db.getAll().map((e) => [e.id, e]));
    let added = 0, updated = 0;
    data.entries.forEach((entry) => {
      if (!entry || !entry.id) return;
      if (byId.has(entry.id)) updated++; else added++;
      byId.set(entry.id, { ...byId.get(entry.id), ...entry });
    });
    db.saveAll(Array.from(byId.values()));
    saveMeta({ lastRestoreAt: new Date().toISOString() });
    return { added, updated, total: data.entries.length };
  }

  // Web Share/mailto cannot silently send email -- browsers block that for
  // spam-prevention reasons. This just pre-addresses a draft to the user's
  // own saved email so the only remaining step is attach-and-tap-send.
  function buildReminderMailto(email, backupName) {
    const subject = encodeURIComponent(`Uber Financials backup - ${new Date().toISOString().slice(0, 10)}`);
    const body = encodeURIComponent(
      `Attach the backup file you just saved (${backupName}) to this email and send it to yourself.\n\n` +
      `This keeps a copy of your drive history off your phone in case you switch devices.`
    );
    return `mailto:${email}?subject=${subject}&body=${body}`;
  }

  function daysSinceLastBackup() {
    const { lastBackupAt } = getMeta();
    if (!lastBackupAt) return Infinity;
    return (Date.now() - new Date(lastBackupAt).getTime()) / 86400000;
  }

  function shouldRemindToday() {
    const today = new Date().toISOString().slice(0, 10);
    if (getMeta().reminderDismissedOn === today) return false;
    return db.getAll().length > 0 && daysSinceLastBackup() >= 1;
  }

  function dismissReminderToday() {
    saveMeta({ reminderDismissedOn: new Date().toISOString().slice(0, 10) });
  }

  return { getMeta, backupNow, restoreFromFile, buildReminderMailto, daysSinceLastBackup, shouldRemindToday, dismissReminderToday };
})();

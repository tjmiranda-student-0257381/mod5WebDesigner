(() => {
  const db = window.UberTracker.db;
  const sheets = window.UberTracker.sheets;
  const backup = window.UberTracker.backup;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').catch((e) => console.warn('SW registration failed', e));
    });
  }

  const statDrives = document.getElementById('statDrives');
  const statMiles = document.getElementById('statMiles');
  const statGross = document.getElementById('statGross');
  const statExpenses = document.getElementById('statExpenses');
  const statNet = document.getElementById('statNet');
  const statPerMile = document.getElementById('statPerMile');
  const chart = document.getElementById('chart');
  const reportBody = document.getElementById('reportBody');
  const emptyState = document.getElementById('emptyState');
  const sheetStatusText = document.getElementById('sheetStatusText');
  const sheetLink = document.getElementById('sheetLink');
  const backupStatusText = document.getElementById('backupStatusText');

  function render() {
    const entries = db.getAll();
    const chronological = entries.slice().sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt));

    let totalMiles = 0, totalGross = 0, totalExpenses = 0, totalNet = 0;
    const rows = chronological.map((entry) => {
      const t = db.computeTotals(entry);
      totalMiles += t.miles;
      totalGross += t.grossProfit;
      totalExpenses += t.totalExpenses;
      totalNet += t.netProfit;
      return { entry, t };
    });

    statDrives.textContent = entries.length;
    statMiles.textContent = totalMiles.toFixed(1);
    statGross.textContent = db.money(totalGross);
    statExpenses.textContent = db.money(totalExpenses);
    statNet.textContent = db.money(totalNet);
    statNet.classList.toggle('negative', totalNet < 0);
    statPerMile.textContent = totalMiles > 0 ? db.money(totalNet / totalMiles) : '$0.00';
    statPerMile.classList.toggle('negative', totalNet < 0);

    // Chart: one bar per drive, scaled to the largest |net profit|.
    chart.innerHTML = '';
    const maxAbs = rows.reduce((m, r) => Math.max(m, Math.abs(r.t.netProfit)), 0.01);
    rows.forEach(({ entry, t }) => {
      const bar = document.createElement('div');
      bar.className = 'chart-bar' + (t.netProfit < 0 ? ' negative' : '');
      const heightPct = Math.max(4, Math.round((Math.abs(t.netProfit) / maxAbs) * 100));
      bar.style.height = heightPct + '%';
      bar.title = `${entry.date}: ${db.money(t.netProfit)}`;
      chart.appendChild(bar);
    });

    // Table, most recent first.
    reportBody.innerHTML = '';
    entries.forEach((entry) => {
      const t = db.computeTotals(entry);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${entry.date}</td>
        <td>${t.miles.toFixed(1)}</td>
        <td>${db.money(t.grossProfit)}</td>
        <td>${db.money(t.gas)}</td>
        <td>${db.money(t.snacks)}</td>
        <td>${db.money(t.maintenance)}</td>
        <td>${db.money(t.other)}</td>
        <td>${db.money(t.totalExpenses)}</td>
        <td class="${t.netProfit < 0 ? 'negative' : 'positive'}">${db.money(t.netProfit)}</td>
      `;
      reportBody.appendChild(tr);
    });
    emptyState.style.display = entries.length ? 'none' : '';

    const url = sheets.sheetUrl();
    if (url) {
      sheetLink.href = url;
      sheetLink.style.display = '';
      const { lastSyncedAt } = sheets.getSettings();
      sheetStatusText.textContent = lastSyncedAt
        ? `Google Sheets: last synced ${new Date(lastSyncedAt).toLocaleString()}`
        : 'Google Sheets: linked, not yet synced';
    } else {
      sheetLink.style.display = 'none';
      sheetStatusText.textContent = 'Google Sheets: not connected (set up in Settings on the Add Drive page)';
    }

    const { lastBackupAt } = backup.getMeta();
    backupStatusText.textContent = lastBackupAt
      ? `Last local backup: ${new Date(lastBackupAt).toLocaleString()}`
      : 'Last local backup: never (back up from Settings on the Add Drive page)';
  }

  render();
})();

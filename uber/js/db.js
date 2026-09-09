// Local, on-device storage for drive entries. No data ever leaves the phone
// except when the user explicitly connects Google and syncs (see sheets.js).
// Namespaced under window.UberTracker so this file can be dropped into any
// site without clobbering a host page's own globals.
window.UberTracker = window.UberTracker || {};
window.UberTracker.db = (() => {
  const KEY = 'uber_financials_entries_v1';

  function getAll() {
    try {
      const raw = localStorage.getItem(KEY);
      const entries = raw ? JSON.parse(raw) : [];
      return entries.slice().sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
    } catch (e) {
      console.error('Failed to read entries from storage', e);
      return [];
    }
  }

  function saveAll(entries) {
    localStorage.setItem(KEY, JSON.stringify(entries));
  }

  function get(id) {
    return getAll().find((e) => e.id === id) || null;
  }

  function add(entry) {
    const entries = getAll();
    entries.push(entry);
    saveAll(entries);
    return entry;
  }

  function update(id, patch) {
    const entries = getAll();
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    entries[idx] = { ...entries[idx], ...patch };
    saveAll(entries);
    return entries[idx];
  }

  function remove(id) {
    saveAll(getAll().filter((e) => e.id !== id));
  }

  function clearAll() {
    saveAll([]);
  }

  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  // Shared math so uber.html, reports.html and the Sheets sync all agree.
  function computeTotals(entry) {
    const start = Number(entry.startMileage) || 0;
    const end = Number(entry.endMileage) || 0;
    const miles = Math.max(0, end - start);
    const expenses = entry.expenses || {};
    const gas = Number(expenses.gas) || 0;
    const snacks = Number(expenses.snacks) || 0;
    const maintenance = Number(expenses.maintenance) || 0;
    const other = Number(expenses.other) || 0;
    const totalExpenses = gas + snacks + maintenance + other;
    const grossProfit = Number(entry.grossProfit) || 0;
    const netProfit = grossProfit - totalExpenses;
    return { miles, totalExpenses, netProfit, gas, snacks, maintenance, other, grossProfit };
  }

  function money(n) {
    const sign = n < 0 ? '-' : '';
    return sign + '$' + Math.abs(n).toFixed(2);
  }

  return { getAll, saveAll, get, add, update, remove, clearAll, newId, computeTotals, money };
})();

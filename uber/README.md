# uber-financials
Mileage, income, and expense tracker for uber drivers.

An installable phone PWA (no backend, no build step) that logs each drive's date, start/end
mileage, gross profit (Uber's payout plus tip), and expenses (gas, snacks, maintenance,
other), then computes net profit. Everything works fully offline, on-device, with zero setup.
Google Sheets sync is available as an optional extra when you're online.

- **uber.html** — add/edit/delete drives, Settings (profile, backup/restore, Google Sheets).
- **reports.html** — totals, a net-profit-per-drive chart, and the full drive history table.

## Running it

Open `uber.html` through a local web server (not `file://` — service workers and Google
sign-in both require `http(s)`), e.g.:

```
npx serve .
```

then visit the printed `localhost` URL and open `uber.html`. On a phone, use your browser's
"Add to Home Screen" to install it as an app. After that one install, it runs fully offline —
no internet connection needed to log drives or view reports.

## Backup & restore (works fully offline, no account)

This is the main way to move your history to a new phone. In Settings:

- **Back Up Now** builds a JSON file of every drive. On phones that support it, this opens the
  native share sheet so you can send it straight to Mail, Drive, AirDrop, WhatsApp, etc. with
  the file already attached; otherwise it just downloads the file.
- **Restore** reads a backup file back in. It merges by drive, so it never deletes anything
  already on the device — safe to use on a phone that already has some entries.
- The app shows a small reminder banner if it's been a day or more since your last backup.

**Getting a backup into your email**, specifically: browsers deliberately block silent,
unattended sending of email — a page can't do that on its own without either a tap from you,
or a third-party email API with an exposed key. There's no way around this that doesn't
involve one of those two trade-offs. This app uses the first one: the native share sheet
above lets you pick Mail in one tap with the file attached, and if you save an email in
**Your Info** in Settings, the app also pre-addresses a draft to it via a `mailto:` link as a
convenience when the share sheet isn't available. Nothing is emailed unless you tap send.

## Your Info (Settings)

Not a real account — no password, nothing is created on any server. It's just a name/email
saved in this browser's local storage, used only to pre-address the backup email draft above.

## Google Sheets sync (optional, needs internet)

Everything above works with zero setup. To also mirror your data into a live Google Sheet:

1. Go to [console.cloud.google.com](https://console.cloud.google.com), create a project.
2. Enable the **Google Sheets API** for that project.
3. Under **APIs & Services → Credentials**, create an **OAuth client ID** of type **Web application**.
4. Add the exact URL you host this app at (must be `https://`, or `http://localhost` for
   testing) under **Authorized JavaScript origins**.
5. Open the app's Settings (gear icon on the Add Drive page), paste in the Client ID, and tap
   **Connect Google Account**.

The app creates a spreadsheet called "Uber Financials Tracker" in your Drive the first time
you connect, and keeps it up to date after every save/edit/delete. No Uber login is ever
requested or stored by this app — there is no public Uber API for a driver's own trip data,
and automating a login into Uber would risk violating Uber's Terms of Service, so entries are
entered manually.

## Embedding this in another website

Everything (`uber.html`, `reports.html`, `manifest.json`, `service-worker.js`, `css/`, `js/`,
`icons/`) is self-contained and uses relative paths, so a developer can drop this whole folder
as a single subfolder anywhere in their own site's file structure, e.g.:

```
mysite.com/
  index.html
  ...
  drive-tracker/          <- this entire folder, copied as-is
    uber.html
    reports.html
    manifest.json
    service-worker.js
    css/style.css
    js/db.js
    js/profile.js
    js/backup.js
    js/sheets.js
    js/app.js
    js/reports.js
    icons/...
```

Then link to it from anywhere on the site, e.g. `<a href="/drive-tracker/uber.html">`. Notes:

- Keep the folder's internal structure intact — don't merge `css/`, `js/`, or `icons/` into
  the host site's own folders of the same name.
- The service worker registers with a scope limited to whichever folder it lives in, so it
  won't affect the rest of the host site.
- The JS files attach a single `window.UberTracker` namespace (`UberTracker.db`,
  `UberTracker.profile`, `UberTracker.backup`, `UberTracker.sheets`) instead of loose globals,
  to avoid clashing with the host site's own scripts.
- A Google OAuth Client ID's "Authorized JavaScript origins" is matched by domain, not path,
  so it only needs to be set once per domain regardless of which subfolder the app lives in.
- Local storage keys are namespaced (`uber_financials_*`), so multiple apps on the same domain
  won't collide, but note that `localStorage` is shared per-origin — if this app is installed
  at two different paths on the *same* domain, they'll share the same saved drives.

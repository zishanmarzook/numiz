# Budget Buddy by Numiz

A responsive, installable web app for manual money management. Built with plain JavaScript modules, HTML, and CSS, with no build dependencies.

## Features

- Expense and income recording, monthly reports, search, filters, and charts derived from actual entries.
- Recurring monthly category budgets and progress tracking.
- Savings goals and manual contribution records.
- Shared group bills, equal splits with exact cent allocation, net balances, and settlement suggestions.
- Individual, student, family, roommate, and other profile options.
- Seven currency choices; currency changes require an empty workspace. No exchange-rate conversion is implied.
- Local device persistence, explicit sample workspace, JSON backup export/import, and offline app shell.

Shared bills and savings records are separate from personal transaction totals. The app does not connect to banks, move money, send payments, or synchronise accounts between devices. Data lives in this browser's local storage; export backups before clearing browser data.

## Run

Serve `dist/` with any static web server. For example:

```sh
python3 -m http.server 8000 --directory dist
```

Then open `http://localhost:8000`. A service worker supports offline access after the first successful load. On a supported mobile browser, use **Add to Home Screen** to open the app as a standalone experience.

## Verify

With Node.js 24 or newer:

```sh
npm run check
```

The runtime smoke tests exercise the actual app handlers with a minimal DOM stub; they do not replace browser testing. The domain tests cover exact cent parsing, monthly totals, proportional remainder handling, group balances and settlements, and strict backup validation. Browser verification is separate from these checks.

## Project structure

- `dist/app.js`: state, screens, and interactions.
- `dist/finance.js`: pure finance calculations and import validation.
- `dist/styles.css`: responsive design.
- `tests/finance.test.js`: financial behavior tests.

Deploy the contents of `dist/` to a static host. All asset paths are relative so the app can run under a repository subpath.

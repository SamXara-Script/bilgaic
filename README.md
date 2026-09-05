# SEZ investor workspace

React 19 + Vite, with a Node.js API and SQLite storage. Includes a responsive dashboard, mining plans, wallet history, referrals, account settings, 17 interface languages, and an admin area.

## Development

Use Node.js 24 or later, which includes the SQLite API required by the server.

```sh
npm install
npm run server
```

In a second terminal:

```sh
npm run dev
```

Vite proxies `/api` requests to the local server on port 8787. Open the local URL printed by Vite. Customer accounts are stored in `data/sez.sqlite`; the development and production server use this same database when launched from the project directory.

## Validation

```sh
npm run build
npm run lint
npm test
```

Tests create an isolated server and SQLite database in the operating system’s temporary directory. They never change the project database. The API suite checks authentication, account review, monetary precision, purchase duplication, withdrawals, and income history. The frontend suite renders the main screens and tests error handling and chart data. These are automated render checks, not browser interaction or visual tests.

## Production server

```sh
npm run build
npm start
```

Configure `PORT` (defaults to 8787), `INVITE_CODES` (comma-separated registration codes), and `ADMIN_ACCESS_KEY` in the deployment environment. Configure HTTPS and use `NODE_ENV=production` so session cookies require a secure connection. Keep `data/` persistent and outside publicly served files.

The admin interface is available at `/admin/` or `/admin/index.html`. It requires the configured admin key. Pending verification documents can be reviewed there, then approved or returned for resubmission. Document uploads no longer automatically grant verified status.

## Payment behavior

Only the existing USDT/TRC20 deposit address is offered. Unsupported networks never produce placeholder addresses. The customer self-credit endpoint is disabled: submitting an amount is not payment confirmation. Deposit settlement still requires a trusted payment provider or an operator workflow, and blockchain withdrawal settlement is not implemented by this project. Withdrawal requests remain pending for processing. Plan payments use the actual dollar-denominated account balance; the UI does not quote invented BTC/ETH conversion rates.

## Static demo

GitHub Pages and file URLs use the existing device-local demo with a visible demo notice. Use test details only. Demo data, verification, and balances are browser-local simulations, and are not synchronized to the server. Ordinary server outages never silently switch a real account into demo mode.

## Design

`src/design.css` defines the graphite and citron theme, shared controls, responsive layouts, keyboard focus, and reduced-motion behavior. The account access, navigation, income chart, and verification review have separate components. The income chart uses complete daily UTC aggregates from the API, independently of the recent-transaction limit. Translation dictionaries load separately to reduce the initial JavaScript bundle.

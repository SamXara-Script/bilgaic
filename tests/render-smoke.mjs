import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const root = fileURLToPath(new URL('../', import.meta.url))
const exported = ['HomeView', 'InvestView', 'WalletView', 'ProfileView', 'ReferralView', 'SupportView', 'SupportTutorialView', 'TierCard', 'MiningDetailsView', 'CheckoutView', 'RechargeView', 'WithdrawView', 'ProfileSettingsView', 'LanguageView', 'SecurityView', 'VerificationView', 'AdminApp', 'isAdminRoute', 'getRechargeAddress', 'requestApi', 'tiers']
const server = await createServer({
  root,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  plugins: [{ name: 'test-view-exports', enforce: 'pre', transform(code, id) {
    if (id.replaceAll('\\', '/').endsWith('/src/App.jsx')) return `${code}\nexport { ${exported.join(', ')} }`
  } }],
})

globalThis.window = { location: { pathname: '/', hostname: 'localhost', protocol: 'http:', origin: 'http://localhost' }, localStorage: { getItem: () => null } }
let passed = 0
const test = (name, callback) => { callback(); passed++; console.log(`PASS ${name}`) }
const noop = () => {}

try {
  const app = await server.ssrLoadModule('/src/App.jsx')
  const { default: AuthScreen } = await server.ssrLoadModule('/src/components/auth-screen.jsx')
  const { default: IncomeChart } = await server.ssrLoadModule('/src/components/income-chart.jsx')
  const user = { id: 1, name: 'Test Member', email: 'test@example.test', verified: false, inviteCode: 'SEZABC123' }
  const wallet = { id: 'SEZ-TEST', balance: 1200 }
  const portfolio = { walletId: wallet.id, walletBalance: 1200, totalInvested: 300, activeTiers: 1, totalIncome: 35, dailyIncome: 17.5, periodProfit: 297.5, earnings: 525, oneMonthResult: 825 }
  const tier = app.tiers[0]
  const purchase = { ...tier, createdAt: new Date().toISOString(), crypto: 'USDT' }
  const verification = { status: 'Pending', documentName: 'document.png', faceName: 'face.png', createdAt: new Date().toISOString() }
  const common = { user, wallet, portfolio, transactions: [], activities: [], incomeHistory: [], referrals: [], purchases: [], tier, tiers: app.tiers, filter: 'all', now: Date.now(), language: { id: 'en', label: 'English' }, onAction: noop, onNavigate: noop, onVerify: noop, onHistory: noop, onReadMore: noop, onBack: noop, onConfirm: noop }
  const render = (name, props = {}, expected) => test(`${name} renders ${expected || 'without errors'}`, () => {
    const html = renderToStaticMarkup(createElement(app[name], { ...common, ...props }))
    assert.ok(html.length > 100)
    assert.doesNotMatch(html, /\b(?:NaN|undefined)\b/)
    if (expected) assert.ok(html.includes(expected), `${name} should contain ${expected}`)
  })
  render('HomeView', {}, 'Total Balance')
  render('HomeView', { verification }, 'under review')
  render('InvestView', {}, 'Mining plans')
  render('InvestView', { purchases: [purchase] })
  render('WalletView', {}, 'Wallet History')
  render('ProfileView', { verification }, 'Pending review')
  render('ProfileView', { user: { ...user, verified: true }, purchases: [purchase] })
  render('ReferralView', {}, 'Referral Tree')
  render('SupportView', {}, 'Customer Support')
  render('SupportTutorialView', { topicId: 'account' }, 'Account Tutorial')
  render('MiningDetailsView', {}, 'Buy Now')
  render('CheckoutView', {}, 'Confirm Wallet Payment')
  render('CheckoutView', { wallet: { ...wallet, balance: 0 } }, 'Insufficient balance')
  render('RechargeView', {}, 'TRC20')
  render('WithdrawView', {}, 'Submit Withdrawal')
  render('ProfileSettingsView', {}, 'Personal details')
  render('LanguageView', { language: 'ka' }, 'Language')
  render('SecurityView', {}, 'Not available')
  render('VerificationView', { verification }, 'Awaiting review')
  render('VerificationView', { user: { ...user, verified: true } }, 'Already Verified')
  render('AdminApp', {}, 'Admin Login')
  test('Login preserves long-password compatibility and accessible controls', () => {
    const html = renderToStaticMarkup(createElement(AuthScreen, { mode: 'login', onModeChange: noop, onAuthenticate: noop }))
    assert.match(html, /maxLength="256"/i)
    assert.match(html, /aria-label="Show password"/)
  })
  test('Registration requires invitation and full name', () => {
    const html = renderToStaticMarkup(createElement(AuthScreen, { mode: 'register', onModeChange: noop, onAuthenticate: noop }))
    assert.match(html, /account-name/)
    assert.match(html, /account-invite/)
  })
  test('Income chart includes Credited earnings and SQLite UTC timestamps', () => {
    const transactions = [{ type: 'earning', status: 'Credited', amount: 17.5, createdAt: new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '') }]
    const html = renderToStaticMarkup(createElement(IncomeChart, { transactions }))
    assert.ok(html.includes('$17.50'))
    assert.ok(!html.includes('chart-empty-copy'))
  })
  test('Income chart uses complete history instead of the recent transaction limit', () => {
    const history = [{ date: new Date().toISOString().slice(0, 10), total: 800 }]
    const html = renderToStaticMarkup(createElement(IncomeChart, { transactions: [], history }))
    assert.ok(html.includes('$800.00'))
  })
  test('Unsupported deposit networks never fabricate an address', () => {
    assert.equal(app.getRechargeAddress('BTC', 'BEP20'), '')
    assert.match(app.getRechargeAddress('USDT', 'TRC20'), /^T/)
  })
  test('Admin HTML entry is recognized with and without trailing slash', () => {
    for (const path of ['/admin', '/admin/', '/admin/index.html', '/bilgaic/admin/index.html']) {
      window.location.pathname = path
      assert.equal(app.isAdminRoute(), true, path)
    }
    window.location.pathname = '/'
    assert.equal(app.isAdminRoute(), false)
  })
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => { throw new Error('offline') }
    await assert.rejects(app.requestApi('/api/auth/login'), /Unable to reach the server/)
    passed++
    console.log('PASS Offline API does not create a browser-local account')
  } finally { globalThis.fetch = originalFetch }
  console.log(`${passed} render and frontend regression checks passed.`)
} finally {
  await server.close()
  delete globalThis.window
}

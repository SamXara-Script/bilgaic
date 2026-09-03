import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { BottomNav, SideNav } from './components/navbar.jsx'
import { IconButton, PrimaryButton, SegmentButton } from './components/button.jsx'
import { defaultLanguageId, formatLanguageChangeNotice, getLanguageOption, languageOptions, observePageTranslations } from './i18n.js'

const navItems = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'invest', label: 'Invest', icon: 'grid' },
  { id: 'wallet', label: 'Wallet', icon: 'wallet' },
  { id: 'referrals', label: 'Referral', icon: 'send' },
  { id: 'support', label: 'Support', icon: 'support' },
  { id: 'profile', label: 'Profile', icon: 'user' },
]

const pageMeta = {
  home: { eyebrow: 'Investor dashboard', title: 'Overview' },
  invest: { eyebrow: 'Investment portfolio', title: 'Maining plans' },
  wallet: { eyebrow: 'Account funds', title: 'Wallet' },
  referrals: { eyebrow: 'Member network', title: 'Referrals' },
  support: { eyebrow: 'Customer help', title: 'Support' },
  profile: { eyebrow: 'Account management', title: 'Profile' },
  mainingDetails: { eyebrow: 'Maining details', title: 'Read more' },
  recharge: { eyebrow: 'Account funds', title: 'Recharge' },
  withdraw: { eyebrow: 'Account funds', title: 'Withdraw' },
  security: { eyebrow: 'Account protection', title: 'Security' },
  profileSettings: { eyebrow: 'Account management', title: 'Profile settings' },
  verification: { eyebrow: 'Customer verification', title: 'Verify account' },
  language: { eyebrow: 'Display settings', title: 'Language' },
  supportTutorial: { eyebrow: 'Customer help', title: 'Tutorial' },
}

const actionItems = [
  { label: 'Recharge', icon: 'plus', tone: 'blue', view: 'recharge' },
  { label: 'Withdraw', icon: 'arrow-up', tone: 'violet', view: 'withdraw' },
  { label: 'Sign Out', icon: 'logout', tone: 'gold', action: 'logout' },
]

const cryptoOptions = [
  { id: 'USDT', name: 'Tether', quantity: (price) => `${price.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT`, tone: 'teal' },
  { id: 'BTC', name: 'Bitcoin', quantity: (price) => `${(price / 64000).toFixed(6)} BTC`, tone: 'gold' },
  { id: 'ETH', name: 'Ethereum', quantity: (price) => `${(price / 3400).toFixed(4)} ETH`, tone: 'violet' },
]

const projectedMonthlyRate = 0.24
const withdrawalFeeRate = 0.16
const profitWindowDays = 17
const payoutCycleMs = 24 * 60 * 60 * 1000
const telegramSupportUrl = 'https://t.me/+J82Rio5xns1lY2Ni'
const telegramGroupUrl = telegramSupportUrl
const referralTeams = [
  { level: 1, label: 'Team 1', taskRate: 0.06, depositRate: 0.03 },
  { level: 2, label: 'Team 2', taskRate: 0.03, depositRate: 0.02 },
  { level: 3, label: 'Team 3', taskRate: 0.02, depositRate: 0.01 },
]
const tierPlans = [
  { amount: 300, dailyIncome: 17.5 },
  { amount: 500, dailyIncome: 30 },
  { amount: 1000, dailyIncome: 59.5 },
  { amount: 1300, dailyIncome: 77 },
  { amount: 1500, dailyIncome: 88.5 },
  { amount: 2000, dailyIncome: 118 },
  { amount: 3000, dailyIncome: 179 },
  { amount: 5000, dailyIncome: 299 },
  { amount: 10000, dailyIncome: 669 },
  { amount: 20000, dailyIncome: 1349 },
  { amount: 30000, dailyIncome: 1839 },
  { amount: 50000, dailyIncome: 3229 },
]
const tierIds = ['starter', 'premium', 'elite', 'royal']
const tierColors = [
  ['#4b91ff', 'rgba(36, 113, 255, .32)'],
  ['#9b70ff', 'rgba(125, 75, 255, .30)'],
  ['#f0b91a', 'rgba(240, 185, 26, .26)'],
  ['#1fddb0', 'rgba(24, 203, 157, .26)'],
]

const maxTierDailyIncome = Math.max(...tierPlans.map((plan) => plan.dailyIncome))
const tiers = tierPlans.map(({ amount: price, dailyIncome }, index) => {
  const [color, shadow] = tierColors[index % tierColors.length]
  const monthlyProfit = dailyIncome * 30

  return {
    id: tierIds[index] || `vip-${index + 1}`,
    level: `Maining ${index + 1}`,
    title: `Maining Plan ${index + 1}`,
    price,
    dailyIncome,
    investment: formatCompactMoney(price),
    risk: `Daily ${formatMoney(dailyIncome)}`,
    riskValue: Math.max(8, Math.round((dailyIncome / maxTierDailyIncome) * 100)),
    monthlyRate: monthlyProfit / price,
    color,
    shadow,
  }
})

const tierFilters = [
  { id: 'all', label: 'All Plans', matches: () => true },
  { id: 'entry', label: '$300-$1,500', matches: (tier) => tier.price <= 1500 },
  { id: 'growth', label: '$2,000-$5,000', matches: (tier) => tier.price >= 2000 && tier.price <= 5000 },
  { id: 'pro', label: '$10,000-$50,000', matches: (tier) => tier.price >= 10000 },
]

const staticAuthStorageKey = 'sez-demo-auth-reset-2026-09-03'
const legacyStaticAuthStorageKeys = ['sez-demo-auth']
const languageStorageKey = 'sez-language'
const defaultInviteCode = 'SEZ2026'
const emptyWallet = { id: '', balance: 0 }
const verificationRequiredMessage = 'Upload your ID or passport and face photo to verify your account.'
const uploadMaxBytes = 3 * 1024 * 1024
const documentUploadTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const faceUploadTypes = ['image/jpeg', 'image/png', 'image/webp']
const supportChangeMessage = 'Contact support to change customer name or Gmail.'
const walletHistoryFilters = [
  { id: 'recharge', label: 'Recharge History', emptyMessage: 'No recharge history yet' },
  { id: 'withdrawal', label: 'Withdraw History', emptyMessage: 'No withdraw history yet' },
]
const incomeTransactionTypes = ['earning', 'referral_deposit', 'referral_task']
const supportTutorials = [
  {
    id: 'account',
    label: 'Account',
    title: 'Account Tutorial',
    icon: 'user',
    intro: 'Use your member invite code to register, then keep login and password details secure.',
    steps: [
      'Register with your full name, Gmail address, password, and member invite code.',
      'After login, open Profile to check account status, language, referrals, and security.',
      'Customer name and Gmail are locked. Contact support when those details need to change.',
    ],
  },
  {
    id: 'wallet',
    label: 'Wallet',
    title: 'Wallet Tutorial',
    icon: 'wallet',
    intro: 'The wallet page controls balance, recharge, withdraw, and filtered transaction history.',
    steps: [
      'Verify the account before using wallet actions.',
      'Open Recharge, choose currency and network, then use the generated wallet address.',
      'Open Withdraw, enter amount and destination wallet, then review fee and receive amount before submitting.',
    ],
  },
  {
    id: 'verification',
    label: 'Verification',
    title: 'Verification Tutorial',
    icon: 'upload',
    intro: 'Verification unlocks recharge, withdrawal, and Maining plan purchase actions.',
    steps: [
      'Choose ID card or passport as the document type.',
      'Upload one document file and one clear face photo.',
      'Submit verification and wait for the profile status to show Verified.',
    ],
  },
  {
    id: 'maining',
    label: 'Maining Plans',
    title: 'Maining Plans Tutorial',
    icon: 'grid',
    intro: 'Maining plans use wallet balance to purchase a selected mining package.',
    steps: [
      'Open Invest and filter plans by price range.',
      'Read plan details to review price, daily payout, projected profit, and payout timer.',
      'Buy the plan from wallet balance and track active plans from Profile.',
    ],
  },
]
const supportTutorialMap = Object.fromEntries(supportTutorials.map((tutorial) => [tutorial.id, tutorial]))

function App() {
  const [activeView, setActiveView] = useState('home')
  const [tierFilter, setTierFilter] = useState('all')
  const [notice, setNotice] = useState('')
  const [checkoutTier, setCheckoutTier] = useState(null)
  const [mainingTier, setMainingTier] = useState(null)
  const [mainingBackView, setMainingBackView] = useState('invest')
  const [selectedCrypto, setSelectedCrypto] = useState('USDT')
  const [purchases, setPurchases] = useState([])
  const [wallet, setWallet] = useState(emptyWallet)
  const [transactions, setTransactions] = useState([])
  const [totalIncome, setTotalIncome] = useState(0)
  const [referrals, setReferrals] = useState([])
  const [verification, setVerification] = useState(null)
  const [user, setUser] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authReady, setAuthReady] = useState(false)
  const [language, setLanguage] = useState(readSavedLanguage)
  const [supportTopic, setSupportTopic] = useState('account')
  const [clockNow, setClockNow] = useState(() => Date.now())

  useEffect(() => {
    try {
      for (const storageKey of legacyStaticAuthStorageKeys) window.localStorage.removeItem(storageKey)
    } catch {
      // The reset only applies where browser storage is available.
    }
  }, [])

  const applyAccountPayload = useCallback((payload) => {
    const normalizedTransactions = (payload.transactions || []).map(toClientTransaction)
    setUser(payload.user)
    setWallet(toClientWallet(payload.wallet))
    setPurchases((payload.purchases || []).map(toClientPurchase))
    setTransactions(normalizedTransactions)
    setTotalIncome(readPayloadTotalIncome(payload, normalizedTransactions))
    setReferrals(payload.referrals || [])
    setVerification(payload.verification || null)
  }, [])

  useEffect(() => {
    let active = true

    async function restoreSession() {
      try {
        const session = await requestApi('/api/session')
        if (!active) return
        applyAccountPayload(session)
      } catch {
        // The login screen remains available while the API is offline.
      } finally {
        if (active) setAuthReady(true)
      }
    }

    restoreSession()
    return () => { active = false }
  }, [applyAccountPayload])

  useEffect(() => {
    if (!user?.id || !purchases.length) return undefined

    let active = true
    let timeoutId = 0

    async function refreshAfterPayout() {
      try {
        const session = await requestApi('/api/session')
        if (active) applyAccountPayload(session)
      } catch {
        // The next normal API request will retry payout sync.
      } finally {
        if (active) scheduleRefresh()
      }
    }

    function scheduleRefresh() {
      const nextRefresh = getNextPortfolioPayoutRefreshDate(purchases)
      const delay = Math.max(nextRefresh.getTime() - Date.now(), 1000)
      timeoutId = window.setTimeout(refreshAfterPayout, Math.min(delay, 2147483647))
    }

    scheduleRefresh()
    return () => {
      active = false
      window.clearTimeout(timeoutId)
    }
  }, [applyAccountPayload, purchases, user?.id])

  useEffect(() => {
    const intervalId = window.setInterval(() => setClockNow(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(languageStorageKey, language)
    } catch {
      // Language still applies for the current browser session.
    }
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    const root = document.getElementById('root')
    return observePageTranslations(root, language)
  }, [language])

  const filteredTiers = useMemo(() => {
    const selectedFilter = tierFilters.find((filter) => filter.id === tierFilter) || tierFilters[0]
    return tiers.filter(selectedFilter.matches)
  }, [tierFilter])

  const portfolio = useMemo(() => {
    const totalInvested = purchases.reduce((total, purchase) => total + purchase.price, 0)
    const projected = purchases.reduce((total, purchase) => {
      const projection = getTierProjection(purchase.price, purchase.monthlyRate)
      return {
        dailyIncome: total.dailyIncome + projection.dailyIncome,
        periodProfit: total.periodProfit + projection.periodProfit,
        monthlyProfit: total.monthlyProfit + projection.monthlyProfit,
      }
    }, { dailyIncome: 0, periodProfit: 0, monthlyProfit: 0 })

    return {
      totalInvested,
      activeTiers: purchases.length,
      walletId: wallet.id,
      walletBalance: wallet.balance,
      earnings: projected.monthlyProfit,
      dailyIncome: projected.dailyIncome,
      periodProfit: projected.periodProfit,
      totalIncome,
      oneMonthResult: totalInvested + projected.monthlyProfit,
    }
  }, [purchases, totalIncome, wallet.balance, wallet.id])

  const selectedLanguage = useMemo(() => getLanguageOption(language), [language])
  const payoutTimer = useMemo(() => getPortfolioPayoutTimer(purchases, clockNow), [purchases, clockNow])
  const mainingPurchase = mainingTier ? purchases.find((purchase) => purchase.id === mainingTier.id) : null

  const activities = useMemo(() => {
    const transactionActivities = transactions.map(toActivity)
    const transactionTitles = new Set(transactionActivities.map((activity) => activity.title))
    const purchaseActivities = purchases.filter((purchase) => !transactionTitles.has(`${purchase.level} ${purchase.title}`)).map((purchase) => ({
      title: `${purchase.level} ${purchase.title}`,
      time: `Paid with ${purchase.crypto}`,
      amount: `-${formatMoney(purchase.price)}`,
      type: 'wallet',
      tone: purchase.tone,
    }))
    return [...transactionActivities, ...purchaseActivities]
  }, [purchases, transactions])

  function showNotice(message) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2400)
  }

  function requireVerifiedAccount() {
    if (user?.verified) return true
    showNotice(verificationRequiredMessage)
    setMainingTier(null)
    setActiveView('verification')
    return false
  }

  function startCheckout(tier) {
    if (!requireVerifiedAccount()) return
    setSelectedCrypto('USDT')
    setMainingTier(null)
    setMainingBackView('invest')
    setActiveView('invest')
    setCheckoutTier(tier)
  }

  function showMainingDetails(tier, backView = 'invest') {
    setCheckoutTier(null)
    setMainingTier(tier)
    setMainingBackView(backView)
    setActiveView('mainingDetails')
  }

  function navigateTo(view) {
    if ((view === 'recharge' || view === 'withdraw') && !requireVerifiedAccount()) return
    setCheckoutTier(null)
    setMainingTier(null)
    setMainingBackView('invest')
    setActiveView(view)
  }

  function openSupportTutorial(topicId) {
    setCheckoutTier(null)
    setMainingTier(null)
    setSupportTopic(supportTutorialMap[topicId] ? topicId : 'account')
    setActiveView('supportTutorial')
  }

  function updateLanguage(nextLanguage) {
    const option = getLanguageOption(nextLanguage)
    setLanguage(option.id)
    showNotice(formatLanguageChangeNotice(option.id, option))
  }

  async function confirmPurchase() {
    if (!checkoutTier || purchases.some((purchase) => purchase.id === checkoutTier.id)) return
    try {
      const result = await requestApi('/api/purchases', { method: 'POST', body: { tierId: checkoutTier.id, crypto: selectedCrypto } })
      const normalizedTransactions = (result.transactions || []).map(toClientTransaction)
      setPurchases((current) => [toClientPurchase(result.purchase), ...current])
      setWallet(toClientWallet(result.wallet))
      setTransactions(normalizedTransactions)
      setTotalIncome(readPayloadTotalIncome(result, normalizedTransactions))
      setCheckoutTier(null)
      setMainingTier(null)
      setActiveView('profile')
      showNotice(`${checkoutTier.title} was added to your profile.`)
    } catch (error) {
      showNotice(error.message)
    }
  }

  async function updatePassword({ currentPassword, newPassword }) {
    await requestApi('/api/security/password', { method: 'POST', body: { currentPassword, newPassword } })
    showNotice('Password updated.')
  }

  async function submitVerification({ documentType, document, face }) {
    const result = await requestApi('/api/verification', { method: 'POST', body: { documentType, document, face } })
    setUser(result.user)
    setVerification(result.verification || null)
    setActiveView('profile')
    showNotice('Account verified. You can now add balance and buy Maining plans.')
  }

  async function submitWithdrawal({ amount, crypto, address }) {
    if (!requireVerifiedAccount()) throw new Error(verificationRequiredMessage)
    const result = await requestApi('/api/withdrawals', { method: 'POST', body: { amount, crypto, address } })
    const normalizedTransactions = (result.transactions || []).map(toClientTransaction)
    setWallet(toClientWallet(result.wallet))
    setTransactions(normalizedTransactions)
    setTotalIncome(readPayloadTotalIncome(result, normalizedTransactions))
    const withdrawal = result.withdrawal || { amount, fee: calculateWithdrawalFee(amount), receiveAmount: calculateWithdrawalReceiveAmount(amount) }
    showNotice(`Withdrawal submitted. You receive ${formatMoney(withdrawal.receiveAmount)} after ${formatMoney(withdrawal.fee)} fee.`)
  }

  async function refreshReferrals() {
    const result = await requestApi('/api/referrals')
    setUser((current) => current ? { ...current, inviteCode: result.inviteCode || current.inviteCode } : current)
    setReferrals(result.referrals || [])
  }

  async function copyInviteCode() {
    if (!user?.inviteCode) return
    try {
      await navigator.clipboard.writeText(user.inviteCode)
      showNotice('Invite code copied.')
    } catch {
      showNotice(`Invite code: ${user.inviteCode}`)
    }
  }

  async function authenticate({ mode, name, email, password, inviteCode }) {
    const payload = mode === 'register' ? { name: name.trim(), email, password, inviteCode } : { email, password }
    const result = await requestApi(`/api/auth/${mode}`, { method: 'POST', body: payload })
    applyAccountPayload(result)
    setActiveView(result.user?.verified ? 'home' : 'verification')
    setCheckoutTier(null)
    setMainingTier(null)
    if (!result.user?.verified) showNotice(verificationRequiredMessage)
  }

  async function logout() {
    try {
      await requestApi('/api/auth/logout', { method: 'POST' })
    } catch {
      // Clear the local session even if the server is unavailable.
    }
    setUser(null)
    setPurchases([])
    setWallet(emptyWallet)
    setTransactions([])
    setTotalIncome(0)
    setReferrals([])
    setVerification(null)
    setCheckoutTier(null)
    setMainingTier(null)
    setMainingBackView('invest')
    setActiveView('home')
    setAuthMode('login')
    setNotice('')
  }

  if (!authReady) return <main className="auth-loading">Loading secure session...</main>

  if (!user) {
    return <AuthScreen mode={authMode} onModeChange={setAuthMode} onAuthenticate={authenticate} />
  }

  const currentPage = checkoutTier ? { eyebrow: 'Customer checkout', title: 'Crypto payment' } : pageMeta[activeView] || pageMeta.home

  return (
    <main className="app-shell">
      <SideNav items={navItems} activeId={activeView} onSelect={navigateTo} onLogout={logout} supportUrl={telegramSupportUrl} />
      <div className="workspace">
        <header className="desktop-topbar">
          <div><p className="eyebrow">{currentPage.eyebrow}</p><h2>{currentPage.title}</h2></div>
          <div className="desktop-account"><button type="button" aria-label="Notifications" onClick={() => showNotice('You have no new notifications.')}><Icon name="bell" /></button><div className="desktop-avatar">{user.name.slice(0, 1).toUpperCase()}</div><span>{user.name}</span></div>
        </header>
        <div className="page-content">
          {checkoutTier ? <CheckoutView tier={checkoutTier} crypto={selectedCrypto} wallet={wallet} onCrypto={setSelectedCrypto} onBack={() => setCheckoutTier(null)} onConfirm={confirmPurchase} /> : <>
            {activeView === 'home' && <HomeView onAction={showNotice} onNavigate={navigateTo} onVerify={() => navigateTo('verification')} onHistory={() => navigateTo('wallet')} portfolio={portfolio} payoutTimer={payoutTimer} activities={activities} user={user} onLogout={logout} />}
            {activeView === 'invest' && <InvestView filter={tierFilter} onFilter={setTierFilter} tiers={filteredTiers} portfolio={portfolio} payoutTimer={payoutTimer} purchases={purchases} now={clockNow} onReadMore={(tier) => showMainingDetails(tier, 'invest')} />}
            {activeView === 'mainingDetails' && mainingTier && <MainingDetailsView tier={mainingPurchase || mainingTier} owned={Boolean(mainingPurchase)} payoutTimer={getPurchasePayoutTimer(mainingPurchase, clockNow)} onBack={() => navigateTo(mainingBackView)} onBuy={startCheckout} />}
            {activeView === 'wallet' && <WalletView onRecharge={() => navigateTo('recharge')} onWithdraw={() => navigateTo('withdraw')} portfolio={portfolio} transactions={transactions} />}
            {activeView === 'referrals' && <ReferralView user={user} referrals={referrals} onCopy={copyInviteCode} onRefresh={refreshReferrals} />}
            {activeView === 'support' && <SupportView onTutorial={openSupportTutorial} />}
            {activeView === 'supportTutorial' && <SupportTutorialView topicId={supportTopic} onBack={() => setActiveView('support')} />}
            {activeView === 'profile' && <ProfileView onAction={showNotice} onProfileSettings={() => navigateTo('profileSettings')} onLanguage={() => navigateTo('language')} onSecurity={() => navigateTo('security')} onReferrals={() => navigateTo('referrals')} onVerification={() => navigateTo('verification')} onReadMore={(tier) => showMainingDetails(tier, 'profile')} portfolio={portfolio} payoutTimer={payoutTimer} purchases={purchases} now={clockNow} user={user} verification={verification} language={selectedLanguage} onLogout={logout} />}
            {activeView === 'recharge' && <RechargeView wallet={wallet} onBack={() => setActiveView('wallet')} />}
            {activeView === 'withdraw' && <WithdrawView onBack={() => setActiveView('wallet')} onWithdraw={submitWithdrawal} portfolio={portfolio} />}
            {activeView === 'profileSettings' && <ProfileSettingsView user={user} onBack={() => setActiveView('profile')} />}
            {activeView === 'security' && <SecurityView user={user} onBack={() => setActiveView('profile')} onAction={showNotice} onPasswordChange={updatePassword} onVerification={() => navigateTo('verification')} />}
            {activeView === 'verification' && <VerificationView user={user} verification={verification} onBack={() => setActiveView('profile')} onVerify={submitVerification} />}
            {activeView === 'language' && <LanguageView language={language} onBack={() => setActiveView('profile')} onChange={updateLanguage} />}
          </>}
        </div>
      </div>

      {notice && <div className="toast" role="status">{notice}</div>}
      <TelegramSupportButton />
      <BottomNav items={navItems} activeId={activeView} onSelect={navigateTo} />
    </main>
  )
}

function AuthScreen({ mode, onModeChange, onAuthenticate }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const isRegister = mode === 'register'

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await onAuthenticate({ mode, name, email, password, inviteCode })
    } catch (submissionError) {
      setError(submissionError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function switchMode() {
    setName('')
    setEmail('')
    setPassword('')
    setInviteCode('')
    onModeChange(isRegister ? 'login' : 'register')
  }

  return <main className="auth-shell">
    <section className="auth-visual" aria-hidden="true"><div className="auth-brand">SEZ<span /></div><div className="auth-visual-copy"><p>Secure investing workspace</p><h1>Invest with a clearer view.</h1><div><strong>$0.00</strong><span>Start with a personal wallet and choose your first plan when ready.</span></div></div></section>
    <section className="auth-main"><div className="auth-card"><div className="auth-mobile-brand">SEZ<span /></div><p className="eyebrow">Customer access</p><h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1><p className="auth-subtitle">{isRegister ? 'Enter a member invite code to open your investor profile.' : 'Sign in to your investor workspace.'}</p><form onSubmit={submit}>{isRegister && <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label>}<label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isRegister ? 'new-password' : 'current-password'} minLength="8" required /></label>{isRegister && <label>Invite code<input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} autoComplete="off" required /></label>}{error && <p className="auth-error" role="alert">{error}</p>}<button className="auth-submit" type="submit" disabled={submitting}>{submitting ? 'Please wait...' : isRegister ? 'Create account' : 'Log in'}</button></form><p className="auth-switch">{isRegister ? 'Already have an account?' : 'New to SEZ?'} <button type="button" onClick={switchMode}>{isRegister ? 'Log in' : 'Create account'}</button></p></div></section>
    <TelegramSupportButton />
  </main>
}

function VerificationBanner({ onVerify }) {
  return <section className="verification-banner"><div><p className="eyebrow">Unverified account</p><h2>Upload your ID or passport and face photo.</h2></div><button type="button" onClick={onVerify}><Icon name="upload" />Verify</button></section>
}

function HomeView({ onAction, onNavigate, onVerify, onHistory, portfolio, payoutTimer, activities, user, onLogout }) {
  const overviewItems = getOverviewItems(portfolio)

  return (
    <>
      {!user.verified && <VerificationBanner onVerify={onVerify} />}
      <div className="home-hero-grid">
        <section className="balance-card">
          <div className="balance-topline">
            <div><p className="eyebrow">Good Morning</p><h1>{user.name}</h1></div>
            <div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div>
          </div>
          <p className="eyebrow balance-label">Total Balance</p>
          <p className="balance-value">{formatMoney(portfolio.walletBalance)}</p>
          <p className="growth"><Icon name="trend" /> 0% this month</p>
          <PayoutTimer timer={payoutTimer} />
          <div className="income-strip">
            <div className="income-icon"><Icon name="check" /></div>
            <div><p className="micro-label">My Income</p><strong>{formatMoney(portfolio.earnings)}</strong></div>
            <div className="strip-rule" />
            <div><p className="micro-label">Revenue</p><strong className="violet-text">{formatMoney(portfolio.earnings)}</strong></div>
          </div>
        </section>
        <section className="quick-actions-panel" aria-label="Quick actions">
          <p className="quick-actions-title">Quick actions</p>
          <div className="action-grid">
            {actionItems.map((item) => <IconButton key={item.label} label={item.label} icon={item.icon} tone={item.tone} onClick={() => item.action === 'logout' ? onLogout() : onNavigate(item.view)} />)}
          </div>
        </section>
      </div>

      <div className="home-data-grid">
        <section className="overview-panel">
          <SectionHeader title="Daily Overview" action="See all" onAction={() => onAction('Daily reporting is up to date.')} />
          <div className="overview-row">{overviewItems.map((item) => <OverviewCard key={item.label} item={item} />)}</div>
        </section>
        <section className="activity-panel">
          <SectionHeader title="Recent Activity" action="History" onAction={onHistory} />
          <ActivityList items={activities} emptyMessage="No transactions yet" />
        </section>
      </div>
    </>
  )
}

function InvestView({ filter, onFilter, tiers: tierItems, portfolio, payoutTimer, purchases, now, onReadMore }) {
  return (
    <>
      <section className="investment-summary">
        <div className="summary-topline">
          <div><p className="eyebrow">Investment</p><h1>Maining Devices</h1></div>
          <div className="active-tier"><span>Active</span><strong>{portfolio.activeTiers} Plans</strong></div>
        </div>
        <div className="summary-metrics"><Metric label="Daily Income" value={formatMoney(portfolio.dailyIncome)} green /><Metric label={`${profitWindowDays} Day Profit`} value={formatMoney(portfolio.periodProfit)} green /><Metric label="1 Month Result" value={formatMoney(portfolio.oneMonthResult)} /><Metric label="Next Payout" value={payoutTimer ? formatCountdown(payoutTimer.remainingMs) : 'No active plan'} /></div>
      </section>

      <div className="filter-row" role="tablist" aria-label="Maining plans">
        {tierFilters.map((item) => <SegmentButton key={item.id} label={item.label} active={filter === item.id} onClick={() => onFilter(item.id)} />)}
      </div>
      <section className="tier-list">{tierItems.map((tier) => {
        const purchase = purchases.find((item) => item.id === tier.id)
        return <TierCard key={tier.id} tier={purchase || tier} owned={Boolean(purchase)} now={now} onReadMore={onReadMore} />
      })}</section>
    </>
  )
}

function WalletView({ onRecharge, onWithdraw, portfolio, transactions }) {
  const [historyFilter, setHistoryFilter] = useState('recharge')
  const selectedFilter = walletHistoryFilters.find((filter) => filter.id === historyFilter) || walletHistoryFilters[0]
  const historyItems = transactions.filter((transaction) => transaction.type === selectedFilter.id).map(toActivity)

  return (
    <>
      <section className="wallet-hero">
        <p className="eyebrow">Available Balance</p><h1>{formatMoney(portfolio.walletBalance)}</h1><p>Your wallet is ready for recharge and withdrawals.</p>
        <div className="wallet-identity"><span>Wallet ID</span><strong>{portfolio.walletId || 'Not assigned'}</strong></div>
        <div className="wallet-buttons"><PrimaryButton label="Recharge" icon="plus" onClick={onRecharge} /><PrimaryButton label="Withdraw" icon="arrow-up" secondary onClick={onWithdraw} /></div>
      </section>
      <section className="wallet-stats"><Metric label="Daily Income" value={formatMoney(portfolio.dailyIncome)} green /><Metric label={`${profitWindowDays} Day Profit`} value={formatMoney(portfolio.periodProfit)} green /><Metric label="1 Month Profit" value={formatMoney(portfolio.earnings)} /><Metric label="Active Plans" value={String(portfolio.activeTiers)} /></section>
      <SectionHeader title="Wallet History" />
      <div className="wallet-history-tabs" role="tablist" aria-label="Wallet history">
        {walletHistoryFilters.map((filter) => <SegmentButton key={filter.id} label={filter.label} active={historyFilter === filter.id} onClick={() => setHistoryFilter(filter.id)} />)}
      </div>
      <ActivityList items={historyItems} emptyMessage={selectedFilter.emptyMessage} />
    </>
  )
}

function ProfileView({ onAction, onProfileSettings, onLanguage, onSecurity, onReferrals, onVerification, onReadMore, portfolio, purchases, now, user, verification, language, onLogout }) {
  const verificationLabel = user.verified ? 'Verified' : 'Unverified'
  const verificationDate = verification?.createdAt ? `Verified ${formatShortDate(verification.createdAt)}` : 'ID/passport and face photo required'

  return (
    <>
      <section className="profile-hero"><div className="large-avatar">{user.name.slice(0, 1).toUpperCase()}</div><div><p className="eyebrow">Member Account</p><h1>{user.name}</h1><p>{user.email}</p><span className={`verification-pill${user.verified ? ' verified' : ''}`}>{verificationLabel}</span></div></section>
      <section className="profile-grid"><Metric label="Wallet" value={formatMoney(portfolio.walletBalance)} /><Metric label="Active Plans" value={String(portfolio.activeTiers)} /><Metric label="Daily Income" value={formatMoney(portfolio.dailyIncome)} green /><Metric label="Total Income" value={formatMoney(portfolio.totalIncome)} green /></section>
      {!user.verified && <VerificationBanner onVerify={onVerification} />}
      <section className="purchased-panel"><SectionHeader title="Purchased Plans" action={`${portfolio.activeTiers} active`} onAction={() => onAction('Your purchased plans are shown below.')} /><PurchasedTiers purchases={purchases} now={now} onReadMore={onReadMore} /></section>
      <section className="settings-list">
        <button type="button" onClick={onVerification}><span><Icon name="upload" />Verification</span><small>{verificationDate}</small><Icon name="chevron" /></button>
        <button type="button" onClick={onProfileSettings}><span><Icon name="user" />Profile settings</span><Icon name="chevron" /></button>
        <button type="button" onClick={onLanguage}><span><Icon name="globe" />Language</span><small>{language.label}</small><Icon name="chevron" /></button>
        <button type="button" onClick={onReferrals}><span><Icon name="send" />Referrals</span><Icon name="chevron" /></button>
        <button type="button" onClick={onSecurity}><span><Icon name="shield" />Security</span><Icon name="chevron" /></button>
        <button type="button" className="signout-row" onClick={onLogout}><span><Icon name="logout" />Sign out</span><Icon name="chevron" /></button>
      </section>
    </>
  )
}

function ReferralView({ user, referrals, onCopy, onRefresh }) {
  const [refreshing, setRefreshing] = useState(false)
  const teamCounts = referralTeams.map((team) => ({ ...team, count: referrals.filter((referral) => Number(referral.level || 1) === team.level).length }))

  async function refresh() {
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <>
      <section className="referral-hero">
        <div>
          <p className="eyebrow">Your invite code</p>
          <h1>{user.inviteCode}</h1>
          <p>New customers need a valid member code before registration.</p>
        </div>
        <button type="button" onClick={onCopy}><Icon name="copy" />Copy</button>
      </section>
      <section className="referral-grid">
        <Metric label="Team Members" value={String(referrals.length)} />
        <Metric label="Invite Status" value="Active" green />
      </section>
      <section className="referral-commissions" aria-label="Referral commission rates">
        {teamCounts.map((team) => <article className="commission-row" key={team.level}><strong>{team.label}</strong><span>{team.count} members</span><small>Task {formatPercent(team.taskRate)} / Deposit {formatPercent(team.depositRate)}</small></article>)}
      </section>
      <section className="purchased-panel referral-panel">
        <SectionHeader title="Referral Team" action={refreshing ? 'Refreshing...' : 'Refresh'} onAction={refresh} />
        <ReferralList referrals={referrals} />
      </section>
    </>
  )
}

function ReferralList({ referrals }) {
  if (!referrals.length) return <div className="empty-state purchased-empty"><Icon name="send" /><p>No team members yet</p></div>
  return <div className="referral-list">{referrals.map((referral) => <article className="referral-row" key={referral.id}><div><span className="team-tag">{referral.team || `Team ${referral.level || 1}`}</span><h3>{referral.name}</h3><p>{referral.email}</p></div><div className="referral-meta"><strong>{formatShortDate(referral.createdAt)}</strong><small>Task {formatPercent(referral.taskRate)} / Deposit {formatPercent(referral.depositRate)}</small></div></article>)}</div>
}

function SupportView({ onTutorial }) {
  return (
    <>
      <section className="support-hero">
        <div>
          <p className="eyebrow">Support center</p>
          <h1>Customer Support</h1>
          <p>Contact support for account, wallet, verification, and Maining plan help.</p>
        </div>
        <div className="support-actions">
          <a href={telegramSupportUrl} target="_blank" rel="noreferrer"><Icon name="send" />Support</a>
          <a href={telegramGroupUrl} target="_blank" rel="noreferrer"><Icon name="users" />Group Chat</a>
        </div>
      </section>
      <section className="support-grid" aria-label="Support tutorials">
        {supportTutorials.map((tutorial) => (
          <button type="button" key={tutorial.id} onClick={() => onTutorial(tutorial.id)}>
            <span><Icon name={tutorial.icon} />{tutorial.label}</span>
            <small>Tutorial</small>
            <Icon name="chevron" />
          </button>
        ))}
      </section>
    </>
  )
}

function SupportTutorialView({ topicId, onBack }) {
  const tutorial = supportTutorialMap[topicId] || supportTutorials[0]

  return <section className="detail-page support-tutorial-page">
    <button className="subpage-back" type="button" onClick={onBack}><Icon name="arrow-left" />Back to support</button>
    <div className="detail-grid support-tutorial-layout">
      <section className="form-panel support-tutorial-panel">
        <p className="eyebrow">Support tutorial</p>
        <h1>{tutorial.title}</h1>
        <p className="tutorial-intro">{tutorial.intro}</p>
        <div className="tutorial-list">
          {tutorial.steps.map((step, index) => <article className="tutorial-step" key={step}><strong>{index + 1}</strong><p>{step}</p></article>)}
        </div>
      </section>
      <section className="info-panel support-contact-panel">
        <p className="eyebrow">Customer help</p>
        <h2>Need support?</h2>
        <div className="verification-status verified"><Icon name="send" /><span>Contact support if you need account changes, wallet help, verification help, or Maining plan help.</span></div>
        <a className="primary-button" href={telegramSupportUrl} target="_blank" rel="noreferrer"><Icon name="send" />Contact Support</a>
        <a className="primary-button secondary" href={telegramGroupUrl} target="_blank" rel="noreferrer"><Icon name="users" />Group Chat</a>
      </section>
    </div>
  </section>
}

function TierCard({ tier, owned, now, onReadMore }) {
  const projection = getTierProjection(tier.price, tier.monthlyRate)
  const payoutTimer = owned ? getPurchasePayoutTimer(tier, now) : null

  return (
    <article className="tier-card" style={{ '--accent': tier.color, '--accent-shadow': tier.shadow }}>
      <div className="tier-heading">
        <div><span className="vip-pill"><span />{tier.level}</span><h2>{tier.title}</h2></div>
        <div className="tier-price"><p className="micro-label">Price</p><strong>{tier.investment}</strong></div>
      </div>
      <div className="risk-row"><span className="micro-label">Daily Payout</span><strong>{tier.risk}</strong></div>
      <div className="risk-track"><span style={{ width: `${tier.riskValue}%` }} /></div>
      <div className="tier-stats"><Metric label="Daily Income" value={formatMoney(projection.dailyIncome)} /><Metric label={`${profitWindowDays} Day Profit`} value={formatMoney(projection.periodProfit)} /><Metric label="1 Month Result" value={formatMoney(projection.monthResult)} /></div>
      {payoutTimer && <PayoutTimer timer={payoutTimer} />}
      {!owned && <PrimaryButton label="Read More" onClick={() => onReadMore(tier)} />}
    </article>
  )
}

function MainingDetailsView({ tier, owned, payoutTimer, onBack, onBuy }) {
  const projection = getTierProjection(tier.price, tier.monthlyRate)

  return <section className="detail-page maining-page" style={{ '--accent': tier.color, '--accent-shadow': tier.shadow }}>
    <button className="subpage-back" type="button" onClick={onBack}><Icon name="arrow-left" />Back to maining</button>
    <div className="detail-grid">
      <section className="maining-panel">
        <p className="eyebrow">Maining plan</p>
        <span className="vip-pill"><span />{tier.level}</span>
        <h1>{tier.title}</h1>
        <p>Maining is a customer plan that connects your account balance to a selected mining package. The dashboard tracks the plan price, daily payout, {profitWindowDays}-day profit, and 1 month result.</p>
        <div className="maining-metrics"><Metric label="Plan Price" value={formatMoney(tier.price)} /><Metric label="Daily Payout" value={formatMoney(projection.dailyIncome)} green /><Metric label={`${profitWindowDays} Day Profit`} value={formatMoney(projection.periodProfit)} /><Metric label="1 Month Result" value={formatMoney(projection.monthResult)} /></div>
        {payoutTimer && <PayoutTimer timer={payoutTimer} />}
        <PrimaryButton label={owned ? 'Purchased' : 'Buy Now'} icon="check" disabled={owned} onClick={() => onBuy(tier)} />
      </section>
      <section className="info-panel maining-info">
        <p className="eyebrow">How it works</p>
        <h2>What Maining uses</h2>
        <div className="maining-copy"><h3>Mining equipment</h3><p>Maining plans are presented as access to managed mining devices that produce daily account income after the payout time.</p></div>
        <div className="maining-copy"><h3>Power and network pools</h3><p>The operation uses electricity capacity, network mining pools, and wallet settlement to calculate the daily payout shown on each plan.</p></div>
        <div className="maining-copy"><h3>Wallet balance</h3><p>After purchase, the plan income is credited to the customer wallet every 24 hours when the account is active.</p></div>
      </section>
    </div>
  </section>
}

function PayoutTimer({ timer }) {
  if (!timer) return null

  return <div className="payout-timer"><span><Icon name="clock" />24H Timer</span><strong>{formatCountdown(timer.remainingMs)}</strong><small>Next payout</small></div>
}

function OverviewCard({ item }) {
  return <article className="overview-card" style={{ '--overview-color': item.color }}><p className="micro-label">{item.label}</p><strong>{item.value}</strong><span>{item.note}</span><div className="bar-chart" aria-hidden="true">{item.bars.map((height, index) => <i key={`${item.label}-${index}`} style={{ height }} />)}</div></article>
}

function ActivityList({ items, emptyMessage }) {
  if (!items.length) return <section className="empty-state"><Icon name="wallet" /><p>{emptyMessage}</p></section>
  return <section className="activity-list">{items.map((item, index) => <article className="activity-row" key={`${item.title}-${item.time}-${item.meta || ''}-${index}`}><div className={`activity-icon ${item.tone}`}><Icon name={item.type} /></div><div className="activity-copy"><h3>{item.title}</h3><p>{item.time}</p>{item.meta && <small>{item.meta}</small>}</div><strong className={item.amount.startsWith('+') ? 'positive' : 'negative'}>{item.amount}</strong></article>)}</section>
}

function PurchasedTiers({ purchases, now, onReadMore }) {
  if (!purchases.length) return <div className="empty-state purchased-empty"><Icon name="grid" /><p>No plan purchased yet</p></div>
  return <div className="purchased-list">{purchases.map((purchase) => {
    const projection = getTierProjection(purchase.price, purchase.monthlyRate)
    const payoutTimer = getPurchasePayoutTimer(purchase, now)
    return <article className="purchased-tier" key={purchase.id} style={{ '--accent': purchase.color }}><div><span className="vip-pill"><span />{purchase.level}</span><h3>{purchase.title}</h3><p>Daily {formatMoney(projection.dailyIncome)} - {profitWindowDays} day {formatMoney(projection.periodProfit)}</p>{payoutTimer && <small className="purchased-countdown"><Icon name="clock" />{formatCountdown(payoutTimer.remainingMs)} left</small>}</div><div className="purchased-tier-actions"><strong>{formatMoney(purchase.price)}</strong><button type="button" onClick={() => onReadMore(purchase)}>Read More</button></div></article>
  })}</div>
}

function CheckoutView({ tier, crypto, wallet, onCrypto, onBack, onConfirm }) {
  const selectedOption = cryptoOptions.find((option) => option.id === crypto)
  return <section className="checkout-page" style={{ '--accent': tier.color, '--accent-shadow': tier.shadow }}>
    <button className="checkout-back" type="button" onClick={onBack}><Icon name="arrow-left" />Back to plans</button>
    <div className="checkout-grid">
      <div className="checkout-intro"><p className="eyebrow">Customer purchase</p><h1>Buy {tier.title}</h1><p>Choose a cryptocurrency to complete your Maining purchase.</p><div className="checkout-product"><span className="vip-pill"><span />{tier.level}</span><h2>{tier.title}</h2><strong>{formatMoney(tier.price)}</strong><div className="risk-row"><span className="micro-label">Daily Payout</span><strong>{tier.risk}</strong></div><div className="risk-track"><span style={{ width: `${tier.riskValue}%` }} /></div></div></div>
      <div className="checkout-payment"><p className="eyebrow">Wallet payment</p><h2>Select cryptocurrency</h2><div className="crypto-options">{cryptoOptions.map((option) => <button key={option.id} className={crypto === option.id ? 'active' : ''} type="button" onClick={() => onCrypto(option.id)}><span className={`crypto-mark ${option.tone}`}>{option.id.slice(0, 1)}</span><span><strong>{option.id}</strong><small>{option.name}</small></span><Icon name="check" /></button>)}</div><div className="payment-total"><span>Amount due</span><strong>{selectedOption.quantity(tier.price)}</strong><small>{formatMoney(tier.price)} from wallet {wallet.id}</small></div><PrimaryButton label="Confirm Wallet Payment" icon="check" onClick={onConfirm} /><p className="payment-note">Your wallet balance must cover this plan before purchase.</p></div>
    </div>
  </section>
}

function RechargeView({ wallet, onBack }) {
  const [crypto, setCrypto] = useState('USDT')
  const [network, setNetwork] = useState('TRC20')
  const walletAddress = `SEZ-${wallet.id || 'WALLET'}-${crypto}-${network}`

  return <section className="detail-page recharge-page">
    <button className="subpage-back" type="button" onClick={onBack}><Icon name="arrow-left" />Back to wallet</button>
    <div className="detail-grid recharge-layout">
      <section className="form-panel recharge-panel">
        <p className="eyebrow">Recharge account</p>
        <h1>Add balance</h1>
        <label>Currency<select value={crypto} onChange={(event) => setCrypto(event.target.value)}>{cryptoOptions.map((option) => <option key={option.id} value={option.id}>{option.id} - {option.name}</option>)}</select></label>
        <label>Network<select value={network} onChange={(event) => setNetwork(event.target.value)}><option>TRC20</option><option>ERC20</option><option>BEP20</option></select></label>
        <label>Crypto wallet address<input className="wallet-address-input" value={walletAddress} readOnly onFocus={(event) => event.target.select()} /></label>
      </section>
    </div>
  </section>
}

function WithdrawView({ onBack, onWithdraw, portfolio }) {
  const [amount, setAmount] = useState('')
  const [crypto, setCrypto] = useState('USDT')
  const [address, setAddress] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const amountValue = Math.max(Number(amount) || 0, 0)
  const withdrawalFee = calculateWithdrawalFee(amountValue)
  const receiveAmount = calculateWithdrawalReceiveAmount(amountValue)

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await onWithdraw({ amount: amountValue, crypto, address })
      setAmount('')
      setAddress('')
    } catch (withdrawError) {
      setError(withdrawError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return <section className="detail-page">
    <button className="subpage-back" type="button" onClick={onBack}><Icon name="arrow-left" />Back to wallet</button>
    <div className="detail-grid">
      <form className="form-panel" onSubmit={submit}>
        <p className="eyebrow">Withdraw funds</p>
        <h1>Send balance</h1>
        <label>Amount<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /></label>
        <label>Currency<select value={crypto} onChange={(event) => setCrypto(event.target.value)}>{cryptoOptions.map((option) => <option key={option.id} value={option.id}>{option.id} - {option.name}</option>)}</select></label>
        <label>Wallet address<input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Paste wallet address" required /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Withdrawal'}</button>
      </form>
      <section className="info-panel">
        <p className="eyebrow">Withdrawal summary</p>
        <h2>{formatMoney(receiveAmount)}</h2>
        <div className="result-strip"><Metric label="Available" value={formatMoney(portfolio.walletBalance)} /><Metric label="Fee 16%" value={formatMoney(withdrawalFee)} /><Metric label="Wallet Debit" value={formatMoney(amountValue)} /><Metric label="You Receive" value={formatMoney(receiveAmount)} green /></div>
      </section>
    </div>
  </section>
}

function ProfileSettingsView({ user, onBack }) {
  return <section className="detail-page">
    <button className="subpage-back" type="button" onClick={onBack}><Icon name="arrow-left" />Back to profile</button>
    <section className="form-panel settings-form">
      <p className="eyebrow">Profile settings</p>
      <h1>Personal details</h1>
      <label>Full name<input value={user.name} readOnly aria-readonly="true" /></label>
      <div className="locked-profile-field"><span>Gmail address</span><strong>{user.email}</strong></div>
      <div className="locked-profile-note"><Icon name="shield" /><span>{supportChangeMessage}</span></div>
      <a className="primary-button" href={telegramSupportUrl} target="_blank" rel="noreferrer"><Icon name="send" />Contact Support</a>
    </section>
  </section>
}

function LanguageView({ language, onBack, onChange }) {
  const selectedLanguage = getLanguageOption(language)

  return <section className="detail-page">
    <button className="subpage-back" type="button" onClick={onBack}><Icon name="arrow-left" />Back to profile</button>
    <div className="detail-grid language-layout">
      <section className="form-panel settings-form">
        <p className="eyebrow">Display settings</p>
        <h1>Language</h1>
        <label>Interface language<select value={selectedLanguage.id} onChange={(event) => onChange(event.target.value)}>{languageOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
        <div className="language-options" aria-label="Available languages">
          {languageOptions.map((option) => <button className={`language-option${option.id === selectedLanguage.id ? ' active' : ''}`} type="button" key={option.id} onClick={() => onChange(option.id)}><span>{option.label}</span>{option.id === selectedLanguage.id && <Icon name="check" />}</button>)}
        </div>
      </section>
      <section className="info-panel language-panel">
        <p className="eyebrow">Current language</p>
        <h2>{selectedLanguage.label}</h2>
        <div className="verification-status verified"><Icon name="globe" /><span>{selectedLanguage.label} is selected for this browser.</span></div>
      </section>
    </div>
  </section>
}

function SecurityView({ user, onBack, onAction, onPasswordChange, onVerification }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await onPasswordChange({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
    } catch (passwordError) {
      setError(passwordError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return <section className="detail-page">
    <button className="subpage-back" type="button" onClick={onBack}><Icon name="arrow-left" />Back to profile</button>
    <div className="detail-grid">
      <form className="form-panel" onSubmit={submit}>
        <p className="eyebrow">Security</p>
        <h1>Password</h1>
        <label>Current password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
        <label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength="8" required /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Updating...' : 'Update Password'}</button>
      </form>
      <section className="info-panel security-panel">
        <p className="eyebrow">Account protection</p>
        <h2>{user.email}</h2>
        <button className={`toggle-row${user.verified ? ' active' : ''}`} type="button" onClick={() => user.verified ? onAction('Your account is verified for recharge and Maining purchases.') : onVerification()}><span><Icon name={user.verified ? 'check' : 'upload'} />Customer verification</span><strong>{user.verified ? 'Verified' : 'Unverified'}</strong></button>
        <button className={`toggle-row${twoFactorEnabled ? ' active' : ''}`} type="button" onClick={() => setTwoFactorEnabled((enabled) => !enabled)}><span><Icon name="shield" />Two-factor login</span><strong>{twoFactorEnabled ? 'On' : 'Off'}</strong></button>
        <button className="toggle-row" type="button" onClick={() => onAction('Withdrawal confirmation is required for every request.')}><span><Icon name="check" />Withdrawal confirmation</span><strong>On</strong></button>
      </section>
    </div>
  </section>
}

function VerificationView({ user, verification, onBack, onVerify }) {
  const [documentType, setDocumentType] = useState('id')
  const [documentFile, setDocumentFile] = useState(null)
  const [faceFile, setFaceFile] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const document = await fileToUpload(documentFile, 'ID or passport document', documentUploadTypes)
      const face = await fileToUpload(faceFile, 'Face photo', faceUploadTypes)
      await onVerify({ documentType, document, face })
    } catch (verificationError) {
      setError(verificationError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return <section className="detail-page">
    <button className="subpage-back" type="button" onClick={onBack}><Icon name="arrow-left" />Back to profile</button>
    <div className="detail-grid">
      <form className="form-panel verification-form" onSubmit={submit}>
        <p className="eyebrow">Customer verification</p>
        <h1>{user.verified ? 'Verified account' : 'Upload documents'}</h1>
        <label>Document type<select value={documentType} onChange={(event) => setDocumentType(event.target.value)} disabled={user.verified}><option value="id">ID card</option><option value="passport">Passport</option></select></label>
        <label>ID or passport<input type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(event) => setDocumentFile(event.target.files?.[0] || null)} disabled={user.verified} required={!user.verified} /></label>
        <label>Face photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFaceFile(event.target.files?.[0] || null)} disabled={user.verified} required={!user.verified} /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={submitting || user.verified}>{submitting ? 'Uploading...' : user.verified ? 'Already Verified' : 'Submit Verification'}</button>
      </form>
      <section className="info-panel verification-panel">
        <p className="eyebrow">Verification status</p>
        <h2>{user.verified ? 'Verified' : 'Unverified'}</h2>
        <div className={`verification-status${user.verified ? ' verified' : ''}`}><Icon name={user.verified ? 'check' : 'upload'} /><span>{user.verified ? 'Your wallet is enabled for recharge, withdrawals, and Maining purchases.' : 'Upload one ID or passport document and one face picture to unlock wallet actions.'}</span></div>
        <div className="result-strip"><Metric label="Document" value={verification?.documentName || 'Required'} /><Metric label="Face Photo" value={verification?.faceName || 'Required'} /></div>
      </section>
    </div>
  </section>
}

function SectionHeader({ title, action, onAction }) {
  return <div className="section-heading"><h2>{title}</h2>{action && <button type="button" onClick={onAction}>{action}</button>}</div>
}

function Metric({ label, value, green = false }) {
  return <div className="metric"><p className="micro-label">{label}</p><strong className={green ? 'positive' : ''}>{value}</strong></div>
}

function getOverviewItems(portfolio) {
  return [
    { label: 'Daily', value: formatMoney(portfolio.dailyIncome), note: 'projected', color: '#4a91ff', bars: [10, 16, 13, 21, 18, 25, 30, 26] },
    { label: `${profitWindowDays} Day`, value: formatMoney(portfolio.periodProfit), note: 'profit', color: '#a983ff', bars: [12, 11, 20, 15, 26, 22, 32, 29] },
    { label: '1 Month', value: formatMoney(portfolio.oneMonthResult), note: 'final result', color: '#1fe1b0', bars: [7, 15, 11, 25, 20, 30, 27, 35] },
  ]
}

function getTierProjection(amount, monthlyRate = projectedMonthlyRate) {
  const numericAmount = Number(amount) || 0
  const plan = findTierPlanByAmount(numericAmount)
  const dailyIncome = plan ? plan.dailyIncome : numericAmount * monthlyRate / 30
  const monthlyProfit = plan ? dailyIncome * 30 : numericAmount * monthlyRate
  const periodProfit = dailyIncome * profitWindowDays
  return { dailyIncome, periodProfit, monthlyProfit, monthResult: numericAmount + monthlyProfit }
}

function getPortfolioPayoutTimer(purchases, now = Date.now()) {
  const timers = purchases.map((purchase) => getPurchasePayoutTimer(purchase, now)).filter(Boolean)
  if (!timers.length) return null
  return timers.reduce((soonest, timer) => timer.targetDate < soonest.targetDate ? timer : soonest)
}

function getPurchasePayoutTimer(purchase, now = Date.now()) {
  const targetDate = getNextPurchasePayoutDate(purchase, now)
  if (!targetDate) return null
  return { targetDate, remainingMs: Math.max(targetDate.getTime() - Number(now), 0) }
}

function getNextPortfolioPayoutRefreshDate(purchases, now = Date.now()) {
  const timer = getPortfolioPayoutTimer(purchases, now)
  return new Date((timer?.targetDate.getTime() || Number(now) + payoutCycleMs) + 2000)
}

function getNextPurchasePayoutDate(purchase, now = Date.now()) {
  const purchaseDate = parseClientDate(purchase?.createdAt)
  if (!purchaseDate) return null
  const elapsedMs = Math.max(Number(now) - purchaseDate.getTime(), 0)
  const cyclesElapsed = Math.floor(elapsedMs / payoutCycleMs) + 1
  return new Date(purchaseDate.getTime() + cyclesElapsed * payoutCycleMs)
}

function formatCountdown(milliseconds) {
  const totalSeconds = Math.max(Math.ceil(Number(milliseconds) / 1000), 0)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function parseClientDate(value) {
  if (!value) return null
  const normalized = String(value).includes('T') ? String(value) : String(value).replace(' ', 'T')
  const date = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function readSavedLanguage() {
  try {
    return getLanguageOption(window.localStorage.getItem(languageStorageKey)).id
  } catch {
    return defaultLanguageId
  }
}

function findTierPlanByAmount(amount) {
  const numericAmount = Number(amount) || 0
  return tierPlans.find((plan) => plan.amount === numericAmount || plan.amount - 1 === numericAmount)
}

function calculateWithdrawalFee(amount) {
  return roundClientMoney((Number(amount) || 0) * withdrawalFeeRate)
}

function calculateWithdrawalReceiveAmount(amount) {
  return Math.max(roundClientMoney((Number(amount) || 0) - calculateWithdrawalFee(amount)), 0)
}

function roundClientMoney(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

function formatCompactMoney(amount) {
  return `$${amount.toLocaleString('en-US')}`
}

function formatMoney(amount) {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPercent(rate) {
  return `${Math.round((Number(rate) || 0) * 100)}%`
}

function toClientPurchase(purchase) {
  const tier = tiers.find((item) => item.id === purchase.tierId)
  const cryptoTone = cryptoOptions.find((option) => option.id === purchase.crypto)?.tone || 'blue'
  const createdAt = purchase.createdAt || new Date().toISOString()
  if (tier) return { ...tier, ...purchase, id: tier.id, level: tier.level, title: tier.title, price: purchase.amount, tone: cryptoTone, createdAt }
  return { ...purchase, id: purchase.tierId, level: normalizeMainingText(purchase.level), title: normalizeMainingText(purchase.title), price: purchase.amount || 0, monthlyRate: projectedMonthlyRate, color: '#4b91ff', tone: cryptoTone, createdAt }
}

function toClientWallet(wallet) {
  return { id: wallet?.id || '', balance: Number(wallet?.balance) || 0 }
}

function toClientTransaction(transaction) {
  return { ...transaction, amount: Number(transaction.amount) || 0, createdAt: transaction.createdAt || new Date().toISOString(), tone: getTransactionTone(transaction.type) }
}

function readPayloadTotalIncome(payload, fallbackTransactions) {
  const total = Number(payload?.totalIncome)
  if (Number.isFinite(total)) return roundClientMoney(total)
  return calculateTotalIncome(fallbackTransactions)
}

function calculateTotalIncome(transactions) {
  return roundClientMoney((transactions || []).reduce((total, transaction) => {
    return incomeTransactionTypes.includes(transaction.type) ? total + (Number(transaction.amount) || 0) : total
  }, 0))
}

function toActivity(transaction) {
  const isCredit = ['recharge', 'earning', 'referral_deposit', 'referral_task'].includes(transaction.type)
  const title = normalizeMainingText(transaction.memo || (transaction.type === 'earning' ? 'Maining daily income' : transaction.type === 'referral_deposit' ? 'Referral deposit commission' : transaction.type === 'referral_task' ? 'Referral task commission' : isCredit ? 'Wallet recharge' : transaction.type === 'purchase' ? 'Plan purchase' : 'Wallet withdrawal'))
  const details = [transaction.status, transaction.crypto, transaction.network].filter(Boolean).join(' - ')
  return {
    title,
    time: details || 'Wallet activity',
    meta: formatShortDateTime(transaction.createdAt),
    amount: `${isCredit ? '+' : '-'}${formatMoney(transaction.amount)}`,
    type: 'wallet',
    tone: transaction.tone,
  }
}

function normalizeMainingText(value) {
  if (!value) return value
  return String(value || '').replaceAll('Sez VIP', 'Maining Plan').replaceAll('VIP', 'Maining').replaceAll('Tier purchase', 'Plan purchase')
}

function getTransactionTone(type) {
  if (type === 'recharge') return 'teal'
  if (type === 'earning' || type === 'referral_task') return 'gold'
  if (type === 'referral_deposit') return 'teal'
  if (type === 'withdrawal') return 'violet'
  return 'blue'
}

function formatShortDate(value) {
  if (!value) return 'New'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'New'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatShortDateTime(value) {
  if (!value) return 'New'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'New'
  return date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fileToUpload(file, label, allowedTypes) {
  if (!file) throw new Error(`${label} is required.`)
  const mime = file.type || inferMimeFromName(file.name)
  const allowedDescription = allowedTypes.includes('application/pdf') ? 'PDF, JPG, PNG, or WEBP' : 'JPG, PNG, or WEBP'

  if (!allowedTypes.includes(mime)) throw new Error(`${label} must be a ${allowedDescription} file.`)
  if (file.size > uploadMaxBytes) throw new Error(`${label} must be 3 MB or smaller.`)

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      const data = String(reader.result || '').replace(/^data:;base64,/, `data:${mime};base64,`)
      resolve({ name: file.name, type: mime, data })
    })
    reader.addEventListener('error', () => reject(new Error(`${label} could not be read.`)))
    reader.readAsDataURL(file)
  })
}

function inferMimeFromName(name) {
  const extension = String(name || '').split('.').pop()?.toLowerCase()
  if (extension === 'pdf') return 'application/pdf'
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'png') return 'image/png'
  if (extension === 'webp') return 'image/webp'
  return ''
}

async function requestApi(path, options = {}) {
  let response
  try {
    response = await fetch(path, {
      method: options.method || 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      credentials: 'include',
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    return handleStaticApi(path, options)
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (!payload.error && (response.status === 404 || response.status === 405)) return handleStaticApi(path, options)
    throw new Error(payload.error || 'Unable to complete this request.')
  }
  return payload
}

function handleStaticApi(path, options = {}) {
  const method = options.method || 'GET'
  const body = options.body || {}
  const state = readStaticAuthState()

  if (method === 'GET' && path === '/api/session') {
    const account = getStaticSessionAccount(state)
    if (!account) throw new Error('Please log in to continue.')
    return toStaticAccountPayload(account, state)
  }

  if (method === 'POST' && path === '/api/auth/register') {
    const name = requireStaticText(body.name, 'Name', 2, 80)
    const email = normalizeStaticEmail(body.email)
    const password = requireStaticPassword(body.password)
    const invitation = requireStaticInviteCode(body.inviteCode, state)
    if (state.users.some((account) => account.email === email)) throw new Error('An account already uses this email address.')

    const account = {
      id: state.nextUserId,
      name,
      email,
      password,
      verified: false,
      verification: null,
      inviteCode: createStaticInviteCode(state.nextUserId, new Set(state.users.map((item) => item.inviteCode))),
      registeredWithCode: invitation.inviteCode,
      referredByUserId: invitation.inviterId,
      wallet: { id: createStaticWalletId(state.nextUserId, new Set(state.users.map((item) => item.wallet.id))), balance: 0 },
      purchases: [],
      transactions: [],
      dailyEarnings: [],
    }
    state.nextUserId += 1
    state.sessionEmail = email
    state.users.push(account)
    writeStaticAuthState(state)
    return toStaticAccountPayload(account, state)
  }

  if (method === 'POST' && path === '/api/auth/login') {
    const email = normalizeStaticEmail(body.email)
    const password = requireStaticPassword(body.password)
    const account = state.users.find((item) => item.email === email)
    if (!account || account.password !== password) throw new Error('Invalid email or password.')

    state.sessionEmail = email
    writeStaticAuthState(state)
    return toStaticAccountPayload(account, state)
  }

  if (method === 'POST' && path === '/api/auth/logout') {
    state.sessionEmail = null
    writeStaticAuthState(state)
    return { ok: true }
  }

  const account = getStaticSessionAccount(state)
  if (!account) throw new Error('Please log in to continue.')

  if (method === 'GET' && path === '/api/referrals') {
    return { inviteCode: account.inviteCode, referrals: getStaticReferrals(state, account.id) }
  }

  if (method === 'PATCH' && path === '/api/profile') {
    throw new Error(supportChangeMessage)
  }

  if (method === 'POST' && path === '/api/security/password') {
    const currentPassword = requireStaticPassword(body.currentPassword)
    const newPassword = requireStaticPassword(body.newPassword)
    if (account.password !== currentPassword) throw new Error('Current password is incorrect.')

    account.password = newPassword
    writeStaticAuthState(state)
    return { ok: true }
  }

  if (method === 'POST' && path === '/api/verification') {
    const documentType = requireStaticVerificationDocumentType(body.documentType)
    const documentFile = requireStaticUpload(body.document, 'ID or passport document', documentUploadTypes)
    const faceFile = requireStaticUpload(body.face, 'Face photo', faceUploadTypes)

    account.verified = true
    account.verification = {
      documentType,
      documentName: documentFile.name,
      faceName: faceFile.name,
      status: 'Verified',
      createdAt: new Date().toISOString(),
    }
    writeStaticAuthState(state)
    return { user: toPublicUser(account), verification: account.verification }
  }

  if (method === 'POST' && path === '/api/purchases') {
    requireStaticVerifiedAccount(account)
    const tier = tiers.find((item) => item.id === body.tierId)
    const crypto = String(body.crypto || '').toUpperCase()
    if (!tier) throw new Error('Choose a valid Maining plan.')
    if (!cryptoOptions.some((option) => option.id === crypto)) throw new Error('Choose a supported cryptocurrency.')
    if ((account.purchases || []).some((purchase) => purchase.tierId === tier.id)) throw new Error('This plan is already in your profile.')
    if (account.wallet.balance < tier.price) throw new Error('Recharge your wallet before buying this plan.')

    const purchase = { tierId: tier.id, level: tier.level, title: tier.title, amount: tier.price, crypto, createdAt: new Date().toISOString() }
    account.purchases = [purchase, ...(account.purchases || [])]
    account.wallet.balance -= tier.price
    account.transactions = [createStaticTransaction('purchase', tier.price, crypto, null, null, `${tier.level} ${tier.title}`, 'Completed'), ...(account.transactions || [])]
    writeStaticAuthState(state)
    return { purchase, wallet: toPublicWallet(account), transactions: account.transactions, totalIncome: calculateTotalIncome(account.transactions) }
  }

  if (method === 'POST' && path === '/api/recharges') {
    requireStaticVerifiedAccount(account)
    const amount = requireStaticAmount(body.amount)
    const crypto = String(body.crypto || '').toUpperCase()
    const network = String(body.network || '').trim().toUpperCase()

    if (!cryptoOptions.some((option) => option.id === crypto)) throw new Error('Choose a supported cryptocurrency.')
    if (!['TRC20', 'ERC20', 'BEP20'].includes(network)) throw new Error('Choose a supported network.')

    account.wallet.balance = roundStaticMoney((Number(account.wallet.balance) || 0) + amount)
    account.transactions = [createStaticTransaction('recharge', amount, crypto, network, `SEZ-${account.wallet.id}-${crypto}-${network}`, 'Wallet recharge', 'Credited'), ...(account.transactions || [])]
    creditStaticReferralCommissions(state, account.id, amount, crypto, 'deposit')
    writeStaticAuthState(state)
    return { recharge: { amount, crypto, network, status: 'Credited' }, wallet: toPublicWallet(account), transactions: account.transactions, totalIncome: calculateTotalIncome(account.transactions) }
  }

  if (method === 'POST' && path === '/api/withdrawals') {
    requireStaticVerifiedAccount(account)
    const amount = requireStaticAmount(body.amount)
    const crypto = String(body.crypto || '').toUpperCase()
    const address = requireStaticText(body.address, 'Wallet address', 8, 180)

    if (!cryptoOptions.some((option) => option.id === crypto)) throw new Error('Choose a supported cryptocurrency.')
    if (account.wallet.balance < amount) throw new Error('Your wallet balance is too low for this withdrawal.')

    const fee = calculateWithdrawalFee(amount)
    const receiveAmount = calculateWithdrawalReceiveAmount(amount)
    account.wallet.balance -= amount
    account.transactions = [createStaticTransaction('withdrawal', amount, crypto, null, address, `Wallet withdrawal - 16% fee, ${formatMoney(receiveAmount)} sent`, 'Pending'), ...(account.transactions || [])]
    writeStaticAuthState(state)
    return { withdrawal: { amount, fee, receiveAmount, crypto, address, status: 'Pending' }, wallet: toPublicWallet(account), transactions: account.transactions, totalIncome: calculateTotalIncome(account.transactions) }
  }

  throw new Error('API route not found.')
}

function readStaticAuthState() {
  try {
    const storedState = JSON.parse(window.localStorage.getItem(staticAuthStorageKey) || '{}')
    const inviteCodes = new Set()
    const walletIds = new Set()
    const users = (Array.isArray(storedState.users) ? storedState.users : []).map((account, index) => normalizeStaticAccount(account, index, inviteCodes, walletIds))
    const nextUserId = Number(storedState.nextUserId) || users.reduce((maxId, account) => Math.max(maxId, Number(account.id) || 0), 0) + 1
    const state = { users, nextUserId, sessionEmail: storedState.sessionEmail || null }
    let hasVipChanges = false
    for (const account of users) {
      if (syncStaticVipEarnings(state, account)) hasVipChanges = true
    }
    if (hasVipChanges) window.localStorage.setItem(staticAuthStorageKey, JSON.stringify(state))
    return state
  } catch {
    throw new Error('This browser cannot save demo accounts.')
  }
}

function writeStaticAuthState(state) {
  try {
    window.localStorage.setItem(staticAuthStorageKey, JSON.stringify(state))
  } catch {
    throw new Error('This browser cannot save demo accounts.')
  }
}

function getStaticSessionAccount(state) {
  return state.sessionEmail ? state.users.find((account) => account.email === state.sessionEmail) : null
}

function toPublicUser(account) {
  return { id: account.id, name: account.name, email: account.email, verified: Boolean(account.verified), inviteCode: account.inviteCode }
}

function toPublicWallet(account) {
  return { id: account.wallet.id, balance: Number(account.wallet.balance) || 0 }
}

function toStaticAccountPayload(account, state) {
  return {
    user: toPublicUser(account),
    wallet: toPublicWallet(account),
    purchases: account.purchases || [],
    transactions: account.transactions || [],
    totalIncome: calculateTotalIncome(account.transactions || []),
    referrals: getStaticReferrals(state, account.id),
    verification: account.verification || null,
  }
}

function getStaticReferrals(state, userId) {
  const referrals = []
  const seen = new Set([userId])
  let currentTeamUserIds = [userId]

  for (const team of referralTeams) {
    const nextTeamUserIds = []
    for (const teamUserId of currentTeamUserIds) {
      for (const account of getStaticDirectReferrals(state, teamUserId)) {
        if (seen.has(account.id)) continue

        seen.add(account.id)
        nextTeamUserIds.push(account.id)
        referrals.push({
          id: account.id,
          name: account.name,
          email: account.email,
          createdAt: account.createdAt,
          level: team.level,
          team: team.label,
          taskRate: team.taskRate,
          depositRate: team.depositRate,
        })
      }
    }
    currentTeamUserIds = nextTeamUserIds
  }

  return referrals
}

function getStaticDirectReferrals(state, userId) {
  const owner = state.users.find((account) => account.id === userId)
  const ownerInviteCode = normalizeStaticInviteCode(owner?.inviteCode)
  return state.users.filter((account) => account.id !== userId && (
    account.referredByUserId === userId || (ownerInviteCode && normalizeStaticInviteCode(account.registeredWithCode) === ownerInviteCode)
  ))
}

function creditStaticReferralCommissions(state, sourceUserId, amount, crypto, kind) {
  let childUserId = sourceUserId
  const seen = new Set([sourceUserId])

  for (const team of referralTeams) {
    const parentId = getStaticReferralParentId(state, childUserId)
    if (!parentId || seen.has(parentId)) break

    seen.add(parentId)
    childUserId = parentId

    const parent = state.users.find((account) => account.id === parentId)
    const rate = kind === 'deposit' ? team.depositRate : team.taskRate
    const commission = roundStaticMoney(amount * rate)
    if (!parent || commission <= 0) continue

    parent.wallet.balance = roundStaticMoney((Number(parent.wallet.balance) || 0) + commission)
    parent.transactions = [
      createStaticTransaction(
        kind === 'deposit' ? 'referral_deposit' : 'referral_task',
        commission,
        crypto,
        null,
        null,
        `${team.label} ${kind === 'deposit' ? 'deposit' : 'task'} commission`,
        'Credited',
      ),
      ...(Array.isArray(parent.transactions) ? parent.transactions : []),
    ]
  }
}

function getStaticReferralParentId(state, userId) {
  const account = state.users.find((item) => item.id === userId)
  if (!account) return null
  if (account.referredByUserId && state.users.some((item) => item.id === account.referredByUserId)) return account.referredByUserId

  const registeredWithCode = normalizeStaticInviteCode(account.registeredWithCode)
  const parent = registeredWithCode ? state.users.find((item) => item.id !== userId && normalizeStaticInviteCode(item.inviteCode) === registeredWithCode) : null
  return parent?.id || null
}

function normalizeStaticAccount(account, index, inviteCodes, walletIds) {
  const id = Number(account.id) || index + 1
  let inviteCode = normalizeStaticInviteCode(account.inviteCode)
  if (!inviteCode || inviteCode === defaultInviteCode || inviteCodes.has(inviteCode)) inviteCode = createStaticInviteCode(id, inviteCodes)
  inviteCodes.add(inviteCode)

  const storedWallet = account.wallet && typeof account.wallet === 'object' ? account.wallet : {}
  let walletId = normalizeStaticWalletId(storedWallet.id || account.walletId)
  if (!walletId || walletIds.has(walletId)) walletId = createStaticWalletId(id, walletIds)
  walletIds.add(walletId)

  return {
    ...account,
    id,
    inviteCode,
    registeredWithCode: normalizeStaticInviteCode(account.registeredWithCode),
    verified: Boolean(account.verified),
    verification: account.verification || null,
    wallet: { id: walletId, balance: Number(storedWallet.balance ?? account.walletBalance) || 0 },
    purchases: Array.isArray(account.purchases) ? account.purchases.map(normalizeStaticPurchase) : [],
    transactions: Array.isArray(account.transactions) ? account.transactions.map(normalizeStaticTransaction) : [],
    dailyEarnings: Array.isArray(account.dailyEarnings) ? account.dailyEarnings : [],
    referredByUserId: Number(account.referredByUserId) || null,
    createdAt: account.createdAt || new Date().toISOString(),
  }
}

function normalizeStaticPurchase(purchase) {
  return { ...purchase, level: normalizeMainingText(purchase.level), title: normalizeMainingText(purchase.title), createdAt: purchase.createdAt || new Date().toISOString() }
}

function normalizeStaticTransaction(transaction) {
  return { ...transaction, createdAt: transaction.createdAt || new Date().toISOString() }
}

function normalizeStaticEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.')
  return email
}

function normalizeStaticInviteCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '')
}

function requireStaticInviteCode(value, state) {
  const inviteCode = normalizeStaticInviteCode(value)
  if (!inviteCode) throw new Error('Invite code is required to create an account.')
  const inviter = state.users.find((account) => account.inviteCode === inviteCode)
  if (inviter) return { inviteCode, inviterId: inviter.id }
  if (inviteCode === defaultInviteCode && state.users.length === 0) return { inviteCode, inviterId: null }
  if (isStaticMemberInviteCode(inviteCode)) return { inviteCode, inviterId: null }
  throw new Error('Invite code is invalid.')
}

function isStaticMemberInviteCode(value) {
  return /^SEZ[0-9A-Z]{6}$/.test(value)
}

function createStaticInviteCode(seed, existingCodes) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = `SEZ${String(seed).padStart(3, '0')}${Math.random().toString(36).slice(2, 5).toUpperCase()}`
    if (!existingCodes.has(code) && code !== defaultInviteCode) return code
  }
  throw new Error('Unable to create a unique invite code.')
}

function createStaticWalletId(seed, existingIds) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const walletId = `WAL${String(seed).padStart(3, '0')}${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    if (!existingIds.has(walletId)) return walletId
  }
  throw new Error('Unable to create a unique wallet.')
}

function createStaticTransaction(type, amount, crypto, network, address, memo, status, createdAt = new Date().toISOString()) {
  return { type, amount, crypto, network, address, memo, status, createdAt }
}

function normalizeStaticWalletId(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '')
}

function requireStaticVerificationDocumentType(value) {
  const documentType = String(value || '').trim().toLowerCase()
  if (!['id', 'passport'].includes(documentType)) throw new Error('Choose ID card or passport for verification.')
  return documentType
}

function requireStaticUpload(value, label, allowedTypes) {
  if (!value || typeof value !== 'object') throw new Error(`${label} is required.`)
  const name = requireStaticText(value.name, `${label} file name`, 1, 180)
  const mime = String(value.type || '').trim().toLowerCase()
  const data = String(value.data || '')
  const prefix = `data:${mime};base64,`
  const base64 = data.startsWith(prefix) ? data.slice(prefix.length) : ''
  const allowedDescription = allowedTypes.includes('application/pdf') ? 'PDF, JPG, PNG, or WEBP' : 'JPG, PNG, or WEBP'

  if (!allowedTypes.includes(mime)) throw new Error(`${label} must be a ${allowedDescription} file.`)
  if (!base64) throw new Error(`${label} upload is not valid.`)
  if (Math.ceil(base64.length * 3 / 4) > uploadMaxBytes) throw new Error(`${label} must be 3 MB or smaller.`)
  return { name, mime }
}

function syncStaticVipEarnings(state, account) {
  if (!Array.isArray(account.purchases) || !account.purchases.length) return false

  let changed = false
  account.dailyEarnings = Array.isArray(account.dailyEarnings) ? account.dailyEarnings : []
  account.transactions = Array.isArray(account.transactions) ? account.transactions : []
  const creditedDates = new Set(account.dailyEarnings.map((earning) => `${earning.tierId}:${earning.earningDate}`))

  for (const purchase of account.purchases) {
    const tierId = purchase.tierId || purchase.id
    const lastEarningDate = account.dailyEarnings
      .filter((earning) => earning.tierId === tierId)
      .map((earning) => earning.earningDate)
      .sort()
      .at(-1)
    const earningDates = getStaticMissingDailyEarningDates(purchase.createdAt, lastEarningDate)
    const dailyAmount = roundStaticMoney(getTierProjection(Number(purchase.amount) || 0).dailyIncome)

    for (const earningDate of earningDates) {
      const earningKey = `${tierId}:${earningDate}`
      if (creditedDates.has(earningKey)) continue

      creditedDates.add(earningKey)
      account.wallet.balance = roundStaticMoney((Number(account.wallet.balance) || 0) + dailyAmount)
      account.dailyEarnings = [{ tierId, earningDate, amount: dailyAmount, createdAt: new Date().toISOString() }, ...account.dailyEarnings]
      account.transactions = [createStaticTransaction('earning', dailyAmount, purchase.crypto, null, null, `${purchase.level} daily income ${earningDate}`, 'Credited'), ...account.transactions]
      creditStaticReferralCommissions(state, account.id, dailyAmount, purchase.crypto, 'task')
      changed = true
    }
  }

  return changed
}

function getStaticMissingDailyEarningDates(purchaseCreatedAt, lastEarningDate) {
  const purchaseDate = parseStaticLocalDate(purchaseCreatedAt)
  let currentPayout = lastEarningDate
    ? getStaticPayoutMomentForDate(addStaticLocalDays(parseStaticLocalDate(lastEarningDate), 1), purchaseDate)
    : new Date(purchaseDate.getTime() + payoutCycleMs)
  const dates = []
  const now = new Date()

  while (currentPayout <= now) {
    dates.push(toStaticLocalDateKey(currentPayout))
    currentPayout = addStaticLocalDays(currentPayout, 1)
  }

  return dates
}

function getStaticPayoutMomentForDate(date, purchaseDate) {
  const payoutMoment = startOfStaticLocalDay(date)
  payoutMoment.setHours(purchaseDate.getHours(), purchaseDate.getMinutes(), purchaseDate.getSeconds(), purchaseDate.getMilliseconds())
  return payoutMoment
}

function parseStaticLocalDate(value) {
  if (!value) return new Date()
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function startOfStaticLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addStaticLocalDays(date, days) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

function toStaticLocalDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function roundStaticMoney(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

function requireStaticVerifiedAccount(account) {
  if (!account.verified) throw new Error(verificationRequiredMessage)
}

function requireStaticAmount(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid recharge amount.')
  return amount
}

function requireStaticText(value, label, minLength, maxLength) {
  const text = String(value || '').trim()
  if (text.length < minLength || text.length > maxLength) throw new Error(`${label} must be between ${minLength} and ${maxLength} characters.`)
  return text
}

function requireStaticPassword(value) {
  const password = String(value || '')
  if (password.length < 8 || password.length > 256) throw new Error('Password must be at least 8 characters.')
  return password
}

function Icon({ name }) {
  const paths = {
    plus: <><path d="M12 5v14M5 12h14" /></>,
    'arrow-up': <><path d="M12 19V5M6 11l6-6 6 6" /></>,
    'arrow-left': <><path d="M19 12H5M11 18l-6-6 6-6" /></>,
    download: <><path d="M12 4v10M8 10l4 4 4-4M5 20h14" /></>,
    upload: <><path d="M12 20V6M7 11l5-5 5 5" /><path d="M5 20h14" /></>,
    logout: <><path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4M14 8l4 4-4 4M18 12H9" /></>,
    home: <><path d="m4 11 8-7 8 7v9H4z" /><path d="M9 20v-6h6v6" /></>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    wallet: <><path d="M4 7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v2H7a3 3 0 0 0 0 6h12v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M19 9h-5a3 3 0 0 0 0 6h5z" /></>,
    user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.6-3.5 3.1-5.5 7-5.5s6.4 2 7 5.5" /></>,
    users: <><path d="M16 11.5a3 3 0 1 0-2.2-5" /><path d="M19.5 20c-.4-2.5-2-4-4.5-4" /><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 20c.6-3.5 2.9-5.5 6.5-5.5s5.9 2 6.5 5.5" /></>,
    trend: <><path d="m4 16 6-6 4 4 6-7" /><path d="M15 7h5v5" /></>,
    check: <><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
    send: <><path d="m21 3-7.5 18-3.3-7.2L3 10.5z" /><path d="m10.2 13.8 4.3-4.3" /></>,
    copy: <><rect x="8" y="8" width="10" height="12" rx="2" /><path d="M6 16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" /></>,
    shield: <><path d="M12 3 5 6v5c0 4.7 2.9 8.2 7 10 4.1-1.8 7-5.3 7-10V6z" /><path d="m9.3 12 1.8 1.8 3.8-4" /></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
    globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5c2.3 2.2 3.5 5 3.5 8.5s-1.2 6.3-3.5 8.5M12 3.5c-2.3 2.2-3.5 5-3.5 8.5s1.2 6.3 3.5 8.5" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
  }
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function TelegramSupportButton() {
  return <a className="message-fab" href={telegramSupportUrl} target="_blank" rel="noreferrer" aria-label="Open support"><Icon name="send" /><span>Support</span></a>
}

export default App

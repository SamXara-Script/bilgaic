import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { BottomNav, SideNav } from './components/navbar.jsx'
import { IconButton, PrimaryButton, SegmentButton } from './components/button.jsx'

const navItems = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'invest', label: 'Invest', icon: 'grid' },
  { id: 'wallet', label: 'Wallet', icon: 'wallet' },
  { id: 'referrals', label: 'Refer', icon: 'send' },
  { id: 'profile', label: 'Profile', icon: 'user' },
]

const pageMeta = {
  home: { eyebrow: 'Investor dashboard', title: 'Overview' },
  invest: { eyebrow: 'Investment portfolio', title: 'Investment tiers' },
  wallet: { eyebrow: 'Account funds', title: 'Wallet' },
  referrals: { eyebrow: 'Member network', title: 'Referrals' },
  profile: { eyebrow: 'Account management', title: 'Profile' },
  recharge: { eyebrow: 'Account funds', title: 'Recharge' },
  withdraw: { eyebrow: 'Account funds', title: 'Withdraw' },
  security: { eyebrow: 'Account protection', title: 'Security' },
  profileSettings: { eyebrow: 'Account management', title: 'Profile settings' },
  verification: { eyebrow: 'Customer verification', title: 'Verify account' },
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
const tierAmounts = [40, 90, 140, 200, 300, 500, 700, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000]
const tierIds = ['starter', 'premium', 'elite', 'royal']
const tierColors = [
  ['#4b91ff', 'rgba(36, 113, 255, .32)'],
  ['#9b70ff', 'rgba(125, 75, 255, .30)'],
  ['#f0b91a', 'rgba(240, 185, 26, .26)'],
  ['#1fddb0', 'rgba(24, 203, 157, .26)'],
]

const tiers = tierAmounts.map((price, index) => {
  const [color, shadow] = tierColors[index % tierColors.length]
  const ratePercent = Math.round(projectedMonthlyRate * 100)

  return {
    id: tierIds[index] || `vip-${index + 1}`,
    level: `VIP ${index + 1}`,
    title: `Sez VIP ${index + 1}`,
    price,
    investment: formatCompactMoney(price),
    risk: `${ratePercent}% monthly`,
    riskValue: ratePercent,
    monthlyRate: projectedMonthlyRate,
    color,
    shadow,
  }
})

const tierFilters = [
  { id: 'all', label: 'All Tiers', matches: () => true },
  { id: 'entry', label: '$40-$300', matches: (tier) => tier.price <= 300 },
  { id: 'growth', label: '$500-$1,500', matches: (tier) => tier.price >= 500 && tier.price <= 1500 },
  { id: 'pro', label: '$2,000-$5,000', matches: (tier) => tier.price >= 2000 },
]

const staticAuthStorageKey = 'sez-demo-auth'
const defaultInviteCode = 'SEZ2026'
const emptyWallet = { id: '', balance: 0 }
const verificationRequiredMessage = 'Upload your ID or passport and face photo to verify your account.'
const uploadMaxBytes = 3 * 1024 * 1024
const documentUploadTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const faceUploadTypes = ['image/jpeg', 'image/png', 'image/webp']

function App() {
  const [activeView, setActiveView] = useState('home')
  const [tierFilter, setTierFilter] = useState('all')
  const [notice, setNotice] = useState('')
  const [checkoutTier, setCheckoutTier] = useState(null)
  const [selectedCrypto, setSelectedCrypto] = useState('USDT')
  const [purchases, setPurchases] = useState([])
  const [wallet, setWallet] = useState(emptyWallet)
  const [transactions, setTransactions] = useState([])
  const [referrals, setReferrals] = useState([])
  const [verification, setVerification] = useState(null)
  const [user, setUser] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    let active = true

    async function restoreSession() {
      try {
        const session = await requestApi('/api/session')
        if (!active) return
        setUser(session.user)
        setWallet(toClientWallet(session.wallet))
        setPurchases(session.purchases.map(toClientPurchase))
        setTransactions((session.transactions || []).map(toClientTransaction))
        setReferrals(session.referrals || [])
        setVerification(session.verification || null)
      } catch {
        // The login screen remains available while the API is offline.
      } finally {
        if (active) setAuthReady(true)
      }
    }

    restoreSession()
    return () => { active = false }
  }, [])

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
        weeklyIncome: total.weeklyIncome + projection.weeklyIncome,
        monthlyProfit: total.monthlyProfit + projection.monthlyProfit,
      }
    }, { dailyIncome: 0, weeklyIncome: 0, monthlyProfit: 0 })

    return {
      totalInvested,
      activeTiers: purchases.length,
      walletId: wallet.id,
      walletBalance: wallet.balance,
      earnings: projected.monthlyProfit,
      dailyIncome: projected.dailyIncome,
      weeklyIncome: projected.weeklyIncome,
      oneMonthResult: totalInvested + projected.monthlyProfit,
    }
  }, [purchases, wallet.balance, wallet.id])

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
    setActiveView('verification')
    return false
  }

  function startCheckout(tier) {
    if (!requireVerifiedAccount()) return
    setSelectedCrypto('USDT')
    setCheckoutTier(tier)
  }

  function navigateTo(view) {
    if ((view === 'recharge' || view === 'withdraw') && !requireVerifiedAccount()) return
    setCheckoutTier(null)
    setActiveView(view)
  }

  async function confirmPurchase() {
    if (!checkoutTier || purchases.some((purchase) => purchase.id === checkoutTier.id)) return
    try {
      const result = await requestApi('/api/purchases', { method: 'POST', body: { tierId: checkoutTier.id, crypto: selectedCrypto } })
      setPurchases((current) => [toClientPurchase(result.purchase), ...current])
      setWallet(toClientWallet(result.wallet))
      setTransactions((result.transactions || []).map(toClientTransaction))
      setCheckoutTier(null)
      setActiveView('profile')
      showNotice(`${checkoutTier.title} was added to your profile.`)
    } catch (error) {
      showNotice(error.message)
    }
  }

  async function updateProfile({ name, email }) {
    const result = await requestApi('/api/profile', { method: 'PATCH', body: { name, email } })
    setUser(result.user)
    showNotice('Profile settings saved.')
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
    showNotice('Account verified. You can now add balance and buy VIP tiers.')
  }

  async function submitRecharge({ amount, crypto, network }) {
    if (!requireVerifiedAccount()) throw new Error(verificationRequiredMessage)
    const result = await requestApi('/api/recharges', { method: 'POST', body: { amount, crypto, network } })
    setWallet(toClientWallet(result.wallet))
    setTransactions((result.transactions || []).map(toClientTransaction))
    showNotice(`Wallet credited with ${formatMoney(amount)}.`)
  }

  async function submitWithdrawal({ amount, crypto, address }) {
    if (!requireVerifiedAccount()) throw new Error(verificationRequiredMessage)
    const result = await requestApi('/api/withdrawals', { method: 'POST', body: { amount, crypto, address } })
    setWallet(toClientWallet(result.wallet))
    setTransactions((result.transactions || []).map(toClientTransaction))
    showNotice(`Withdrawal request for ${formatMoney(amount)} submitted.`)
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
    setUser(result.user)
    setWallet(toClientWallet(result.wallet))
    setPurchases(result.purchases.map(toClientPurchase))
    setTransactions((result.transactions || []).map(toClientTransaction))
    setReferrals(result.referrals || [])
    setVerification(result.verification || null)
    setActiveView(result.user?.verified ? 'home' : 'verification')
    setCheckoutTier(null)
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
    setReferrals([])
    setVerification(null)
    setCheckoutTier(null)
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
      <SideNav items={navItems} activeId={activeView} onSelect={setActiveView} onLogout={logout} />
      <div className="workspace">
        <header className="desktop-topbar">
          <div><p className="eyebrow">{currentPage.eyebrow}</p><h2>{currentPage.title}</h2></div>
          <div className="desktop-account"><button type="button" aria-label="Notifications" onClick={() => showNotice('You have no new notifications.')}><Icon name="bell" /></button><div className="desktop-avatar">{user.name.slice(0, 1).toUpperCase()}</div><span>{user.name}</span></div>
        </header>
        <div className="page-content">
          {checkoutTier ? <CheckoutView tier={checkoutTier} crypto={selectedCrypto} wallet={wallet} onCrypto={setSelectedCrypto} onBack={() => setCheckoutTier(null)} onConfirm={confirmPurchase} /> : <>
            {activeView === 'home' && <HomeView onAction={showNotice} onNavigate={navigateTo} onVerify={() => setActiveView('verification')} onHistory={() => setActiveView('wallet')} portfolio={portfolio} activities={activities} user={user} onLogout={logout} />}
            {activeView === 'invest' && <InvestView filter={tierFilter} onFilter={setTierFilter} tiers={filteredTiers} portfolio={portfolio} purchases={purchases} onInvest={startCheckout} onProfile={() => setActiveView('profile')} onSupport={showNotice} />}
            {activeView === 'wallet' && <WalletView onAction={showNotice} onRecharge={() => navigateTo('recharge')} onWithdraw={() => navigateTo('withdraw')} portfolio={portfolio} activities={activities} />}
            {activeView === 'referrals' && <ReferralView user={user} referrals={referrals} onCopy={copyInviteCode} onRefresh={refreshReferrals} />}
            {activeView === 'profile' && <ProfileView onAction={showNotice} onProfileSettings={() => navigateTo('profileSettings')} onSecurity={() => navigateTo('security')} onReferrals={() => navigateTo('referrals')} onVerification={() => navigateTo('verification')} portfolio={portfolio} purchases={purchases} user={user} verification={verification} onLogout={logout} />}
            {activeView === 'recharge' && <RechargeView wallet={wallet} onBack={() => setActiveView('wallet')} onRecharge={submitRecharge} />}
            {activeView === 'withdraw' && <WithdrawView onBack={() => setActiveView('wallet')} onWithdraw={submitWithdrawal} portfolio={portfolio} />}
            {activeView === 'profileSettings' && <ProfileSettingsView user={user} onBack={() => setActiveView('profile')} onSave={updateProfile} />}
            {activeView === 'security' && <SecurityView user={user} onBack={() => setActiveView('profile')} onAction={showNotice} onPasswordChange={updatePassword} onVerification={() => navigateTo('verification')} />}
            {activeView === 'verification' && <VerificationView user={user} verification={verification} onBack={() => setActiveView('profile')} onVerify={submitVerification} />}
          </>}
        </div>
      </div>

      {notice && <div className="toast" role="status">{notice}</div>}
      <BottomNav items={navItems} activeId={activeView} onSelect={setActiveView} />
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
    <section className="auth-visual" aria-hidden="true"><div className="auth-brand">SEZ<span /></div><div className="auth-visual-copy"><p>Secure investing workspace</p><h1>Invest with a clearer view.</h1><div><strong>$0.00</strong><span>Start with a personal wallet and choose your first tier when ready.</span></div></div></section>
    <section className="auth-main"><div className="auth-card"><div className="auth-mobile-brand">SEZ<span /></div><p className="eyebrow">Customer access</p><h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1><p className="auth-subtitle">{isRegister ? 'Enter a member invite code to open your investor profile.' : 'Sign in to your investor workspace.'}</p><form onSubmit={submit}>{isRegister && <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label>}<label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isRegister ? 'new-password' : 'current-password'} minLength="8" required /></label>{isRegister && <label>Invite code<input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} autoComplete="off" required /></label>}{error && <p className="auth-error" role="alert">{error}</p>}<button className="auth-submit" type="submit" disabled={submitting}>{submitting ? 'Please wait...' : isRegister ? 'Create account' : 'Log in'}</button></form><p className="auth-switch">{isRegister ? 'Already have an account?' : 'New to SEZ?'} <button type="button" onClick={switchMode}>{isRegister ? 'Log in' : 'Create account'}</button></p></div></section>
  </main>
}

function VerificationBanner({ onVerify }) {
  return <section className="verification-banner"><div><p className="eyebrow">Unverified account</p><h2>Upload your ID or passport and face photo.</h2></div><button type="button" onClick={onVerify}><Icon name="upload" />Verify</button></section>
}

function HomeView({ onAction, onNavigate, onVerify, onHistory, portfolio, activities, user, onLogout }) {
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

function InvestView({ filter, onFilter, tiers: tierItems, portfolio, purchases, onInvest, onProfile, onSupport }) {
  return (
    <>
      <section className="investment-summary">
        <div className="summary-topline">
          <div><p className="eyebrow">Investment</p><h1>Sez Devices</h1></div>
          <div className="active-tier"><span>Active</span><strong>{portfolio.activeTiers} Tiers</strong></div>
        </div>
        <div className="summary-metrics"><Metric label="Daily Income" value={formatMoney(portfolio.dailyIncome)} green /><Metric label="1 Month Result" value={formatMoney(portfolio.oneMonthResult)} /></div>
      </section>

      <div className="filter-row" role="tablist" aria-label="Investment tiers">
        {tierFilters.map((item) => <SegmentButton key={item.id} label={item.label} active={filter === item.id} onClick={() => onFilter(item.id)} />)}
      </div>
      <section className="tier-list">{tierItems.map((tier) => <TierCard key={tier.id} tier={tier} owned={purchases.some((purchase) => purchase.id === tier.id)} onInvest={onInvest} onProfile={onProfile} />)}</section>
      <button className="message-fab" type="button" aria-label="Contact support" onClick={() => onSupport('Support is currently unavailable.')}><Icon name="send" /></button>
    </>
  )
}

function WalletView({ onAction, onRecharge, onWithdraw, portfolio, activities }) {
  return (
    <>
      <section className="wallet-hero">
        <p className="eyebrow">Available Balance</p><h1>{formatMoney(portfolio.walletBalance)}</h1><p>Your wallet is ready for recharge and withdrawals.</p>
        <div className="wallet-identity"><span>Wallet ID</span><strong>{portfolio.walletId || 'Not assigned'}</strong></div>
        <div className="wallet-buttons"><PrimaryButton label="Recharge" icon="plus" onClick={onRecharge} /><PrimaryButton label="Withdraw" icon="arrow-up" secondary onClick={onWithdraw} /></div>
      </section>
      <section className="wallet-stats"><Metric label="Daily Income" value={formatMoney(portfolio.dailyIncome)} green /><Metric label="Weekly Income" value={formatMoney(portfolio.weeklyIncome)} green /><Metric label="1 Month Profit" value={formatMoney(portfolio.earnings)} /><Metric label="Active Tiers" value={String(portfolio.activeTiers)} /></section>
      <SectionHeader title="Recent Activity" action="History" onAction={() => onAction('Wallet history is up to date.')} />
      <ActivityList items={activities} emptyMessage="No transactions yet" />
    </>
  )
}

function ProfileView({ onAction, onProfileSettings, onSecurity, onReferrals, onVerification, portfolio, purchases, user, verification, onLogout }) {
  const verificationLabel = user.verified ? 'Verified' : 'Unverified'
  const verificationDate = verification?.createdAt ? `Verified ${formatShortDate(verification.createdAt)}` : 'ID/passport and face photo required'

  return (
    <>
      <section className="profile-hero"><div className="large-avatar">{user.name.slice(0, 1).toUpperCase()}</div><div><p className="eyebrow">Member Account</p><h1>{user.name}</h1><p>{user.email}</p><span className={`verification-pill${user.verified ? ' verified' : ''}`}>{verificationLabel}</span></div></section>
      <section className="profile-grid"><Metric label="Wallet" value={formatMoney(portfolio.walletBalance)} /><Metric label="Active Tiers" value={String(portfolio.activeTiers)} /><Metric label="Daily Income" value={formatMoney(portfolio.dailyIncome)} green /><Metric label="1 Month Result" value={formatMoney(portfolio.oneMonthResult)} /></section>
      {!user.verified && <VerificationBanner onVerify={onVerification} />}
      <section className="purchased-panel"><SectionHeader title="Purchased Tiers" action={`${portfolio.activeTiers} active`} onAction={() => onAction('Your purchased tiers are shown below.')} /><PurchasedTiers purchases={purchases} /></section>
      <section className="settings-list">
        <button type="button" onClick={onVerification}><span><Icon name="upload" />Verification</span><small>{verificationDate}</small><Icon name="chevron" /></button>
        <button type="button" onClick={onProfileSettings}><span><Icon name="user" />Profile settings</span><Icon name="chevron" /></button>
        <button type="button" onClick={onReferrals}><span><Icon name="send" />Referrals</span><Icon name="chevron" /></button>
        <button type="button" onClick={onSecurity}><span><Icon name="shield" />Security</span><Icon name="chevron" /></button>
        <button type="button" className="signout-row" onClick={onLogout}><span><Icon name="logout" />Sign out</span><Icon name="chevron" /></button>
      </section>
    </>
  )
}

function ReferralView({ user, referrals, onCopy, onRefresh }) {
  const [refreshing, setRefreshing] = useState(false)

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
        <Metric label="Invited Customers" value={String(referrals.length)} />
        <Metric label="Invite Status" value="Active" green />
      </section>
      <section className="purchased-panel referral-panel">
        <SectionHeader title="Invited Customers" action={refreshing ? 'Refreshing...' : 'Refresh'} onAction={refresh} />
        <ReferralList referrals={referrals} />
      </section>
    </>
  )
}

function ReferralList({ referrals }) {
  if (!referrals.length) return <div className="empty-state purchased-empty"><Icon name="send" /><p>No invited customers yet</p></div>
  return <div className="referral-list">{referrals.map((referral) => <article className="referral-row" key={referral.id}><div><h3>{referral.name}</h3><p>{referral.email}</p></div><span>{formatShortDate(referral.createdAt)}</span></article>)}</div>
}

function TierCard({ tier, owned, onInvest, onProfile }) {
  const projection = getTierProjection(tier.price, tier.monthlyRate)

  return (
    <article className="tier-card" style={{ '--accent': tier.color, '--accent-shadow': tier.shadow }}>
      <div className="tier-heading">
        <div><span className="vip-pill"><span />{tier.level}</span><h2>{tier.title}</h2></div>
        <div className="tier-price"><p className="micro-label">Invest</p><strong>{tier.investment}</strong></div>
      </div>
      <div className="risk-row"><span className="micro-label">Monthly Rate</span><strong>{tier.risk}</strong></div>
      <div className="risk-track"><span style={{ width: `${tier.riskValue}%` }} /></div>
      <div className="tier-stats"><Metric label="Daily Income" value={formatMoney(projection.dailyIncome)} /><Metric label="Weekly Income" value={formatMoney(projection.weeklyIncome)} /><Metric label="1 Month Result" value={formatMoney(projection.monthResult)} /></div>
      <PrimaryButton label={owned ? 'View Profile' : 'Invest Now'} onClick={() => owned ? onProfile() : onInvest(tier)} />
    </article>
  )
}

function OverviewCard({ item }) {
  return <article className="overview-card" style={{ '--overview-color': item.color }}><p className="micro-label">{item.label}</p><strong>{item.value}</strong><span>{item.note}</span><div className="bar-chart" aria-hidden="true">{item.bars.map((height, index) => <i key={`${item.label}-${index}`} style={{ height }} />)}</div></article>
}

function ActivityList({ items, emptyMessage }) {
  if (!items.length) return <section className="empty-state"><Icon name="wallet" /><p>{emptyMessage}</p></section>
  return <section className="activity-list">{items.map((item, index) => <article className="activity-row" key={`${item.title}-${item.time}-${index}`}><div className={`activity-icon ${item.tone}`}><Icon name={item.type} /></div><div className="activity-copy"><h3>{item.title}</h3><p>{item.time}</p></div><strong className={item.amount.startsWith('+') ? 'positive' : 'negative'}>{item.amount}</strong></article>)}</section>
}

function PurchasedTiers({ purchases }) {
  if (!purchases.length) return <div className="empty-state purchased-empty"><Icon name="grid" /><p>No tier purchased yet</p></div>
  return <div className="purchased-list">{purchases.map((purchase) => {
    const projection = getTierProjection(purchase.price, purchase.monthlyRate)
    return <article className="purchased-tier" key={purchase.id} style={{ '--accent': purchase.color }}><div><span className="vip-pill"><span />{purchase.level}</span><h3>{purchase.title}</h3><p>Daily {formatMoney(projection.dailyIncome)} - 1 month {formatMoney(projection.monthResult)}</p></div><strong>{formatMoney(purchase.price)}</strong></article>
  })}</div>
}

function CheckoutView({ tier, crypto, wallet, onCrypto, onBack, onConfirm }) {
  const selectedOption = cryptoOptions.find((option) => option.id === crypto)
  return <section className="checkout-page" style={{ '--accent': tier.color, '--accent-shadow': tier.shadow }}>
    <button className="checkout-back" type="button" onClick={onBack}><Icon name="arrow-left" />Back to tiers</button>
    <div className="checkout-grid">
      <div className="checkout-intro"><p className="eyebrow">Customer purchase</p><h1>Buy {tier.title}</h1><p>Choose a cryptocurrency to complete your investment purchase.</p><div className="checkout-product"><span className="vip-pill"><span />{tier.level}</span><h2>{tier.title}</h2><strong>{formatMoney(tier.price)}</strong><div className="risk-row"><span className="micro-label">Monthly Rate</span><strong>{tier.risk}</strong></div><div className="risk-track"><span style={{ width: `${tier.riskValue}%` }} /></div></div></div>
      <div className="checkout-payment"><p className="eyebrow">Wallet payment</p><h2>Select cryptocurrency</h2><div className="crypto-options">{cryptoOptions.map((option) => <button key={option.id} className={crypto === option.id ? 'active' : ''} type="button" onClick={() => onCrypto(option.id)}><span className={`crypto-mark ${option.tone}`}>{option.id.slice(0, 1)}</span><span><strong>{option.id}</strong><small>{option.name}</small></span><Icon name="check" /></button>)}</div><div className="payment-total"><span>Amount due</span><strong>{selectedOption.quantity(tier.price)}</strong><small>{formatMoney(tier.price)} from wallet {wallet.id}</small></div><PrimaryButton label="Confirm Wallet Payment" icon="check" onClick={onConfirm} /><p className="payment-note">Your wallet balance must cover this tier before purchase.</p></div>
    </div>
  </section>
}

function RechargeView({ wallet, onBack, onRecharge }) {
  const [amount, setAmount] = useState('40')
  const [crypto, setCrypto] = useState('USDT')
  const [network, setNetwork] = useState('TRC20')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const amountValue = Math.max(Number(amount) || 0, 0)

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await onRecharge({ amount: amountValue, crypto, network })
    } catch (rechargeError) {
      setError(rechargeError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return <section className="detail-page">
    <button className="subpage-back" type="button" onClick={onBack}><Icon name="arrow-left" />Back to wallet</button>
    <div className="detail-grid">
      <form className="form-panel" onSubmit={submit}>
        <p className="eyebrow">Recharge account</p>
        <h1>Add balance</h1>
        <label>Amount<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
        <label>Currency<select value={crypto} onChange={(event) => setCrypto(event.target.value)}>{cryptoOptions.map((option) => <option key={option.id} value={option.id}>{option.id} - {option.name}</option>)}</select></label>
        <label>Network<select value={network} onChange={(event) => setNetwork(event.target.value)}><option>TRC20</option><option>ERC20</option><option>BEP20</option></select></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Recharge'}</button>
      </form>
      <section className="info-panel">
        <p className="eyebrow">Payment address</p>
        <h2>{crypto} {network}</h2>
        <div className="address-box">SEZ-{wallet.id || 'WALLET'}-{crypto}-{network}</div>
        <div className="result-strip"><Metric label="Recharge Amount" value={formatMoney(amountValue)} /><Metric label="Status" value="Credited" /></div>
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
        <h2>{formatMoney(amountValue)}</h2>
        <div className="result-strip"><Metric label="Available" value={formatMoney(portfolio.walletBalance)} /><Metric label="Monthly Profit" value={formatMoney(portfolio.earnings)} green /></div>
      </section>
    </div>
  </section>
}

function ProfileSettingsView({ user, onBack, onSave }) {
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await onSave({ name, email })
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return <section className="detail-page">
    <button className="subpage-back" type="button" onClick={onBack}><Icon name="arrow-left" />Back to profile</button>
    <form className="form-panel settings-form" onSubmit={submit}>
      <p className="eyebrow">Profile settings</p>
      <h1>Personal details</h1>
      <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label>
      <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Save Profile'}</button>
    </form>
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
        <button className={`toggle-row${user.verified ? ' active' : ''}`} type="button" onClick={() => user.verified ? onAction('Your account is verified for recharge and tier purchases.') : onVerification()}><span><Icon name={user.verified ? 'check' : 'upload'} />Customer verification</span><strong>{user.verified ? 'Verified' : 'Unverified'}</strong></button>
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
        <div className={`verification-status${user.verified ? ' verified' : ''}`}><Icon name={user.verified ? 'check' : 'upload'} /><span>{user.verified ? 'Your wallet is enabled for recharge, withdrawals, and VIP purchases.' : 'Upload one ID or passport document and one face picture to unlock wallet actions.'}</span></div>
        <div className="result-strip"><Metric label="Document" value={verification?.documentName || 'Required'} /><Metric label="Face Photo" value={verification?.faceName || 'Required'} /></div>
      </section>
    </div>
  </section>
}

function SectionHeader({ title, action, onAction }) {
  return <div className="section-heading"><h2>{title}</h2><button type="button" onClick={onAction}>{action}</button></div>
}

function Metric({ label, value, green = false }) {
  return <div className="metric"><p className="micro-label">{label}</p><strong className={green ? 'positive' : ''}>{value}</strong></div>
}

function getOverviewItems(portfolio) {
  return [
    { label: 'Daily', value: formatMoney(portfolio.dailyIncome), note: 'projected', color: '#4a91ff', bars: [10, 16, 13, 21, 18, 25, 30, 26] },
    { label: 'Weekly', value: formatMoney(portfolio.weeklyIncome), note: 'projected', color: '#a983ff', bars: [12, 11, 20, 15, 26, 22, 32, 29] },
    { label: '1 Month', value: formatMoney(portfolio.oneMonthResult), note: 'final result', color: '#1fe1b0', bars: [7, 15, 11, 25, 20, 30, 27, 35] },
  ]
}

function getTierProjection(amount, monthlyRate = projectedMonthlyRate) {
  const monthlyProfit = amount * monthlyRate
  const dailyIncome = monthlyProfit / 30
  const weeklyIncome = dailyIncome * 7
  return { dailyIncome, weeklyIncome, monthlyProfit, monthResult: amount + monthlyProfit }
}

function formatCompactMoney(amount) {
  return `$${amount.toLocaleString('en-US')}`
}

function formatMoney(amount) {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function toClientPurchase(purchase) {
  const tier = tiers.find((item) => item.id === purchase.tierId)
  const cryptoTone = cryptoOptions.find((option) => option.id === purchase.crypto)?.tone || 'blue'
  if (tier) return { ...tier, ...purchase, id: tier.id, price: purchase.amount, tone: cryptoTone }
  return { ...purchase, id: purchase.tierId, price: purchase.amount || 0, monthlyRate: projectedMonthlyRate, color: '#4b91ff', tone: cryptoTone }
}

function toClientWallet(wallet) {
  return { id: wallet?.id || '', balance: Number(wallet?.balance) || 0 }
}

function toClientTransaction(transaction) {
  return { ...transaction, amount: Number(transaction.amount) || 0, tone: getTransactionTone(transaction.type) }
}

function toActivity(transaction) {
  const isCredit = transaction.type === 'recharge' || transaction.type === 'earning'
  const title = transaction.memo || (transaction.type === 'earning' ? 'VIP daily income' : isCredit ? 'Wallet recharge' : transaction.type === 'purchase' ? 'Tier purchase' : 'Wallet withdrawal')
  const details = [transaction.status, transaction.crypto, transaction.network].filter(Boolean).join(' - ')
  return {
    title,
    time: details || 'Wallet activity',
    amount: `${isCredit ? '+' : '-'}${formatMoney(transaction.amount)}`,
    type: 'wallet',
    tone: transaction.tone,
  }
}

function getTransactionTone(type) {
  if (type === 'recharge') return 'teal'
  if (type === 'earning') return 'gold'
  if (type === 'withdrawal') return 'violet'
  return 'blue'
}

function formatShortDate(value) {
  if (!value) return 'New'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'New'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
    const name = requireStaticText(body.name, 'Name', 2, 80)
    const email = normalizeStaticEmail(body.email)
    const existingAccount = state.users.find((item) => item.email === email)
    if (existingAccount && existingAccount.id !== account.id) throw new Error('An account already uses this email address.')

    account.name = name
    account.email = email
    state.sessionEmail = email
    writeStaticAuthState(state)
    return { user: toPublicUser(account) }
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
    if (!tier) throw new Error('Choose a valid investment tier.')
    if (!cryptoOptions.some((option) => option.id === crypto)) throw new Error('Choose a supported cryptocurrency.')
    if ((account.purchases || []).some((purchase) => purchase.tierId === tier.id)) throw new Error('This tier is already in your profile.')
    if (account.wallet.balance < tier.price) throw new Error('Recharge your wallet before buying this tier.')

    const purchase = { tierId: tier.id, level: tier.level, title: tier.title, amount: tier.price, crypto, createdAt: new Date().toISOString() }
    account.purchases = [purchase, ...(account.purchases || [])]
    account.wallet.balance -= tier.price
    account.transactions = [createStaticTransaction('purchase', tier.price, crypto, null, null, `${tier.level} ${tier.title}`, 'Completed'), ...(account.transactions || [])]
    writeStaticAuthState(state)
    return { purchase, wallet: toPublicWallet(account), transactions: account.transactions }
  }

  if (method === 'POST' && path === '/api/recharges') {
    requireStaticVerifiedAccount(account)
    const amount = requireStaticAmount(body.amount)
    const crypto = String(body.crypto || '').toUpperCase()
    const network = String(body.network || '').trim().toUpperCase()

    if (!cryptoOptions.some((option) => option.id === crypto)) throw new Error('Choose a supported cryptocurrency.')
    if (!['TRC20', 'ERC20', 'BEP20'].includes(network)) throw new Error('Choose a supported network.')

    account.wallet.balance += amount
    account.transactions = [createStaticTransaction('recharge', amount, crypto, network, `SEZ-${account.wallet.id}-${crypto}-${network}`, 'Wallet recharge', 'Credited'), ...(account.transactions || [])]
    writeStaticAuthState(state)
    return { recharge: { amount, crypto, network, status: 'Credited' }, wallet: toPublicWallet(account), transactions: account.transactions }
  }

  if (method === 'POST' && path === '/api/withdrawals') {
    requireStaticVerifiedAccount(account)
    const amount = requireStaticAmount(body.amount)
    const crypto = String(body.crypto || '').toUpperCase()
    const address = requireStaticText(body.address, 'Wallet address', 8, 180)

    if (!cryptoOptions.some((option) => option.id === crypto)) throw new Error('Choose a supported cryptocurrency.')
    if (account.wallet.balance < amount) throw new Error('Your wallet balance is too low for this withdrawal.')

    account.wallet.balance -= amount
    account.transactions = [createStaticTransaction('withdrawal', amount, crypto, null, address, 'Wallet withdrawal', 'Pending'), ...(account.transactions || [])]
    writeStaticAuthState(state)
    return { withdrawal: { amount, crypto, address, status: 'Pending' }, wallet: toPublicWallet(account), transactions: account.transactions }
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
      if (syncStaticVipEarnings(account)) hasVipChanges = true
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
    referrals: getStaticReferrals(state, account.id),
    verification: account.verification || null,
  }
}

function getStaticReferrals(state, userId) {
  return state.users.filter((account) => account.referredByUserId === userId).map((account) => ({
    id: account.id,
    name: account.name,
    email: account.email,
    createdAt: account.createdAt,
  }))
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
    verified: Boolean(account.verified),
    verification: account.verification || null,
    wallet: { id: walletId, balance: Number(storedWallet.balance ?? account.walletBalance) || 0 },
    purchases: Array.isArray(account.purchases) ? account.purchases.map(normalizeStaticPurchase) : [],
    transactions: Array.isArray(account.transactions) ? account.transactions : [],
    dailyEarnings: Array.isArray(account.dailyEarnings) ? account.dailyEarnings : [],
    referredByUserId: Number(account.referredByUserId) || null,
    createdAt: account.createdAt || new Date().toISOString(),
  }
}

function normalizeStaticPurchase(purchase) {
  return { ...purchase, createdAt: purchase.createdAt || new Date().toISOString() }
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
  throw new Error('Invite code is invalid.')
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

function syncStaticVipEarnings(account) {
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
      changed = true
    }
  }

  return changed
}

function getStaticMissingDailyEarningDates(purchaseCreatedAt, lastEarningDate) {
  const today = startOfStaticUtcDay(new Date())
  const lastDate = lastEarningDate ? parseStaticUtcDate(lastEarningDate) : null
  const purchaseDate = parseStaticUtcDate(purchaseCreatedAt)
  let currentDate = addStaticUtcDays(startOfStaticUtcDay(lastDate || purchaseDate), 1)
  const dates = []

  while (currentDate <= today) {
    dates.push(currentDate.toISOString().slice(0, 10))
    currentDate = addStaticUtcDays(currentDate, 1)
  }

  return dates
}

function parseStaticUtcDate(value) {
  if (!value) return new Date()
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return new Date(`${value}T00:00:00.000Z`)

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function startOfStaticUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function addStaticUtcDays(date, days) {
  const nextDate = new Date(date)
  nextDate.setUTCDate(nextDate.getUTCDate() + days)
  return nextDate
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
    trend: <><path d="m4 16 6-6 4 4 6-7" /><path d="M15 7h5v5" /></>,
    check: <><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
    send: <><path d="m21 3-7.5 18-3.3-7.2L3 10.5z" /><path d="m10.2 13.8 4.3-4.3" /></>,
    copy: <><rect x="8" y="8" width="10" height="12" rx="2" /><path d="M6 16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" /></>,
    shield: <><path d="M12 3 5 6v5c0 4.7 2.9 8.2 7 10 4.1-1.8 7-5.3 7-10V6z" /><path d="m9.3 12 1.8 1.8 3.8-4" /></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
  }
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export default App

import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { BottomNav, SideNav } from './components/navbar.jsx'
import { IconButton, PrimaryButton, SegmentButton } from './components/button.jsx'

const navItems = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'invest', label: 'Invest', icon: 'grid' },
  { id: 'wallet', label: 'Wallet', icon: 'wallet' },
  { id: 'profile', label: 'Profile', icon: 'user' },
]

const pageMeta = {
  home: { eyebrow: 'Investor dashboard', title: 'Overview' },
  invest: { eyebrow: 'Investment portfolio', title: 'Investment tiers' },
  wallet: { eyebrow: 'Account funds', title: 'Wallet' },
  profile: { eyebrow: 'Account management', title: 'Profile' },
  recharge: { eyebrow: 'Account funds', title: 'Recharge' },
  withdraw: { eyebrow: 'Account funds', title: 'Withdraw' },
  security: { eyebrow: 'Account protection', title: 'Security' },
  profileSettings: { eyebrow: 'Account management', title: 'Profile settings' },
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

function App() {
  const [activeView, setActiveView] = useState('home')
  const [tierFilter, setTierFilter] = useState('all')
  const [notice, setNotice] = useState('')
  const [checkoutTier, setCheckoutTier] = useState(null)
  const [selectedCrypto, setSelectedCrypto] = useState('USDT')
  const [purchases, setPurchases] = useState([])
  const [user, setUser] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    let active = true

    async function restoreSession() {
      try {
        const response = await fetch('/api/session', { credentials: 'include' })
        if (!response.ok) return
        const session = await response.json()
        if (!active) return
        setUser(session.user)
        setPurchases(session.purchases.map(toClientPurchase))
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
      walletBalance: 0,
      earnings: projected.monthlyProfit,
      dailyIncome: projected.dailyIncome,
      weeklyIncome: projected.weeklyIncome,
      oneMonthResult: totalInvested + projected.monthlyProfit,
    }
  }, [purchases])

  const activities = useMemo(
    () => purchases.map((purchase) => ({
      title: `${purchase.level} ${purchase.title}`,
      time: `Paid with ${purchase.crypto}`,
      amount: `-${formatMoney(purchase.price)}`,
      type: 'wallet',
      tone: purchase.tone,
    })),
    [purchases],
  )

  function showNotice(message) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2400)
  }

  function startCheckout(tier) {
    setSelectedCrypto('USDT')
    setCheckoutTier(tier)
  }

  function navigateTo(view) {
    setCheckoutTier(null)
    setActiveView(view)
  }

  async function confirmPurchase() {
    if (!checkoutTier || purchases.some((purchase) => purchase.id === checkoutTier.id)) return
    try {
      const result = await requestApi('/api/purchases', { method: 'POST', body: { tierId: checkoutTier.id, crypto: selectedCrypto } })
      setPurchases((current) => [toClientPurchase(result.purchase), ...current])
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

  async function authenticate({ mode, name, email, password }) {
    const payload = mode === 'register' ? { name: name.trim(), email, password } : { email, password }
    const result = await requestApi(`/api/auth/${mode}`, { method: 'POST', body: payload })
    setUser(result.user)
    setPurchases(result.purchases.map(toClientPurchase))
    setActiveView('home')
    setCheckoutTier(null)
  }

  async function logout() {
    try {
      await requestApi('/api/auth/logout', { method: 'POST' })
    } catch {
      // Clear the local session even if the server is unavailable.
    }
    setUser(null)
    setPurchases([])
    setCheckoutTier(null)
    setActiveView('home')
    setAuthMode('login')
    setNotice('')
  }

  if (!authReady) return <main className="auth-loading">Loading secure session...</main>

  if (!user) {
    return <AuthScreen mode={authMode} onModeChange={setAuthMode} onAuthenticate={authenticate} />
  }

  const currentPage = checkoutTier ? { eyebrow: 'Customer checkout', title: 'Crypto payment' } : pageMeta[activeView]

  return (
    <main className="app-shell">
      <SideNav items={navItems} activeId={activeView} onSelect={setActiveView} onLogout={logout} />
      <div className="workspace">
        <header className="desktop-topbar">
          <div><p className="eyebrow">{currentPage.eyebrow}</p><h2>{currentPage.title}</h2></div>
          <div className="desktop-account"><button type="button" aria-label="Notifications" onClick={() => showNotice('You have no new notifications.')}><Icon name="bell" /></button><div className="desktop-avatar">{user.name.slice(0, 1).toUpperCase()}</div><span>{user.name}</span></div>
        </header>
        <div className="page-content">
          {checkoutTier ? <CheckoutView tier={checkoutTier} crypto={selectedCrypto} onCrypto={setSelectedCrypto} onBack={() => setCheckoutTier(null)} onConfirm={confirmPurchase} /> : <>
            {activeView === 'home' && <HomeView onAction={showNotice} onNavigate={navigateTo} onHistory={() => setActiveView('wallet')} portfolio={portfolio} activities={activities} user={user} onLogout={logout} />}
            {activeView === 'invest' && <InvestView filter={tierFilter} onFilter={setTierFilter} tiers={filteredTiers} portfolio={portfolio} purchases={purchases} onInvest={startCheckout} onProfile={() => setActiveView('profile')} onSupport={showNotice} />}
            {activeView === 'wallet' && <WalletView onAction={showNotice} onRecharge={() => navigateTo('recharge')} onWithdraw={() => navigateTo('withdraw')} portfolio={portfolio} activities={activities} />}
            {activeView === 'profile' && <ProfileView onAction={showNotice} onProfileSettings={() => navigateTo('profileSettings')} onSecurity={() => navigateTo('security')} portfolio={portfolio} purchases={purchases} user={user} onLogout={logout} />}
            {activeView === 'recharge' && <RechargeView onBack={() => setActiveView('wallet')} onAction={showNotice} />}
            {activeView === 'withdraw' && <WithdrawView onBack={() => setActiveView('wallet')} onAction={showNotice} portfolio={portfolio} />}
            {activeView === 'profileSettings' && <ProfileSettingsView user={user} onBack={() => setActiveView('profile')} onSave={updateProfile} />}
            {activeView === 'security' && <SecurityView user={user} onBack={() => setActiveView('profile')} onAction={showNotice} onPasswordChange={updatePassword} />}
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
  const isRegister = mode === 'register'

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await onAuthenticate({ mode, name, email, password })
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
    onModeChange(isRegister ? 'login' : 'register')
  }

  return <main className="auth-shell">
    <section className="auth-visual" aria-hidden="true"><div className="auth-brand">SEZ<span /></div><div className="auth-visual-copy"><p>Secure investing workspace</p><h1>Invest with a clearer view.</h1><div><strong>$0.00</strong><span>Start with a zero-balance account and choose your first tier when ready.</span></div></div></section>
    <section className="auth-main"><div className="auth-card"><div className="auth-mobile-brand">SEZ<span /></div><p className="eyebrow">Customer access</p><h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1><p className="auth-subtitle">{isRegister ? 'Set up your investor profile.' : 'Sign in to your investor workspace.'}</p><form onSubmit={submit}>{isRegister && <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label>}<label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isRegister ? 'new-password' : 'current-password'} minLength="8" required /></label>{error && <p className="auth-error" role="alert">{error}</p>}<button className="auth-submit" type="submit" disabled={submitting}>{submitting ? 'Please wait...' : isRegister ? 'Create account' : 'Log in'}</button></form><p className="auth-switch">{isRegister ? 'Already have an account?' : 'New to SEZ?'} <button type="button" onClick={switchMode}>{isRegister ? 'Log in' : 'Create account'}</button></p></div></section>
  </main>
}

function HomeView({ onAction, onNavigate, onHistory, portfolio, activities, user, onLogout }) {
  const overviewItems = getOverviewItems(portfolio)

  return (
    <>
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
        <div className="wallet-buttons"><PrimaryButton label="Recharge" icon="plus" onClick={onRecharge} /><PrimaryButton label="Withdraw" icon="arrow-up" secondary onClick={onWithdraw} /></div>
      </section>
      <section className="wallet-stats"><Metric label="Daily Income" value={formatMoney(portfolio.dailyIncome)} green /><Metric label="Weekly Income" value={formatMoney(portfolio.weeklyIncome)} green /><Metric label="1 Month Profit" value={formatMoney(portfolio.earnings)} /><Metric label="Active Tiers" value={String(portfolio.activeTiers)} /></section>
      <SectionHeader title="Recent Activity" action="History" onAction={() => onAction('Wallet history is up to date.')} />
      <ActivityList items={activities} emptyMessage="No transactions yet" />
    </>
  )
}

function ProfileView({ onAction, onProfileSettings, onSecurity, portfolio, purchases, user, onLogout }) {
  return (
    <>
      <section className="profile-hero"><div className="large-avatar">{user.name.slice(0, 1).toUpperCase()}</div><div><p className="eyebrow">Member Account</p><h1>{user.name}</h1><p>{user.email}</p></div></section>
      <section className="profile-grid"><Metric label="Active Tiers" value={String(portfolio.activeTiers)} /><Metric label="Daily Income" value={formatMoney(portfolio.dailyIncome)} green /><Metric label="Weekly Income" value={formatMoney(portfolio.weeklyIncome)} green /><Metric label="1 Month Result" value={formatMoney(portfolio.oneMonthResult)} /></section>
      <section className="purchased-panel"><SectionHeader title="Purchased Tiers" action={`${portfolio.activeTiers} active`} onAction={() => onAction('Your purchased tiers are shown below.')} /><PurchasedTiers purchases={purchases} /></section>
      <section className="settings-list">
        <button type="button" onClick={onProfileSettings}><span><Icon name="user" />Profile settings</span><Icon name="chevron" /></button>
        <button type="button" onClick={onSecurity}><span><Icon name="shield" />Security</span><Icon name="chevron" /></button>
        <button type="button" className="signout-row" onClick={onLogout}><span><Icon name="logout" />Sign out</span><Icon name="chevron" /></button>
      </section>
    </>
  )
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
  return <section className="activity-list">{items.map((item) => <article className="activity-row" key={item.title}><div className={`activity-icon ${item.tone}`}><Icon name={item.type} /></div><div className="activity-copy"><h3>{item.title}</h3><p>{item.time}</p></div><strong className={item.amount.startsWith('+') ? 'positive' : 'negative'}>{item.amount}</strong></article>)}</section>
}

function PurchasedTiers({ purchases }) {
  if (!purchases.length) return <div className="empty-state purchased-empty"><Icon name="grid" /><p>No tier purchased yet</p></div>
  return <div className="purchased-list">{purchases.map((purchase) => {
    const projection = getTierProjection(purchase.price, purchase.monthlyRate)
    return <article className="purchased-tier" key={purchase.id} style={{ '--accent': purchase.color }}><div><span className="vip-pill"><span />{purchase.level}</span><h3>{purchase.title}</h3><p>Daily {formatMoney(projection.dailyIncome)} - 1 month {formatMoney(projection.monthResult)}</p></div><strong>{formatMoney(purchase.price)}</strong></article>
  })}</div>
}

function CheckoutView({ tier, crypto, onCrypto, onBack, onConfirm }) {
  const selectedOption = cryptoOptions.find((option) => option.id === crypto)
  return <section className="checkout-page" style={{ '--accent': tier.color, '--accent-shadow': tier.shadow }}>
    <button className="checkout-back" type="button" onClick={onBack}><Icon name="arrow-left" />Back to tiers</button>
    <div className="checkout-grid">
      <div className="checkout-intro"><p className="eyebrow">Customer purchase</p><h1>Buy {tier.title}</h1><p>Choose a cryptocurrency to complete your investment purchase.</p><div className="checkout-product"><span className="vip-pill"><span />{tier.level}</span><h2>{tier.title}</h2><strong>{formatMoney(tier.price)}</strong><div className="risk-row"><span className="micro-label">Monthly Rate</span><strong>{tier.risk}</strong></div><div className="risk-track"><span style={{ width: `${tier.riskValue}%` }} /></div></div></div>
      <div className="checkout-payment"><p className="eyebrow">Payment method</p><h2>Select cryptocurrency</h2><div className="crypto-options">{cryptoOptions.map((option) => <button key={option.id} className={crypto === option.id ? 'active' : ''} type="button" onClick={() => onCrypto(option.id)}><span className={`crypto-mark ${option.tone}`}>{option.id.slice(0, 1)}</span><span><strong>{option.id}</strong><small>{option.name}</small></span><Icon name="check" /></button>)}</div><div className="payment-total"><span>Amount due</span><strong>{selectedOption.quantity(tier.price)}</strong><small>{formatMoney(tier.price)} value</small></div><PrimaryButton label="Confirm Demo Payment" icon="check" onClick={onConfirm} /><p className="payment-note">This checkout records a local demo purchase only. It does not connect a wallet or process cryptocurrency.</p></div>
    </div>
  </section>
}

function RechargeView({ onBack, onAction }) {
  const [amount, setAmount] = useState('40')
  const [crypto, setCrypto] = useState('USDT')
  const [network, setNetwork] = useState('TRC20')
  const amountValue = Math.max(Number(amount) || 0, 0)

  function submit(event) {
    event.preventDefault()
    onAction(`Recharge request for ${formatMoney(amountValue)} submitted.`)
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
        <button className="primary-button" type="submit">Submit Recharge</button>
      </form>
      <section className="info-panel">
        <p className="eyebrow">Payment address</p>
        <h2>{crypto} {network}</h2>
        <div className="address-box">SEZ-DEMO-{crypto}-{network}-0001</div>
        <div className="result-strip"><Metric label="Recharge Amount" value={formatMoney(amountValue)} /><Metric label="Status" value="Pending" /></div>
      </section>
    </div>
  </section>
}

function WithdrawView({ onBack, onAction, portfolio }) {
  const [amount, setAmount] = useState('')
  const [crypto, setCrypto] = useState('USDT')
  const [address, setAddress] = useState('')
  const amountValue = Math.max(Number(amount) || 0, 0)

  function submit(event) {
    event.preventDefault()
    onAction(`Withdraw request for ${formatMoney(amountValue)} submitted.`)
    setAmount('')
    setAddress('')
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
        <button className="primary-button" type="submit">Submit Withdrawal</button>
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

function SecurityView({ user, onBack, onAction, onPasswordChange }) {
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
        <button className={`toggle-row${twoFactorEnabled ? ' active' : ''}`} type="button" onClick={() => setTwoFactorEnabled((enabled) => !enabled)}><span><Icon name="shield" />Two-factor login</span><strong>{twoFactorEnabled ? 'On' : 'Off'}</strong></button>
        <button className="toggle-row" type="button" onClick={() => onAction('Withdrawal confirmation is required for every request.')}><span><Icon name="check" />Withdrawal confirmation</span><strong>On</strong></button>
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

async function requestApi(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    credentials: 'include',
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Unable to complete this request.')
  return payload
}

function Icon({ name }) {
  const paths = {
    plus: <><path d="M12 5v14M5 12h14" /></>,
    'arrow-up': <><path d="M12 19V5M6 11l6-6 6 6" /></>,
    'arrow-left': <><path d="M19 12H5M11 18l-6-6 6-6" /></>,
    download: <><path d="M12 4v10M8 10l4 4 4-4M5 20h14" /></>,
    logout: <><path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4M14 8l4 4-4 4M18 12H9" /></>,
    home: <><path d="m4 11 8-7 8 7v9H4z" /><path d="M9 20v-6h6v6" /></>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    wallet: <><path d="M4 7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v2H7a3 3 0 0 0 0 6h12v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M19 9h-5a3 3 0 0 0 0 6h5z" /></>,
    user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.6-3.5 3.1-5.5 7-5.5s6.4 2 7 5.5" /></>,
    trend: <><path d="m4 16 6-6 4 4 6-7" /><path d="M15 7h5v5" /></>,
    check: <><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
    send: <><path d="m21 3-7.5 18-3.3-7.2L3 10.5z" /><path d="m10.2 13.8 4.3-4.3" /></>,
    shield: <><path d="M12 3 5 6v5c0 4.7 2.9 8.2 7 10 4.1-1.8 7-5.3 7-10V6z" /><path d="m9.3 12 1.8 1.8 3.8-4" /></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
  }
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export default App

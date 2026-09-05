import { useState } from 'react'

const supportUrl = 'https://t.me/+J82Rio5xns1lY2Ni'

export function Brand({ compact = false }) {
  return <div className={`brand-lockup${compact ? ' compact' : ''}`}><span className="brand-symbol" aria-hidden="true"><i /><i /><i /></span><span>SEZ<span className="brand-period">.</span></span></div>
}

function Arrow() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>
}

export default function AuthScreen({ mode, onModeChange, onAuthenticate }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isRegister = mode === 'register'

  function changeMode(nextMode) {
    if (submitting || nextMode === mode) return
    setError('')
    setPassword('')
    setShowPassword(false)
    onModeChange(nextMode)
  }

  async function submit(event) {
    event.preventDefault()
    if (submitting) return
    setError('')
    setSubmitting(true)
    try {
      await onAuthenticate({ mode, name, email: email.trim(), password, inviteCode: inviteCode.trim() })
    } catch (submissionError) {
      setError(submissionError.message || 'Unable to sign in. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="access-shell">
    <section className="access-story" aria-label="SEZ investor platform">
      <Brand />
      <div className="access-story-copy"><p className="eyebrow"><span className="status-dot" />YOUR INVESTOR WORKSPACE</p><h1>Your assets.<br />A clearer<br /><span>perspective.</span></h1><p>Manage your wallet, explore mining plans, and keep every move in view.</p></div>
      <div className="orbit-art" aria-hidden="true"><div className="orbit-disc"><div className="orbit-core"><span className="brand-symbol"><i /><i /><i /></span></div></div><span className="orbit-point point-one" /><span className="orbit-point point-two" /><span className="orbit-caption">A NEW POINT OF VIEW</span><span className="orbit-coordinate">SEZ / 01</span></div>
      <div className="access-story-footer"><span>Wallet. Plans. Possibilities.</span><span className="story-arrow"><Arrow /></span></div>
    </section>
    <section className="access-main">
      <header className="access-header"><div className="access-mobile-brand"><Brand compact /></div><a href={supportUrl} target="_blank" rel="noreferrer">Need help? <Arrow /></a></header>
      <div className="access-form-wrap">
        <div className="access-tabs" aria-label="Account access"><button type="button" aria-pressed={!isRegister} className={!isRegister ? 'active' : ''} onClick={() => changeMode('login')} disabled={submitting}>Log in</button><button type="button" aria-pressed={isRegister} className={isRegister ? 'active' : ''} onClick={() => changeMode('register')} disabled={submitting}>Create account</button></div>
        <div className="access-heading"><span className="access-step">{isRegister ? 'LET’S GET STARTED' : 'GOOD TO SEE YOU AGAIN'}</span><h2>{isRegister ? 'Make it yours.' : 'Welcome back.'}</h2><p>{isRegister ? 'Your workspace starts with a member invitation.' : 'Sign in and pick up where you left off.'}</p></div>
        <form className="access-form" onSubmit={submit} aria-busy={submitting}>
          {isRegister && <label htmlFor="account-name">Full name<input id="account-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" autoComplete="name" minLength={2} maxLength={80} required disabled={submitting} /></label>}
          <label htmlFor="account-email">Email address<input id="account-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" spellCheck={false} required disabled={submitting} /></label>
          <label htmlFor="account-password">Password<span className="password-control"><input id="account-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isRegister ? 'At least 8 characters' : 'Enter your password'} autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={8} maxLength={256} required disabled={submitting} /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{showPassword && <path d="m3 3 18 18" />}</svg></button></span></label>
          {isRegister && <label htmlFor="account-invite">Member invite code<input id="account-invite" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="Enter your invitation code" autoComplete="off" maxLength={32} required disabled={submitting} /><small>Use the code shared by the member who invited you.</small></label>}
          {!isRegister && <a className="access-recovery" href={supportUrl} target="_blank" rel="noreferrer">Need help signing in?</a>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="access-submit" type="submit" disabled={submitting}><span>{submitting ? 'Please wait...' : isRegister ? 'Create account' : 'Log in to your account'}</span>{submitting ? <span className="button-spinner" /> : <Arrow />}</button>
        </form>
        <p className="access-switch">{isRegister ? 'Already part of SEZ?' : 'New to SEZ?'} <button type="button" onClick={() => changeMode(isRegister ? 'login' : 'register')} disabled={submitting}>{isRegister ? 'Log in' : 'Create an account'} <span aria-hidden="true">↗</span></button></p>
        {(window.location.hostname.endsWith('.github.io') || window.location.protocol === 'file:') && <p className="demo-disclosure">Browser demo · Accounts and activity are stored on this device. Use test details only.</p>}
      </div>
      <footer className="access-footer"><span>© {new Date().getFullYear()} SEZ. All rights reserved.</span><a href={supportUrl} target="_blank" rel="noreferrer">Contact support <span aria-hidden="true">↗</span></a></footer>
    </section>
  </main>
}

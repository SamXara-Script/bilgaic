import { Brand } from './auth-screen.jsx'

export function BottomNav({ items, activeId, onSelect }) {
  return <nav className="bottom-nav" aria-label="Main navigation">{items.map((item) => <button key={item.id} type="button" className={activeId === item.id ? 'active' : ''} aria-current={activeId === item.id ? 'page' : undefined} onClick={() => onSelect(item.id)}><NavIcon name={item.icon} /><span>{item.label}</span></button>)}</nav>
}

export function SideNav({ items, activeId, onSelect, onLogout, supportUrl, user }) {
  return (
    <aside className="side-nav">
      <button className="side-brand-button" type="button" aria-label="SEZ home" onClick={() => onSelect('home')}><Brand /></button>
      <div className="workspace-label"><span className="workspace-monogram">S</span><div><strong>Personal workspace</strong><small>Investor account</small></div></div>
      <p className="side-caption">WORKSPACE</p>
      <nav aria-label="Desktop navigation">
        {items.map((item) => <button key={item.id} type="button" className={activeId === item.id ? 'active' : ''} aria-current={activeId === item.id ? 'page' : undefined} onClick={() => onSelect(item.id)}><NavIcon name={item.icon} /><span>{item.label}</span>{activeId === item.id && <i className="nav-active-dot" />}</button>)}
      </nav>
      <a className="side-help" href={supportUrl} target="_blank" rel="noreferrer"><span className="help-icon"><NavIcon name="support" /></span><strong>A little guidance?</strong><span>We’re here when you need us.</span><b>Contact support <span aria-hidden="true">↗</span></b></a>
      <div className="side-account"><button className="side-profile" type="button" onClick={() => onSelect('profile')}><span className="desktop-avatar">{user?.name?.slice(0, 1).toUpperCase() || 'S'}</span><span><strong>{user?.name || 'Account'}</strong><small>Personal account</small></span></button><button className="side-logout" type="button" onClick={onLogout} aria-label="Sign out" title="Sign out"><NavIcon name="logout" /></button></div>
    </aside>
  )
}

function NavIcon({ name }) {
  const paths = {
    home: <><path d="m4 11 8-7 8 7v9H4z" /><path d="M9 20v-6h6v6" /></>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    wallet: <><path d="M4 7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v2H7a3 3 0 0 0 0 6h12v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M19 9h-5a3 3 0 0 0 0 6h5z" /></>,
    send: <><path d="m21 3-7.5 18-3.3-7.2L3 10.5z" /><path d="m10.2 13.8 4.3-4.3" /></>,
    support: <><circle cx="12" cy="12" r="8" /><path d="M9.4 9a2.9 2.9 0 0 1 5.2 1.8c0 2-2.6 2.3-2.6 4" /><path d="M12 18h.01" /></>,
    user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.6-3.5 3.1-5.5 7-5.5s6.4 2 7 5.5" /></>,
    logout: <><path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4M14 8l4 4-4 4M18 12H9" /></>,
  }
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

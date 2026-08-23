const tones = { blue: '#4a91ff', violet: '#a983ff', teal: '#1fe1b0', gold: '#f0b91a' }

export function IconButton({ label, icon, tone, onClick }) {
  return <button className="icon-action" type="button" style={{ '--tone': tones[tone] }} onClick={onClick}><span><ActionIcon name={icon} /></span><em>{label}</em></button>
}

export function PrimaryButton({ label, icon, secondary = false, onClick }) {
  return <button className={`primary-button${secondary ? ' secondary' : ''}`} type="button" onClick={onClick}>{icon && <ActionIcon name={icon} />}{label}</button>
}

export function SegmentButton({ label, active, onClick }) {
  return <button className={`segment-button${active ? ' active' : ''}`} type="button" role="tab" aria-selected={active} onClick={onClick}>{label}</button>
}

function ActionIcon({ name }) {
  const paths = {
    plus: <><path d="M12 5v14M5 12h14" /></>,
    'arrow-up': <><path d="M12 19V5M6 11l6-6 6 6" /></>,
    download: <><path d="M12 4v10M8 10l4 4 4-4M5 20h14" /></>,
    logout: <><path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4M14 8l4 4-4 4M18 12H9" /></>,
    check: <><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
  }
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

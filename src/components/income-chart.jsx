import { useMemo, useState } from 'react'

const incomeTypes = new Set(['earning', 'referral_deposit', 'referral_task'])
const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)

export default function IncomeChart({ transactions, history }) {
  const [period, setPeriod] = useState(7)
  const days = useMemo(() => {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    return Array.from({ length: period }, (_, index) => {
      const date = new Date(today)
      date.setUTCDate(date.getUTCDate() - period + index + 1)
      const next = new Date(date)
      next.setUTCDate(next.getUTCDate() + 1)
      const total = Array.isArray(history) ? Number(history.find((day) => day.date === date.toISOString().slice(0, 10))?.total || 0) : transactions.reduce((sum, transaction) => {
        const raw = String(transaction.createdAt || '').replace(' ', 'T')
        const time = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`).getTime()
        return incomeTypes.has(transaction.type) && ['Credited', 'Completed'].includes(transaction.status) && time >= date.getTime() && time < next.getTime() ? sum + Number(transaction.amount || 0) : sum
      }, 0)
      return { date, total }
    })
  }, [transactions, history, period])
  const total = days.reduce((sum, day) => sum + day.total, 0)
  const max = Math.max(...days.map((day) => day.total), 1)

  return <section className="income-chart-panel">
    <div className="chart-heading"><div><h2>Income overview</h2><p>Recorded earnings · Daily totals in UTC</p></div><div className="chart-period" aria-label="Income period">{[7, 30].map((value) => <button key={value} type="button" aria-pressed={period === value} className={period === value ? 'active' : ''} onClick={() => setPeriod(value)}>{value}D</button>)}</div></div>
    <div className="chart-total"><strong>{money(total)}</strong><span>Last {period} days</span></div>
    <div className={`income-chart${total === 0 ? ' is-empty' : ''}`}>
      <div className="chart-grid" aria-hidden="true"><span>{money(max)}</span><span>{money(max / 2)}</span><span>$0</span></div>
      <div className="chart-bars" aria-label={`Daily income over the last ${period} days`}>{days.map(({ date, total: amount }) => <div className="chart-column" key={date.toISOString()} tabIndex={amount > 0 ? 0 : undefined} aria-label={`${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}: ${money(amount)}`}><span className="chart-tooltip">{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}<strong>{money(amount)}</strong></span><i style={{ height: `${Math.max(amount / max * 100, 1)}%` }} /></div>)}</div>
      {total === 0 && <div className="chart-empty-copy"><span className="empty-chart-icon" aria-hidden="true">↗</span><strong>Your next chapter starts here</strong><span>Your income will appear as activity is recorded.</span></div>}
    </div>
    <div className="chart-axis"><span>{days[0].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span><span>{days[Math.floor(period / 2)].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span><span>Today</span></div>
  </section>
}

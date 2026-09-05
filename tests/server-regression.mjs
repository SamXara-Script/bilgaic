import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes } from 'node:crypto'

const sourcePath = resolve(process.argv[2] || fileURLToPath(new URL('../server.js', import.meta.url)))
const runDir = mkdtempSync(join(tmpdir(), 'sez-regression-'))
const dbPath = join(runDir, 'data', 'sez.sqlite')
const reportPath = join(runDir, 'results.json')
const socket = createServer()
socket.listen(0, '127.0.0.1')
await once(socket, 'listening')
const port = socket.address().port
await new Promise(resolveClose => socket.close(resolveClose))
const origin = `http://127.0.0.1:${port}`
const adminKey = randomBytes(24).toString('hex')
const child = spawn(process.execPath, [sourcePath], {
  cwd: runDir,
  env: { ...process.env, PORT: String(port), INVITE_CODES: 'REGRESSIONONLY', ADMIN_ACCESS_KEY: adminKey, NODE_ENV: 'test', COOKIE_SECURE: '0' },
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
child.stdout.on('data', chunk => { serverLog += chunk })
child.stderr.on('data', chunk => { serverLog += chunk })
const results = []
let fixtureDb
let cookieA
let cookieB
let cookieReferral
let userId

async function api(path, { method = 'GET', body, cookie, raw, headers = {} } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  })
  const text = await response.text()
  let payload
  try { payload = JSON.parse(text) } catch { payload = { raw: text } }
  return { status: response.status, payload, headers: response.headers, cookie: response.headers.get('set-cookie')?.split(';')[0] }
}

async function test(name, fn) {
  const startedAt = Date.now()
  try {
    await fn()
    results.push({ name, status: 'passed', durationMs: Date.now() - startedAt })
    console.log(`PASS ${name}`)
  } catch (error) {
    results.push({ name, status: 'failed', durationMs: Date.now() - startedAt, error: error.stack || error.message })
    console.log(`FAIL ${name}: ${error.message}`)
  }
}

function expectedStatus(result, status) {
  assert.equal(result.status, status, JSON.stringify(result.payload))
}

function balance() {
  return fixtureDb.prepare('SELECT wallet_balance AS amount FROM users WHERE id = ?').get(userId).amount
}

function financialSnapshot() {
  return JSON.stringify({
    users: fixtureDb.prepare('SELECT id, wallet_balance FROM users ORDER BY id').all(),
    transactions: fixtureDb.prepare('SELECT * FROM wallet_transactions ORDER BY id').all(),
    purchases: fixtureDb.prepare('SELECT * FROM purchases ORDER BY id').all(),
  })
}

try {
  await new Promise((resolveReady, rejectReady) => {
    const timer = setTimeout(() => rejectReady(new Error(`Server readiness timeout: ${serverLog}`)), 10000)
    const onData = () => {
      if (serverLog.includes('running at')) {
        clearTimeout(timer)
        resolveReady()
      }
    }
    child.stdout.on('data', onData)
    child.once('error', error => { clearTimeout(timer); rejectReady(error) })
    child.once('exit', code => { clearTimeout(timer); rejectReady(new Error(`Server exited (${code}): ${serverLog}`)) })
    onData()
  })
  fixtureDb = new DatabaseSync(dbPath)

  await test('Unauthenticated session is rejected', async () => {
    expectedStatus(await api('/api/session'), 401)
  })
  await test('Malformed JSON returns 400', async () => {
    expectedStatus(await api('/api/auth/register', { method: 'POST', raw: '{broken' }), 400)
  })
  await test('Invalid invite is rejected', async () => {
    expectedStatus(await api('/api/auth/register', { method: 'POST', body: { name: 'Test User', email: 'invalid@example.test', password: 'RegressionPassword123', inviteCode: 'INVALID' } }), 403)
  })
  await test('Registration creates secure session and empty wallet', async () => {
    const result = await api('/api/auth/register', { method: 'POST', body: { name: 'Regression Member', email: 'member@example.test', password: 'RegressionPassword123', inviteCode: 'REGRESSIONONLY' } })
    expectedStatus(result, 201)
    cookieA = result.cookie
    userId = result.payload.user.id
    assert.ok(cookieA)
    assert.match(result.headers.get('set-cookie'), /HttpOnly/)
    assert.match(result.headers.get('set-cookie'), /SameSite=Strict/)
    assert.equal(result.payload.user.verified, false)
    assert.equal(result.payload.wallet.balance, 0)
    assert.equal(result.payload.user.password, undefined)
    assert.equal(result.payload.user.passwordHash, undefined)
    assert.deepEqual(result.payload.purchases, [])
  })
  if (!cookieA || !userId) throw new Error('Cannot continue without registration fixture.')
  await test('Session restores the registered user', async () => {
    const result = await api('/api/session', { cookie: cookieA })
    expectedStatus(result, 200)
    assert.equal(result.payload.user.id, userId)
  })
  await test('Duplicate registration is rejected', async () => {
    expectedStatus(await api('/api/auth/register', { method: 'POST', body: { name: 'Regression Member', email: 'MEMBER@example.test', password: 'RegressionPassword123', inviteCode: 'REGRESSIONONLY' } }), 409)
  })
  await test('Wrong password is rejected', async () => {
    expectedStatus(await api('/api/auth/login', { method: 'POST', body: { email: 'member@example.test', password: 'WrongPassword123' } }), 401)
  })
  await test('Second login creates a separate session', async () => {
    const result = await api('/api/auth/login', { method: 'POST', body: { email: 'member@example.test', password: 'RegressionPassword123' } })
    expectedStatus(result, 200)
    cookieB = result.cookie
    assert.ok(cookieB)
    assert.notEqual(cookieB, cookieA)
  })
  await test('Admin summary rejects missing and wrong keys', async () => {
    expectedStatus(await api('/api/admin/summary'), 401)
    expectedStatus(await api('/api/admin/summary', { headers: { 'X-Admin-Key': 'incorrect' } }), 401)
  })
  await test('Admin summary accepts the configured key', async () => {
    expectedStatus(await api('/api/admin/summary', { headers: { 'X-Admin-Key': adminKey } }), 200)
  })
  await test('Verification requires both document uploads', async () => {
    expectedStatus(await api('/api/verification', { method: 'POST', cookie: cookieA, body: { documentType: 'id' } }), 400)
  })
  await test('Verification remains Pending and does not authorize financial actions', async () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5RkAAAAASUVORK5CYII='
    const result = await api('/api/verification', { method: 'POST', cookie: cookieA, body: {
      documentType: 'id',
      document: { name: 'test-document.png', type: 'image/png', data: `data:image/png;base64,${png}` },
      face: { name: 'test-face.png', type: 'image/png', data: `data:image/png;base64,${png}` },
    } })
    assert.ok(result.status === 201 || result.status === 202, JSON.stringify(result.payload))
    assert.equal(result.payload.user.verified, false)
    assert.equal(result.payload.verification.status, 'Pending')
    assert.equal(fixtureDb.prepare('SELECT verified FROM users WHERE id = ?').get(userId).verified, 0)
  })
  await test('Unverified purchase and withdrawal are blocked', async () => {
    fixtureDb.prepare('UPDATE users SET verified = 0 WHERE id = ?').run(userId)
    expectedStatus(await api('/api/purchases', { method: 'POST', cookie: cookieA, body: { tierId: 'starter', crypto: 'USDT' } }), 403)
    expectedStatus(await api('/api/withdrawals', { method: 'POST', cookie: cookieA, body: { amount: 10, crypto: 'USDT', address: 'TRegressionWalletAddress12345' } }), 403)
  })

  await test('Verification documents require admin access', async () => {
    expectedStatus(await api(`/api/admin/verifications/${userId}`, { cookie: cookieA }), 401)
    expectedStatus(await api(`/api/admin/verifications/${userId}`, { headers: { 'X-Admin-Key': 'wrong' } }), 401)
  })
  await test('Admin can review and approve a pending submission exactly once', async () => {
    const headers = { 'X-Admin-Key': adminKey }
    const review = await api(`/api/admin/verifications/${userId}`, { headers })
    expectedStatus(review, 200)
    assert.equal(review.headers.get('cache-control'), 'no-store')
    assert.match(review.payload.documentData, /^data:image\/png;base64,/)
    assert.match(review.payload.faceData, /^data:image\/png;base64,/)
    expectedStatus(await api(`/api/admin/verifications/${userId}`, { method: 'POST', headers, body: { status: 'Invalid', submissionId: review.payload.id } }), 400)
    expectedStatus(await api(`/api/admin/verifications/${userId}`, { method: 'POST', headers, body: { status: 'Verified', submissionId: review.payload.id + 1 } }), 409)
    expectedStatus(await api(`/api/admin/verifications/${userId}`, { method: 'POST', headers, body: { status: 'Verified', submissionId: review.payload.id } }), 200)
    assert.equal((await api('/api/session', { cookie: cookieA })).payload.user.verified, true)
    expectedStatus(await api(`/api/admin/verifications/${userId}`, { method: 'POST', headers, body: { status: 'Verified', submissionId: review.payload.id } }), 409)
  })

  // Seed only the disposable fixture DB to exercise post-approval accounting.
  fixtureDb.prepare('UPDATE users SET verified = 1, wallet_balance = 2000 WHERE id = ?').run(userId)
  await test('Referral fixture is linked to the original member', async () => {
    const member = await api('/api/session', { cookie: cookieA })
    const result = await api('/api/auth/register', { method: 'POST', body: { name: 'Regression Referral', email: 'referral@example.test', password: 'ReferralPassword123', inviteCode: member.payload.user.inviteCode } })
    expectedStatus(result, 201)
    cookieReferral = result.cookie
    fixtureDb.prepare('UPDATE users SET verified = 1 WHERE id = ?').run(result.payload.user.id)
    const referrals = await api('/api/referrals', { cookie: cookieA })
    assert.equal(referrals.payload.referrals.length, 1)
  })
  await test('Self-credit deposit is disabled with no balance, ledger, or referral change', async () => {
    const before = financialSnapshot()
    const result = await api('/api/recharges', { method: 'POST', cookie: cookieReferral || cookieA, body: { amount: 1000000, crypto: 'USDT', network: 'TRC20' } })
    expectedStatus(result, 503)
    assert.equal(financialSnapshot(), before)
  })
  fixtureDb.prepare('UPDATE users SET wallet_balance = 2000 WHERE id = ?').run(userId)
  await test('Unknown plan is rejected without debit', async () => {
    const before = financialSnapshot()
    expectedStatus(await api('/api/purchases', { method: 'POST', cookie: cookieA, body: { tierId: 'missing-plan', crypto: 'USDT' } }), 400)
    assert.equal(financialSnapshot(), before)
  })
  await test('Concurrent duplicate purchase creates one plan and one debit', async () => {
    const before = balance()
    const requests = await Promise.all([1, 2].map(() => api('/api/purchases', { method: 'POST', cookie: cookieA, body: { tierId: 'starter', crypto: 'USDT' } })))
    assert.deepEqual(requests.map(result => result.status).sort(), [201, 409])
    assert.equal(balance(), before - 300)
    assert.equal(fixtureDb.prepare('SELECT COUNT(*) AS count FROM purchases WHERE user_id = ?').get(userId).count, 1)
    assert.equal(fixtureDb.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE user_id = ? AND type = 'purchase'").get(userId).count, 1)
  })
  await test('Unaffordable plan is rejected without debit', async () => {
    const before = financialSnapshot()
    expectedStatus(await api('/api/purchases', { method: 'POST', cookie: cookieA, body: { tierId: 'vip-6', crypto: 'USDT' } }), 400)
    assert.equal(financialSnapshot(), before)
  })
  for (const amount of [true, false, null, 0, -1, 'invalid', [], {}, 1e20]) {
    await test(`Invalid withdrawal amount ${JSON.stringify(amount)} is rejected without debit`, async () => {
      const before = financialSnapshot()
      expectedStatus(await api('/api/withdrawals', { method: 'POST', cookie: cookieA, body: { amount, crypto: 'USDT', address: 'TRegressionWalletAddress12345' } }), 400)
      assert.equal(financialSnapshot(), before)
    })
  }
  await test('Excess withdrawal precision is rejected or normalized consistently', async () => {
    const before = balance()
    const countBefore = fixtureDb.prepare('SELECT COUNT(*) AS count FROM wallet_transactions').get().count
    const result = await api('/api/withdrawals', { method: 'POST', cookie: cookieA, body: { amount: '10.009', crypto: 'USDT', address: 'TRegressionWalletAddress12345' } })
    if (result.status === 400) {
      assert.equal(balance(), before)
      assert.equal(fixtureDb.prepare('SELECT COUNT(*) AS count FROM wallet_transactions').get().count, countBefore)
    } else {
      expectedStatus(result, 201)
      assert.equal(result.payload.withdrawal.amount, 10.01)
      assert.ok(Math.abs(balance() - (before - 10.01)) < 1e-8)
      const latest = fixtureDb.prepare('SELECT amount FROM wallet_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId)
      assert.equal(latest.amount, 10.01)
    }
  })
  await test('Valid decimal withdrawal uses a consistent fee and ledger debit', async () => {
    const before = balance()
    const result = await api('/api/withdrawals', { method: 'POST', cookie: cookieA, body: { amount: '100.25', crypto: 'USDT', address: 'TRegressionWalletAddress12345' } })
    expectedStatus(result, 201)
    assert.equal(result.payload.withdrawal.amount, 100.25)
    assert.equal(result.payload.withdrawal.fee, 16.04)
    assert.equal(result.payload.withdrawal.receiveAmount, 84.21)
    assert.equal(result.payload.withdrawal.status, 'Pending')
    assert.ok(Math.abs(balance() - (before - 100.25)) < 1e-8)
    const latest = fixtureDb.prepare('SELECT amount, status FROM wallet_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId)
    assert.equal(latest.amount, 100.25)
    assert.equal(latest.status, 'Pending')
  })
  await test('Overdraw and unsupported currency are rejected without debit', async () => {
    const before = financialSnapshot()
    expectedStatus(await api('/api/withdrawals', { method: 'POST', cookie: cookieA, body: { amount: 100000, crypto: 'USDT', address: 'TRegressionWalletAddress12345' } }), 400)
    expectedStatus(await api('/api/withdrawals', { method: 'POST', cookie: cookieA, body: { amount: 10, crypto: 'DOGE', address: 'TRegressionWalletAddress12345' } }), 400)
    assert.equal(financialSnapshot(), before)
  })
  await test('Password update rejects an incorrect current password', async () => {
    expectedStatus(await api('/api/security/password', { method: 'POST', cookie: cookieA, body: { currentPassword: 'IncorrectPassword123', newPassword: 'RotatedPassword123' } }), 401)
  })
  await test('Password rotation keeps this session and revokes the second session', async () => {
    expectedStatus(await api('/api/security/password', { method: 'POST', cookie: cookieA, body: { currentPassword: 'RegressionPassword123', newPassword: 'RotatedPassword123' } }), 200)
    expectedStatus(await api('/api/session', { cookie: cookieA }), 200)
    expectedStatus(await api('/api/session', { cookie: cookieB }), 401)
    expectedStatus(await api('/api/auth/login', { method: 'POST', body: { email: 'member@example.test', password: 'RegressionPassword123' } }), 401)
    expectedStatus(await api('/api/auth/login', { method: 'POST', body: { email: 'member@example.test', password: 'RotatedPassword123' } }), 200)
  })
  await test('Income history includes earnings outside the latest 40 transactions', async () => {
    const insert = fixtureDb.prepare("INSERT INTO wallet_transactions (user_id, type, amount, crypto, memo, status) VALUES (?, 'earning', 2, 'USDT', 'History fixture', 'Credited')")
    for (let index = 0; index < 45; index++) insert.run(userId)
    const session = await api('/api/session', { cookie: cookieA })
    expectedStatus(session, 200)
    assert.equal(session.payload.transactions.length, 40)
    const today = new Date().toISOString().slice(0, 10)
    const row = session.payload.incomeHistory.find(day => day.date === today)
    assert.ok(row)
    const expected = fixtureDb.prepare("SELECT ROUND(SUM(amount), 2) AS total FROM wallet_transactions WHERE user_id = ? AND date(created_at) = date('now') AND type IN ('earning', 'referral_deposit', 'referral_task') AND status IN ('Credited', 'Completed')").get(userId).total
    assert.equal(row.total, expected)
    assert.ok(row.total >= 90)
  })
  await test('Logout clears and invalidates its session', async () => {
    const result = await api('/api/auth/logout', { method: 'POST', cookie: cookieA })
    expectedStatus(result, 200)
    assert.match(result.headers.get('set-cookie'), /Max-Age=0/)
    expectedStatus(await api('/api/session', { cookie: cookieA }), 401)
  })
} catch (error) {
  results.push({ name: 'Harness setup/runtime', status: 'failed', error: error.stack || error.message })
  console.error(error.stack || error.message)
} finally {
  fixtureDb?.close()
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit')
    child.kill()
    await exited
  }
  const report = { sourcePath, runDir, dbPath, serverPid: child.pid, childStopped: child.exitCode !== null || child.signalCode !== null, passed: results.filter(result => result.status === 'passed').length, failed: results.filter(result => result.status === 'failed').length, results }
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  writeFileSync(join(runDir, 'server.log'), serverLog)
  console.log(JSON.stringify({ reportPath, dbPath, childStopped: report.childStopped, passed: report.passed, failed: report.failed }))
  if (report.failed) process.exitCode = 1
}

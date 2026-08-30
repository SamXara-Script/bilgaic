import { createServer } from 'node:http'
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

const port = Number(process.env.PORT || 8787)
const dataDir = resolve('data')
const distDir = resolve('dist')
const sessionLifetime = 7 * 24 * 60 * 60 * 1000
const defaultInviteCode = 'SEZ2026'
const configuredInviteCodes = process.env.INVITE_CODES
const bootstrapInviteCodes = new Set(String(configuredInviteCodes || defaultInviteCode).split(',').map(normalizeInviteCodeValue).filter(Boolean))
const hasConfiguredInviteCodes = Boolean(configuredInviteCodes)
const projectedMonthlyRate = 0.24
const maxJsonBodySize = 8 * 1024 * 1024
const maxUploadBytes = 3 * 1024 * 1024

const tierAmounts = [40, 90, 140, 200, 300, 500, 700, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000]
const tierIds = ['starter', 'premium', 'elite', 'royal']
const tierCatalog = Object.fromEntries(tierAmounts.map((amount, index) => {
  const id = tierIds[index] || `vip-${index + 1}`
  return [id, { id, level: `VIP ${index + 1}`, title: `Sez VIP ${index + 1}`, amount }]
}))

const allowedCryptos = new Set(['USDT', 'BTC', 'ETH'])
const allowedNetworks = new Set(['TRC20', 'ERC20', 'BEP20'])
const allowedDocumentTypes = new Set(['id', 'passport'])
const allowedDocumentMimes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
const allowedFaceMimes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
}

mkdirSync(dataDir, { recursive: true })
const db = new DatabaseSync(join(dataDir, 'sez.sqlite'))

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    verified INTEGER NOT NULL DEFAULT 0,
    invite_code TEXT UNIQUE,
    registration_invite_code TEXT,
    referred_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    wallet_id TEXT UNIQUE,
    wallet_balance REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier_id TEXT NOT NULL,
    tier_level TEXT NOT NULL,
    tier_title TEXT NOT NULL,
    amount INTEGER NOT NULL,
    crypto TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, tier_id)
  );

  CREATE TABLE IF NOT EXISTS wallet_transactions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    crypto TEXT,
    network TEXT,
    address TEXT,
    memo TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS daily_vip_earnings (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    tier_id TEXT NOT NULL,
    earning_date TEXT NOT NULL,
    amount REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(purchase_id, earning_date)
  );

  CREATE TABLE IF NOT EXISTS verification_submissions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    document_name TEXT NOT NULL,
    document_mime TEXT NOT NULL,
    document_data TEXT NOT NULL,
    face_name TEXT NOT NULL,
    face_mime TEXT NOT NULL,
    face_data TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Verified',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`)

ensureColumn('users', 'verified', 'verified INTEGER NOT NULL DEFAULT 0')
ensureColumn('users', 'invite_code', 'invite_code TEXT')
ensureColumn('users', 'registration_invite_code', 'registration_invite_code TEXT')
ensureColumn('users', 'referred_by_user_id', 'referred_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL')
ensureColumn('users', 'wallet_id', 'wallet_id TEXT')
ensureColumn('users', 'wallet_balance', 'wallet_balance REAL NOT NULL DEFAULT 0')
migrateUserAccounts()
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS users_invite_code_unique ON users(invite_code);
  CREATE UNIQUE INDEX IF NOT EXISTS users_wallet_id_unique ON users(wallet_id);
`)

const queries = {
  deleteExpiredSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  countUsers: db.prepare('SELECT COUNT(*) AS count FROM users'),
  findUserByEmail: db.prepare(`
    SELECT id, name, email, verified, invite_code AS inviteCode, wallet_id AS walletId, wallet_balance AS walletBalance, password_salt AS passwordSalt, password_hash AS passwordHash
    FROM users
    WHERE email = ?
  `),
  findUserById: db.prepare(`
    SELECT id, name, email, verified, invite_code AS inviteCode, wallet_id AS walletId, wallet_balance AS walletBalance, password_salt AS passwordSalt, password_hash AS passwordHash
    FROM users
    WHERE id = ?
  `),
  findUserByInviteCode: db.prepare('SELECT id, name, email, invite_code AS inviteCode FROM users WHERE invite_code = ?'),
  createUser: db.prepare(`
    INSERT INTO users (name, email, password_salt, password_hash, verified, invite_code, registration_invite_code, referred_by_user_id, wallet_id, wallet_balance)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateUserProfile: db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?'),
  updatePassword: db.prepare('UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?'),
  updateWalletBalance: db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?'),
  updateVerificationStatus: db.prepare('UPDATE users SET verified = ? WHERE id = ?'),
  createSession: db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
  deleteOtherSessions: db.prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?'),
  findSessionUser: db.prepare(`
    SELECT users.id, users.name, users.email, users.verified, users.invite_code AS inviteCode, users.wallet_id AS walletId, users.wallet_balance AS walletBalance
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ? AND sessions.expires_at > ?
  `),
  listPurchases: db.prepare(`
    SELECT id AS purchaseId, tier_id AS tierId, tier_level AS level, tier_title AS title, amount, crypto, created_at AS createdAt
    FROM purchases
    WHERE user_id = ?
    ORDER BY id DESC
  `),
  listAccruablePurchases: db.prepare(`
    SELECT id AS purchaseId, tier_id AS tierId, tier_level AS level, tier_title AS title, amount, crypto, created_at AS createdAt
    FROM purchases
    WHERE user_id = ?
    ORDER BY id
  `),
  createPurchase: db.prepare(`
    INSERT INTO purchases (user_id, tier_id, tier_level, tier_title, amount, crypto)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  findLastDailyVipEarning: db.prepare('SELECT MAX(earning_date) AS earningDate FROM daily_vip_earnings WHERE purchase_id = ?'),
  createDailyVipEarning: db.prepare(`
    INSERT OR IGNORE INTO daily_vip_earnings (user_id, purchase_id, tier_id, earning_date, amount)
    VALUES (?, ?, ?, ?, ?)
  `),
  listReferrals: db.prepare(`
    SELECT invited.id, invited.name, invited.email, invited.created_at AS createdAt
    FROM users AS invited
    JOIN users AS owner ON owner.id = ?
    WHERE invited.id <> owner.id
      AND (invited.referred_by_user_id = owner.id OR invited.registration_invite_code = owner.invite_code)
    ORDER BY invited.id DESC
  `),
  listWalletTransactions: db.prepare(`
    SELECT type, amount, crypto, network, address, memo, status, created_at AS createdAt
    FROM wallet_transactions
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 40
  `),
  createWalletTransaction: db.prepare(`
    INSERT INTO wallet_transactions (user_id, type, amount, crypto, network, address, memo, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  findLatestVerification: db.prepare(`
    SELECT document_type AS documentType, document_name AS documentName, face_name AS faceName, status, created_at AS createdAt
    FROM verification_submissions
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 1
  `),
  createVerificationSubmission: db.prepare(`
    INSERT INTO verification_submissions (user_id, document_type, document_name, document_mime, document_data, face_name, face_mime, face_data, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)

  if (url.pathname.startsWith('/api/')) {
    try {
      await handleApi(request, response, url)
    } catch (error) {
      const status = error.statusCode || 500
      sendJson(response, status, { error: status === 500 ? 'Unexpected server error.' : error.message })
    }
    return
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendJson(response, 405, { error: 'Method not allowed.' })
    return
  }

  serveFrontend(response, url.pathname, request.method === 'HEAD')
})

async function handleApi(request, response, url) {
  if (request.method === 'POST' && url.pathname === '/api/auth/register') {
    const body = await readBody(request)
    const name = requireText(body.name, 'Name', 2, 80)
    const email = normalizeEmail(body.email)
    const password = requirePassword(body.password)
    const invitation = requireInviteCode(body.inviteCode)

    if (queries.findUserByEmail.get(email)) throw httpError(409, 'An account already uses this email address.')

    const { salt, hash } = hashPassword(password)
    const result = queries.createUser.run(name, email, salt, hash, 0, createInviteCode(), invitation.inviteCode, invitation.inviterId, createWalletId(), 0)
    const user = queries.findUserById.get(Number(result.lastInsertRowid))
    const token = createSession(user.id)
    sendAccountPayload(response, 201, user, { 'Set-Cookie': sessionCookie(token) })
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readBody(request)
    const email = normalizeEmail(body.email)
    const password = requirePassword(body.password)
    const record = queries.findUserByEmail.get(email)

    if (!record || !verifyPassword(password, record.passwordSalt, record.passwordHash)) throw httpError(401, 'Invalid email or password.')

    const user = toPublicUser(record)
    const token = createSession(user.id)
    sendAccountPayload(response, 200, record, { 'Set-Cookie': sessionCookie(token) })
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = readCookies(request).sez_session
    if (token) queries.deleteSession.run(token)
    sendJson(response, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() })
    return
  }

  const user = requireUser(request)

  if (request.method === 'GET' && url.pathname === '/api/session') {
    sendAccountPayload(response, 200, user)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/referrals') {
    sendJson(response, 200, { inviteCode: user.inviteCode, referrals: queries.listReferrals.all(user.id).map(toPublicReferral) })
    return
  }

  if (request.method === 'PATCH' && url.pathname === '/api/profile') {
    const body = await readBody(request)
    const name = requireText(body.name, 'Name', 2, 80)
    const email = normalizeEmail(body.email)
    const existingUser = queries.findUserByEmail.get(email)

    if (existingUser && existingUser.id !== user.id) throw httpError(409, 'An account already uses this email address.')

    queries.updateUserProfile.run(name, email, user.id)
    const record = queries.findUserById.get(user.id)
    sendJson(response, 200, { user: toPublicUser(record) })
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/security/password') {
    const body = await readBody(request)
    const currentPassword = requirePassword(body.currentPassword)
    const newPassword = requirePassword(body.newPassword)
    const record = queries.findUserById.get(user.id)

    if (!record || !verifyPassword(currentPassword, record.passwordSalt, record.passwordHash)) throw httpError(401, 'Current password is incorrect.')

    const { salt, hash } = hashPassword(newPassword)
    queries.updatePassword.run(salt, hash, user.id)

    const token = readCookies(request).sez_session
    if (token) queries.deleteOtherSessions.run(user.id, token)

    sendJson(response, 200, { ok: true })
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/verification') {
    const body = await readBody(request)
    const documentType = requireVerificationDocumentType(body.documentType)
    const documentFile = requireUpload(body.document, 'ID or passport document', allowedDocumentMimes)
    const faceFile = requireUpload(body.face, 'Face photo', allowedFaceMimes)

    runInTransaction(() => {
      queries.createVerificationSubmission.run(
        user.id,
        documentType,
        documentFile.name,
        documentFile.mime,
        documentFile.data,
        faceFile.name,
        faceFile.mime,
        faceFile.data,
        'Verified',
      )
      queries.updateVerificationStatus.run(1, user.id)
    })

    const record = queries.findUserById.get(user.id)
    sendJson(response, 201, { user: toPublicUser(record), verification: toPublicVerification(queries.findLatestVerification.get(user.id)) })
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/purchases') {
    const body = await readBody(request)
    requireVerifiedUser(user)
    const tier = tierCatalog[body.tierId]
    const crypto = String(body.crypto || '').toUpperCase()
    if (!tier) throw httpError(400, 'Choose a valid investment tier.')
    if (!allowedCryptos.has(crypto)) throw httpError(400, 'Choose a supported cryptocurrency.')

    try {
      runInTransaction(() => {
        const walletOwner = queries.findUserById.get(user.id)
        if (!walletOwner || Number(walletOwner.walletBalance) < tier.amount) throw httpError(400, 'Recharge your wallet before buying this tier.')
        queries.createPurchase.run(user.id, tier.id, tier.level, tier.title, tier.amount, crypto)
        queries.updateWalletBalance.run(-tier.amount, user.id)
        queries.createWalletTransaction.run(user.id, 'purchase', tier.amount, crypto, null, null, `${tier.level} ${tier.title}`, 'Completed')
      })
    } catch (error) {
      if (String(error.message).includes('UNIQUE constraint failed')) throw httpError(409, 'This tier is already in your profile.')
      throw error
    }

    const record = queries.findUserById.get(user.id)
    sendJson(response, 201, {
      purchase: { tierId: tier.id, level: tier.level, title: tier.title, amount: tier.amount, crypto },
      wallet: toPublicWallet(record),
      transactions: queries.listWalletTransactions.all(user.id).map(toPublicWalletTransaction),
    })
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/recharges') {
    const body = await readBody(request)
    requireVerifiedUser(user)
    const amount = requireAmount(body.amount)
    const crypto = String(body.crypto || '').toUpperCase()
    const network = String(body.network || '').trim().toUpperCase()

    if (!allowedCryptos.has(crypto)) throw httpError(400, 'Choose a supported cryptocurrency.')
    if (!allowedNetworks.has(network)) throw httpError(400, 'Choose a supported network.')

    runInTransaction(() => {
      queries.updateWalletBalance.run(amount, user.id)
      queries.createWalletTransaction.run(user.id, 'recharge', amount, crypto, network, walletAddress(user, crypto, network), 'Wallet recharge', 'Credited')
    })

    const record = queries.findUserById.get(user.id)
    sendJson(response, 201, {
      recharge: { amount, crypto, network, status: 'Credited' },
      wallet: toPublicWallet(record),
      transactions: queries.listWalletTransactions.all(user.id).map(toPublicWalletTransaction),
    })
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/withdrawals') {
    const body = await readBody(request)
    requireVerifiedUser(user)
    const amount = requireAmount(body.amount)
    const crypto = String(body.crypto || '').toUpperCase()
    const address = requireText(body.address, 'Wallet address', 8, 180)

    if (!allowedCryptos.has(crypto)) throw httpError(400, 'Choose a supported cryptocurrency.')

    runInTransaction(() => {
      const walletOwner = queries.findUserById.get(user.id)
      if (!walletOwner || Number(walletOwner.walletBalance) < amount) throw httpError(400, 'Your wallet balance is too low for this withdrawal.')
      queries.updateWalletBalance.run(-amount, user.id)
      queries.createWalletTransaction.run(user.id, 'withdrawal', amount, crypto, null, address, 'Wallet withdrawal', 'Pending')
    })

    const record = queries.findUserById.get(user.id)
    sendJson(response, 201, {
      withdrawal: { amount, crypto, address, status: 'Pending' },
      wallet: toPublicWallet(record),
      transactions: queries.listWalletTransactions.all(user.id).map(toPublicWalletTransaction),
    })
    return
  }

  sendJson(response, 404, { error: 'API route not found.' })
}

function requireUser(request) {
  queries.deleteExpiredSessions.run(Date.now())
  const token = readCookies(request).sez_session
  const user = token ? queries.findSessionUser.get(token, Date.now()) : null
  if (!user) throw httpError(401, 'Please log in to continue.')
  syncVipEarnings(user.id)
  return queries.findSessionUser.get(token, Date.now()) || user
}

function requireVerifiedUser(user) {
  if (!user.verified) throw httpError(403, 'Upload your ID or passport and face photo to verify your account.')
}

function createSession(userId) {
  const token = randomBytes(32).toString('hex')
  queries.createSession.run(token, userId, Date.now() + sessionLifetime)
  return token
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') }
}

function verifyPassword(password, salt, storedHash) {
  const calculatedHash = scryptSync(password, salt, 64)
  return timingSafeEqual(calculatedHash, Buffer.from(storedHash, 'hex'))
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'Enter a valid email address.')
  return email
}

function normalizeInviteCodeValue(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '')
}

function requireInviteCode(value) {
  const inviteCode = normalizeInviteCodeValue(value)
  if (!inviteCode) throw httpError(400, 'Invite code is required to create an account.')

  const inviter = queries.findUserByInviteCode.get(inviteCode)
  if (inviter) return { inviteCode, inviterId: inviter.id }

  const userCount = Number(queries.countUsers.get().count) || 0
  const bootstrapAllowed = bootstrapInviteCodes.has(inviteCode) && (hasConfiguredInviteCodes || userCount === 0)
  if (bootstrapAllowed) return { inviteCode, inviterId: null }
  if (isMemberInviteCode(inviteCode)) return { inviteCode, inviterId: null }

  throw httpError(403, 'Invite code is invalid.')
}

function isMemberInviteCode(value) {
  return /^SEZ[0-9A-Z]{6}$/.test(value)
}

function requireAmount(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) throw httpError(400, 'Enter a valid recharge amount.')
  return amount
}

function requireVerificationDocumentType(value) {
  const documentType = String(value || '').trim().toLowerCase()
  if (!allowedDocumentTypes.has(documentType)) throw httpError(400, 'Choose ID card or passport for verification.')
  return documentType
}

function requireText(value, label, minLength, maxLength) {
  const text = String(value || '').trim()
  if (text.length < minLength || text.length > maxLength) throw httpError(400, `${label} must be between ${minLength} and ${maxLength} characters.`)
  return text
}

function requirePassword(value) {
  const password = String(value || '')
  if (password.length < 8 || password.length > 256) throw httpError(400, 'Password must be at least 8 characters.')
  return password
}

function requireUpload(value, label, allowedMimes) {
  if (!value || typeof value !== 'object') throw httpError(400, `${label} is required.`)

  const name = requireText(value.name, `${label} file name`, 1, 180)
  const mime = String(value.type || '').trim().toLowerCase()
  const data = String(value.data || '')
  const dataPrefix = `data:${mime};base64,`
  const base64 = data.startsWith(dataPrefix) ? data.slice(dataPrefix.length) : ''
  const allowedDescription = allowedMimes.has('application/pdf') ? 'PDF, JPG, PNG, or WEBP' : 'JPG, PNG, or WEBP'

  if (!allowedMimes.has(mime)) throw httpError(400, `${label} must be a ${allowedDescription} file.`)
  if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw httpError(400, `${label} upload is not valid.`)

  const bytes = Buffer.from(base64, 'base64')
  if (!bytes.length) throw httpError(400, `${label} upload is empty.`)
  if (bytes.length > maxUploadBytes) throw httpError(413, `${label} must be 3 MB or smaller.`)

  return { name, mime, data }
}

function syncVipEarnings(userId) {
  const purchases = queries.listAccruablePurchases.all(userId)
  if (!purchases.length) return queries.findUserById.get(userId)

  runInTransaction(() => {
    for (const purchase of purchases) {
      const lastEarning = queries.findLastDailyVipEarning.get(purchase.purchaseId)
      const earningDates = getMissingDailyEarningDates(purchase.createdAt, lastEarning?.earningDate)
      if (!earningDates.length) continue

      const dailyAmount = calculateDailyVipIncome(purchase.amount)
      for (const earningDate of earningDates) {
        const result = queries.createDailyVipEarning.run(userId, purchase.purchaseId, purchase.tierId, earningDate, dailyAmount)
        if (!result.changes) continue

        queries.updateWalletBalance.run(dailyAmount, userId)
        queries.createWalletTransaction.run(userId, 'earning', dailyAmount, purchase.crypto, null, null, `${purchase.level} daily income ${earningDate}`, 'Credited')
      }
    }
  })

  return queries.findUserById.get(userId)
}

function getMissingDailyEarningDates(purchaseCreatedAt, lastEarningDate) {
  const today = startOfUtcDay(new Date())
  const lastDate = lastEarningDate ? parseUtcDate(lastEarningDate) : null
  const purchaseDate = parseUtcDate(purchaseCreatedAt)
  let currentDate = addUtcDays(startOfUtcDay(lastDate || purchaseDate), 1)
  const dates = []

  while (currentDate <= today) {
    dates.push(toUtcDateKey(currentDate))
    currentDate = addUtcDays(currentDate, 1)
  }

  return dates
}

function calculateDailyVipIncome(amount) {
  return roundMoney((Number(amount) || 0) * projectedMonthlyRate / 30)
}

function roundMoney(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

function parseUtcDate(value) {
  if (!value) return new Date()
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return new Date(`${value}T00:00:00.000Z`)

  const normalized = String(value).includes('T') ? String(value) : String(value).replace(' ', 'T')
  const date = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function addUtcDays(date, days) {
  const nextDate = new Date(date)
  nextDate.setUTCDate(nextDate.getUTCDate() + days)
  return nextDate
}

function toUtcDateKey(date) {
  return date.toISOString().slice(0, 10)
}

async function readBody(request) {
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > maxJsonBodySize) throw httpError(413, 'Request is too large.')
  }
  try {
    return body ? JSON.parse(body) : {}
  } catch {
    throw httpError(400, 'Request body must be valid JSON.')
  }
}

function readCookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie || '')
      .split(';')
      .map((item) => item.trim().split('='))
      .filter(([name, value]) => name && value)
      .map(([name, value]) => [name, decodeURIComponent(value)]),
  )
}

function toPublicUser(record) {
  return { id: record.id, name: record.name, email: record.email, verified: Boolean(record.verified), inviteCode: record.inviteCode }
}

function toPublicWallet(record) {
  return { id: record.walletId, balance: Number(record.walletBalance) || 0 }
}

function toPublicReferral(record) {
  return { id: record.id, name: record.name, email: record.email, createdAt: record.createdAt }
}

function toPublicWalletTransaction(record) {
  return {
    type: record.type,
    amount: Number(record.amount) || 0,
    crypto: record.crypto,
    network: record.network,
    address: record.address,
    memo: record.memo,
    status: record.status,
    createdAt: record.createdAt,
  }
}

function toPublicVerification(record) {
  if (!record) return null
  return {
    documentType: record.documentType,
    documentName: record.documentName,
    faceName: record.faceName,
    status: record.status,
    createdAt: record.createdAt,
  }
}

function sendAccountPayload(response, status, record, extraHeaders = {}) {
  const syncedRecord = syncVipEarnings(record.id) || record
  sendJson(response, status, {
    user: toPublicUser(syncedRecord),
    wallet: toPublicWallet(syncedRecord),
    purchases: queries.listPurchases.all(syncedRecord.id),
    transactions: queries.listWalletTransactions.all(syncedRecord.id).map(toPublicWalletTransaction),
    referrals: queries.listReferrals.all(syncedRecord.id).map(toPublicReferral),
    verification: toPublicVerification(queries.findLatestVerification.get(syncedRecord.id)),
  }, extraHeaders)
}

function walletAddress(record, crypto, network) {
  return `SEZ-${record.walletId}-${crypto}-${network}`
}

function runInTransaction(callback) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = callback()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function migrateUserAccounts() {
  const users = db.prepare('SELECT id, invite_code AS inviteCode, wallet_id AS walletId FROM users ORDER BY id').all()
  const usedInviteCodes = new Set()
  const usedWalletIds = new Set()
  const updateUserAccount = db.prepare('UPDATE users SET invite_code = ?, wallet_id = ?, wallet_balance = COALESCE(wallet_balance, 0) WHERE id = ?')

  for (const user of users) {
    let inviteCode = normalizeInviteCodeValue(user.inviteCode)
    if (!inviteCode || bootstrapInviteCodes.has(inviteCode) || usedInviteCodes.has(inviteCode)) inviteCode = createInviteCode(usedInviteCodes)
    usedInviteCodes.add(inviteCode)

    let walletId = normalizeWalletIdValue(user.walletId)
    if (!walletId || usedWalletIds.has(walletId)) walletId = createWalletId(usedWalletIds)
    usedWalletIds.add(walletId)

    updateUserAccount.run(inviteCode, walletId, user.id)
  }
}

function createInviteCode(existingCodes = readInviteCodes()) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = `SEZ${randomBytes(3).toString('hex').toUpperCase()}`
    if (!existingCodes.has(code) && !bootstrapInviteCodes.has(code)) return code
  }
  throw new Error('Unable to create a unique invite code.')
}

function createWalletId(existingIds = readWalletIds()) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const walletId = `WAL${randomBytes(4).toString('hex').toUpperCase()}`
    if (!existingIds.has(walletId)) return walletId
  }
  throw new Error('Unable to create a unique wallet.')
}

function readInviteCodes() {
  return new Set(db.prepare('SELECT invite_code AS inviteCode FROM users WHERE invite_code IS NOT NULL').all().map((row) => normalizeInviteCodeValue(row.inviteCode)).filter(Boolean))
}

function readWalletIds() {
  return new Set(db.prepare('SELECT wallet_id AS walletId FROM users WHERE wallet_id IS NOT NULL').all().map((row) => normalizeWalletIdValue(row.walletId)).filter(Boolean))
}

function normalizeWalletIdValue(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '')
}

function ensureColumn(tableName, columnName, columnDefinition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all()
  if (!columns.some((column) => column.name === columnName)) db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`)
}

function sessionCookie(token) {
  return `sez_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(sessionLifetime / 1000)}`
}

function clearSessionCookie() {
  return 'sez_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0'
}

function sendJson(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders })
  response.end(JSON.stringify(payload))
}

function serveFrontend(response, pathname, headOnly) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname
  const candidate = resolve(distDir, `.${requestedPath}`)
  const filePath = candidate.startsWith(distDir) && existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(distDir, 'index.html')

  if (!existsSync(filePath)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Build the frontend with `npm run build` before starting the production server.')
    return
  }

  const content = readFileSync(filePath)
  response.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream' })
  if (!headOnly) response.end(content)
  else response.end()
}

function httpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

server.listen(port, '127.0.0.1', () => {
  console.log(`SEZ API and production server running at http://127.0.0.1:${port}`)
})

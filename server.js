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
const withdrawalFeeRate = 0.16
const payoutCycleMs = 24 * 60 * 60 * 1000
const payoutSyncIntervalMs = 60 * 1000
const rateLimitWindowMs = 15 * 60 * 1000
const rateLimitBuckets = new Map()
const secureCookieAttribute = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === '1' ? '; Secure' : ''
const adminAccessKey = process.env.ADMIN_ACCESS_KEY || ''
const referralTeams = [
  { level: 1, label: 'Team 1', taskRate: 0.06, depositRate: 0.03 },
  { level: 2, label: 'Team 2', taskRate: 0.03, depositRate: 0.02 },
  { level: 3, label: 'Team 3', taskRate: 0.02, depositRate: 0.01 },
]
const maxJsonBodySize = 8 * 1024 * 1024
const maxUploadBytes = 3 * 1024 * 1024
const supportChangeMessage = 'Contact support to change customer name or Gmail.'
const baseSecurityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'self'",
}

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
const tierCatalog = Object.fromEntries(tierPlans.map(({ amount, dailyIncome }, index) => {
  const id = tierIds[index] || `vip-${index + 1}`
  return [id, { id, level: `Maining ${index + 1}`, title: `Maining Plan ${index + 1}`, amount, dailyIncome }]
}))

const allowedCryptos = new Set(['USDT', 'BTC', 'ETH'])
const allowedNetworks = new Set(['TRC20', 'ERC20', 'BEP20'])
const rechargeAddresses = {
  USDT: {
    TRC20: 'TC8a7KAFSuBo9bfHuHRApFs678jGtMjznv',
  },
}
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
  listUserIds: db.prepare('SELECT id FROM users ORDER BY id'),
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
  findReferralParent: db.prepare(`
    SELECT COALESCE(parent.id, invite_owner.id) AS parentId
    FROM users AS child
    LEFT JOIN users AS parent ON parent.id = child.referred_by_user_id
    LEFT JOIN users AS invite_owner ON invite_owner.invite_code = child.registration_invite_code AND invite_owner.id <> child.id
    WHERE child.id = ?
  `),
  createUser: db.prepare(`
    INSERT INTO users (name, email, password_salt, password_hash, verified, invite_code, registration_invite_code, referred_by_user_id, wallet_id, wallet_balance)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
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
    INSERT INTO purchases (user_id, tier_id, tier_level, tier_title, amount, crypto, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  findLastDailyVipEarning: db.prepare('SELECT MAX(earning_date) AS earningDate FROM daily_vip_earnings WHERE purchase_id = ?'),
  createDailyVipEarning: db.prepare(`
    INSERT OR IGNORE INTO daily_vip_earnings (user_id, purchase_id, tier_id, earning_date, amount)
    VALUES (?, ?, ?, ?, ?)
  `),
  listDirectReferrals: db.prepare(`
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
  listAdminUsers: db.prepare(`
    SELECT
      u.id,
      u.name,
      u.email,
      u.verified,
      u.invite_code AS inviteCode,
      u.registration_invite_code AS registeredWithCode,
      u.referred_by_user_id AS referredByUserId,
      COALESCE(
        (SELECT parent.name FROM users AS parent WHERE parent.id = u.referred_by_user_id),
        (SELECT invite_owner.name FROM users AS invite_owner WHERE invite_owner.id <> u.id AND invite_owner.invite_code = u.registration_invite_code LIMIT 1)
      ) AS referredByName,
      u.wallet_id AS walletId,
      u.wallet_balance AS walletBalance,
      u.created_at AS createdAt,
      (SELECT document_type FROM verification_submissions AS vs WHERE vs.user_id = u.id ORDER BY vs.id DESC LIMIT 1) AS verificationDocumentType,
      (SELECT document_name FROM verification_submissions AS vs WHERE vs.user_id = u.id ORDER BY vs.id DESC LIMIT 1) AS documentName,
      (SELECT face_name FROM verification_submissions AS vs WHERE vs.user_id = u.id ORDER BY vs.id DESC LIMIT 1) AS faceName,
      (SELECT status FROM verification_submissions AS vs WHERE vs.user_id = u.id ORDER BY vs.id DESC LIMIT 1) AS verificationStatus,
      (SELECT MAX(created_at) FROM verification_submissions AS vs WHERE vs.user_id = u.id) AS lastVerificationAt,
      (SELECT COUNT(*) FROM purchases AS p WHERE p.user_id = u.id) AS purchasesCount,
      (
        SELECT COUNT(*)
        FROM users AS child
        WHERE child.id <> u.id
          AND (child.referred_by_user_id = u.id OR child.registration_invite_code = u.invite_code)
      ) AS referralCount,
      (SELECT COUNT(*) FROM wallet_transactions AS wt WHERE wt.user_id = u.id) AS transactionsCount,
      (
        SELECT COALESCE(SUM(amount), 0)
        FROM wallet_transactions AS wt
        WHERE wt.user_id = u.id
          AND wt.type IN ('earning', 'referral_deposit', 'referral_task')
      ) AS totalIncome,
      (
        SELECT COALESCE(SUM(amount), 0)
        FROM wallet_transactions AS wt
        WHERE wt.user_id = u.id
          AND wt.type = 'recharge'
      ) AS totalRecharged,
      (
        SELECT COALESCE(SUM(amount), 0)
        FROM wallet_transactions AS wt
        WHERE wt.user_id = u.id
          AND wt.type = 'withdrawal'
      ) AS totalWithdrawn,
      (
        SELECT COUNT(*)
        FROM wallet_transactions AS wt
        WHERE wt.user_id = u.id
          AND wt.type = 'withdrawal'
          AND wt.status = 'Pending'
      ) AS pendingWithdrawals,
      (SELECT MAX(created_at) FROM purchases AS p WHERE p.user_id = u.id) AS lastPurchaseAt,
      (SELECT MAX(created_at) FROM wallet_transactions AS wt WHERE wt.user_id = u.id) AS lastTransactionAt
    FROM users AS u
    ORDER BY u.id DESC
  `),
  listAdminTransactions: db.prepare(`
    SELECT
      wt.id,
      wt.user_id AS userId,
      users.name AS userName,
      users.email AS userEmail,
      wt.type,
      wt.amount,
      wt.crypto,
      wt.network,
      wt.address,
      wt.memo,
      wt.status,
      wt.created_at AS createdAt
    FROM wallet_transactions AS wt
    JOIN users ON users.id = wt.user_id
    ORDER BY wt.id DESC
    LIMIT 80
  `),
  sumIncomeTransactions: db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS totalIncome
    FROM wallet_transactions
    WHERE user_id = ?
      AND type IN ('earning', 'referral_deposit', 'referral_task')
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
      enforceRateLimit(request, url)
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

  if (request.method === 'GET' && url.pathname === '/api/admin/summary') {
    requireAdminRequest(request)
    syncAllVipEarnings()
    sendJson(response, 200, getAdminSnapshot())
    return
  }

  const user = requireUser(request)

  if (request.method === 'GET' && url.pathname === '/api/session') {
    sendAccountPayload(response, 200, user)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/referrals') {
    sendJson(response, 200, { inviteCode: user.inviteCode, referrals: listReferralTeam(user.id) })
    return
  }

  if (request.method === 'PATCH' && url.pathname === '/api/profile') {
    throw httpError(403, supportChangeMessage)
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
    if (!tier) throw httpError(400, 'Choose a valid Maining plan.')
    if (!allowedCryptos.has(crypto)) throw httpError(400, 'Choose a supported cryptocurrency.')

    try {
      const createdAt = new Date().toISOString()
      runInTransaction(() => {
        const walletOwner = queries.findUserById.get(user.id)
        if (!walletOwner || Number(walletOwner.walletBalance) < tier.amount) throw httpError(400, 'Recharge your wallet before buying this plan.')
        queries.createPurchase.run(user.id, tier.id, tier.level, tier.title, tier.amount, crypto, createdAt)
        queries.updateWalletBalance.run(-tier.amount, user.id)
        queries.createWalletTransaction.run(user.id, 'purchase', tier.amount, crypto, null, null, `${tier.level} ${tier.title}`, 'Completed')
      })
      const record = queries.findUserById.get(user.id)
      sendJson(response, 201, {
        purchase: { tierId: tier.id, level: tier.level, title: tier.title, amount: tier.amount, crypto, createdAt },
        wallet: toPublicWallet(record),
        transactions: queries.listWalletTransactions.all(user.id).map(toPublicWalletTransaction),
        totalIncome: getTotalIncome(user.id),
      })
      return
    } catch (error) {
      if (String(error.message).includes('UNIQUE constraint failed')) throw httpError(409, 'This plan is already in your profile.')
      throw error
    }
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
      creditReferralCommissions(user.id, amount, crypto, 'deposit')
    })

    const record = queries.findUserById.get(user.id)
    sendJson(response, 201, {
      recharge: { amount, crypto, network, status: 'Credited' },
      wallet: toPublicWallet(record),
      transactions: queries.listWalletTransactions.all(user.id).map(toPublicWalletTransaction),
      totalIncome: getTotalIncome(user.id),
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
    const fee = calculateWithdrawalFee(amount)
    const receiveAmount = calculateWithdrawalReceiveAmount(amount)

    runInTransaction(() => {
      const walletOwner = queries.findUserById.get(user.id)
      if (!walletOwner || Number(walletOwner.walletBalance) < amount) throw httpError(400, 'Your wallet balance is too low for this withdrawal.')
      queries.updateWalletBalance.run(-amount, user.id)
      queries.createWalletTransaction.run(user.id, 'withdrawal', amount, crypto, null, address, `Wallet withdrawal - 16% fee, ${formatServerMoney(receiveAmount)} sent`, 'Pending')
    })

    const record = queries.findUserById.get(user.id)
    sendJson(response, 201, {
      withdrawal: { amount, fee, receiveAmount, crypto, address, status: 'Pending' },
      wallet: toPublicWallet(record),
      transactions: queries.listWalletTransactions.all(user.id).map(toPublicWalletTransaction),
      totalIncome: getTotalIncome(user.id),
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

function requireAdminRequest(request) {
  if (!adminAccessKey) throw httpError(503, 'Admin API is disabled until ADMIN_ACCESS_KEY is configured.')
  const accessKey = String(request.headers['x-admin-key'] || '')
  if (!secureTextEquals(accessKey, adminAccessKey)) throw httpError(401, 'Admin access key is invalid.')
}

function secureTextEquals(value, expected) {
  const valueBuffer = Buffer.from(String(value))
  const expectedBuffer = Buffer.from(String(expected))
  return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer)
}

function getAdminSnapshot() {
  const users = queries.listAdminUsers.all().map(toAdminUser)
  const transactions = queries.listAdminTransactions.all().map(toAdminTransaction)
  const summary = {
    totalUsers: users.length,
    verifiedUsers: users.filter((user) => user.verified).length,
    walletBalance: roundMoney(users.reduce((total, user) => total + user.walletBalance, 0)),
    activePlans: users.reduce((total, user) => total + user.purchasesCount, 0),
    totalRecharged: roundMoney(users.reduce((total, user) => total + user.totalRecharged, 0)),
    totalWithdrawn: roundMoney(users.reduce((total, user) => total + user.totalWithdrawn, 0)),
    pendingWithdrawals: users.reduce((total, user) => total + user.pendingWithdrawals, 0),
  }

  return {
    sourceLabel: 'Server API',
    sourceType: 'server',
    generatedAt: new Date().toISOString(),
    summary,
    users,
    transactions,
  }
}

function toAdminUser(record) {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    verified: Boolean(record.verified),
    inviteCode: record.inviteCode,
    registeredWithCode: record.registeredWithCode,
    referredByUserId: record.referredByUserId,
    referredByName: record.referredByName,
    walletId: record.walletId,
    walletBalance: Number(record.walletBalance) || 0,
    purchasesCount: Number(record.purchasesCount) || 0,
    referralCount: Number(record.referralCount) || 0,
    transactionsCount: Number(record.transactionsCount) || 0,
    pendingWithdrawals: Number(record.pendingWithdrawals) || 0,
    totalIncome: Number(record.totalIncome) || 0,
    totalRecharged: Number(record.totalRecharged) || 0,
    totalWithdrawn: Number(record.totalWithdrawn) || 0,
    verificationStatus: record.verificationStatus || (record.verified ? 'Verified' : 'Required'),
    verificationDocumentType: record.verificationDocumentType,
    documentName: record.documentName,
    faceName: record.faceName,
    createdAt: record.createdAt,
    lastActivity: latestDateValue(record.lastTransactionAt, record.lastPurchaseAt, record.lastVerificationAt, record.createdAt),
  }
}

function toAdminTransaction(record) {
  return {
    id: record.id,
    userId: record.userId,
    userName: record.userName,
    userEmail: record.userEmail,
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

function latestDateValue(...values) {
  const timestamps = values.filter(Boolean).map((value) => new Date(value).getTime()).filter((value) => Number.isFinite(value))
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null
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

  throw httpError(403, 'Invite code is invalid.')
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
        creditReferralCommissions(userId, dailyAmount, purchase.crypto, 'task')
      }
    }
  })

  return queries.findUserById.get(userId)
}

function syncAllVipEarnings() {
  for (const user of queries.listUserIds.all()) {
    try {
      syncVipEarnings(user.id)
    } catch (error) {
      console.error(`Unable to sync Maining earnings for user ${user.id}:`, error.message)
    }
  }
}

function scheduleVipPayoutSync() {
  setTimeout(() => {
    syncAllVipEarnings()
    scheduleVipPayoutSync()
  }, payoutSyncIntervalMs)
}

function getMissingDailyEarningDates(purchaseCreatedAt, lastEarningDate) {
  const purchaseDate = parseLocalDate(purchaseCreatedAt)
  let currentPayout = lastEarningDate
    ? getPayoutMomentForDate(addLocalDays(parseLocalDate(lastEarningDate), 1), purchaseDate)
    : new Date(purchaseDate.getTime() + payoutCycleMs)
  const dates = []
  const now = new Date()

  while (currentPayout <= now) {
    dates.push(toLocalDateKey(currentPayout))
    currentPayout = addLocalDays(currentPayout, 1)
  }

  return dates
}

function getPayoutMomentForDate(date, purchaseDate) {
  const payoutMoment = startOfLocalDay(date)
  payoutMoment.setHours(purchaseDate.getHours(), purchaseDate.getMinutes(), purchaseDate.getSeconds(), purchaseDate.getMilliseconds())
  return payoutMoment
}

function listReferralTeam(userId) {
  const referrals = []
  const seen = new Set([userId])
  let currentTeamUserIds = [userId]

  for (const team of referralTeams) {
    const nextTeamUserIds = []
    for (const teamUserId of currentTeamUserIds) {
      const parent = queries.findUserById.get(teamUserId)
      for (const referral of queries.listDirectReferrals.all(teamUserId)) {
        if (seen.has(referral.id)) continue

        seen.add(referral.id)
        nextTeamUserIds.push(referral.id)
        referrals.push(toPublicReferral({ ...referral, ...team, parentId: teamUserId, parentName: parent?.name || 'You' }))
      }
    }
    currentTeamUserIds = nextTeamUserIds
  }

  return referrals
}

function creditReferralCommissions(sourceUserId, amount, crypto, kind) {
  let childUserId = sourceUserId
  const seen = new Set([sourceUserId])

  for (const team of referralTeams) {
    const parentId = Number(queries.findReferralParent.get(childUserId)?.parentId) || 0
    if (!parentId || seen.has(parentId)) break

    seen.add(parentId)
    childUserId = parentId

    const rate = kind === 'deposit' ? team.depositRate : team.taskRate
    const commission = roundMoney((Number(amount) || 0) * rate)
    if (commission <= 0) continue

    queries.updateWalletBalance.run(commission, parentId)
    queries.createWalletTransaction.run(
      parentId,
      kind === 'deposit' ? 'referral_deposit' : 'referral_task',
      commission,
      crypto,
      null,
      null,
      `${team.label} ${kind === 'deposit' ? 'deposit' : 'task'} commission`,
      'Credited',
    )
  }
}

function findTierPlanByAmount(amount) {
  const numericAmount = Number(amount) || 0
  return tierPlans.find((plan) => plan.amount === numericAmount || plan.amount - 1 === numericAmount)
}

function calculateWithdrawalFee(amount) {
  return roundMoney((Number(amount) || 0) * withdrawalFeeRate)
}

function calculateWithdrawalReceiveAmount(amount) {
  return Math.max(roundMoney((Number(amount) || 0) - calculateWithdrawalFee(amount)), 0)
}

function calculateDailyVipIncome(amount) {
  const numericAmount = Number(amount) || 0
  const plan = findTierPlanByAmount(numericAmount)
  return roundMoney(plan ? plan.dailyIncome : numericAmount * projectedMonthlyRate / 30)
}

function roundMoney(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

function formatServerMoney(amount) {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function parseLocalDate(value) {
  if (!value) return new Date()
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  const normalized = String(value).includes('T') ? String(value) : String(value).replace(' ', 'T')
  const date = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addLocalDays(date, days) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

function toLocalDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

function enforceRateLimit(request, url) {
  const now = Date.now()
  const routeType = url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/admin/') ? 'auth' : request.method === 'GET' ? 'read' : 'write'
  const maxRequests = routeType === 'auth' ? 30 : routeType === 'write' ? 120 : 600
  const key = `${routeType}:${getClientIp(request)}`
  const bucket = rateLimitBuckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + rateLimitWindowMs })
    cleanupRateLimitBuckets(now)
    return
  }

  if (bucket.count >= maxRequests) throw httpError(429, 'Too many requests. Try again later.')
  bucket.count += 1
}

function cleanupRateLimitBuckets(now) {
  if (rateLimitBuckets.size < 1000) return
  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key)
  }
}

function getClientIp(request) {
  const forwardedFor = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return forwardedFor || request.socket.remoteAddress || 'unknown'
}

function toPublicUser(record) {
  return { id: record.id, name: record.name, email: record.email, verified: Boolean(record.verified), inviteCode: record.inviteCode }
}

function toPublicWallet(record) {
  return { id: record.walletId, balance: Number(record.walletBalance) || 0 }
}

function toPublicReferral(record) {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    createdAt: record.createdAt,
    parentId: Number(record.parentId) || null,
    parentName: record.parentName || '',
    level: Number(record.level) || 1,
    team: record.label || `Team ${Number(record.level) || 1}`,
    taskRate: Number(record.taskRate) || 0,
    depositRate: Number(record.depositRate) || 0,
  }
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
    totalIncome: getTotalIncome(syncedRecord.id),
    referrals: listReferralTeam(syncedRecord.id),
    verification: toPublicVerification(queries.findLatestVerification.get(syncedRecord.id)),
  }, extraHeaders)
}

function getTotalIncome(userId) {
  return Number(queries.sumIncomeTransactions.get(userId)?.totalIncome) || 0
}

function walletAddress(record, crypto, network) {
  return rechargeAddresses[crypto]?.[network] || `SEZ-${record.walletId}-${crypto}-${network}`
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
  return `sez_session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${Math.floor(sessionLifetime / 1000)}${secureCookieAttribute}`
}

function clearSessionCookie() {
  return `sez_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secureCookieAttribute}`
}

function sendJson(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, { ...securityHeaders(), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders })
  response.end(JSON.stringify(payload))
}

function serveFrontend(response, pathname, headOnly) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname
  const candidate = resolve(distDir, `.${requestedPath}`)
  const directoryIndex = join(candidate, 'index.html')
  const safeCandidate = candidate.startsWith(distDir)
  const filePath = safeCandidate && existsSync(candidate) && statSync(candidate).isFile()
    ? candidate
    : safeCandidate && existsSync(directoryIndex) && statSync(directoryIndex).isFile()
      ? directoryIndex
      : join(distDir, 'index.html')

  if (!existsSync(filePath)) {
    response.writeHead(404, { ...securityHeaders(), 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Build the frontend with `npm run build` before starting the production server.')
    return
  }

  const content = readFileSync(filePath)
  response.writeHead(200, { ...securityHeaders(), 'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream' })
  if (!headOnly) response.end(content)
  else response.end()
}

function securityHeaders() {
  if (!secureCookieAttribute) return baseSecurityHeaders
  return { ...baseSecurityHeaders, 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' }
}

function httpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

server.listen(port, '127.0.0.1', () => {
  console.log(`SEZ API and production server running at http://127.0.0.1:${port}`)
  syncAllVipEarnings()
  scheduleVipPayoutSync()
})

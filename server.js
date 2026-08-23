import { createServer } from 'node:http'
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

const port = Number(process.env.PORT || 8787)
const dataDir = resolve('data')
const distDir = resolve('dist')
const sessionLifetime = 7 * 24 * 60 * 60 * 1000

const tierAmounts = [40, 90, 140, 200, 300, 500, 700, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000]
const tierIds = ['starter', 'premium', 'elite', 'royal']
const tierCatalog = Object.fromEntries(tierAmounts.map((amount, index) => {
  const id = tierIds[index] || `vip-${index + 1}`
  return [id, { id, level: `VIP ${index + 1}`, title: `Sez VIP ${index + 1}`, amount }]
}))

const allowedCryptos = new Set(['USDT', 'BTC', 'ETH'])
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
`)

const queries = {
  deleteExpiredSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  findUserByEmail: db.prepare('SELECT id, name, email, password_salt AS passwordSalt, password_hash AS passwordHash FROM users WHERE email = ?'),
  findUserById: db.prepare('SELECT id, name, email, password_salt AS passwordSalt, password_hash AS passwordHash FROM users WHERE id = ?'),
  createUser: db.prepare('INSERT INTO users (name, email, password_salt, password_hash) VALUES (?, ?, ?, ?)'),
  updateUserProfile: db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?'),
  updatePassword: db.prepare('UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?'),
  createSession: db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
  deleteOtherSessions: db.prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?'),
  findSessionUser: db.prepare(`
    SELECT users.id, users.name, users.email
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ? AND sessions.expires_at > ?
  `),
  listPurchases: db.prepare(`
    SELECT tier_id AS tierId, tier_level AS level, tier_title AS title, amount, crypto, created_at AS createdAt
    FROM purchases
    WHERE user_id = ?
    ORDER BY id DESC
  `),
  createPurchase: db.prepare(`
    INSERT INTO purchases (user_id, tier_id, tier_level, tier_title, amount, crypto)
    VALUES (?, ?, ?, ?, ?, ?)
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

    if (queries.findUserByEmail.get(email)) throw httpError(409, 'An account already uses this email address.')

    const { salt, hash } = hashPassword(password)
    const result = queries.createUser.run(name, email, salt, hash)
    const user = { id: Number(result.lastInsertRowid), name, email }
    const token = createSession(user.id)
    sendJson(response, 201, { user, purchases: [] }, { 'Set-Cookie': sessionCookie(token) })
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readBody(request)
    const email = normalizeEmail(body.email)
    const password = requirePassword(body.password)
    const record = queries.findUserByEmail.get(email)

    if (!record || !verifyPassword(password, record.passwordSalt, record.passwordHash)) throw httpError(401, 'Invalid email or password.')

    const user = { id: record.id, name: record.name, email: record.email }
    const token = createSession(user.id)
    sendJson(response, 200, { user, purchases: queries.listPurchases.all(user.id) }, { 'Set-Cookie': sessionCookie(token) })
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
    sendJson(response, 200, { user, purchases: queries.listPurchases.all(user.id) })
    return
  }

  if (request.method === 'PATCH' && url.pathname === '/api/profile') {
    const body = await readBody(request)
    const name = requireText(body.name, 'Name', 2, 80)
    const email = normalizeEmail(body.email)
    const existingUser = queries.findUserByEmail.get(email)

    if (existingUser && existingUser.id !== user.id) throw httpError(409, 'An account already uses this email address.')

    queries.updateUserProfile.run(name, email, user.id)
    sendJson(response, 200, { user: { id: user.id, name, email } })
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

  if (request.method === 'POST' && url.pathname === '/api/purchases') {
    const body = await readBody(request)
    const tier = tierCatalog[body.tierId]
    const crypto = String(body.crypto || '').toUpperCase()
    if (!tier) throw httpError(400, 'Choose a valid investment tier.')
    if (!allowedCryptos.has(crypto)) throw httpError(400, 'Choose a supported cryptocurrency.')

    try {
      queries.createPurchase.run(user.id, tier.id, tier.level, tier.title, tier.amount, crypto)
    } catch (error) {
      if (String(error.message).includes('UNIQUE constraint failed')) throw httpError(409, 'This tier is already in your profile.')
      throw error
    }

    sendJson(response, 201, { purchase: { tierId: tier.id, level: tier.level, title: tier.title, amount: tier.amount, crypto } })
    return
  }

  sendJson(response, 404, { error: 'API route not found.' })
}

function requireUser(request) {
  queries.deleteExpiredSessions.run(Date.now())
  const token = readCookies(request).sez_session
  const user = token ? queries.findSessionUser.get(token, Date.now()) : null
  if (!user) throw httpError(401, 'Please log in to continue.')
  return user
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

async function readBody(request) {
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > 100_000) throw httpError(413, 'Request is too large.')
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

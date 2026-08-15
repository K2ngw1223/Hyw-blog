// Hyw-blog · Cloudflare 版鉴权（Web Crypto，无 Node 依赖）
// - 密码哈希：PBKDF2-SHA256（替代 bcryptjs）
// - 登录态：HMAC-SHA256 自实现 JWT，存 HttpOnly Cookie（替代 jsonwebtoken）

import { get } from './db.js';

const COOKIE = 'ka_token';
const MAX_AGE = 7 * 24 * 60 * 60; // 7 天（秒）

function b64urlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlEncodeBytes(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return b64urlEncode(bin);
}
function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) {
  const a = [];
  for (let i = 0; i < hex.length; i += 2) a.push(parseInt(hex.substr(i, 2), 16));
  return new Uint8Array(a);
}

function getSecret(env) {
  const s = env?.JWT_SECRET || '';
  if (!s) throw new Error('缺少 JWT_SECRET（请在 wrangler.toml 的 [vars] 或 .dev.vars 配置）');
  return s;
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  const sig = await crypto.subtle.sign('HMAC', key, data);
  return new Uint8Array(sig);
}

export async function signToken(payload, env) {
  const secret = getSecret(env);
  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64urlEncode(JSON.stringify(payload));
  const data = new TextEncoder().encode(`${header}.${body}`);
  const sig = await hmac(secret, data);
  return `${header}.${body}.${b64urlEncodeBytes(sig)}`;
}

export async function verifyToken(token, env) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const secret = getSecret(env);
  const data = new TextEncoder().encode(`${header}.${body}`);
  const expected = b64urlEncodeBytes(await hmac(secret, data));
  if (expected.length !== sig.length) return null;
  let ok = true;
  for (let i = 0; i < sig.length; i++) if (sig[i] !== expected[i]) ok = false;
  if (!ok) return null;

  try {
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

const PBKDF2_ITER = 150000;

export async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    key,
    256
  );
  const hash = bytesToHex(new Uint8Array(bits));
  return `pbkdf2$${PBKDF2_ITER}$${bytesToHex(salt)}$${hash}`;
}

export async function verifyPassword(pw, stored) {
  if (typeof stored !== 'string' || !stored.startsWith('pbkdf2$')) return false;
  const [, iterStr, saltHex, hashHex] = stored.split('$');
  const salt = hexToBytes(saltHex);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: Number(iterStr), hash: 'SHA-256' },
    key,
    256
  );
  const computed = bytesToHex(new Uint8Array(bits));
  if (computed.length !== hashHex.length) return false;
  let ok = true;
  for (let i = 0; i < hashHex.length; i++) if (computed[i] !== hashHex[i]) ok = false;
  return ok;
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    bio: u.bio,
    avatarColor: u.avatar_color,
    isOwner: !!u.is_owner,
    createdAt: u.created_at,
  };
}

function cookieString(token, secure) {
  const parts = [
    `${COOKIE}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${MAX_AGE}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function issueToken(c, user) {
  return signToken({ uid: user.id, username: user.username }, c.env).then((token) => {
    const secure = new URL(c.req.url).protocol === 'https:';
    c.header('Set-Cookie', cookieString(token, secure));
  });
}

export function clearToken(c) {
  const secure = new URL(c.req.url).protocol === 'https:';
  c.header('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`);
}

function parseCookie(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

/** 解析 cookie 登录态，挂到 c.set('user')（未登录为 null，不拦截） */
export async function attachUser(c, next) {
  c.set('user', null);
  const header = c.req.header('Cookie') || '';
  const token = parseCookie(header)[COOKIE];
  if (token) {
    const payload = await verifyToken(token, c.env);
    if (payload) {
      const u = await get('SELECT * FROM users WHERE id = ?', payload.uid);
      if (u) c.set('user', u);
    }
  }
  await next();
}

export async function requireAuth(c, next) {
  if (!c.get('user')) return c.json({ error: '请先登录' }, 401);
  await next();
}

export async function requireOwner(c, next) {
  const u = c.get('user');
  if (!u) return c.json({ error: '请先登录' }, 401);
  if (!u.is_owner) return c.json({ error: '只有站长可以访问管理后台' }, 403);
  await next();
}

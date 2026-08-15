import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECRET_FILE = path.join(__dirname, '..', 'data', '.jwt-secret');

// 没有显式配置 JWT_SECRET 时，首次运行自动生成随机密钥落盘，重启后旧 token 仍有效
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, secret, 'utf8');
  return secret;
}

const SECRET = loadSecret();
const COOKIE = 'ka_token';
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export function issueToken(res, user) {
  const token = jwt.sign({ uid: user.id, username: user.username }, SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  });
}

export function clearToken(res) {
  res.clearCookie(COOKIE, { path: '/' });
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

// 解析 cookie 里的登录态挂到 req.user；未登录则为 null（不拦截）
export function attachUser(req, _res, next) {
  req.user = null;
  const token = req.cookies?.[COOKIE];
  if (token) {
    try {
      const { uid } = jwt.verify(token, SECRET);
      req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid) || null;
    } catch {
      // token 过期或伪造，按未登录处理
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '请先登录' });
  next();
}

export function requireOwner(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '请先登录' });
  if (!req.user.is_owner) return res.status(403).json({ error: '只有站长可以访问管理后台' });
  next();
}

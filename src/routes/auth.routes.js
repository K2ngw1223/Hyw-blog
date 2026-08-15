import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, flag } from '../db.js';
import { issueToken, clearToken, publicUser, requireAuth } from '../auth.js';

const router = Router();

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;
const COLORS = ['#4ade80', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#22d3ee', '#fb7185'];

router.post('/register', (req, res) => {
  if (!flag('allow_register')) {
    return res.status(403).json({ error: '站长已关闭新用户注册' });
  }

  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const displayName = String(req.body.displayName || '').trim() || username;

  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: '用户名需为 3-20 位字母、数字、下划线或短横线' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' });
  }
  if (displayName.length > 24) {
    return res.status(400).json({ error: '昵称最多 24 个字符' });
  }
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
    return res.status(409).json({ error: '这个用户名已经被占用了' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const r = db
    .prepare(
      `INSERT INTO users (username, password_hash, display_name, avatar_color, is_owner)
       VALUES (?, ?, ?, ?, 0)`
    )
    .run(username, hash, displayName, color);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(r.lastInsertRowid));
  issueToken(res, user);
  res.status(201).json({ user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: '用户名或密码不对' });
  }

  issueToken(res, user);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (_req, res) => {
  clearToken(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.patch('/me', requireAuth, (req, res) => {
  const displayName = String(req.body.displayName ?? req.user.display_name).trim();
  const bio = String(req.body.bio ?? req.user.bio).trim();
  const avatarColor = String(req.body.avatarColor ?? req.user.avatar_color).trim();

  if (!displayName || displayName.length > 24) {
    return res.status(400).json({ error: '昵称需为 1-24 个字符' });
  }
  if (bio.length > 200) {
    return res.status(400).json({ error: '简介最多 200 个字符' });
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(avatarColor)) {
    return res.status(400).json({ error: '头像颜色格式不对' });
  }

  db.prepare('UPDATE users SET display_name = ?, bio = ?, avatar_color = ? WHERE id = ?').run(
    displayName,
    bio,
    avatarColor,
    req.user.id
  );
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(user) });
});

router.post('/password', requireAuth, (req, res) => {
  const current = String(req.body.currentPassword || '');
  const next = String(req.body.newPassword || '');

  if (!bcrypt.compareSync(current, req.user.password_hash)) {
    return res.status(400).json({ error: '当前密码不对' });
  }
  if (next.length < 6) {
    return res.status(400).json({ error: '新密码至少 6 位' });
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    bcrypt.hashSync(next, 10),
    req.user.id
  );
  res.json({ ok: true });
});

export default router;

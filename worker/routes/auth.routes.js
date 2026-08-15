// Hyw-blog · 鉴权路由（Hono 版，挂载在 /api/auth）
import { Hono } from 'hono';
import { get, run, flag } from '../db.js';
import {
  hashPassword,
  verifyPassword,
  issueToken,
  clearToken,
  publicUser,
  requireAuth,
} from '../auth.js';

const router = new Hono();
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;
const COLORS = ['#4ade80', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#22d3ee', '#fb7185'];

router.post('/register', async (c) => {
  if (!(await flag('allow_register'))) {
    return c.json({ error: '站长已关闭新用户注册' }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const displayName = String(body.displayName || '').trim() || username;

  if (!USERNAME_RE.test(username)) {
    return c.json({ error: '用户名需为 3-20 位字母、数字、下划线或短横线' }, 400);
  }
  if (password.length < 6) return c.json({ error: '密码至少 6 位' }, 400);
  if (displayName.length > 24) return c.json({ error: '昵称最多 24 个字符' }, 400);
  if (await get('SELECT 1 FROM users WHERE username = ?', username)) {
    return c.json({ error: '这个用户名已经被占用了' }, 409);
  }

  const hash = await hashPassword(password);
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const r = await run(
    `INSERT INTO users (username, password_hash, display_name, avatar_color, is_owner)
     VALUES (?, ?, ?, ?, 0)`,
    username, hash, displayName, color
  );
  const user = await get('SELECT * FROM users WHERE id = ?', r.lastId);
  await issueToken(c, user);
  return c.json({ user: publicUser(user) }, 201);
});

router.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = String(body.username || '').trim();
  const password = String(body.password || '');

  const user = await get('SELECT * FROM users WHERE username = ?', username);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: '用户名或密码不对' }, 401);
  }
  await issueToken(c, user);
  return c.json({ user: publicUser(user) });
});

router.post('/logout', (c) => {
  clearToken(c);
  return c.json({ ok: true });
});

router.get('/me', (c) => {
  return c.json({ user: publicUser(c.get('user')) });
});

router.patch('/me', requireAuth, async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const displayName = String(body.displayName ?? me.display_name).trim();
  const bio = String(body.bio ?? me.bio).trim();
  const avatarColor = String(body.avatarColor ?? me.avatar_color).trim();

  if (!displayName || displayName.length > 24) return c.json({ error: '昵称需为 1-24 个字符' }, 400);
  if (bio.length > 200) return c.json({ error: '简介最多 200 个字符' }, 400);
  if (!/^#[0-9a-fA-F]{6}$/.test(avatarColor)) return c.json({ error: '头像颜色格式不对' }, 400);

  await run(
    'UPDATE users SET display_name = ?, bio = ?, avatar_color = ? WHERE id = ?',
    displayName, bio, avatarColor, me.id
  );
  const user = await get('SELECT * FROM users WHERE id = ?', me.id);
  return c.json({ user: publicUser(user) });
});

router.post('/password', requireAuth, async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const current = String(body.currentPassword || '');
  const next = String(body.newPassword || '');

  if (!(await verifyPassword(current, me.password_hash))) {
    return c.json({ error: '当前密码不对' }, 400);
  }
  if (next.length < 6) return c.json({ error: '新密码至少 6 位' }, 400);

  await run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(next), me.id);
  return c.json({ ok: true });
});

export default router;

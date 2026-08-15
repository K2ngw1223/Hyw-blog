import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, tagsOf, getSettings, saveSettings, DEFAULT_SETTINGS } from '../db.js';
import { requireOwner, publicUser } from '../auth.js';

const router = Router();
router.use(requireOwner); // 整个 /api/admin 都只对站长开放

const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

/** 生成 IN (?,?,?) 用的占位符 */
function holders(n) {
  return Array(n).fill('?').join(',');
}

function idList(body) {
  const ids = (Array.isArray(body.ids) ? body.ids : [])
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(ids)];
}

router.get('/overview', (_req, res) => {
  const stats = {
    posts: one('SELECT COUNT(*) AS n FROM posts').n,
    published: one("SELECT COUNT(*) AS n FROM posts WHERE status = 'published'").n,
    drafts: one("SELECT COUNT(*) AS n FROM posts WHERE status = 'draft'").n,
    users: one('SELECT COUNT(*) AS n FROM users').n,
    comments: one('SELECT COUNT(*) AS n FROM comments').n,
    views: one('SELECT COALESCE(SUM(views), 0) AS n FROM posts').n,
    tags: one('SELECT COUNT(*) AS n FROM tags').n,
  };

  // 最近 14 天的发文 / 评论数，缺失的日期补 0
  const days = [];
  for (let i = 13; i >= 0; i--) {
    days.push(one(`SELECT date('now', '-${i} days') AS d`).d);
  }
  const bucket = (table) => {
    const rows = all(
      `SELECT date(created_at) AS d, COUNT(*) AS n FROM ${table}
       WHERE created_at >= date('now', '-13 days') GROUP BY d`
    );
    const map = Object.fromEntries(rows.map((r) => [r.d, r.n]));
    return days.map((d) => map[d] || 0);
  };

  const trend = { days, posts: bucket('posts'), comments: bucket('comments') };

  const recentPosts = all(
    `SELECT p.id, p.title, p.status, p.views, p.created_at, u.display_name
     FROM posts p JOIN users u ON u.id = p.author_id
     ORDER BY p.created_at DESC LIMIT 6`
  ).map((r) => ({
    id: r.id, title: r.title, status: r.status, views: r.views,
    createdAt: r.created_at, author: r.display_name,
  }));

  const recentComments = all(
    `SELECT c.id, c.content, c.created_at, u.display_name, p.id AS post_id, p.title
     FROM comments c JOIN users u ON u.id = c.author_id JOIN posts p ON p.id = c.post_id
     ORDER BY c.created_at DESC LIMIT 6`
  ).map((r) => ({
    id: r.id, content: r.content, createdAt: r.created_at,
    author: r.display_name, postId: r.post_id, postTitle: r.title,
  }));

  const topPosts = all(
    `SELECT id, title, views FROM posts WHERE status = 'published'
     ORDER BY views DESC LIMIT 5`
  );

  res.json({ stats, trend, recentPosts, recentComments, topPosts });
});

router.get('/posts', (req, res) => {
  const q = String(req.query.q || '').trim();
  const authorId = Number(req.query.authorId) || 0;
  const status = ['published', 'draft'].includes(req.query.status) ? req.query.status : '';
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  const where = [];
  const params = [];
  if (q) {
    where.push('(p.title LIKE ? OR p.content LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (authorId) {
    where.push('p.author_id = ?');
    params.push(authorId);
  }
  if (status) {
    where.push('p.status = ?');
    params.push(status);
  }
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';

  const total = one(
    `SELECT COUNT(*) AS n FROM posts p JOIN users u ON u.id = p.author_id${clause}`,
    ...params
  ).n;

  const rows = all(
    `SELECT p.id, p.title, p.status, p.pinned, p.views, p.created_at, p.updated_at,
            u.id AS author_id, u.display_name, u.avatar_color, u.is_owner,
            (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
     FROM posts p JOIN users u ON u.id = p.author_id${clause}
     ORDER BY p.pinned DESC, p.created_at DESC LIMIT ? OFFSET ?`,
    ...params,
    limit,
    (page - 1) * limit
  );

  res.json({
    total,
    page,
    limit,
    posts: rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      pinned: !!r.pinned,
      views: r.views,
      commentCount: r.comment_count,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      tags: tagsOf(r.id),
      author: {
        id: r.author_id,
        displayName: r.display_name,
        avatarColor: r.avatar_color,
        isOwner: !!r.is_owner,
      },
    })),
  });
});

/** 单篇改状态 / 置顶 */
router.patch('/posts/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!one('SELECT 1 FROM posts WHERE id = ?', id)) {
    return res.status(404).json({ error: '文章不存在' });
  }
  if (req.body.status !== undefined) {
    const s = req.body.status === 'draft' ? 'draft' : 'published';
    run('UPDATE posts SET status = ? WHERE id = ?', s, id);
  }
  if (req.body.pinned !== undefined) {
    run('UPDATE posts SET pinned = ? WHERE id = ?', req.body.pinned ? 1 : 0, id);
  }
  res.json({ ok: true });
});

/** 批量：删除 / 上架 / 下架 */
router.post('/posts/bulk', (req, res) => {
  const ids = idList(req.body);
  if (!ids.length) return res.status(400).json({ error: '没有选中任何文章' });

  const action = req.body.action;
  const ph = holders(ids.length);

  if (action === 'delete') run(`DELETE FROM posts WHERE id IN (${ph})`, ...ids);
  else if (action === 'publish') run(`UPDATE posts SET status='published' WHERE id IN (${ph})`, ...ids);
  else if (action === 'draft') run(`UPDATE posts SET status='draft' WHERE id IN (${ph})`, ...ids);
  else return res.status(400).json({ error: '未知操作' });

  res.json({ ok: true, affected: ids.length });
});

router.get('/comments', (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  const where = q ? ' WHERE c.content LIKE ?' : '';
  const params = q ? [`%${q}%`] : [];

  const total = one(`SELECT COUNT(*) AS n FROM comments c${where}`, ...params).n;
  const rows = all(
    `SELECT c.id, c.content, c.created_at, u.display_name, u.avatar_color, u.is_owner,
            p.id AS post_id, p.title
     FROM comments c JOIN users u ON u.id = c.author_id JOIN posts p ON p.id = c.post_id${where}
     ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
    ...params,
    limit,
    (page - 1) * limit
  );

  res.json({
    total,
    page,
    limit,
    comments: rows.map((r) => ({
      id: r.id,
      content: r.content,
      createdAt: r.created_at,
      postId: r.post_id,
      postTitle: r.title,
      author: { displayName: r.display_name, avatarColor: r.avatar_color, isOwner: !!r.is_owner },
    })),
  });
});

router.post('/comments/bulk', (req, res) => {
  const ids = idList(req.body);
  if (!ids.length) return res.status(400).json({ error: '没有选中任何评论' });
  if (req.body.action !== 'delete') return res.status(400).json({ error: '未知操作' });

  run(`DELETE FROM comments WHERE id IN (${holders(ids.length)})`, ...ids);
  res.json({ ok: true, affected: ids.length });
});

router.get('/users', (_req, res) => {
  const rows = all(
    `SELECT u.*,
            (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id)    AS post_count,
            (SELECT COUNT(*) FROM comments c WHERE c.author_id = u.id) AS comment_count
     FROM users u ORDER BY u.is_owner DESC, u.created_at ASC`
  );
  res.json({
    users: rows.map((u) => ({
      ...publicUser(u),
      postCount: u.post_count,
      commentCount: u.comment_count,
    })),
  });
});

function ownerCount() {
  return one('SELECT COUNT(*) AS n FROM users WHERE is_owner = 1').n;
}

/** 改昵称 / 简介 / 站长身份 */
router.patch('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const target = one('SELECT * FROM users WHERE id = ?', id);
  if (!target) return res.status(404).json({ error: '用户不存在' });

  if (req.body.isOwner !== undefined) {
    const next = req.body.isOwner ? 1 : 0;
    if (!next && target.is_owner && ownerCount() <= 1) {
      return res.status(400).json({ error: '至少要保留一个站长' });
    }
    run('UPDATE users SET is_owner = ? WHERE id = ?', next, id);
  }
  if (typeof req.body.displayName === 'string') {
    const name = req.body.displayName.trim();
    if (!name || name.length > 24) return res.status(400).json({ error: '昵称需为 1-24 个字符' });
    run('UPDATE users SET display_name = ? WHERE id = ?', name, id);
  }
  if (typeof req.body.bio === 'string') {
    run('UPDATE users SET bio = ? WHERE id = ?', req.body.bio.trim().slice(0, 200), id);
  }

  res.json({ user: publicUser(one('SELECT * FROM users WHERE id = ?', id)) });
});

/** 站长强制重置某人的密码 */
router.post('/users/:id/password', (req, res) => {
  const id = Number(req.params.id);
  if (!one('SELECT 1 FROM users WHERE id = ?', id)) {
    return res.status(404).json({ error: '用户不存在' });
  }
  const pwd = String(req.body.newPassword || '');
  if (pwd.length < 6) return res.status(400).json({ error: '密码至少 6 位' });

  run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(pwd, 10), id);
  res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: '不能删除自己的账号' });

  const target = one('SELECT * FROM users WHERE id = ?', id);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  if (target.is_owner && ownerCount() <= 1) {
    return res.status(400).json({ error: '至少要保留一个站长' });
  }

  // 外键 ON DELETE CASCADE 会连带清掉他的文章和评论
  run('DELETE FROM users WHERE id = ?', id);
  res.json({ ok: true });
});

router.get('/tags', (_req, res) => {
  const rows = all(
    `SELECT t.id, t.name, COUNT(pt.post_id) AS count
     FROM tags t LEFT JOIN post_tags pt ON pt.tag_id = t.id
     GROUP BY t.id ORDER BY count DESC, t.name ASC`
  );
  res.json({ tags: rows });
});

/** 重命名；改成已存在的名字即视为合并 */
router.patch('/tags/:id', (req, res) => {
  const id = Number(req.params.id);
  const tag = one('SELECT * FROM tags WHERE id = ?', id);
  if (!tag) return res.status(404).json({ error: '标签不存在' });

  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: '标签名不能为空' });
  if (name.length > 20) return res.status(400).json({ error: '标签名最多 20 个字符' });
  if (name === tag.name) return res.json({ ok: true, merged: false });

  const exist = one('SELECT * FROM tags WHERE name = ?', name);
  if (exist) {
    // 合并：把旧标签的关联迁到目标标签，再删掉旧标签
    run(
      'INSERT OR IGNORE INTO post_tags (post_id, tag_id) SELECT post_id, ? FROM post_tags WHERE tag_id = ?',
      exist.id,
      id
    );
    run('DELETE FROM tags WHERE id = ?', id);
    return res.json({ ok: true, merged: true });
  }

  run('UPDATE tags SET name = ? WHERE id = ?', name, id);
  res.json({ ok: true, merged: false });
});

router.delete('/tags/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!one('SELECT 1 FROM tags WHERE id = ?', id)) {
    return res.status(404).json({ error: '标签不存在' });
  }
  run('DELETE FROM tags WHERE id = ?', id); // post_tags 级联清理
  res.json({ ok: true });
});

/** 清理没有任何文章关联的孤立标签 */
router.post('/tags/prune', (_req, res) => {
  const r = run(
    'DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM post_tags)'
  );
  res.json({ ok: true, removed: Number(r.changes) });
});

router.get('/settings', (_req, res) => {
  res.json({ settings: getSettings(), defaults: DEFAULT_SETTINGS });
});

router.put('/settings', (req, res) => {
  const patch = req.body?.settings || {};

  const size = parseInt(patch.page_size, 10);
  if (patch.page_size !== undefined && (!Number.isInteger(size) || size < 1 || size > 50)) {
    return res.status(400).json({ error: '每页文章数需在 1-50 之间' });
  }
  if (patch.site_title !== undefined && !String(patch.site_title).trim()) {
    return res.status(400).json({ error: '站点标题不能为空' });
  }

  res.json({ settings: saveSettings(patch) });
});

router.get('/export', (_req, res) => {
  const dump = {
    exportedAt: new Date().toISOString(),
    settings: getSettings(),
    users: all('SELECT id, username, display_name, bio, avatar_color, is_owner, created_at FROM users'),
    posts: all('SELECT * FROM posts').map((p) => ({ ...p, tags: tagsOf(p.id) })),
    comments: all('SELECT * FROM comments'),
  };
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="hyw-blog-backup-${new Date().toISOString().slice(0, 10)}.json"`
  );
  res.type('application/json').send(JSON.stringify(dump, null, 2));
});

export default router;

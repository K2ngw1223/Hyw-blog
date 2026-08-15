// Hyw-blog · 管理后台路由（Hono 版，挂载在 /api/admin，仅站长可访问）
import { Hono } from 'hono';
import { get, all, run, tagsOf, getSettings, saveSettings, DEFAULT_SETTINGS } from '../db.js';
import { requireOwner, publicUser, hashPassword } from '../auth.js';

const router = new Hono();
router.use('*', requireOwner); // 整个 /api/admin 都只对站长开放

function holders(n) {
  return Array(n).fill('?').join(',');
}
function idList(body) {
  const ids = (Array.isArray(body.ids) ? body.ids : [])
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(ids)];
}

router.get('/overview', async (c) => {
  const stats = {
    posts: (await get("SELECT COUNT(*) AS n FROM posts")).n,
    published: (await get("SELECT COUNT(*) AS n FROM posts WHERE status = 'published'")).n,
    drafts: (await get("SELECT COUNT(*) AS n FROM posts WHERE status = 'draft'")).n,
    users: (await get('SELECT COUNT(*) AS n FROM users')).n,
    comments: (await get('SELECT COUNT(*) AS n FROM comments')).n,
    views: (await get('SELECT COALESCE(SUM(views), 0) AS n FROM posts')).n,
    tags: (await get('SELECT COUNT(*) AS n FROM tags')).n,
  };

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = await get(`SELECT date('now', '-${i} days') AS d`);
    days.push(d.d);
  }
  const bucket = async (table) => {
    const rows = await all(
      `SELECT date(created_at) AS d, COUNT(*) AS n FROM ${table}
       WHERE created_at >= date('now', '-13 days') GROUP BY d`
    );
    const map = Object.fromEntries(rows.map((r) => [r.d, r.n]));
    return days.map((d) => map[d] || 0);
  };
  const trend = { days, posts: await bucket('posts'), comments: await bucket('comments') };

  const recentPosts = (await all(
    `SELECT p.id, p.title, p.status, p.views, p.created_at, u.display_name
     FROM posts p JOIN users u ON u.id = p.author_id
     ORDER BY p.created_at DESC LIMIT 6`
  )).map((r) => ({
    id: r.id, title: r.title, status: r.status, views: r.views,
    createdAt: r.created_at, author: r.display_name,
  }));

  const recentComments = (await all(
    `SELECT c.id, c.content, c.created_at, u.display_name, p.id AS post_id, p.title
     FROM comments c JOIN users u ON u.id = c.author_id JOIN posts p ON p.id = c.post_id
     ORDER BY c.created_at DESC LIMIT 6`
  )).map((r) => ({
    id: r.id, content: r.content, createdAt: r.created_at,
    author: r.display_name, postId: r.post_id, postTitle: r.title,
  }));

  const topPosts = await all(
    `SELECT id, title, views FROM posts WHERE status = 'published' ORDER BY views DESC LIMIT 5`
  );

  return c.json({ stats, trend, recentPosts, recentComments, topPosts });
});

router.get('/posts', async (c) => {
  const q = c.req.query();
  const search = String(q.q || '').trim();
  const authorId = Number(q.authorId) || 0;
  const status = ['published', 'draft'].includes(q.status) ? q.status : '';
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 20, 1), 100);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);

  const where = [];
  const params = [];
  if (search) {
    where.push('(p.title LIKE ? OR p.content LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
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

  const total = (await get(
    `SELECT COUNT(*) AS n FROM posts p JOIN users u ON u.id = p.author_id${clause}`,
    ...params
  )).n;

  const rows = await all(
    `SELECT p.id, p.title, p.status, p.pinned, p.views, p.created_at, p.updated_at,
            u.id AS author_id, u.display_name, u.avatar_color, u.is_owner,
            (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
     FROM posts p JOIN users u ON u.id = p.author_id${clause}
     ORDER BY p.pinned DESC, p.created_at DESC LIMIT ? OFFSET ?`,
    ...params,
    limit,
    (page - 1) * limit
  );

  return c.json({
    total,
    page,
    limit,
    posts: await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        pinned: !!r.pinned,
        views: r.views,
        commentCount: r.comment_count,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        tags: await tagsOf(r.id),
        author: {
          id: r.author_id,
          displayName: r.display_name,
          avatarColor: r.avatar_color,
          isOwner: !!r.is_owner,
        },
      }))
    ),
  });
});

router.patch('/posts/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!(await get('SELECT 1 FROM posts WHERE id = ?', id))) {
    return c.json({ error: '文章不存在' }, 404);
  }
  const body = await c.req.json().catch(() => ({}));
  if (body.status !== undefined) {
    const s = body.status === 'draft' ? 'draft' : 'published';
    await run('UPDATE posts SET status = ? WHERE id = ?', s, id);
  }
  if (body.pinned !== undefined) {
    await run('UPDATE posts SET pinned = ? WHERE id = ?', body.pinned ? 1 : 0, id);
  }
  return c.json({ ok: true });
});

router.post('/posts/bulk', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ids = idList(body);
  if (!ids.length) return c.json({ error: '没有选中任何文章' }, 400);

  const action = body.action;
  const ph = holders(ids.length);
  if (action === 'delete') await run(`DELETE FROM posts WHERE id IN (${ph})`, ...ids);
  else if (action === 'publish') await run(`UPDATE posts SET status='published' WHERE id IN (${ph})`, ...ids);
  else if (action === 'draft') await run(`UPDATE posts SET status='draft' WHERE id IN (${ph})`, ...ids);
  else return c.json({ error: '未知操作' }, 400);

  return c.json({ ok: true, affected: ids.length });
});

router.get('/comments', async (c) => {
  const q = c.req.query();
  const search = String(q.q || '').trim();
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 30, 1), 100);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);

  const where = search ? ' WHERE c.content LIKE ?' : '';
  const params = search ? [`%${search}%`] : [];

  const total = (await get(`SELECT COUNT(*) AS n FROM comments c${where}`, ...params)).n;
  const rows = await all(
    `SELECT c.id, c.content, c.created_at, u.display_name, u.avatar_color, u.is_owner,
            p.id AS post_id, p.title
     FROM comments c JOIN users u ON u.id = c.author_id JOIN posts p ON p.id = c.post_id${where}
     ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
    ...params,
    limit,
    (page - 1) * limit
  );

  return c.json({
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

router.post('/comments/bulk', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ids = idList(body);
  if (!ids.length) return c.json({ error: '没有选中任何评论' }, 400);
  if (body.action !== 'delete') return c.json({ error: '未知操作' }, 400);

  await run(`DELETE FROM comments WHERE id IN (${holders(ids.length)})`, ...ids);
  return c.json({ ok: true, affected: ids.length });
});

router.get('/users', async (c) => {
  const rows = await all(
    `SELECT u.*,
            (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id)    AS post_count,
            (SELECT COUNT(*) FROM comments c WHERE c.author_id = u.id) AS comment_count
     FROM users u ORDER BY u.is_owner DESC, u.created_at ASC`
  );
  return c.json({
    users: rows.map((u) => ({
      ...publicUser(u),
      postCount: u.post_count,
      commentCount: u.comment_count,
    })),
  });
});

async function ownerCount() {
  return (await get('SELECT COUNT(*) AS n FROM users WHERE is_owner = 1')).n;
}

router.patch('/users/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const target = await get('SELECT * FROM users WHERE id = ?', id);
  if (!target) return c.json({ error: '用户不存在' }, 404);

  const body = await c.req.json().catch(() => ({}));

  if (body.isOwner !== undefined) {
    const next = body.isOwner ? 1 : 0;
    if (!next && target.is_owner && (await ownerCount()) <= 1) {
      return c.json({ error: '至少要保留一个站长' }, 400);
    }
    await run('UPDATE users SET is_owner = ? WHERE id = ?', next, id);
  }
  if (typeof body.displayName === 'string') {
    const name = body.displayName.trim();
    if (!name || name.length > 24) return c.json({ error: '昵称需为 1-24 个字符' }, 400);
    await run('UPDATE users SET display_name = ? WHERE id = ?', name, id);
  }
  if (typeof body.bio === 'string') {
    await run('UPDATE users SET bio = ? WHERE id = ?', body.bio.trim().slice(0, 200), id);
  }

  return c.json({ user: publicUser(await get('SELECT * FROM users WHERE id = ?', id)) });
});

router.post('/users/:id/password', async (c) => {
  const id = Number(c.req.param('id'));
  if (!(await get('SELECT 1 FROM users WHERE id = ?', id))) {
    return c.json({ error: '用户不存在' }, 404);
  }
  const body = await c.req.json().catch(() => ({}));
  const pwd = String(body.newPassword || '');
  if (pwd.length < 6) return c.json({ error: '密码至少 6 位' }, 400);

  await run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(pwd), id);
  return c.json({ ok: true });
});

router.delete('/users/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (id === c.get('user').id) return c.json({ error: '不能删除自己的账号' }, 400);

  const target = await get('SELECT * FROM users WHERE id = ?', id);
  if (!target) return c.json({ error: '用户不存在' }, 404);
  if (target.is_owner && (await ownerCount()) <= 1) {
    return c.json({ error: '至少要保留一个站长' }, 400);
  }

  await run('DELETE FROM users WHERE id = ?', id);
  return c.json({ ok: true });
});

router.get('/tags', async (c) => {
  const rows = await all(
    `SELECT t.id, t.name, COUNT(pt.post_id) AS count
     FROM tags t LEFT JOIN post_tags pt ON pt.tag_id = t.id
     GROUP BY t.id ORDER BY count DESC, t.name ASC`
  );
  return c.json({ tags: rows });
});

router.patch('/tags/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const tag = await get('SELECT * FROM tags WHERE id = ?', id);
  if (!tag) return c.json({ error: '标签不存在' }, 404);

  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  if (!name) return c.json({ error: '标签名不能为空' }, 400);
  if (name.length > 20) return c.json({ error: '标签名最多 20 个字符' }, 400);
  if (name === tag.name) return c.json({ ok: true, merged: false });

  const exist = await get('SELECT * FROM tags WHERE name = ?', name);
  if (exist) {
    await run(
      'INSERT OR IGNORE INTO post_tags (post_id, tag_id) SELECT post_id, ? FROM post_tags WHERE tag_id = ?',
      exist.id,
      id
    );
    await run('DELETE FROM tags WHERE id = ?', id);
    return c.json({ ok: true, merged: true });
  }

  await run('UPDATE tags SET name = ? WHERE id = ?', name, id);
  return c.json({ ok: true, merged: false });
});

router.delete('/tags/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!(await get('SELECT 1 FROM tags WHERE id = ?', id))) {
    return c.json({ error: '标签不存在' }, 404);
  }
  await run('DELETE FROM tags WHERE id = ?', id);
  return c.json({ ok: true });
});

router.post('/tags/prune', async (c) => {
  const r = await run('DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM post_tags)');
  return c.json({ ok: true, removed: r.changes });
});

router.get('/settings', async (c) => {
  return c.json({ settings: await getSettings(), defaults: DEFAULT_SETTINGS });
});

router.put('/settings', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const patch = body?.settings || {};

  const size = parseInt(patch.page_size, 10);
  if (patch.page_size !== undefined && (!Number.isInteger(size) || size < 1 || size > 50)) {
    return c.json({ error: '每页文章数需在 1-50 之间' }, 400);
  }
  if (patch.site_title !== undefined && !String(patch.site_title).trim()) {
    return c.json({ error: '站点标题不能为空' }, 400);
  }

  return c.json({ settings: await saveSettings(patch) });
});

router.get('/export', async (c) => {
  const dump = {
    exportedAt: new Date().toISOString(),
    settings: await getSettings(),
    users: await all('SELECT id, username, display_name, bio, avatar_color, is_owner, created_at FROM users'),
    posts: await Promise.all(
      (await all('SELECT * FROM posts')).map(async (p) => ({ ...p, tags: await tagsOf(p.id) }))
    ),
    comments: await all('SELECT * FROM comments'),
  };
  const filename = `hyw-blog-backup-${new Date().toISOString().slice(0, 10)}.json`;
  return c.body(JSON.stringify(dump, null, 2), 200, {
    'Content-Type': 'application/json',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
});

export default router;

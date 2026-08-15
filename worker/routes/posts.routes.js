// Hyw-blog · 文章 / 评论 / 站点 路由（Hono 版，挂载在 /api）
import { Hono } from 'hono';
import { get, all, run, flag, getSettings, tagsOf, setTags } from '../db.js';
import { requireAuth, publicUser } from '../auth.js';
import { renderMarkdown, autoSummary } from '../../src/markdown.js';

const router = new Hono();

const LIST_SELECT = `
  SELECT p.id, p.title, p.summary, p.cover, p.views, p.status, p.pinned,
         p.created_at, p.updated_at,
         u.id AS author_id, u.username, u.display_name, u.avatar_color, u.is_owner,
         (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
  FROM posts p JOIN users u ON u.id = p.author_id
`;

async function shapePost(row) {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    cover: row.cover,
    views: row.views,
    status: row.status,
    pinned: !!row.pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    commentCount: row.comment_count ?? 0,
    tags: await tagsOf(row.id),
    author: {
      id: row.author_id,
      username: row.username,
      displayName: row.display_name,
      avatarColor: row.avatar_color,
      isOwner: !!row.is_owner,
    },
  };
}

function canEdit(user, post) {
  if (!user) return false;
  return user.id === post.author_id || !!user.is_owner;
}

router.get('/site', async (c) => {
  const owner = await get("SELECT * FROM users WHERE is_owner = 1 ORDER BY id LIMIT 1");
  const pub = "status = 'published'";
  const stats = {
    posts: (await get(`SELECT COUNT(*) AS n FROM posts WHERE ${pub}`)).n,
    ownerPosts: owner
      ? (await get(`SELECT COUNT(*) AS n FROM posts WHERE author_id = ? AND ${pub}`, owner.id)).n
      : 0,
    users: (await get('SELECT COUNT(*) AS n FROM users')).n,
    comments: (await get('SELECT COUNT(*) AS n FROM comments')).n,
  };
  return c.json({ owner: publicUser(owner), stats, settings: await getSettings() });
});

router.get('/tags', async (c) => {
  const rows = await all(
    `SELECT t.name, COUNT(pt.post_id) AS count
     FROM tags t JOIN post_tags pt ON pt.tag_id = t.id
     GROUP BY t.id ORDER BY count DESC, t.name ASC`
  );
  return c.json({ tags: rows });
});

router.get('/posts', async (c) => {
  const q = c.req.query();
  const scope = ['owner', 'community', 'all'].includes(q.scope) ? q.scope : 'all';
  const tag = String(q.tag || '').trim();
  const search = String(q.q || '').trim();
  const author = String(q.author || '').trim();
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 10, 1), 50);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);

  const where = [];
  const params = [];

  const viewingSelf = author && c.get('user') && author === c.get('user').username;
  if (!c.get('user')?.is_owner && !viewingSelf) where.push("p.status = 'published'");

  if (scope === 'owner') where.push('u.is_owner = 1');
  if (scope === 'community') where.push('u.is_owner = 0');
  if (author) {
    where.push('u.username = ?');
    params.push(author);
  }
  if (tag) {
    where.push(
      'p.id IN (SELECT pt.post_id FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE t.name = ?)'
    );
    params.push(tag);
  }
  if (search) {
    where.push('(p.title LIKE ? OR p.summary LIKE ? OR p.content LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const total = (await get(
    `SELECT COUNT(*) AS n FROM posts p JOIN users u ON u.id = p.author_id${clause}`,
    ...params
  )).n;

  const rows = await all(
    `${LIST_SELECT}${clause} ORDER BY p.pinned DESC, p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`,
    ...params,
    limit,
    (page - 1) * limit
  );

  return c.json({
    posts: await Promise.all(rows.map(shapePost)),
    total,
    page,
    limit,
    hasMore: page * limit < total,
  });
});

router.get('/posts/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const row = await get(`${LIST_SELECT} WHERE p.id = ?`, id);
  if (!row) return c.json({ error: '文章不存在' }, 404);

  const editable = canEdit(c.get('user'), row);
  if (row.status !== 'published' && !editable) {
    return c.json({ error: '文章不存在' }, 404);
  }

  if (row.status === 'published') {
    await run('UPDATE posts SET views = views + 1 WHERE id = ?', id);
  }
  const raw = (await get('SELECT content FROM posts WHERE id = ?', id)).content;

  const prev = await get(
    `SELECT id, title FROM posts WHERE created_at < ? AND status = 'published'
     ORDER BY created_at DESC LIMIT 1`,
    row.created_at
  );
  const next = await get(
    `SELECT id, title FROM posts WHERE created_at > ? AND status = 'published'
     ORDER BY created_at ASC LIMIT 1`,
    row.created_at
  );

  return c.json({
    post: {
      ...(await shapePost(row)),
      views: row.views + (row.status === 'published' ? 1 : 0),
      content: raw,
      html: renderMarkdown(raw),
      canEdit: editable,
    },
    prev: prev || null,
    next: next || null,
  });
});

function validate(body) {
  const title = String(body.title || '').trim();
  const content = String(body.content || '').trim();
  if (!title) return { error: '标题不能为空' };
  if (title.length > 120) return { error: '标题最多 120 个字符' };
  if (!content) return { error: '正文不能为空' };
  if (content.length > 100_000) return { error: '正文太长了' };

  const cover = String(body.cover || '').trim();
  if (cover && !/^\/uploads\/[\w.-]+$/.test(cover) && !/^https?:\/\//.test(cover)) {
    return { error: '封面图地址不合法' };
  }
  const summary = String(body.summary || '').trim().slice(0, 200) || autoSummary(content);
  const tags = Array.isArray(body.tags) ? body.tags : [];
  const status = body.status === 'draft' ? 'draft' : 'published';
  return { title, content, cover, summary, tags, status };
}

router.post('/posts', requireAuth, async (c) => {
  if (!c.get('user').is_owner && !(await flag('allow_community_post'))) {
    return c.json({ error: '站长暂时关闭了社区投稿' }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const v = validate(body);
  if (v.error) return c.json({ error: v.error }, 400);

  const r = await run(
    `INSERT INTO posts (author_id, title, summary, content, cover, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    c.get('user').id, v.title, v.summary, v.content, v.cover, v.status
  );
  const id = r.lastId;
  await setTags(id, v.tags);
  return c.json({ id, status: v.status }, 201);
});

router.put('/posts/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const post = await get('SELECT * FROM posts WHERE id = ?', id);
  if (!post) return c.json({ error: '文章不存在' }, 404);
  if (!canEdit(c.get('user'), post)) return c.json({ error: '不能编辑别人的文章' }, 403);

  const v = validate(await c.req.json().catch(() => ({})));
  if (v.error) return c.json({ error: v.error }, 400);

  await run(
    `UPDATE posts SET title = ?, summary = ?, content = ?, cover = ?, status = ?,
            updated_at = datetime('now')
     WHERE id = ?`,
    v.title, v.summary, v.content, v.cover, v.status, id
  );
  await setTags(id, v.tags);
  return c.json({ id, status: v.status });
});

router.delete('/posts/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const post = await get('SELECT * FROM posts WHERE id = ?', id);
  if (!post) return c.json({ error: '文章不存在' }, 404);
  if (!canEdit(c.get('user'), post)) return c.json({ error: '不能删除别人的文章' }, 403);

  await run('DELETE FROM posts WHERE id = ?', id);
  return c.json({ ok: true });
});

// 编辑器实时预览：服务端渲染，与最终展示一致
router.post('/render', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json({ html: renderMarkdown(String(body.content || '').slice(0, 100_000)) });
});

router.get('/posts/:id/comments', async (c) => {
  const postId = Number(c.req.param('id'));
  const rows = await all(
    `SELECT c.id, c.content, c.created_at, u.id AS author_id, u.username,
            u.display_name, u.avatar_color, u.is_owner
     FROM comments c JOIN users u ON u.id = c.author_id
     WHERE c.post_id = ? ORDER BY c.created_at ASC`,
    postId
  );
  const me = c.get('user');
  const post = await get('SELECT author_id FROM posts WHERE id = ?', postId);

  return c.json({
    comments: rows.map((cm) => ({
      id: cm.id,
      content: cm.content,
      createdAt: cm.created_at,
      canDelete: !!me && (me.id === cm.author_id || me.id === post?.author_id || !!me.is_owner),
      author: {
        id: cm.author_id,
        username: cm.username,
        displayName: cm.display_name,
        avatarColor: cm.avatar_color,
        isOwner: !!cm.is_owner,
      },
    })),
  });
});

router.post('/posts/:id/comments', requireAuth, async (c) => {
  if (!(await flag('allow_comment'))) return c.json({ error: '站长已关闭评论功能' }, 403);

  const postId = Number(c.req.param('id'));
  if (!(await get('SELECT 1 FROM posts WHERE id = ?', postId))) {
    return c.json({ error: '文章不存在' }, 404);
  }
  const body = await c.req.json().catch(() => ({}));
  const content = String(body.content || '').trim();
  if (!content) return c.json({ error: '评论不能为空' }, 400);
  if (content.length > 1000) return c.json({ error: '评论最多 1000 个字符' }, 400);

  await run('INSERT INTO comments (post_id, author_id, content) VALUES (?, ?, ?)', postId, c.get('user').id, content);
  return c.json({ ok: true }, 201);
});

router.delete('/comments/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const cm = await get('SELECT * FROM comments WHERE id = ?', id);
  if (!cm) return c.json({ error: '评论不存在' }, 404);

  const post = await get('SELECT author_id FROM posts WHERE id = ?', cm.post_id);
  const me = c.get('user');
  const allowed = me.id === cm.author_id || me.id === post?.author_id || me.is_owner;
  if (!allowed) return c.json({ error: '没有权限删除这条评论' }, 403);

  await run('DELETE FROM comments WHERE id = ?', id);
  return c.json({ ok: true });
});

router.get('/users/:username', async (c) => {
  const u = await get('SELECT * FROM users WHERE username = ?', c.req.param('username'));
  if (!u) return c.json({ error: '用户不存在' }, 404);
  const count = (await get('SELECT COUNT(*) AS n FROM posts WHERE author_id = ?', u.id)).n;
  return c.json({ user: { ...publicUser(u), postCount: count } });
});

export default router;

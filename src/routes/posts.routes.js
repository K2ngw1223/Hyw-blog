import { Router } from 'express';
import { db, tagsOf, setTags, getSettings, flag } from '../db.js';
import { requireAuth, publicUser } from '../auth.js';
import { renderMarkdown, autoSummary } from '../markdown.js';

const router = Router();

const LIST_SELECT = `
  SELECT p.id, p.title, p.summary, p.cover, p.views, p.status, p.pinned,
         p.created_at, p.updated_at,
         u.id AS author_id, u.username, u.display_name, u.avatar_color, u.is_owner,
         (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
  FROM posts p JOIN users u ON u.id = p.author_id
`;

function shapePost(row) {
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
    tags: tagsOf(row.id),
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

router.get('/site', (_req, res) => {
  const owner = db.prepare('SELECT * FROM users WHERE is_owner = 1 ORDER BY id LIMIT 1').get();
  const pub = "status = 'published'";
  const stats = {
    posts: db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE ${pub}`).get().n,
    ownerPosts: owner
      ? db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE author_id = ? AND ${pub}`).get(owner.id).n
      : 0,
    users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
    comments: db.prepare('SELECT COUNT(*) AS n FROM comments').get().n,
  };
  res.json({ owner: publicUser(owner), stats, settings: getSettings() });
});

router.get('/tags', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT t.name, COUNT(pt.post_id) AS count
       FROM tags t JOIN post_tags pt ON pt.tag_id = t.id
       GROUP BY t.id ORDER BY count DESC, t.name ASC`
    )
    .all();
  res.json({ tags: rows });
});

// scope: owner | community | all；支持 tag / q / author / 分页过滤
router.get('/posts', (req, res) => {
  const scope = ['owner', 'community', 'all'].includes(req.query.scope) ? req.query.scope : 'all';
  const tag = String(req.query.tag || '').trim();
  const q = String(req.query.q || '').trim();
  const author = String(req.query.author || '').trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  const where = [];
  const params = [];

  // 草稿仅作者本人和站长可见
  const viewingSelf = author && req.user && author === req.user.username;
  if (!req.user?.is_owner && !viewingSelf) where.push("p.status = 'published'");

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
  if (q) {
    where.push('(p.title LIKE ? OR p.summary LIKE ? OR p.content LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM posts p JOIN users u ON u.id = p.author_id${clause}`)
    .get(...params).n;

  const rows = db
    .prepare(
      `${LIST_SELECT}${clause} ORDER BY p.pinned DESC, p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, (page - 1) * limit);

  res.json({
    posts: rows.map(shapePost),
    total,
    page,
    limit,
    hasMore: page * limit < total,
  });
});

router.get('/posts/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare(`${LIST_SELECT} WHERE p.id = ?`).get(id);
  if (!row) return res.status(404).json({ error: '文章不存在' });

  const editable = canEdit(req.user, row);
  if (row.status !== 'published' && !editable) {
    return res.status(404).json({ error: '文章不存在' });
  }

  if (row.status === 'published') {
    db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(id);
  }
  const raw = db.prepare('SELECT content FROM posts WHERE id = ?').get(id).content;

  const prev = db
    .prepare(
      `SELECT id, title FROM posts WHERE created_at < ? AND status = 'published'
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(row.created_at);
  const next = db
    .prepare(
      `SELECT id, title FROM posts WHERE created_at > ? AND status = 'published'
       ORDER BY created_at ASC LIMIT 1`
    )
    .get(row.created_at);

  res.json({
    post: {
      ...shapePost(row),
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

router.post('/posts', requireAuth, (req, res) => {
  if (!req.user.is_owner && !flag('allow_community_post')) {
    return res.status(403).json({ error: '站长暂时关闭了社区投稿' });
  }

  const v = validate(req.body);
  if (v.error) return res.status(400).json({ error: v.error });

  const r = db
    .prepare(
      `INSERT INTO posts (author_id, title, summary, content, cover, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(req.user.id, v.title, v.summary, v.content, v.cover, v.status);

  const id = Number(r.lastInsertRowid);
  setTags(id, v.tags);
  res.status(201).json({ id, status: v.status });
});

router.put('/posts/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  if (!post) return res.status(404).json({ error: '文章不存在' });
  if (!canEdit(req.user, post)) return res.status(403).json({ error: '不能编辑别人的文章' });

  const v = validate(req.body);
  if (v.error) return res.status(400).json({ error: v.error });

  db.prepare(
    `UPDATE posts SET title = ?, summary = ?, content = ?, cover = ?, status = ?,
            updated_at = datetime('now')
     WHERE id = ?`
  ).run(v.title, v.summary, v.content, v.cover, v.status, id);

  setTags(id, v.tags);
  res.json({ id, status: v.status });
});

router.delete('/posts/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  if (!post) return res.status(404).json({ error: '文章不存在' });
  if (!canEdit(req.user, post)) return res.status(403).json({ error: '不能删除别人的文章' });

  db.prepare('DELETE FROM posts WHERE id = ?').run(id);
  res.json({ ok: true });
});

// 编辑器实时预览：服务端渲染，保证和最终展示完全一致
router.post('/render', requireAuth, (req, res) => {
  res.json({ html: renderMarkdown(String(req.body.content || '').slice(0, 100_000)) });
});

router.get('/posts/:id/comments', (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.content, c.created_at, u.id AS author_id, u.username,
              u.display_name, u.avatar_color, u.is_owner
       FROM comments c JOIN users u ON u.id = c.author_id
       WHERE c.post_id = ? ORDER BY c.created_at ASC`
    )
    .all(Number(req.params.id));

  const me = req.user;
  const post = db.prepare('SELECT author_id FROM posts WHERE id = ?').get(Number(req.params.id));

  res.json({
    comments: rows.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.created_at,
      canDelete: !!me && (me.id === c.author_id || me.id === post?.author_id || !!me.is_owner),
      author: {
        id: c.author_id,
        username: c.username,
        displayName: c.display_name,
        avatarColor: c.avatar_color,
        isOwner: !!c.is_owner,
      },
    })),
  });
});

router.post('/posts/:id/comments', requireAuth, (req, res) => {
  if (!flag('allow_comment')) return res.status(403).json({ error: '站长已关闭评论功能' });

  const postId = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM posts WHERE id = ?').get(postId)) {
    return res.status(404).json({ error: '文章不存在' });
  }
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: '评论不能为空' });
  if (content.length > 1000) return res.status(400).json({ error: '评论最多 1000 个字符' });

  db.prepare('INSERT INTO comments (post_id, author_id, content) VALUES (?, ?, ?)').run(
    postId,
    req.user.id,
    content
  );
  res.status(201).json({ ok: true });
});

router.delete('/comments/:id', requireAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM comments WHERE id = ?').get(Number(req.params.id));
  if (!c) return res.status(404).json({ error: '评论不存在' });

  const post = db.prepare('SELECT author_id FROM posts WHERE id = ?').get(c.post_id);
  const allowed = req.user.id === c.author_id || req.user.id === post?.author_id || req.user.is_owner;
  if (!allowed) return res.status(403).json({ error: '没有权限删除这条评论' });

  db.prepare('DELETE FROM comments WHERE id = ?').run(c.id);
  res.json({ ok: true });
});

router.get('/users/:username', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const count = db.prepare('SELECT COUNT(*) AS n FROM posts WHERE author_id = ?').get(u.id).n;
  res.json({ user: { ...publicUser(u), postCount: count } });
});

export default router;

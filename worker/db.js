// Hyw-blog · Cloudflare 版数据层（D1）
// 只在 Worker 运行时加载，不依赖任何 Node 原生模块，可安全打进 Worker bundle。
import { OWNER, DEMO, SAMPLE_POSTS, SAMPLE_COMMENT, DEFAULT_SETTINGS } from '../src/seed-data.js';

let _d1 = null;

// worker.js 在每次 fetch 时调用，注入 D1 binding
export function initDB(env) {
  _d1 = env?.DB ?? null;
}

function d1() {
  if (!_d1) throw new Error('D1 数据库未绑定（请在 wrangler.toml 配置 d1_databases）');
  return _d1;
}

export async function get(sql, ...params) {
  const row = await d1().prepare(sql).bind(...params).first();
  return row || undefined;
}

export async function all(sql, ...params) {
  const res = await d1().prepare(sql).bind(...params).all();
  return res.results || [];
}

export async function run(sql, ...params) {
  const res = await d1().prepare(sql).bind(...params).run();
  return {
    lastId: Number(res.meta?.last_row_id ?? 0),
    changes: Number(res.meta?.changes ?? 0),
  };
}

export { DEFAULT_SETTINGS };

export async function getSettings() {
  const out = { ...DEFAULT_SETTINGS };
  const rows = await all('SELECT key, value FROM settings');
  for (const r of rows) {
    if (r.key in DEFAULT_SETTINGS) out[r.key] = r.value;
  }
  return out;
}

export async function saveSettings(patch) {
  const stmts = [];
  for (const [k, v] of Object.entries(patch || {})) {
    if (k in DEFAULT_SETTINGS) {
      stmts.push(d1().prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(k, String(v)));
    }
  }
  if (stmts.length) await d1().batch(stmts);
  return getSettings();
}

export async function flag(key) {
  return (await getSettings())[key] === '1';
}

export async function tagsOf(postId) {
  const rows = await all(
    `SELECT t.name FROM tags t
     JOIN post_tags pt ON pt.tag_id = t.id
     WHERE pt.post_id = ? ORDER BY t.name`,
    postId
  );
  return rows.map((r) => r.name);
}

export async function setTags(postId, names) {
  await run('DELETE FROM post_tags WHERE post_id = ?', postId);
  const clean = [...new Set((names || []).map((n) => String(n).trim()).filter(Boolean))].slice(0, 8);

  const inserts = clean.map((name) =>
    d1().prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').bind(name)
  );
  if (inserts.length) await d1().batch(inserts);

  const links = clean.map((name) =>
    d1().prepare(
      `INSERT OR IGNORE INTO post_tags (post_id, tag_id)
       SELECT ?, (SELECT id FROM tags WHERE name = ?)`
    ).bind(postId, name)
  );
  if (links.length) await d1().batch(links);

  return clean;
}

async function insertPost(authorId, title, summary, content, offsetDays, tags) {
  const r = await run(
    `INSERT INTO posts (author_id, title, summary, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, datetime('now', ?), datetime('now', ?))`,
    authorId, title, summary, content, `-${offsetDays} days`, `-${offsetDays} days`
  );
  const postId = r.lastId;
  await setTags(postId, tags);
  return postId;
}

// 仅在库为空时写一次，保证首次部署即有内容
export async function maybeSeed() {
  const n = await get('SELECT COUNT(*) AS n FROM users');
  if (n && n.n > 0) return;

  const { hashPassword } = await import('./auth.js');

  const ownerId = (
    await run(
      `INSERT INTO users (username, password_hash, display_name, bio, avatar_color, is_owner)
       VALUES (?, ?, ?, ?, ?, 1)`,
      OWNER.username, await hashPassword(OWNER.password), OWNER.display_name, OWNER.bio, OWNER.avatar_color
    )
  ).lastId;

  const demoId = (
    await run(
      `INSERT INTO users (username, password_hash, display_name, bio, avatar_color, is_owner)
       VALUES (?, ?, ?, ?, ?, 0)`,
      DEMO.username, await hashPassword(DEMO.password), DEMO.display_name, DEMO.bio, DEMO.avatar_color
    )
  ).lastId;

  for (let i = 0; i < SAMPLE_POSTS.length; i++) {
    const s = SAMPLE_POSTS[i];
    const authorId = s.author === 'demo' ? demoId : ownerId;
    const postId = await insertPost(authorId, s.title, s.summary, s.content, (SAMPLE_POSTS.length - i) * 2, s.tags);
    if (i === 0) {
      await run('INSERT INTO comments (post_id, author_id, content) VALUES (?, ?, ?)',
        postId, demoId, SAMPLE_COMMENT);
    }
  }
}

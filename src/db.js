import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OWNER, DEMO, SAMPLE_POSTS, SAMPLE_COMMENT, DEFAULT_SETTINGS } from './seed-data.js';
export { DEFAULT_SETTINGS };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'public', 'uploads'), { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'hyw-blog.db'));

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  display_name  TEXT    NOT NULL,
  bio           TEXT    NOT NULL DEFAULT '',
  avatar_color  TEXT    NOT NULL DEFAULT '#4ade80',
  is_owner      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  summary     TEXT    NOT NULL DEFAULT '',
  content     TEXT    NOT NULL,
  cover       TEXT    NOT NULL DEFAULT '',
  status      TEXT    NOT NULL DEFAULT 'published',
  views       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_author  ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
`);

// 老库升级用：字段不存在才补，重复启动安全
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    console.log(`[db] 迁移：${table}.${column} 已添加`);
  }
}

ensureColumn('posts', 'pinned', 'pinned INTEGER NOT NULL DEFAULT 0');
ensureColumn('posts', 'status', "status TEXT NOT NULL DEFAULT 'published'");

export function getSettings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const r of db.prepare('SELECT key, value FROM settings').all()) {
    if (r.key in DEFAULT_SETTINGS) out[r.key] = r.value;
  }
  return out;
}

export function saveSettings(patch) {
  const stmt = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  for (const [k, v] of Object.entries(patch || {})) {
    if (k in DEFAULT_SETTINGS) stmt.run(k, String(v));
  }
  return getSettings();
}

export function flag(key) {
  return getSettings()[key] === '1';
}

function seed() {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return;

  const ownerId = Number(
    db
      .prepare(
        `INSERT INTO users (username, password_hash, display_name, bio, avatar_color, is_owner)
         VALUES (?, ?, ?, ?, ?, 1)`
      )
      .run(OWNER.username, bcrypt.hashSync(OWNER.password, 10), OWNER.display_name, OWNER.bio, OWNER.avatar_color)
      .lastInsertRowid
  );

  const demoId = Number(
    db
      .prepare(
        `INSERT INTO users (username, password_hash, display_name, bio, avatar_color, is_owner)
         VALUES (?, ?, ?, ?, ?, 0)`
      )
      .run(DEMO.username, bcrypt.hashSync(DEMO.password, 10), DEMO.display_name, DEMO.bio, DEMO.avatar_color)
      .lastInsertRowid
  );

  const insertPost = db.prepare(
    `INSERT INTO posts (author_id, title, summary, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, datetime('now', ?), datetime('now', ?))`
  );
  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
  const findTag = db.prepare('SELECT id FROM tags WHERE name = ?');
  const linkTag = db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)');

  SAMPLE_POSTS.forEach((s, i) => {
    const authorId = s.author === 'demo' ? demoId : ownerId;
    const offset = `-${(SAMPLE_POSTS.length - i) * 2} days`;
    const postId = Number(insertPost.run(authorId, s.title, s.summary, s.content, offset, offset).lastInsertRowid);
    for (const name of s.tags) {
      insertTag.run(name);
      linkTag.run(postId, findTag.get(name).id);
    }
  });

  db.prepare('INSERT INTO comments (post_id, author_id, content) VALUES (?, ?, ?)').run(
    1,
    demoId,
    SAMPLE_COMMENT
  );

  console.log('[db] 已写入示例数据（admin / admin123，demo / demo123）');
}

seed();

export function tagsOf(postId) {
  return db
    .prepare(
      `SELECT t.name FROM tags t
       JOIN post_tags pt ON pt.tag_id = t.id
       WHERE pt.post_id = ? ORDER BY t.name`
    )
    .all(postId)
    .map((r) => r.name);
}

export function setTags(postId, names) {
  db.prepare('DELETE FROM post_tags WHERE post_id = ?').run(postId);
  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
  const findTag = db.prepare('SELECT id FROM tags WHERE name = ?');
  const linkTag = db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)');

  const clean = [...new Set(names.map((n) => String(n).trim()).filter(Boolean))].slice(0, 8);
  for (const name of clean) {
    insertTag.run(name);
    linkTag.run(postId, findTag.get(name).id);
  }
  return clean;
}

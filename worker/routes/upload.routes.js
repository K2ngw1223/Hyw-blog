// Hyw-blog · 图片上传路由（Hono 版，挂载在 /api；存到 Cloudflare R2）
import { Hono } from 'hono';
import { requireAuth } from '../auth.js';

const router = new Hono();
const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const MAX = 5 * 1024 * 1024;

function randHex(n) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

router.post('/upload', requireAuth, async (c) => {
  const form = await c.req.parseBody().catch(() => ({}));
  const file = form['file'];
  if (!file || !(file instanceof File)) return c.json({ error: '没有收到文件' }, 400);

  const name = String(file.name || '').toLowerCase();
  const ext = name.includes('.') ? '.' + name.split('.').pop() : '';
  if (!ALLOWED.has(ext) || !String(file.type || '').startsWith('image/')) {
    return c.json({ error: '只支持 png / jpg / gif / webp / svg 图片' }, 400);
  }
  if (file.size > MAX) return c.json({ error: '图片不能超过 5MB' }, 400);

  const key = `${Date.now()}-${randHex(4)}${ext}`;
  const buf = await file.arrayBuffer();
  await c.env.R2.put(key, buf, { httpMetadata: { contentType: file.type } });

  return c.json({ url: `/uploads/${key}` }, 201);
});

export default router;

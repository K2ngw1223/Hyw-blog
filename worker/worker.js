// Hyw-blog · Cloudflare Worker 入口
// 职责：注入 D1 / R2 / ASSETS binding，空库时种子，按路径分流到 API / 上传 / 静态资源。
import { createApp } from './app.js';
import { initDB, maybeSeed } from './db.js';

const app = createApp();

async function serveUpload(url, env) {
  const key = decodeURIComponent(url.pathname.slice('/uploads/'.length));
  if (!key || key.includes('..') || key.startsWith('/')) {
    return new Response('Not found', { status: 404 });
  }
  const obj = await env.R2.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  // 上传图片（尤其 SVG）禁止执行脚本
  headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(obj.body, { headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    initDB(env);

    if (url.pathname.startsWith('/api/')) {
      await maybeSeed(); // 幂等：仅当库为空时写入示例数据
      return app.fetch(request, env, ctx);
    }

    if (url.pathname.startsWith('/uploads/')) {
      return serveUpload(url, env);
    }

    // 静态资源（public/）+ 单页应用回落（由 wrangler.toml 的 not_found_handling 控制）
    return env.ASSETS.fetch(request);
  },
};

// Hyw-blog · Hono 应用组装（框架无关，本地/边缘通用）
import { Hono } from 'hono';
import { attachUser } from './auth.js';
import auth from './routes/auth.routes.js';
import posts from './routes/posts.routes.js';
import upload from './routes/upload.routes.js';
import admin from './routes/admin.routes.js';

export function createApp() {
  const app = new Hono();

  app.use('/api/*', attachUser); // 解析登录态，挂到 c.set('user')
  app.route('/api/auth', auth);
  app.route('/api/admin', admin);
  app.route('/api', posts);
  app.route('/api', upload);

  // 未匹配的 API 返回 404
  app.all('/api/*', (c) => c.json({ error: '接口不存在' }, 404));

  return app;
}

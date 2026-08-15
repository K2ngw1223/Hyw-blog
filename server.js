import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { attachUser } from './src/auth.js';
import authRoutes from './src/routes/auth.routes.js';
import postRoutes from './src/routes/posts.routes.js';
import uploadRoutes from './src/routes/upload.routes.js';
import adminRoutes from './src/routes/admin.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(attachUser);

// highlight.js 的暗色主题，直接从 node_modules 提供，免 CDN
app.get('/vendor/hljs.css', (_req, res) => {
  res.type('css');
  res.sendFile(path.join(__dirname, 'node_modules', 'highlight.js', 'styles', 'github-dark.css'));
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', postRoutes);
app.use('/api', uploadRoutes);

app.use(
  express.static(path.join(__dirname, 'public'), {
    extensions: ['html'],
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}uploads${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        // 上传的 SVG 被浏览器直接打开时可能带脚本，锁死执行能力
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
        res.setHeader('X-Content-Type-Options', 'nosniff');
      }
    },
  })
);

app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在' }));

// 非接口路径回落到首页，支持直接访问 /post?id=1 这类前端路由
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: '服务器开小差了' });
});

app.listen(PORT, () => {
  console.log(`\n  Hyw-blog 已启动  ->  http://localhost:${PORT}\n`);
});

# 部署 Hyw-blog 到 Cloudflare

Hyw-blog 已改造为 **Cloudflare Workers + D1 + R2** 架构，全部代码在仓库内，本机只需登录账号后推送即可。

> 架构：前端 `public/` 由 Cloudflare 边缘直接分发；`/api/*` 由 Worker（Hono）处理，读写 D1（边缘 SQLite）；上传的图片存 R2。无服务器、无常驻进程、免费额度内基本零成本。

---

## 0. 前置条件

- **Node.js 22+** 与 npm
- 自定义域名 `example.com` **必须已经托管在 Cloudflare**（Add Site → 去原注册商改 NS 到 Cloudflare）。若域名不在 Cloudflare，`wrangler.toml` 里的 `[[custom_domains]]` 无法生效，可改用 `[[routes]]` 或先迁移域名。
- 本地已 `npm install`（已包含 `wrangler`、`hono` 等依赖）。

---

## 1. 登录 Cloudflare

```bash
npx wrangler login          # 浏览器授权，最简单
# 或用 API Token（CI / 无浏览器环境）：
# export CLOUDFLARE_API_TOKEN=xxxx
```

---

## 2. 创建 D1 数据库

```bash
npx wrangler d1 create hyw-blog
```

终端会返回一个 `database_id`。把它填进 `wrangler.toml` 的：

```toml
[[d1_databases]]
binding = "DB"
database_name = "hyw-blog"
database_id = "这里填返回的 id"
```

然后执行建表迁移（创建表结构）：

```bash
# 远程（线上）
npx wrangler d1 execute hyw-blog --file=./migrations/0001_init.sql
# 本地预览（wrangler dev 用）
npx wrangler d1 execute hyw-blog --local --file=./migrations/0001_init.sql
```

---

## 3. 创建 R2 存储桶（图片上传）

```bash
npx wrangler r2 bucket create hyw-blog-uploads
```

桶名需与 `wrangler.toml` 里的 `bucket_name = "hyw-blog-uploads"` 一致。

---

## 4. 配置 JWT 密钥

登录态用 HMAC-SHA256 自签 JWT，需要一个足够长的随机密钥。

```bash
# 生产环境（写入 Cloudflare 保密变量，不会进仓库）
npx wrangler secret put JWT_SECRET
# 提示输入时粘贴一段随机串，例如：
#   openssl rand -hex 32

# 本地开发（wrangler dev）用 .dev.vars（已被 .gitignore 忽略）
echo "JWT_SECRET=$(openssl rand -hex 32)" > .dev.vars
```

> ⚠️ 不要把真密钥写进 `wrangler.toml` 的 `[vars]`。toml 里的只是占位，生产务必用 `wrangler secret put`。

---

## 5. 本地预览（可选，先验证再上线）

```bash
npm run dev:cf      # 等于 npx wrangler dev
```

打开 `http://localhost:8787`。首次访问首页会触发自动种子（写入示例文章/用户），用 `admin / admin123` 登录。

---

## 6. 上线

```bash
npm run deploy      # 等于 npx wrangler deploy
```

部署成功后，Cloudflare 会自动为 `example.com` 配置自定义域名（域名已在 CF 上，无需再改 DNS）。稍等证书生效（通常几十秒到几分钟），浏览器访问 https://example.com 即可。

首次访问线上首页同样会触发自动种子；用 `admin / admin123` 登录后台 **立即修改默认密码**。

---

## 7. 日常管理

| 操作 | 命令 |
| --- | --- |
| 重新部署 | `npm run deploy` |
| 查看日志 | `npx wrangler tail` |
| 导出备份 | 后台「设置 → 导出备份 (JSON)」 |
| 直接查库 | `npx wrangler d1 execute hyw-blog --remote --command "SELECT * FROM posts"` |
| 改 D1 结构 | 改 `migrations/` 后 `npx wrangler d1 execute hyw-blog --file=...` |

---

## 8. 与本地 Node 版的区别

- 仓库里有两套后端：**`server.js` + `src/`（Express + 本地 node:sqlite）** 用于本机直接 `npm start` 调试；**`worker/`（Hono + D1 + Web Crypto + R2）** 用于 Cloudflare。
- 前端 `public/` 与 `src/markdown.js` 两者共用，API 契约完全一致，所以页面无需改动。
- 鉴权在 Worker 版改用 Web Crypto（PBKDF2 密码 + HMAC-JWT），不依赖 `bcryptjs` / `jsonwebtoken`；上传改用 R2 而非本地磁盘——这都是因为 Workers 边缘环境没有 Node 原生模块和常驻文件系统。

---

## 排错

- **部署报 `database_id` 相关错误**：第 2 步没填或填错，重新 `wrangler d1 create` 复制 id。
- **线上 500 / `缺少 JWT_SECRET`**：忘了第 4 步 `wrangler secret put JWT_SECRET`。
- **上传图片失败**：确认第 3 步 R2 桶已建且 `bucket_name` 匹配。
- **自定义域名打不开**：确认 `example.com` 的 NS 已指向 Cloudflare，且 `[[custom_domains]]` 已在 toml 中。
- **本地 `wrangler dev` 登录态不生效**：本地是 http，Cookie 不会带 `Secure`；已自动处理，若仍不行检查 `.dev.vars` 是否有 `JWT_SECRET`。

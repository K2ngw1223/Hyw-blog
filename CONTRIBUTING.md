# 贡献指南

感谢你考虑为 **Hyw-blog** 做贡献！这是一个轻量的个人博客模板，欢迎提 Issue、修 Bug、加功能或改进文档。

## 本地跑起来

```bash
npm install
npm start
```

打开 http://localhost:3000 。需要 **Node.js >= 22.5**（数据库用的是 Node 内置的 `node:sqlite`，无需原生编译）。

想上云部署请参考 [DEPLOY.md](./DEPLOY.md)。

## 项目结构

两套后端共用同一套 API 契约和同一份前端：

| 目录 | 作用 | 何时改 |
| --- | --- | --- |
| `server.js` + `src/` | 本地开发版，Express 4 + `node:sqlite` | 本地调试、加功能时首选 |
| `worker/` | 边缘部署版，Hono + Cloudflare D1 + R2 | 只在上云相关改动时动 |
| `public/` | 前端（原生 HTML + CSS + ES Module，零构建） | 界面 / 交互改动 |
| `src/seed-data.js` | 示例账号、示例文章、默认站点设置 | 想换初始内容改这里（两套后端都读它） |
| `migrations/0001_init.sql` | D1 建表 schema | 改数据结构时同步更新 |

> 加功能时**两套后端都要照顾到**：Express 在 `src/routes/`，Worker 在 `worker/routes/`，API 路径和返回结构请保持一致，否则部署版会和本地版行为不一致。

## 代码风格

- **零构建前端**：直接写 HTML/CSS/原生 JS，不引入打包器。
- **注释克制**：只在「为什么」不好一眼看出来的地方写注释，不要写把代码念一遍的冗余注释，也不要用大段 `/* ---- 小节 ---- */` 分隔条。
- **提交信息**：用中文或英文均可，但请说清「做了什么、为什么」。

## 提交流程

1. Fork 本仓库并 clone 到本地。
2. 从 `main` 切一个有意义的分支，例如 `fix/upload-csp` 或 `feat/tag-cloud`。
3. 本地自测：至少确认 `npm start` 能起来、登录/注册/发文这条主链路正常。
4. 提交前确保没有把下面这些不该提交的东西带进来（仓库已用 `.gitignore` 挡住大部分）：
   - `node_modules/`、`data/`（含 SQLite 库与 JWT 密钥）、`.wrangler/`、`.dev.vars`
   - 任何真实域名、密钥、个人信息
5. 推到你的 Fork，发起 Pull Request，并在描述里写清楚改动目的。

## 报告问题

开 Issue 时尽量带上：复现步骤、预期 / 实际表现、Node 版本、浏览器（前端问题）、以及相关的报错日志。能附最小复现最好。

## 行为准则

友好、就事论事。不接受人身攻击或骚扰。维护者保留对不符合规范的 Issue / PR 进行关闭或要求修改的权利。

---

再次感谢，你的每一份贡献都会让这个模板更好用 🙏

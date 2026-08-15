# Hyw-blog

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D%2022.5-339933.svg)](https://nodejs.org)
[![Deploy](https://img.shields.io/badge/deploy-Cloudflare%20Workers%20%2B%20D1%20%2B%20R2-f38020.svg)](DEPLOY.md)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#)

一个可自托管、开源的个人博客系统模板。**首页默认展示管理员（角色名为"站长"）的文章**，同时任何注册用户登录之后，也可以在站内发表自己的文章。

暗色极客风，零构建（没有 webpack / vite，前端就是原生 HTML + CSS + ES Module），改一行刷新就能看到效果。克隆下来即可作为你自己的博客起点，也可以当作学习 Express / Workers + D1 的示例。

## 快速开始

```bash
npm install
npm start
```

打开 http://localhost:3000

> 需要 Node.js >= 22.5（数据库用 Node 内置的 `node:sqlite`，无需任何原生编译）。

想上云（边缘全球访问、免运维）？已内置 **Workers + D1 + R2** 版本，详见 **[DEPLOY.md](./DEPLOY.md)**，把 `wrangler.toml` 里的 `example.com` 换成你的域名即可一键上线。

## 预置账号

| 角色 | 用户名 | 密码 | 说明 |
| --- | --- | --- | --- |
| 站长 | `admin` | `admin123` | 文章展示在首页「站长文章」，可管理全站内容 |
| 普通用户 | `demo` | `demo123` | 文章进入「社区文章」 |

**上线前请先登录 admin，在「个人中心 → 修改密码」里改掉默认密码。**

---

## 功能

- **双身份内容流** —— 首页头部是站长个人介绍，文章分「站长文章 / 社区文章 / 全部」三个标签页
- **注册登录** —— bcrypt 加密存储，JWT 放在 HttpOnly Cookie 里，7 天有效
- **Markdown 写作** —— 左写右预览，预览走服务端渲染，所见即所得
- **代码高亮** —— highlight.js，暗色主题，代码块右上角显示语言
- **标签 + 全文搜索** —— 首页标签筛选，导航栏搜索（按 `/` 快速聚焦）
- **图片上传** —— 封面图 + 正文配图，支持拖拽和直接粘贴截图
- **评论** —— 登录用户可评论，作者 / 站长可删除
- **个人中心** —— 改昵称、简介、头像色、密码，管理自己的文章
- **本地草稿** —— 没发布的内容自动存 localStorage，下次打开可恢复
- **管理后台** —— 站长专属 `/admin`：运行概览、管理文章（上架/下架/置顶/批量）、评论、用户（改昵称/站长身份/重置密码）、标签（重命名/合并/清理孤立），随时改站点设置并一键导出 JSON 备份
- **站点设置** —— 标题、副标题、页脚、每页文章数可调；可随时开关「注册 / 社区投稿 / 评论」

### 权限规则

| 操作 | 谁可以做 |
| --- | --- |
| 发表文章 | 任何登录用户 |
| 编辑 / 删除文章 | 作者本人、站长 |
| 发表评论 | 任何登录用户 |
| 删除评论 | 评论者本人、文章作者、站长 |
| 进入管理后台 `/admin` | 仅站长（普通用户访问返回 403） |

---

## 目录结构

```
Hyw-blog/
├── server.js                  # Express 入口
├── src/
│   ├── db.js                  # node:sqlite 建表、设置读写
│   ├── seed-data.js           # 示例账号与文章（两版后端共用），想换示例内容改这里
│   ├── auth.js                # JWT 签发/校验、登录态中间件
│   ├── markdown.js            # marked + highlight.js + sanitize-html
│   └── routes/
│       ├── auth.routes.js     # 注册 / 登录 / 资料 / 改密码
│       ├── posts.routes.js    # 文章 CRUD / 标签 / 搜索 / 评论
│       ├── admin.routes.js    # 管理后台 API（仅站长）
│       └── upload.routes.js   # 图片上传
├── public/
│   ├── index.html  post.html  editor.html  login.html  me.html  admin.html
│   ├── css/app.css  css/admin.css
│   ├── js/                    # common / home / post / editor / me / login / admin
│   └── uploads/               # 上传的图片
└── data/                      # SQLite 数据库 + JWT 密钥（自动生成）
```

`data/` 和 `public/uploads/` 是运行时产物，备份博客只要备份这两个目录。

---

## API

| Method | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/logout` | 退出 |
| GET | `/api/auth/me` | 当前登录用户 |
| PATCH | `/api/auth/me` | 改昵称 / 简介 / 头像色 |
| POST | `/api/auth/password` | 改密码 |
| GET | `/api/site` | 站长信息 + 全站统计 |
| GET | `/api/posts` | 列表，支持 `scope` `tag` `q` `author` `page` `limit` |
| GET | `/api/posts/:id` | 详情（含渲染后的 HTML、上下篇） |
| POST | `/api/posts` | 发表 |
| PUT | `/api/posts/:id` | 修改 |
| DELETE | `/api/posts/:id` | 删除 |
| GET | `/api/tags` | 标签及文章数 |
| GET | `/api/posts/:id/comments` | 评论列表 |
| POST | `/api/posts/:id/comments` | 发表评论 |
| DELETE | `/api/comments/:id` | 删除评论 |
| POST | `/api/upload` | 上传图片（≤5MB） |
| POST | `/api/render` | Markdown 预览渲染 |
| GET | `/api/admin/overview` | 概览：统计 + 14 天趋势 + 最近动态（仅站长） |
| GET | `/api/admin/posts` | 文章管理列表（筛选/分页） |
| PATCH | `/api/admin/posts/:id` | 改状态（上架/下架）、置顶 |
| POST | `/api/admin/posts/bulk` | 批量 删除/上架/下架 |
| GET | `/api/admin/comments` | 评论管理列表 |
| POST | `/api/admin/comments/bulk` | 批量删除评论 |
| GET | `/api/admin/users` | 用户列表 |
| PATCH | `/api/admin/users/:id` | 改昵称 / 简介 / 站长身份 |
| POST | `/api/admin/users/:id/password` | 站长强制重置密码 |
| DELETE | `/api/admin/users/:id` | 删除用户（连带文章/评论） |
| GET | `/api/admin/tags` | 标签列表 |
| PATCH | `/api/admin/tags/:id` | 重命名（改成已有名即合并） |
| DELETE | `/api/admin/tags/:id` | 删除标签 |
| POST | `/api/admin/tags/prune` | 清理无关联孤立标签 |
| GET / PUT | `/api/admin/settings` | 读取 / 更新站点设置 |
| GET | `/api/admin/export` | 导出全站数据 JSON 备份 |

---

## 一些说明

**为什么用 `node:sqlite` 而不是 `better-sqlite3`**
后者是原生模块，在没有 build tools 的机器上安装容易失败。Node 22.5 起标准库自带 SQLite，API 够用，装依赖时少一个坑。启动脚本里的 `--experimental-sqlite` 就是为它加的。

**XSS 防护**
Markdown 渲染后统一过 `sanitize-html` 白名单，评论内容按纯文本转义输出，不解析 HTML。

**换端口**

```bash
PORT=8080 npm start
```

**重置所有数据**
删掉 `data/` 目录再启动，会重新生成示例数据。

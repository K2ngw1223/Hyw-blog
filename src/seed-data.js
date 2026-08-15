// 首次启动写入库的示例数据，纯展示用，可随时在后台删掉。

export const DEFAULT_SETTINGS = {
  site_title: 'Hyw-blog',
  site_kicker: 'hyw-blog · 自建博客',
  hero_suffix: '的自留地',
  footer_text: 'Node.js + Express + SQLite',
  site_description: '一个可自托管、开源的个人博客系统模板，支持 Markdown 写作、标签、搜索与评论。',
  page_size: '8',
  allow_register: '1',
  allow_community_post: '1',
  allow_comment: '1',
};

export const OWNER = {
  username: 'admin',
  password: 'admin123',
  display_name: '站长',
  bio: '在这里记录一些代码、想法和碎片。',
  avatar_color: '#4ade80',
};

export const DEMO = {
  username: 'demo',
  password: 'demo123',
  display_name: '路过的读者',
  bio: '一个刚注册的普通用户。',
  avatar_color: '#60a5fa',
};

// 第 1 篇下的示例评论（由 demo 用户发表）
export const SAMPLE_COMMENT = '路过看看，这个编辑器的实时预览挺舒服的。';

export const SAMPLE_POSTS = [
  {
    title: '你好，这里是 Hyw-blog',
    summary: '一个用 Node.js + SQLite 从零搭起来的博客系统，支持 Markdown 写作、标签、搜索和评论。',
    tags: ['公告', 'Hyw-blog'],
    content: `## 这是什么

Hyw-blog 是一个**自建的个人博客系统**。首页是站长的自留地，同时任何注册用户登录之后，也可以在这里发表自己的文章。

## 它能做什么

- Markdown 写作，左边写右边实时预览
- 标签分类 + 全文搜索
- 文章封面图与正文配图上传
- 登录用户可以在文章下评论

## 技术栈

| 层 | 选型 |
| --- | --- |
| 运行时 | Node.js 22 |
| Web 框架 | Express |
| 数据库 | SQLite（Node 内置 \`node:sqlite\`） |
| 鉴权 | JWT + HttpOnly Cookie |
| 前端 | 原生 HTML / CSS / JS，零构建 |

没有打包器，没有前端框架，改一行刷新就能看到效果。

> 第一件事，请去个人中心把 admin 的默认密码改掉。`,
  },
  {
    title: '为什么我不再用 better-sqlite3 了',
    summary: 'Node 22 内置的 node:sqlite 已经够用，省掉一整套原生编译工具链。',
    tags: ['Node.js', '数据库', '踩坑'],
    content: `很长一段时间里，Node 里用 SQLite 的默认答案是 \`better-sqlite3\`。它很好，但有个绕不开的问题：**原生模块**。

\`\`\`bash
npm install better-sqlite3
# 然后开始编译 ... 然后在某台没有 build tools 的机器上失败
\`\`\`

Node 22.5 之后，标准库里多了 \`node:sqlite\`：

\`\`\`js
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('app.db');
db.exec('CREATE TABLE IF NOT EXISTS t (a TEXT)');
db.prepare('INSERT INTO t VALUES (?)').run('hello');
console.log(db.prepare('SELECT * FROM t').all());
\`\`\`

同步 API、预编译语句、事务，日常 CRUD 需要的都有。启动时加一个 \`--experimental-sqlite\` 标志即可。

## 什么时候还是该用 better-sqlite3

- 需要自定义扩展、加载 sqlite 扩展库
- 需要更成熟的 API 稳定性承诺
- 跑在 Node 22 以下的环境

除此之外，内置的那个就够了。少一个原生依赖，CI 少一半玄学问题。`,
  },
  {
    title: '暗色主题的几个细节',
    summary: '纯黑不好看，纯灰没层次 —— 聊聊做暗色界面时容易忽略的几件小事。',
    tags: ['设计', 'CSS'],
    content: `做暗色主题最容易犯的错，是把浅色主题的颜色直接反过来。

## 1. 不要用纯黑

\`#000\` 配 \`#fff\` 的对比度是 21:1，看久了眼睛会累，而且阴影完全失效。用 \`#0d1117\` 这种带一点蓝的深色，层次立刻出来了。

## 2. 用背景亮度表达层级

浅色界面靠阴影做层级，暗色界面靠**亮度**：越靠近用户的元素越亮。

\`\`\`css
--bg-0: #0b0e14;  /* 页面底 */
--bg-1: #121722;  /* 卡片 */
--bg-2: #1a2130;  /* 卡片上的输入框 */
\`\`\`

## 3. 正文不要用纯白

\`rgba(255,255,255,0.86)\` 比 \`#fff\` 舒服得多。标题可以亮一些，正文压下去，视觉重心自然分开。

## 4. 饱和度要降

亮色主题里好看的 \`#ff0000\`，放到深色背景上会刺眼到发光。暗色主题里的强调色应该**更柔和**一点。`,
  },
  {
    author: 'demo',
    title: '作为普通用户，我也来水一篇',
    summary: '测试一下非站长用户发文的效果，顺便看看社区列表长什么样。',
    tags: ['随笔'],
    content: `我不是站长，只是一个注册用户。

登录之后点右上角的「写文章」，就能发到**社区文章**里。站长的文章会单独展示在首页头部，我们的文章在下面的社区区块。

这样既保留了个人博客的调性，又不至于把其他人的内容藏起来。挺合理的设计。`,
  },
];

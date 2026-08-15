/* Hyw-blog · 管理后台 */

import { $, $$, api, esc, fmtDate, fmtRelative, avatarHTML, toast, boot, currentUser } from './common.js';

const view = $('#view');

const META = {
  overview: ['概览', '站点运行数据与最近动态'],
  posts: ['文章管理', '上架、下架、置顶、删除，支持批量操作'],
  comments: ['评论管理', '查看与清理全站评论'],
  users: ['用户管理', '管理注册用户、站长身份与密码'],
  tags: ['标签管理', '重命名、合并、清理孤立标签'],
  settings: ['站点设置', '随时修改站点外观与功能开关'],
};

function setPage(key) {
  const [t, s] = META[key] || META.overview;
  $('#pageTitle').textContent = t;
  $('#pageSub').textContent = s;
  $$('#nav-menu a').forEach((a) => a.classList.toggle('on', a.dataset.tab === key));
  document.title = `${t} · Hyw-blog`;
}

/* -------------------------------------------------------------- 路由 ----- */

const routes = { overview, posts, comments, users, tags, settings };

function route() {
  const key = location.hash.replace(/^#\/?/, '') || 'overview';
  const fn = routes[key] || overview;
  setPage(routes[key] ? key : 'overview');
  view.innerHTML = '<div class="empty"><span class="mono">加载中…</span></div>';
  Promise.resolve(fn()).catch((e) => {
    view.innerHTML = `<div class="empty"><b>出错了</b><span class="mono">${esc(e.message)}</span></div>`;
  });
}

window.addEventListener('hashchange', route);

/* ------------------------------------------------------------- 概览 ----- */

function trendSVG(d) {
  const W = 580, H = 190, p = 26;
  const n = d.days.length;
  const max = Math.max(1, ...d.posts, ...d.comments);
  const slot = (W - p * 2) / n;
  const bw = Math.min(11, slot / 3.2);
  const cx = (i) => p + slot * i + slot / 2;
  const y = (v) => H - p - (v / max) * (H - p * 2 - 6);

  let bars = '';
  d.days.forEach((_, i) => {
    const x = cx(i);
    const hp = y(d.posts[i]);
    const hc = y(d.comments[i]);
    bars += `<rect x="${x - bw - 1.5}" y="${hp}" width="${bw}" height="${H - p - hp}" rx="2" fill="#4ade80"/>`;
    bars += `<rect x="${x + 1.5}" y="${hc}" width="${bw}" height="${H - p - hc}" rx="2" fill="#60a5fa"/>`;
  });

  let labels = '';
  for (let i = 0; i < n; i += 2) {
    labels += `<text class="axis" x="${cx(i)}" y="${H - 8}" text-anchor="middle">${d.days[i].slice(5)}</text>`;
  }

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="近 14 天趋势">
    <line class="grid-line" x1="${p}" y1="${H - p}" x2="${W - p}" y2="${H - p}"/>
    ${bars}${labels}
    <text class="axis" x="${p}" y="${p - 8}">${max}</text>
  </svg>`;
}

async function overview() {
  const d = await api('/admin/overview');
  const s = d.stats;

  const cards = [
    ['文章总数', s.posts, `${s.published} 已发布 · ${s.drafts} 草稿`],
    ['已发布', s.published, '对外可见'],
    ['草稿', s.drafts, '仅自己可见'],
    ['用户', s.users, '注册账号'],
    ['评论', s.comments, '全站评论'],
    ['阅读量', s.views, '累计 PV'],
    ['标签', s.tags, '分类数'],
  ];

  const statHTML = `<div class="stat-grid">${cards
    .map(
      ([label, num, sub]) => `
      <div class="stat">
        <b>${num}</b>
        <span>${label}</span>
        <div class="spark">${sub}</div>
      </div>`
    )
    .join('')}</div>`;

  const recentPosts = d.recentPosts.length
    ? d.recentPosts
        .map(
          (r) => `
        <div class="feed-item">
          ${avatarHTML({ displayName: r.author, avatarColor: '#4ade80' })}
          <div style="min-width:0">
            <a class="gtitle" href="/post?id=${r.id}">${esc(r.title)}</a>
            <div class="feed-meta">${esc(r.author)} · ${fmtRelative(r.createdAt)} · ${r.views} 阅读 ${
              r.status === 'draft' ? '· <span class="pill draft">草稿</span>' : ''
            }</div>
          </div>
        </div>`
        )
        .join('')
    : '<div class="empty"><span class="muted">暂无文章</span></div>';

  const recentComments = d.recentComments.length
    ? d.recentComments
        .map(
          (r) => `
        <div class="feed-item">
          ${avatarHTML({ displayName: r.author, avatarColor: '#60a5fa' })}
          <div style="min-width:0">
            <div class="gbody">${esc(r.content).slice(0, 140)}</div>
            <div class="feed-meta">${esc(r.author)} 评《<a class="gtitle" href="/post?id=${r.postId}">${esc(
              r.postTitle
            )}</a>》· ${fmtRelative(r.createdAt)}</div>
          </div>
        </div>`
        )
        .join('')
    : '<div class="empty"><span class="muted">暂无评论</span></div>';

  const topPosts = d.topPosts.length
    ? d.topPosts
        .map(
          (r, i) => `
        <div class="rank-item">
          <span class="rk">${i + 1}</span>
          <a class="rt" href="/post?id=${r.id}">${esc(r.title)}</a>
          <span class="rv">${r.views}</span>
        </div>`
        )
        .join('')
    : '<div class="empty"><span class="muted">暂无数据</span></div>';

  view.innerHTML = `
    ${statHTML}

    <div class="abox">
      <div class="abox-h"><h2>近 14 天趋势</h2><div class="right muted">发文 vs 评论</div></div>
      ${trendSVG(d.trend)}
      <div class="chart-legend">
        <span><i style="background:#4ade80"></i>发文</span>
        <span><i style="background:#60a5fa"></i>评论</span>
      </div>
    </div>

    <div class="abox">
      <div class="abox-h"><h2>最近文章</h2><div class="right"><a class="btn btn-sm btn-ghost" href="#/posts">全部 →</a></div></div>
      <div class="feed">${recentPosts}</div>
    </div>

    <div class="abox">
      <div class="abox-h"><h2>最近评论</h2><div class="right"><a class="btn btn-sm btn-ghost" href="#/comments">全部 →</a></div></div>
      <div class="feed">${recentComments}</div>
    </div>

    <div class="abox">
      <div class="abox-h"><h2>阅读排行</h2><div class="right muted">Top 5</div></div>
      <div class="rank">${topPosts}</div>
    </div>`;
}

/* ------------------------------------------------------------- 文章 ----- */

const postsState = { q: '', authorId: 0, status: '', page: 1, limit: 15, users: [], total: 0 };

async function posts() {
  if (!postsState.users.length) {
    const { users } = await api('/admin/users');
    postsState.users = users;
  }
  view.innerHTML = `
    <div class="toolbar">
      <div class="grow"><input id="pQ" placeholder="搜索标题或正文…" value="${esc(postsState.q)}"></div>
      <select id="pAuthor">
        <option value="0">全部作者</option>
        ${postsState.users
          .map((u) => `<option value="${u.id}" ${postsState.authorId === u.id ? 'selected' : ''}>${esc(u.displayName)}</option>`)
          .join('')}
      </select>
      <select id="pStatus">
        <option value="">全部状态</option>
        <option value="published" ${postsState.status === 'published' ? 'selected' : ''}>已发布</option>
        <option value="draft" ${postsState.status === 'draft' ? 'selected' : ''}>草稿</option>
      </select>
      <button class="btn btn-sm" id="pSearch">搜索</button>
      <button class="btn btn-sm btn-ghost" id="pReset">重置</button>
    </div>

    <div class="bulkbar" id="bulkbar">
      <span class="cnt">已选 <b id="bulkCnt">0</b> 篇</span>
      <button class="btn btn-sm" data-bulk="publish">批量上架</button>
      <button class="btn btn-sm" data-bulk="draft">批量下架</button>
      <button class="btn btn-sm btn-danger" data-bulk="delete">批量删除</button>
      <span class="sp"></span>
      <button class="btn btn-sm btn-ghost" id="bulkClear">取消选择</button>
    </div>

    <div class="abox">
      <div class="abox-b flush"><table class="tbl" id="postsTable"></table></div>
    </div>
    <div class="pager" id="postsPager"></div>`;

  // 表格元素在 posts() 内只创建一次，监听器只挂一次，loadPosts 只替换其内容
  $('#postsTable').addEventListener('click', onPostRowAction);

  $('#pSearch').addEventListener('click', () => {
    postsState.q = $('#pQ').value.trim();
    postsState.authorId = Number($('#pAuthor').value);
    postsState.status = $('#pStatus').value;
    postsState.page = 1;
    loadPosts();
  });
  $('#pReset').addEventListener('click', () => {
    postsState.q = '';
    postsState.authorId = 0;
    postsState.status = '';
    postsState.page = 1;
    posts();
  });
  $('#bulkClear').addEventListener('click', () => {
    $$('#postsTable .chk[data-id]').forEach((c) => (c.checked = false));
    refreshBulk();
  });
  $('#bulkbar').addEventListener('click', async (e) => {
    const act = e.target.closest('[data-bulk]')?.dataset.bulk;
    if (!act) return;
    const ids = checkedIds();
    if (!ids.length) return toast('请先选择文章', true);
    if (act === 'delete' && !confirm(`确定删除选中的 ${ids.length} 篇文章？此操作不可撤销。`)) return;
    try {
      await api('/admin/posts/bulk', { method: 'POST', body: { ids, action: act } });
      toast('操作成功');
      postsState.page = 1;
      loadPosts();
    } catch (err) {
      toast(err.message, true);
    }
  });

  await loadPosts();
}

function postRow(p) {
  return `<tr>
    <td><input type="checkbox" class="chk" data-id="${p.id}"></td>
    <td class="title-cell"><a href="/post?id=${p.id}">${esc(p.title)}</a>${
      p.pinned ? ' <span class="pill pin">置顶</span>' : ''
    }</td>
    <td>${avatarHTML(p.author, 'avatar-sm')} ${esc(p.author.displayName)}</td>
    <td><span class="pill ${p.status === 'draft' ? 'draft' : 'pub'}">${
      p.status === 'draft' ? '草稿' : '已发布'
    }</span></td>
    <td class="num">${p.views}</td>
    <td class="num">${p.commentCount}</td>
    <td class="muted">${fmtDate(p.createdAt)}</td>
    <td>
      <div class="row-actions">
        <button class="btn btn-sm btn-ghost" data-act="pin" data-id="${p.id}" data-on="${p.pinned ? 1 : 0}">${
          p.pinned ? '取消置顶' : '置顶'
        }</button>
        <button class="btn btn-sm btn-ghost" data-act="toggle" data-id="${p.id}" data-status="${p.status}">${
          p.status === 'draft' ? '上架' : '下架'
        }</button>
        <a class="btn btn-sm btn-ghost" href="/editor?id=${p.id}">编辑</a>
        <button class="btn btn-sm btn-danger" data-act="del" data-id="${p.id}">删除</button>
      </div>
    </td>
  </tr>`;
}

async function loadPosts() {
  const qs = new URLSearchParams({ page: postsState.page, limit: postsState.limit });
  if (postsState.q) qs.set('q', postsState.q);
  if (postsState.authorId) qs.set('authorId', postsState.authorId);
  if (postsState.status) qs.set('status', postsState.status);

  const d = await api(`/admin/posts?${qs}`);
  postsState.total = d.total;

  $('#postsTable').innerHTML = d.posts.length
    ? `<thead><tr>
         <th style="width:36px"><input type="checkbox" class="chk" id="selAll"></th>
         <th>标题</th><th>作者</th><th>状态</th>
         <th class="num">阅读</th><th class="num">评论</th><th>创建</th>
         <th style="width:240px"></th>
       </tr></thead><tbody>${d.posts.map(postRow).join('')}</tbody>`
    : `<tbody><tr><td colspan="8"><div class="empty"><b>没有符合条件的文章</b></div></td></tr></tbody>`;

  const pages = Math.max(1, Math.ceil(d.total / postsState.limit));
  $('#postsPager').innerHTML =
    pages > 1
      ? `<button class="btn btn-sm btn-ghost" id="pPrev" ${postsState.page <= 1 ? 'disabled' : ''}>← 上一页</button>
         <span class="info">第 ${postsState.page} / ${pages} 页 · 共 ${d.total} 篇</span>
         <button class="btn btn-sm btn-ghost" id="pNext" ${postsState.page >= pages ? 'disabled' : ''}>下一页 →</button>`
      : `<span class="info">共 ${d.total} 篇</span>`;

  $('#selAll')?.addEventListener('change', (e) => {
    $$('#postsTable .chk[data-id]').forEach((c) => (c.checked = e.target.checked));
    refreshBulk();
  });
  $('#pPrev')?.addEventListener('click', () => {
    if (postsState.page > 1) {
      postsState.page--;
      loadPosts();
    }
  });
  $('#pNext')?.addEventListener('click', () => {
    if (postsState.page < pages) {
      postsState.page++;
      loadPosts();
    }
  });

  $$('#postsTable .chk[data-id]').forEach((c) =>
    c.addEventListener('change', refreshBulk)
  );

  refreshBulk();
}

function checkedIds() {
  return $$('#postsTable .chk[data-id]:checked').map((c) => Number(c.dataset.id));
}

function refreshBulk() {
  const n = checkedIds().length;
  $('#bulkCnt').textContent = n;
  $('#bulkbar').classList.toggle('on', n > 0);
}

async function onPostRowAction(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const act = btn.dataset.act;
  try {
    if (act === 'pin') {
      await api(`/admin/posts/${id}`, { method: 'PATCH', body: { pinned: btn.dataset.on !== '1' } });
    } else if (act === 'toggle') {
      await api(`/admin/posts/${id}`, {
        method: 'PATCH',
        body: { status: btn.dataset.status === 'draft' ? 'published' : 'draft' },
      });
    } else if (act === 'del') {
      if (!confirm('确定删除这篇文章？此操作不可撤销。')) return;
      await api('/admin/posts/bulk', { method: 'POST', body: { ids: [id], action: 'delete' } });
      toast('已删除');
    }
    loadPosts();
  } catch (err) {
    toast(err.message, true);
  }
}

/* ------------------------------------------------------------- 评论 ----- */

const commentsState = { q: '', page: 1, limit: 30, total: 0 };

async function comments() {
  view.innerHTML = `
    <div class="toolbar">
      <div class="grow"><input id="cQ" placeholder="搜索评论内容…" value="${esc(commentsState.q)}"></div>
      <button class="btn btn-sm" id="cSearch">搜索</button>
      <button class="btn btn-sm btn-ghost" id="cReset">重置</button>
    </div>
    <div class="bulkbar" id="cBulkbar">
      <span class="cnt">已选 <b id="cBulkCnt">0</b> 条</span>
      <button class="btn btn-sm btn-danger" data-bulk="delete">批量删除</button>
      <span class="sp"></span>
      <button class="btn btn-sm btn-ghost" id="cBulkClear">取消选择</button>
    </div>
    <div class="abox">
      <div class="abox-b flush"><table class="tbl" id="commentsTable"></table></div>
    </div>
    <div class="pager" id="commentsPager"></div>`;

  $('#cSearch').addEventListener('click', () => {
    commentsState.q = $('#cQ').value.trim();
    commentsState.page = 1;
    loadComments();
  });
  $('#cReset').addEventListener('click', () => {
    commentsState.q = '';
    commentsState.page = 1;
    comments();
  });
  $('#cBulkClear').addEventListener('click', () => {
    $$('#commentsTable .chk[data-id]').forEach((c) => (c.checked = false));
    refreshCommentBulk();
  });
  $('#cBulkbar').addEventListener('click', async (e) => {
    const act = e.target.closest('[data-bulk]')?.dataset.bulk;
    if (!act) return;
    const ids = $$('#commentsTable .chk[data-id]:checked').map((c) => Number(c.dataset.id));
    if (!ids.length) return toast('请先选择评论', true);
    if (!confirm(`确定删除选中的 ${ids.length} 条评论？`)) return;
    try {
      await api('/admin/comments/bulk', { method: 'POST', body: { ids, action: 'delete' } });
      toast('已删除');
      loadComments();
    } catch (err) {
      toast(err.message, true);
    }
  });

  await loadComments();
}

function commentRow(c) {
  return `<tr>
    <td><input type="checkbox" class="chk" data-id="${c.id}"></td>
    <td>${avatarHTML(c.author, 'avatar-sm')} ${esc(c.author.displayName)}</td>
    <td>${esc(c.content).slice(0, 200)}${c.content.length > 200 ? '…' : ''}</td>
    <td class="muted">《<a class="gtitle" href="/post?id=${c.postId}">${esc(c.postTitle)}</a>》</td>
    <td class="muted">${fmtRelative(c.createdAt)}</td>
    <td><button class="btn btn-sm btn-danger" data-act="del" data-id="${c.id}">删除</button></td>
  </tr>`;
}

async function loadComments() {
  const qs = new URLSearchParams({ page: commentsState.page, limit: commentsState.limit });
  if (commentsState.q) qs.set('q', commentsState.q);

  const d = await api(`/admin/comments?${qs}`);
  commentsState.total = d.total;

  $('#commentsTable').innerHTML = d.comments.length
    ? `<thead><tr>
         <th style="width:36px"><input type="checkbox" class="chk" id="cSelAll"></th>
         <th>用户</th><th>内容</th><th>文章</th><th>时间</th><th style="width:70px"></th>
       </tr></thead><tbody>${d.comments.map(commentRow).join('')}</tbody>`
    : `<tbody><tr><td colspan="6"><div class="empty"><b>没有评论</b></div></td></tr></tbody>`;

  const pages = Math.max(1, Math.ceil(d.total / commentsState.limit));
  $('#commentsPager').innerHTML =
    pages > 1
      ? `<button class="btn btn-sm btn-ghost" id="cPrev" ${commentsState.page <= 1 ? 'disabled' : ''}>← 上一页</button>
         <span class="info">第 ${commentsState.page} / ${pages} 页 · 共 ${d.total} 条</span>
         <button class="btn btn-sm btn-ghost" id="cNext" ${commentsState.page >= pages ? 'disabled' : ''}>下一页 →</button>`
      : `<span class="info">共 ${d.total} 条</span>`;

  $('#cSelAll')?.addEventListener('change', (e) => {
    $$('#commentsTable .chk[data-id]').forEach((c) => (c.checked = e.target.checked));
    refreshCommentBulk();
  });
  $('#cPrev')?.addEventListener('click', () => {
    if (commentsState.page > 1) {
      commentsState.page--;
      loadComments();
    }
  });
  $('#cNext')?.addEventListener('click', () => {
    if (commentsState.page < pages) {
      commentsState.page++;
      loadComments();
    }
  });
  $$('#commentsTable .chk[data-id]').forEach((c) => c.addEventListener('change', refreshCommentBulk));
  $('#commentsTable').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act="del"]');
    if (!btn) return;
    if (!confirm('确定删除这条评论？')) return;
    try {
      await api('/admin/comments/bulk', { method: 'POST', body: { ids: [Number(btn.dataset.id)], action: 'delete' } });
      toast('已删除');
      loadComments();
    } catch (err) {
      toast(err.message, true);
    }
  });

  refreshCommentBulk();
}

function refreshCommentBulk() {
  const n = $$('#commentsTable .chk[data-id]:checked').length;
  $('#cBulkCnt').textContent = n;
  $('#cBulkbar').classList.toggle('on', n > 0);
}

/* ------------------------------------------------------------- 用户 ----- */

let usersCache = [];

async function users() {
  const { users } = await api('/admin/users');
  usersCache = users;

  const rows = users
    .map(
      (u) => `<tr>
      <td>${avatarHTML(u, 'avatar-sm')}</td>
      <td><b>${esc(u.displayName)}</b>${u.isOwner ? ' <span class="pill own">站长</span>' : ''}<br>
          <small class="muted">@${esc(u.username)}</small></td>
      <td class="num">${u.postCount}</td>
      <td class="num">${u.commentCount}</td>
      <td class="muted">${fmtDate(u.createdAt)}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-sm btn-ghost" data-act="edit" data-id="${u.id}">编辑</button>
          <button class="btn btn-sm btn-ghost" data-act="pwd" data-id="${u.id}">改密码</button>
          <button class="btn btn-sm btn-danger" data-act="del" data-id="${u.id}">删除</button>
        </div>
      </td>
    </tr>`
    )
    .join('');

  view.innerHTML = `
    <div class="abox">
      <div class="abox-h"><h2>注册用户</h2><div class="right muted">共 ${users.length} 人</div></div>
      <div class="abox-b flush"><table class="tbl">
        <thead><tr>
          <th style="width:48px"></th><th>用户</th><th class="num">文章</th>
          <th class="num">评论</th><th>注册时间</th><th style="width:200px"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;

  view.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const u = usersCache.find((x) => x.id === id);
    if (!u) return;

    if (btn.dataset.act === 'edit') openUserEdit(u);
    else if (btn.dataset.act === 'pwd') openPasswordReset(u);
    else if (btn.dataset.act === 'del') {
      if (!confirm(`确定删除用户「${u.displayName}」？其文章与评论会一并删除。`)) return;
      try {
        await api(`/admin/users/${id}`, { method: 'DELETE' });
        toast('已删除');
        users();
      } catch (err) {
        toast(err.message, true);
      }
    }
  };
}

function openModal(html) {
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal-back"><div class="modal-card">${html}</div></div>`;
  const back = root.querySelector('.modal-back');
  back.addEventListener('click', (e) => {
    if (e.target === back) closeModal();
  });
  return root.querySelector('.modal-card');
}

function closeModal() {
  $('#modalRoot').innerHTML = '';
}

function openUserEdit(u) {
  const card = openModal(`
    <h3>编辑用户</h3>
    <label>昵称</label>
    <input type="text" id="mName" value="${esc(u.displayName)}" maxlength="24">
    <label>简介</label>
    <textarea id="mBio" maxlength="200">${esc(u.bio || '')}</textarea>
    <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
      <span class="switch"><input type="checkbox" id="mOwner" ${u.isOwner ? 'checked' : ''}><span class="track"></span></span>
      设为站长（可进入管理后台）
    </label>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="mCancel">取消</button>
      <button class="btn btn-primary" id="mSave">保存</button>
    </div>`);

  card.querySelector('#mCancel').addEventListener('click', closeModal);
  card.querySelector('#mSave').addEventListener('click', async () => {
    try {
      await api(`/admin/users/${u.id}`, {
        method: 'PATCH',
        body: {
          displayName: card.querySelector('#mName').value,
          bio: card.querySelector('#mBio').value,
          isOwner: card.querySelector('#mOwner').checked,
        },
      });
      toast('已保存');
      closeModal();
      users();
    } catch (err) {
      toast(err.message, true);
    }
  });
}

function openPasswordReset(u) {
  const card = openModal(`
    <h3>重置密码 · ${esc(u.displayName)}</h3>
    <label>新密码（至少 6 位）</label>
    <input type="text" id="mPwd" placeholder="输入新密码">
    <div class="modal-actions">
      <button class="btn btn-ghost" id="mCancel">取消</button>
      <button class="btn btn-primary" id="mSavePwd">重置</button>
    </div>`);

  card.querySelector('#mCancel').addEventListener('click', closeModal);
  card.querySelector('#mSavePwd').addEventListener('click', async () => {
    const pwd = card.querySelector('#mPwd').value;
    try {
      await api(`/admin/users/${u.id}/password`, { method: 'POST', body: { newPassword: pwd } });
      toast('密码已重置');
      closeModal();
    } catch (err) {
      toast(err.message, true);
    }
  });
}

/* ------------------------------------------------------------- 标签 ----- */

async function tags() {
  const { tags } = await api('/admin/tags');

  const rows = tags.length
    ? tags
        .map(
          (t) => `<tr>
        <td># ${esc(t.name)}</td>
        <td class="num">${t.count}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-sm btn-ghost" data-act="ren" data-id="${t.id}" data-name="${esc(t.name)}">重命名</button>
            <button class="btn btn-sm btn-danger" data-act="del" data-id="${t.id}">删除</button>
          </div>
        </td>
      </tr>`
        )
        .join('')
    : '<tr><td colspan="3"><div class="empty"><b>还没有标签</b></div></td></tr>';

  view.innerHTML = `
    <div class="toolbar">
      <span class="muted">重命名会自动应用到所有文章；把标签改成已存在的名字即可合并两个标签。</span>
      <span class="sp"></span>
      <button class="btn btn-sm" id="pruneBtn">清理孤立标签</button>
    </div>
    <div class="abox">
      <div class="abox-b flush"><table class="tbl">
        <thead><tr><th>标签</th><th class="num">文章数</th><th style="width:160px"></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;

  $('#pruneBtn').addEventListener('click', async () => {
    if (!confirm('删除所有没有任何文章关联的孤立标签？')) return;
    try {
      const r = await api('/admin/tags/prune', { method: 'POST' });
      toast(`已清理 ${r.removed} 个孤立标签`);
      tags();
    } catch (err) {
      toast(err.message, true);
    }
  });

  view.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = Number(btn.dataset.id);

    if (btn.dataset.act === 'ren') {
      const card = openModal(`
        <h3>重命名标签</h3>
        <label>新名字</label>
        <input type="text" id="tName" value="${esc(btn.dataset.name)}" maxlength="20">
        <div class="modal-actions">
          <button class="btn btn-ghost" id="mCancel">取消</button>
          <button class="btn btn-primary" id="mSave">保存</button>
        </div>`);
      card.querySelector('#mCancel').addEventListener('click', closeModal);
      card.querySelector('#mSave').addEventListener('click', async () => {
        try {
          await api(`/admin/tags/${id}`, { method: 'PATCH', body: { name: card.querySelector('#tName').value } });
          toast('已保存');
          closeModal();
          tags();
        } catch (err) {
          toast(err.message, true);
        }
      });
    } else if (btn.dataset.act === 'del') {
      if (!confirm(`确定删除标签「${btn.dataset.name}」？关联文章会保留但不再带此标签。`)) return;
      try {
        await api(`/admin/tags/${id}`, { method: 'DELETE' });
        toast('已删除');
        tags();
      } catch (err) {
        toast(err.message, true);
      }
    }
  };
}

/* ------------------------------------------------------------- 设置 ----- */

async function settings() {
  const { settings } = await api('/admin/settings');

  const textRow = (key, label, hint) => `
    <div class="setrow">
      <div class="lbl"><b>${label}</b><small>${hint}</small></div>
      <div class="val"><input type="text" id="f_${key}" value="${esc(settings[key] ?? '')}"></div>
    </div>`;

  const textAreaRow = (key, label, hint) => `
    <div class="setrow">
      <div class="lbl"><b>${label}</b><small>${hint}</small></div>
      <div class="val" style="flex-direction:column;align-items:stretch">
        <textarea id="f_${key}" rows="3" style="width:100%;background:var(--bg-2);border:1px solid var(--line);border-radius:var(--radius-sm);padding:8px 12px;outline:none;font:inherit;font-size:14px;line-height:1.7;resize:vertical">${esc(
          settings[key] ?? ''
        )}</textarea>
      </div>
    </div>`;

  const switchRow = (key, label, hint) => `
    <div class="setrow">
      <div class="lbl"><b>${label}</b><small>${hint}</small></div>
      <div class="val">
        <span class="switch">
          <input type="checkbox" id="f_${key}" ${settings[key] === '1' ? 'checked' : ''}>
          <span class="track"></span>
        </span>
        <span class="hint">${settings[key] === '1' ? '已开启' : '已关闭'}</span>
      </div>
    </div>`;

  view.innerHTML = `
    <div class="abox">
      <div class="abox-h"><h2>基础信息</h2></div>
      <div class="abox-b">
        ${textRow('site_title', '站点标题', '浏览器标签与页脚显示')}
        ${textRow('site_kicker', '头部副标题', '首页大标题上方的小字')}
        ${textRow('hero_suffix', '主页后缀', '首页“XX 的自留地”里的词')}
        ${textRow('footer_text', '页脚文字', '页脚右侧说明')}
        ${textAreaRow('site_description', '站点描述', '用于 SEO 的 meta description；留空则输出默认描述')}
        ${textRow('page_size', '每页文章数', '首页分页大小（1-50）')}
      </div>
    </div>

    <div class="abox">
      <div class="abox-h"><h2>功能开关</h2></div>
      <div class="abox-b">
        ${switchRow('allow_register', '允许注册', '关闭后新用户无法注册')}
        ${switchRow('allow_community_post', '允许社区投稿', '关闭后普通用户不能发表文章')}
        ${switchRow('allow_comment', '允许评论', '关闭后文章下不能评论')}
      </div>
    </div>

    <div class="toolbar">
      <button class="btn btn-primary" id="saveSet">保存设置</button>
      <span class="sp"></span>
      <a class="btn btn-ghost" href="/api/admin/export">导出备份 (JSON)</a>
    </div>

    <div class="danger-zone">
      <h3>备份与恢复</h3>
      <p>点右侧「导出备份」可下载包含全部用户、文章与评论的 JSON 文件，用于迁移或恢复。</p>
    </div>`;

  view.onclick = async (e) => {
    if (!e.target.closest('#saveSet')) return;
    const payload = {};
    ['site_title', 'site_kicker', 'hero_suffix', 'footer_text', 'site_description', 'page_size'].forEach((k) => {
      payload[k] = $(`#f_${k}`).value;
    });
    ['allow_register', 'allow_community_post', 'allow_comment'].forEach((k) => {
      payload[k] = $(`#f_${k}`).checked ? '1' : '0';
    });
    try {
      await api('/admin/settings', { method: 'PUT', body: { settings: payload } });
      toast('设置已保存');
      settings();
    } catch (err) {
      toast(err.message, true);
    }
  };

  // 开关切换时实时更新文字提示
  ['allow_register', 'allow_community_post', 'allow_comment'].forEach((k) => {
    $(`#f_${k}`).addEventListener('change', (e) => {
      const hint = e.target.parentElement.querySelector('.hint');
      if (hint) hint.textContent = e.target.checked ? '已开启' : '已关闭';
    });
  });
}

/* ------------------------------------------------------------- 启动 ----- */

(async function init() {
  await boot();
  if (!currentUser) {
    location.replace(`/login?next=${encodeURIComponent('/admin')}`);
    return;
  }
  if (!currentUser.isOwner) {
    toast('只有站长可以访问管理后台', true);
    setTimeout(() => (location.href = '/'), 900);
    return;
  }
  if (!location.hash) location.hash = '#/overview';
  route();
})();

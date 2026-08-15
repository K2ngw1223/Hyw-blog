import { $, $$, api, boot, esc, fmtDate, avatarHTML, toast } from './common.js';

const COLORS = ['#4ade80', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#22d3ee', '#fb7185'];

let me = null;
let picked = '';

/* ------------------------------------------------------------- 资料卡 --- */

function renderProfile() {
  picked = me.avatarColor;

  $('#profilePanel').innerHTML = `
    <div style="display:flex;gap:14px;align-items:center;margin-bottom:20px">
      ${avatarHTML(me, 'avatar-lg')}
      <div>
        <div style="font-size:17px;font-weight:600">${esc(me.displayName)}
          ${me.isOwner ? '<span class="badge-owner">站长</span>' : ''}</div>
        <div class="mono" style="font-size:12px;color:var(--text-3)">@${esc(me.username)}</div>
        <div class="mono" style="font-size:11.5px;color:var(--text-3)">加入于 ${fmtDate(
          me.createdAt
        )}</div>
      </div>
    </div>

    <div class="form-msg" id="pMsg"></div>

    <div class="form-row">
      <label>昵称</label>
      <input id="fName" value="${esc(me.displayName)}" maxlength="24" />
    </div>
    <div class="form-row">
      <label>个人简介</label>
      <textarea id="fBio" maxlength="200" placeholder="介绍一下自己…">${esc(me.bio)}</textarea>
      <div class="hint">${me.isOwner ? '这段文字会显示在博客首页的大标题下面' : '显示在你的作者信息里'}</div>
    </div>
    <div class="form-row">
      <label>头像颜色</label>
      <div class="color-picks" id="colors">
        ${COLORS.map(
          (c) =>
            `<button data-c="${c}" style="background:${c}" class="${
              c === me.avatarColor ? 'on' : ''
            }"></button>`
        ).join('')}
      </div>
    </div>
    <button class="btn btn-primary" style="width:100%" id="saveProfile">保存资料</button>`;

  $('#colors').onclick = (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    picked = b.dataset.c;
    $$('#colors button').forEach((x) => x.classList.toggle('on', x === b));
  };

  $('#saveProfile').onclick = async () => {
    const btn = $('#saveProfile');
    btn.disabled = true;
    try {
      const { user } = await api('/auth/me', {
        method: 'PATCH',
        body: {
          displayName: $('#fName').value.trim(),
          bio: $('#fBio').value.trim(),
          avatarColor: picked,
        },
      });
      me = user;
      toast('资料已更新');
      renderProfile();
      renderPwd();
    } catch (e) {
      const el = $('#pMsg');
      el.textContent = e.message;
      el.className = 'form-msg err';
      btn.disabled = false;
    }
  };
}

/* -------------------------------------------------------------- 改密码 -- */

function renderPwd() {
  $('#pwdPanel').innerHTML = `
    <h2>修改密码</h2>
    <div class="form-msg" id="wMsg"></div>
    <div class="form-row">
      <label>当前密码</label>
      <input id="pOld" type="password" autocomplete="current-password" />
    </div>
    <div class="form-row">
      <label>新密码</label>
      <input id="pNew" type="password" autocomplete="new-password" />
      <div class="hint">至少 6 位</div>
    </div>
    <button class="btn" style="width:100%" id="savePwd">更新密码</button>`;

  $('#savePwd').onclick = async () => {
    const el = $('#wMsg');
    try {
      await api('/auth/password', {
        method: 'POST',
        body: { currentPassword: $('#pOld').value, newPassword: $('#pNew').value },
      });
      el.textContent = '密码已更新';
      el.className = 'form-msg ok';
      $('#pOld').value = $('#pNew').value = '';
    } catch (e) {
      el.textContent = e.message;
      el.className = 'form-msg err';
    }
  };
}

/* ------------------------------------------------------------ 我的文章 -- */

async function renderMyPosts() {
  const { posts, total } = await api(
    `/posts?scope=all&author=${encodeURIComponent(me.username)}&limit=50`
  );
  $('#myInfo').innerHTML = `我的文章 · 共 <b>${total}</b> 篇`;

  const box = $('#mylist');
  if (!posts.length) {
    box.innerHTML = `<div class="empty"><b>还没有发表过文章</b>
      <span class="mono">点右上角「写新文章」开始</span></div>`;
    return;
  }

  box.innerHTML = posts
    .map(
      (p) => `
      <div class="myitem" data-id="${p.id}">
        <div class="t">
          <b>${esc(p.title)}</b>
          <small>${fmtDate(p.createdAt)} · ${p.views} 阅读 · ${p.commentCount} 评论${
            p.tags.length ? ' · ' + p.tags.map((t) => '#' + esc(t)).join(' ') : ''
          }</small>
        </div>
        <div class="acts">
          <a class="btn btn-sm btn-ghost" href="/post?id=${p.id}">查看</a>
          <a class="btn btn-sm" href="/editor?id=${p.id}">编辑</a>
          <button class="btn btn-sm btn-danger" data-del>删除</button>
        </div>
      </div>`
    )
    .join('');

  box.onclick = async (e) => {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    const item = btn.closest('.myitem');
    if (!confirm('删除这篇文章？删除后无法恢复。')) return;
    try {
      await api(`/posts/${item.dataset.id}`, { method: 'DELETE' });
      toast('已删除');
      renderMyPosts();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

/* ---------------------------------------------------------------- init -- */

(async function init() {
  me = await boot();
  if (!me) {
    location.replace('/login?next=/me');
    return;
  }
  renderProfile();
  renderPwd();
  await renderMyPosts();
})();

/* Hyw-blog · 公共工具 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ------------------------------------------------------------------ api -- */

export async function api(path, options = {}) {
  const opts = { credentials: 'same-origin', ...options };
  if (opts.body && !(opts.body instanceof FormData)) {
    opts.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(`/api${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

/* ---------------------------------------------------------------- toast -- */

let toastTimer;
export function toast(msg, isError = false) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = isError ? 'show err' : 'show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ''), 2600);
}

/* ---------------------------------------------------------------- utils -- */

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

/** SQLite 的 'YYYY-MM-DD HH:MM:SS' 是 UTC，转成本地 Date */
function parseUTC(s) {
  return new Date(String(s).replace(' ', 'T') + 'Z');
}

export function fmtDate(s) {
  const d = parseUTC(s);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

export function fmtRelative(s) {
  const diff = (Date.now() - parseUTC(s)) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  return fmtDate(s);
}

export function initials(name) {
  const n = String(name || '?').trim();
  return /[\u4e00-\u9fa5]/.test(n[0]) ? n[0] : n.slice(0, 2).toUpperCase();
}

export function avatarHTML(user, cls = '') {
  return `<div class="avatar ${cls}" style="background:${esc(user.avatarColor || '#4ade80')}">${esc(
    initials(user.displayName)
  )}</div>`;
}

/* ------------------------------------------------------------------ nav -- */

export let currentUser = null;
export let siteSettings = null;

export async function loadUser() {
  try {
    const { user } = await api('/auth/me');
    currentUser = user;
  } catch {
    currentUser = null;
  }
  return currentUser;
}

const ICON = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
  cog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
};

export function renderNav(active = '') {
  const el = $('#nav');
  if (!el) return;
  const isOn = (k) => (active === k ? 'on' : '');

  el.innerHTML = `
    <div class="wrap nav-in">
      <a class="brand" href="/">
        <span class="brand-mark">H</span>
        <span class="brand-text">Hyw<span>-</span>blog</span>
      </a>
      <nav class="nav-links">
        <a href="/" class="${isOn('home')}">首页</a>
        <a href="/?scope=community" class="${isOn('community')}">社区</a>
      </nav>
      <div class="nav-spacer"></div>
      <form class="nav-search" id="navSearch">
        ${ICON.search}
        <input type="search" name="q" placeholder="搜索文章…" autocomplete="off" />
        <kbd>/</kbd>
      </form>
      ${
        currentUser
          ? `<a class="btn btn-primary" href="/editor">${ICON.pen}<span>写文章</span></a>
             ${
               currentUser.isOwner
                 ? `<a class="btn btn-ghost" href="/admin" title="管理后台">${ICON.cog}<span>后台</span></a>`
                 : ''
             }
             <div class="usermenu">
               <button class="usermenu-btn" id="umBtn">${avatarHTML(currentUser)}</button>
               <div class="usermenu-pop" id="umPop">
                 <div class="usermenu-head">
                   <b>${esc(currentUser.displayName)}${
                     currentUser.isOwner ? ' <span class="badge-owner">站长</span>' : ''
                   }</b>
                   <small>@${esc(currentUser.username)}</small>
                 </div>
                 <a href="/me">${ICON.user}个人中心</a>
                 <button id="logoutBtn">${ICON.out}退出登录</button>
               </div>
             </div>`
          : `<a class="btn btn-ghost" href="/login">登录</a>
             <a class="btn btn-primary" href="/login?tab=register">注册</a>`
      }
    </div>`;

  $('#navSearch')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = new FormData(e.target).get('q').toString().trim();
    location.href = q ? `/?q=${encodeURIComponent(q)}` : '/';
  });

  const pop = $('#umPop');
  $('#umBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    pop.classList.toggle('open');
  });
  document.addEventListener('click', () => pop?.classList.remove('open'));

  $('#logoutBtn')?.addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' });
    location.href = '/';
  });

  // 按 / 聚焦搜索框
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      e.preventDefault();
      $('#navSearch input')?.focus();
    }
  });
}

export function renderFooter() {
  const el = $('#footer');
  if (!el) return;
  el.className = 'footer';
  el.innerHTML = `
    <span>${esc(siteSettings?.site_title || 'Hyw-blog')}</span>
    <span style="opacity:.4">·</span>
    <span>${esc(siteSettings?.footer_text || 'Node.js + Express + SQLite')}</span>
    <span class="sp"></span>
    <span>© ${new Date().getFullYear()}</span>`;
}

/** 页面通用初始化 */
export async function boot(active = '') {
  await loadUser();
  try {
    const { settings } = await api('/site');
    siteSettings = settings;
    const desc = siteSettings?.site_description?.trim();
    if (desc) {
      let meta = document.querySelector('meta[name="description"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'description';
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', desc);
    }
  } catch {
    /* 取不到设置就不阻塞页面 */
  }
  renderNav(active);
  renderFooter();
  return currentUser;
}

import { $, api, boot, esc, fmtDate, avatarHTML, toast } from './common.js';

const params = new URLSearchParams(location.search);

const state = {
  scope: params.get('scope') || 'owner',
  tag: params.get('tag') || '',
  q: params.get('q') || '',
  page: 1,
  limit: 8,
  loaded: [],
};

let site = null;

/* ----------------------------------------------------------------- hero -- */

function renderHero() {
  const o = site.owner;
  const s = site.stats;
  if (!o) return;

  $('#hero').innerHTML = `
    <div class="hero-grid">
      <div>
        <div class="hero-kicker">${esc(site.settings?.site_kicker || 'hyw-blog · 自建博客')}</div>
        <h1>${esc(o.displayName)} 的<em>${esc(site.settings?.hero_suffix || '自留地')}</em></h1>
        <p class="hero-bio">${esc(o.bio || '还没有写简介。')}</p>
        <div class="hero-stats">
          <div><b>${s.ownerPosts}</b><span>站长文章</span></div>
          <div><b>${s.posts}</b><span>全站文章</span></div>
          <div><b>${s.users}</b><span>注册用户</span></div>
          <div><b>${s.comments}</b><span>条评论</span></div>
        </div>
      </div>
      <div class="term">
        <div class="term-bar"><i></i><i></i><i></i><span>~/hyw-blog</span></div>
        <div class="term-body">
          <div><span class="g">$</span> whoami</div>
          <div class="l">${esc(o.displayName)} · @${esc(o.username)}</div>
          <div><span class="g">$</span> cat stack.txt</div>
          <div><span class="b">node</span> <span class="l">·</span> <span class="p">express</span> <span class="l">·</span> <span class="b">sqlite</span></div>
          <div><span class="g">$</span> <span class="term-cursor"></span></div>
        </div>
      </div>
    </div>`;
}

/* ----------------------------------------------------------------- tags -- */

async function renderTags() {
  const { tags } = await api('/tags');
  const bar = $('#tagbar');
  if (!tags.length) return (bar.innerHTML = '');

  bar.innerHTML =
    `<button class="tag ${state.tag ? '' : 'on'}" data-tag="">全部标签</button>` +
    tags
      .map(
        (t) =>
          `<button class="tag ${state.tag === t.name ? 'on' : ''}" data-tag="${esc(
            t.name
          )}">${esc(t.name)}<em>${t.count}</em></button>`
      )
      .join('');

  bar.onclick = (e) => {
    const btn = e.target.closest('.tag');
    if (!btn) return;
    state.tag = btn.dataset.tag;
    state.page = 1;
    sync();
    load(true);
  };
}

/* ---------------------------------------------------------------- posts -- */

function cardHTML(p) {
  const cover = p.cover
    ? `<div class="card-cover" style="background-image:url('${esc(p.cover)}')"></div>`
    : '';
  const tags = p.tags.length
    ? `<div class="card-tags">${p.tags.map((t) => `<span># ${esc(t)}</span>`).join('')}</div>`
    : '';

  return `
    <a class="card" href="/post?id=${p.id}">
      ${cover}
      <div class="card-body">
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.summary)}</p>
        ${tags}
        <div class="card-foot">
          ${avatarHTML(p.author, 'avatar-sm')}
          <span class="who">${esc(p.author.displayName)}</span>
          ${p.author.isOwner ? '<span class="badge-owner">站长</span>' : ''}
          <span class="dot">·</span>
          <span>${fmtDate(p.createdAt)}</span>
          <span class="metas">
            <span>${p.views} 阅读</span>
            <span>${p.commentCount} 评论</span>
          </span>
        </div>
      </div>
    </a>`;
}

async function load(reset = false) {
  if (reset) {
    state.page = 1;
    state.loaded = [];
    $('#posts').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
  }

  const qs = new URLSearchParams({
    scope: state.scope,
    page: state.page,
    limit: state.limit,
  });
  if (state.tag) qs.set('tag', state.tag);
  if (state.q) qs.set('q', state.q);

  let data;
  try {
    data = await api(`/posts?${qs}`);
  } catch (err) {
    $('#posts').innerHTML = `<div class="empty"><b>加载失败</b><span class="mono">${esc(
      err.message
    )}</span></div>`;
    return;
  }

  state.loaded.push(...data.posts);

  const box = $('#posts');
  if (!state.loaded.length) {
    box.classList.remove('two');
    box.innerHTML = `
      <div class="empty">
        <b>${state.q ? '没有匹配的文章' : '这里还什么都没有'}</b>
        <span class="mono">${
          state.q
            ? `grep "${esc(state.q)}" → 0 results`
            : state.scope === 'community'
              ? '还没有其他用户发表过文章'
              : '登录后点右上角「写文章」开始'
        }</span>
      </div>`;
  } else {
    box.classList.add('two');
    box.innerHTML = state.loaded.map(cardHTML).join('');
  }

  $('#listInfo').innerHTML = `共 <b>${data.total}</b> 篇`;

  $('#moreBox').innerHTML = data.hasMore
    ? '<button class="btn" id="moreBtn">加载更多</button>'
    : '';
  $('#moreBtn')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = '加载中…';
    state.page += 1;
    await load();
  });
}

/* ------------------------------------------------------------ 状态同步 --- */

function sync() {
  const qs = new URLSearchParams();
  if (state.scope !== 'owner') qs.set('scope', state.scope);
  if (state.tag) qs.set('tag', state.tag);
  if (state.q) qs.set('q', state.q);
  const url = qs.toString() ? `/?${qs}` : '/';
  history.replaceState(null, '', url);

  document.querySelectorAll('#tabs button').forEach((b) => {
    b.classList.toggle('on', b.dataset.scope === state.scope);
  });

  $('#clearBox').innerHTML =
    state.q || state.tag
      ? `<button class="btn btn-sm btn-ghost" id="clearBtn">✕ 清除筛选${
          state.q ? `：“${esc(state.q)}”` : ''
        }</button>`
      : '';
  $('#clearBtn')?.addEventListener('click', () => {
    state.q = '';
    state.tag = '';
    sync();
    renderTags();
    load(true);
  });
}

/* ----------------------------------------------------------------- init -- */

(async function init() {
  await boot(state.scope === 'community' ? 'community' : 'home');

  try {
    site = await api('/site');
    document.title = `${site.settings?.site_title || 'Hyw-blog'}${
      site.owner ? ' · ' + site.owner.displayName : ''
    }`;
    renderHero();
  } catch (e) {
    toast(e.message, true);
  }

  $('#tabs').onclick = (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.scope = btn.dataset.scope;
    sync();
    load(true);
  };

  sync();
  await renderTags();
  await load(true);
})();

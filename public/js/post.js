import {
  $, api, boot, esc, fmtDate, fmtRelative, avatarHTML, toast, currentUser,
} from './common.js';

const id = Number(new URLSearchParams(location.search).get('id'));
let me = null;

/* ---------------------------------------------------------------- 文章 --- */

async function renderArticle() {
  let data;
  try {
    data = await api(`/posts/${id}`);
  } catch (err) {
    $('#article').innerHTML = `<div class="empty"><b>文章不见了</b>
      <span class="mono">${esc(err.message)}</span>
      <div style="margin-top:18px"><a class="btn" href="/">回首页</a></div></div>`;
    return null;
  }

  const p = data.post;
  document.title = `${p.title} · Hyw-blog`;

  const cover = p.cover
    ? `<img class="article-cover" src="${esc(p.cover)}" alt="${esc(p.title)}" />`
    : '';

  const actions = p.canEdit
    ? `<div class="article-actions">
         <a class="btn btn-sm" href="/editor?id=${p.id}">编辑</a>
         <button class="btn btn-sm btn-danger" id="delPost">删除</button>
       </div>`
    : '';

  const tags = p.tags.length
    ? `<div class="article-tags">${p.tags
        .map((t) => `<a class="tag" href="/?scope=all&tag=${encodeURIComponent(t)}"># ${esc(t)}</a>`)
        .join('')}</div>`
    : '';

  const pager =
    data.prev || data.next
      ? `<div class="pager">
           ${
             data.prev
               ? `<a href="/post?id=${data.prev.id}"><small>← 上一篇</small><b>${esc(
                   data.prev.title
                 )}</b></a>`
               : '<span></span>'
           }
           ${
             data.next
               ? `<a class="next" href="/post?id=${data.next.id}"><small>下一篇 →</small><b>${esc(
                   data.next.title
                 )}</b></a>`
               : '<span></span>'
           }
         </div>`
      : '';

  $('#article').innerHTML = `
    ${cover}
    <h1>${esc(p.title)}</h1>
    <div class="article-meta">
      ${avatarHTML(p.author, 'avatar-sm')}
      <span>${esc(p.author.displayName)}</span>
      ${p.author.isOwner ? '<span class="badge-owner">站长</span>' : ''}
      <span style="opacity:.4">·</span>
      <span class="mono">${fmtDate(p.createdAt)}</span>
      <span style="opacity:.4">·</span>
      <span class="mono">${p.views} 阅读</span>
      ${actions}
    </div>
    <div class="prose">${p.html}</div>
    ${tags}
    ${pager}`;

  $('#delPost')?.addEventListener('click', async () => {
    if (!confirm('确定删除这篇文章？删除后无法恢复。')) return;
    try {
      await api(`/posts/${p.id}`, { method: 'DELETE' });
      toast('已删除');
      setTimeout(() => (location.href = '/'), 700);
    } catch (e) {
      toast(e.message, true);
    }
  });

  return p;
}

/* ---------------------------------------------------------------- 评论 --- */

function commentHTML(c) {
  return `
    <div class="comment" data-id="${c.id}">
      ${avatarHTML(c.author)}
      <div class="comment-main">
        <div class="comment-head">
          <b>${esc(c.author.displayName)}</b>
          ${c.author.isOwner ? '<span class="badge-owner">站长</span>' : ''}
          <time>${fmtRelative(c.createdAt)}</time>
          ${
            c.canDelete
              ? '<button class="btn btn-sm btn-ghost del" data-del>删除</button>'
              : ''
          }
        </div>
        <div class="comment-body">${esc(c.content)}</div>
      </div>
    </div>`;
}

async function renderComments() {
  const box = $('#comments');
  box.hidden = false;

  const { comments } = await api(`/posts/${id}/comments`);

  const form = me
    ? `<div class="comment-form">
         ${avatarHTML(me)}
         <div style="flex:1">
           <textarea id="cText" placeholder="说点什么…（Ctrl + Enter 发送）" maxlength="1000"></textarea>
           <div class="comment-form-foot">
             <button class="btn btn-primary btn-sm" id="cSend">发表评论</button>
             <small id="cCount">0 / 1000</small>
           </div>
         </div>
       </div>`
    : `<div class="comment-login">
         <a href="/login?next=${encodeURIComponent(location.pathname + location.search)}">登录</a>
         后即可参与评论
       </div>`;

  box.innerHTML = `
    <h2>评论 <span>${comments.length}</span></h2>
    ${form}
    <div id="cList">${
      comments.length
        ? comments.map(commentHTML).join('')
        : '<div class="empty" style="padding:34px"><span class="mono">// 还没有人评论</span></div>'
    }</div>`;

  const text = $('#cText');
  text?.addEventListener('input', () => {
    $('#cCount').textContent = `${text.value.length} / 1000`;
  });
  text?.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') send();
  });
  $('#cSend')?.addEventListener('click', send);

  async function send() {
    const content = text.value.trim();
    if (!content) return toast('评论不能为空', true);
    const btn = $('#cSend');
    btn.disabled = true;
    try {
      await api(`/posts/${id}/comments`, { method: 'POST', body: { content } });
      text.value = '';
      toast('评论已发表');
      await renderComments();
    } catch (e) {
      toast(e.message, true);
      btn.disabled = false;
    }
  }

  $('#cList').onclick = async (e) => {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    const cid = btn.closest('.comment').dataset.id;
    if (!confirm('删除这条评论？')) return;
    try {
      await api(`/comments/${cid}`, { method: 'DELETE' });
      toast('已删除');
      await renderComments();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

/* ----------------------------------------------------------------- init -- */

(async function init() {
  me = await boot();

  if (!id) {
    $('#article').innerHTML =
      '<div class="empty"><b>缺少文章 id</b><a class="btn" style="margin-top:14px" href="/">回首页</a></div>';
    return;
  }

  const post = await renderArticle();
  if (post) await renderComments();
})();

import { $, $$, api, boot, esc } from './common.js';

const params = new URLSearchParams(location.search);
const next = params.get('next') || '/';
let tab = params.get('tab') === 'register' ? 'register' : 'login';

function setTab(name) {
  tab = name;
  $$('.auth-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));

  const isReg = name === 'register';
  $('#authTitle').textContent = isReg ? '创建账号' : '欢迎回来';
  $('#authSub').textContent = isReg
    ? '注册后你就有了自己的作者身份，可以在这里发文章。'
    : '登录之后就可以发表文章和评论了。';
  $('#nameRow').hidden = !isReg;
  $('#submitBtn').textContent = isReg ? '注册并登录' : '登录';
  $('#password').setAttribute('autocomplete', isReg ? 'new-password' : 'current-password');
  $('#msg').className = 'form-msg';

  const url = new URL(location.href);
  isReg ? url.searchParams.set('tab', 'register') : url.searchParams.delete('tab');
  history.replaceState(null, '', url);
}

function showMsg(text, ok = false) {
  const el = $('#msg');
  el.textContent = text;
  el.className = `form-msg ${ok ? 'ok' : 'err'}`;
}

(async function init() {
  const user = await boot();
  if (user) {
    location.replace(next);
    return;
  }

  $$('.auth-tabs button').forEach((b) =>
    b.addEventListener('click', () => setTab(b.dataset.tab))
  );
  setTab(tab);

  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#submitBtn');
    btn.disabled = true;

    const body = {
      username: $('#username').value.trim(),
      password: $('#password').value,
    };
    if (tab === 'register') body.displayName = $('#displayName').value.trim();

    try {
      await api(`/auth/${tab}`, { method: 'POST', body });
      showMsg(tab === 'register' ? '注册成功，正在进入…' : '登录成功，正在进入…', true);
      setTimeout(() => location.replace(next), 500);
    } catch (err) {
      showMsg(esc(err.message));
      btn.disabled = false;
    }
  });
})();

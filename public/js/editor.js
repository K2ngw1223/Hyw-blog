import { $, api, boot, esc, toast } from './common.js';

const editId = Number(new URLSearchParams(location.search).get('id')) || 0;
const DRAFT_KEY = 'hyw-blog:draft';

let cover = '';
let dirty = false;
let coverMode = false; // 上传的图片是当封面还是插进正文

/* -------------------------------------------------------------- 预览 ----- */

let renderTimer;
function schedulePreview() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderPreview, 260);
}

async function renderPreview() {
  const content = $('#md').value;
  $('#wc').textContent = `${content.length} 字符`;
  try {
    const { html } = await api('/render', { method: 'POST', body: { content } });
    $('#preview').innerHTML = html;
  } catch {
    /* 预览失败不打扰用户 */
  }
}

/* ------------------------------------------------------- Markdown 工具 -- */

function surround(before, after = before, placeholder = '') {
  const ta = $('#md');
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const sel = value.slice(s, e) || placeholder;
  ta.value = value.slice(0, s) + before + sel + after + value.slice(e);
  ta.focus();
  ta.setSelectionRange(s + before.length, s + before.length + sel.length);
  onInput();
}

function prefixLine(prefix) {
  const ta = $('#md');
  const { selectionStart: s, value } = ta;
  const lineStart = value.lastIndexOf('\n', s - 1) + 1;
  ta.value = value.slice(0, lineStart) + prefix + value.slice(lineStart);
  ta.focus();
  ta.setSelectionRange(s + prefix.length, s + prefix.length);
  onInput();
}

const MD_ACTIONS = {
  h2: () => prefixLine('## '),
  bold: () => surround('**', '**', '粗体'),
  italic: () => surround('*', '*', '斜体'),
  code: () => surround('\n```js\n', '\n```\n', 'console.log(1)'),
  link: () => surround('[', '](https://)', '链接文字'),
  quote: () => prefixLine('> '),
  list: () => prefixLine('- '),
  img: () => pickImage(false),
};

/* -------------------------------------------------------------- 上传 ----- */

function pickImage(asCover) {
  coverMode = asCover;
  $('#filePicker').value = '';
  $('#filePicker').click();
}

async function uploadFile(file, asCover) {
  if (!file || !file.type.startsWith('image/')) return;
  const fd = new FormData();
  fd.append('file', file);
  toast('上传中…');
  try {
    const { url } = await api('/upload', { method: 'POST', body: fd });
    if (asCover) {
      cover = url;
      renderCover();
      toast('封面已设置');
    } else {
      const ta = $('#md');
      const pos = ta.selectionStart;
      const snippet = `\n![${file.name.replace(/\.[^.]+$/, '')}](${url})\n`;
      ta.value = ta.value.slice(0, pos) + snippet + ta.value.slice(pos);
      ta.focus();
      ta.setSelectionRange(pos + snippet.length, pos + snippet.length);
      onInput();
      toast('图片已插入');
    }
  } catch (e) {
    toast(e.message, true);
  }
}

function renderCover() {
  $('#coverBox').innerHTML = cover
    ? `<span class="cover-chip"><img src="${esc(cover)}" alt="" />
         <span>已设置</span><button id="rmCover" title="移除">✕</button></span>`
    : '';
  $('#rmCover')?.addEventListener('click', () => {
    cover = '';
    renderCover();
    markDirty();
  });
}

/* -------------------------------------------------------------- 草稿 ----- */

function collect() {
  return {
    title: $('#title').value.trim(),
    content: $('#md').value,
    summary: $('#summary').value.trim(),
    cover,
    tags: $('#tags')
      .value.split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

let saveTimer;
function markDirty() {
  dirty = true;
  $('#saveState').textContent = '未保存';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (editId) return; // 编辑已有文章时不写本地草稿
    localStorage.setItem(DRAFT_KEY, JSON.stringify(collect()));
    $('#saveState').textContent = '草稿已存本地';
  }, 900);
}

function onInput() {
  markDirty();
  schedulePreview();
}

/* -------------------------------------------------------------- 发布 ----- */

async function submit(status) {
  const data = collect();
  if (!data.title) return toast('标题还没写', true);
  if (!data.content.trim()) return toast('正文还是空的', true);

  const btn = status === 'draft' ? $('#draftBtn') : $('#publishBtn');
  const other = status === 'draft' ? $('#publishBtn') : $('#draftBtn');
  const label = btn.textContent;
  btn.disabled = true;
  other.disabled = true;
  btn.textContent = '保存中…';

  try {
    const res = editId
      ? await api(`/posts/${editId}`, { method: 'PUT', body: { ...data, status } })
      : await api('/posts', { method: 'POST', body: { ...data, status } });

    localStorage.removeItem(DRAFT_KEY);
    dirty = false;
    toast(status === 'draft' ? '已存为草稿' : editId ? '已保存' : '发布成功');

    if (status === 'draft' && !editId) {
      // 新建的草稿跳转到其编辑页，方便继续修改
      setTimeout(() => (location.href = `/editor?id=${res.id}`), 500);
    } else {
      setTimeout(() => (location.href = `/post?id=${res.id}`), 500);
    }
  } catch (e) {
    toast(e.message, true);
    btn.disabled = false;
    btn.textContent = label;
  } finally {
    other.disabled = false;
  }
}

async function publish() {
  await submit('published');
}

async function saveDraft() {
  await submit('draft');
}

/* ---------------------------------------------------------------- init -- */

(async function init() {
  const user = await boot();
  if (!user) {
    location.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    return;
  }

  if (editId) {
    $('#publishBtn').textContent = '保存';
    document.title = '编辑文章 · Hyw-blog';
    try {
      const { post } = await api(`/posts/${editId}`);
      if (!post.canEdit) {
        toast('你不能编辑这篇文章', true);
        setTimeout(() => (location.href = `/post?id=${editId}`), 900);
        return;
      }
      $('#title').value = post.title;
      $('#md').value = post.content;
      $('#summary').value = post.summary;
      $('#tags').value = post.tags.join(', ');
      cover = post.cover || '';
    } catch (e) {
      toast(e.message, true);
    }
  } else {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const d = JSON.parse(saved);
        if ((d.title || d.content) && confirm('检测到未发布的草稿，要继续编辑吗？')) {
          $('#title').value = d.title || '';
          $('#md').value = d.content || '';
          $('#summary').value = d.summary || '';
          $('#tags').value = (d.tags || []).join(', ');
          cover = d.cover || '';
        } else {
          localStorage.removeItem(DRAFT_KEY);
        }
      } catch {
        localStorage.removeItem(DRAFT_KEY);
      }
    }
  }

  renderCover();
  renderPreview();

  ['#title', '#md', '#summary', '#tags'].forEach((sel) =>
    $(sel).addEventListener('input', sel === '#md' ? onInput : markDirty)
  );

  document.querySelector('.md-tools').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-md]');
    if (btn) MD_ACTIONS[btn.dataset.md]?.();
  });

  // Tab 缩进
  $('#md').addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      surround('  ', '');
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      publish();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      MD_ACTIONS.bold();
    }
  });

  $('#publishBtn').addEventListener('click', publish);
  $('#draftBtn').addEventListener('click', saveDraft);
  $('#coverBtn').addEventListener('click', () => pickImage(true));
  $('#filePicker').addEventListener('change', (e) => uploadFile(e.target.files[0], coverMode));

  // 粘贴图片
  $('#md').addEventListener('paste', (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (item) {
      e.preventDefault();
      uploadFile(item.getAsFile(), false);
    }
  });

  // 拖拽上传
  const hint = $('#dropHint');
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    if (![...e.dataTransfer.types].includes('Files')) return;
    dragDepth++;
    hint.classList.add('on');
  });
  window.addEventListener('dragleave', () => {
    if (--dragDepth <= 0) hint.classList.remove('on');
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    hint.classList.remove('on');
    uploadFile(e.dataTransfer.files[0], false);
  });

  window.addEventListener('beforeunload', (e) => {
    if (dirty) e.preventDefault();
  });
})();

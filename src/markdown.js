import { Marked } from 'marked';
import hljs from 'highlight.js';
import sanitizeHtml from 'sanitize-html';

const marked = new Marked({ gfm: true, breaks: true });

marked.use({
  renderer: {
    // marked v12 传 (code, infostring)，v13+ 传 token 对象，兼容两种写法
    code(codeOrToken, infostring) {
      const isToken = typeof codeOrToken === 'object' && codeOrToken !== null;
      const text = isToken ? codeOrToken.text : String(codeOrToken ?? '');
      const rawLang = (isToken ? codeOrToken.lang : infostring) || '';
      const lang = String(rawLang).split(/\s+/)[0];

      const language = lang && hljs.getLanguage(lang) ? lang : null;
      const html = language
        ? hljs.highlight(text, { language }).value
        : hljs.highlightAuto(text).value;
      const label = language || 'text';
      return `<pre class="code-block" data-lang="${label}"><code class="hljs language-${label}">${html}</code></pre>`;
    },
  },
});

const SANITIZE_OPTIONS = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    'img', 'h1', 'h2', 'del', 'input', 'figure', 'figcaption',
  ],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    code: ['class'],
    span: ['class'],
    pre: ['class', 'data-lang'],
    img: ['src', 'alt', 'title', 'loading'],
    a: ['href', 'title', 'target', 'rel'],
    input: ['type', 'checked', 'disabled'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'data'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
    img: sanitizeHtml.simpleTransform('img', { loading: 'lazy' }),
  },
};

export function renderMarkdown(md) {
  return sanitizeHtml(marked.parse(md || ''), SANITIZE_OPTIONS);
}

// 从正文里抽一段纯文本当摘要
export function autoSummary(md, max = 110) {
  const text = String(md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/[*_`~|>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
}

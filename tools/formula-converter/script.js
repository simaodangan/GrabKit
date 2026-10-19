const $ = (id) => document.getElementById(id);
function escapeHTML(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function mdInline(s) {
  return escapeHTML(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}
function simpleMarkdown(s) {
  const lines = s.replace(/\r\n?/g, '\n').split('\n'),
    out = [];
  let paragraph = [],
    list = [],
    listType = null,
    listStart = 1;
  function flushParagraph() {
    if (paragraph.length) {
      out.push(paragraph.map((line) => '<p>' + mdInline(line) + '</p>').join('\n'));
      paragraph = [];
    }
  }
  function flushList() {
    if (list.length) {
      const start = listType === 'ol' && listStart !== 1 ? ' start="' + listStart + '"' : '';
      out.push(
        '<' +
          listType +
          start +
          '>' +
          list.map((x) => '<li>' + mdInline(x) + '</li>').join('') +
          '</' +
          listType +
          '>'
      );
      list = [];
      listType = null;
    }
  }
  function flush() {
    flushParagraph();
    flushList();
  }
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      flush();
      continue;
    }
    const h = t.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      flush();
      out.push('<h' + h[1].length + '>' + mdInline(h[2]) + '</h' + h[1].length + '>');
      continue;
    }
    const li = t.match(/^[-*+]\s+(.+)$/),
      ordered = t.match(/^(\d+)[.)]\s+(.+)$/);
    if (li || ordered) {
      flushParagraph();
      const type = ordered ? 'ol' : 'ul';
      if (listType && listType !== type) flushList();
      if (!list.length) {
        listType = type;
        listStart = ordered ? Number(ordered[1]) : 1;
      }
      list.push(ordered ? ordered[2] : li[1]);
      continue;
    }
    flushList();
    paragraph.push(t);
  }
  flush();
  return out.join('\n');
}
function extractMath(src) {
  let holder = [],
    token = (i) => 'ZZMATHPLACEHOLDER' + i + 'ZZ';
  function add(tex, display) {
    let i = holder.length;
    holder.push({ tex, display });
    return '\n' + token(i) + '\n';
  }
  // Protect fenced code; math parsing is otherwise intended for GPT manuscript prose.
  let s = src.replace(/\$\$([\s\S]+?)\$\$/g, (_, v) => add(v, true));
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, v) => add(v, true));
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, v) => tokenAdd(v, false));
  function tokenAdd(tex, display) {
    let i = holder.length;
    holder.push({ tex, display });
    return token(i);
  }
  s = s.replace(/\$(?!\s)([^$\n]+?)(?<!\s)\$/g, (_, v) => tokenAdd(v, false));
  return { s, holder, token };
}
function buildMath(tex, display) {
  try {
    let xml = MathJax.tex2mml(tex, { display });
    let doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('MathML 解析失败');
    let m = doc.documentElement;
    m.setAttribute('xmlns', 'http://www.w3.org/1998/Math/MathML');
    if (display) m.setAttribute('display', 'block');
    return display
      ? '<div class="display-math">' + new XMLSerializer().serializeToString(m) + '</div>'
      : new XMLSerializer().serializeToString(m);
  } catch (e) {
    return (
      '<span class="error" title="公式转换失败">[公式转换失败：' + escapeHTML(tex) + ']</span>'
    );
  }
}
async function convert() {
  let raw = $('source').value;
  if (!raw.trim()) {
    $('preview').innerHTML = '<p style="color:#98a2b3">转换后会在这里显示正文和数学公式。</p>';
    $('copy').disabled = true;
    $('copyTop').disabled = true;
    $('status').textContent = '等待输入';
    $('status').className = 'status';
    return;
  }
  if (!window.MathJax || !MathJax.tex2mml) {
    $('status').textContent = '等待公式引擎加载…';
    $('status').className = 'status';
    return;
  }
  try {
    await MathJax.startup.promise;
  } catch (e) {
    $('status').textContent = '本地公式引擎加载失败，请重新安装依赖后打开';
    $('status').className = 'status error';
    return;
  }
  if (raw !== $('source').value) return;
  let { s, holder, token } = extractMath(raw),
    html = simpleMarkdown(s); // Restore math tokens; block formulas are standalone paragraphs.
  for (let i = 0; i < holder.length; i++) {
    let marker = token(i),
      piece = buildMath(holder[i].tex, holder[i].display);
    html = html.replaceAll('<p>' + marker + '</p>', piece).replaceAll(marker, piece);
  }
  $('preview').innerHTML = html;
  $('copy').disabled = false;
  $('copyTop').disabled = false;
  $('status').textContent = '已转换 ' + holder.length + ' 处公式';
  $('status').className = 'status ok';
}
let toastTimer = null;
function showToast(message) {
  const toast = $('toast');
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('visible');
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
}
async function copyPreview() {
  const root = $('preview'),
    selection = window.getSelection(),
    range = document.createRange();
  selection.removeAllRanges();
  range.selectNodeContents(root);
  selection.addRange(range);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (e) {}
  selection.removeAllRanges();
  showToast(ok ? '✓ 已复制，请粘贴到 Word' : '复制未成功，请选中右侧预览后按 Ctrl+C');
}
// Automatic, debounced conversion for typing and immediate conversion after paste.
let conversionTimer = null;
function scheduleConversion(delay = 250) {
  clearTimeout(conversionTimer);
  $('status').textContent = '准备转换…';
  $('status').className = 'status';
  conversionTimer = setTimeout(convert, delay);
}
$('source').addEventListener('input', () => scheduleConversion(250));
$('source').addEventListener('paste', () => scheduleConversion(30));
$('convert').addEventListener('click', () => {
  clearTimeout(conversionTimer);
  convert();
});
// If MathJax is still loading when text is pasted, retry when the library loads.
const mathjaxScript = document.querySelector('script[src*="mathjax"]');
if (mathjaxScript) {
  mathjaxScript.addEventListener('load', () => {
    Promise.resolve(window.MathJax?.startup?.promise)
      .then(() => {
        if ($('source').value.trim()) scheduleConversion(0);
      })
      .catch(() => {
        $('status').textContent = '公式引擎初始化失败，请重新打开工具';
        $('status').className = 'status error';
      });
  });
  mathjaxScript.addEventListener('error', () => {
    $('status').textContent = '本地公式引擎缺失，请运行 npm install 后重新打开';
    $('status').className = 'status error';
  });
}
$('copy').addEventListener('click', copyPreview);
$('copyTop').addEventListener('click', copyPreview);
$('example').addEventListener('click', () => {
  $('source').value =
    '# 2.1 Printing System and Actuator Interfaces\n\n本文定义实际喷嘴体积流量为 $Q(t)$，目标体积流量为 $Q_d(t)$，挤出执行器控制命令为 $u(t)$。目标流量与打印速度之间的关系可表示为：\n\n$$\nQ_d(t)=A_d\\bigl(w_d(t),h(t)\\bigr)v(t)\n$$\n\n其中，$w_d(t)$ 为目标沉积线宽，$h(t)$ 为沉积层高，$v(t)$ 为喷嘴运动速度。';
  convert();
});

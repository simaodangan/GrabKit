const $ = (selector) => document.querySelector(selector);
function setSidebarHidden(hidden) {
  document.body.classList.toggle('sidebar-hidden', hidden);
  $('#sidebar').hidden = hidden;
  const button = $('#toggle-sidebar');
  button.setAttribute('aria-expanded', String(!hidden));
  button.setAttribute('aria-label', hidden ? '展开侧边栏' : '收起侧边栏');
  button.title = hidden ? '展开侧边栏' : '收起侧边栏';
}
try {
  setSidebarHidden(localStorage.getItem('sidebarHidden') === 'true');
} catch {
  setSidebarHidden(false);
}
$('#toggle-sidebar').onclick = () => {
  const hidden = !document.body.classList.contains('sidebar-hidden');
  setSidebarHidden(hidden);
  try {
    localStorage.setItem('sidebarHidden', String(hidden));
  } catch {
    /* 当前窗口仍可切换。 */
  }
};
let tools = [];
function readState(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter((id) => tools.some((tool) => tool.id === id)) : [];
  } catch {
    return [];
  }
}
const state = { page: 'tools', view: 'normal', filter: 'all', toolOrder: [], hiddenTools: [] };
let managing = false;
let searchResults = [];
let draggedId = null;
let trayListSignature = null;
function syncTrayTools() {
  const ids = orderedIds().filter((id) => !state.hiddenTools.includes(id));
  const signature = JSON.stringify(ids);
  if (signature === trayListSignature) return;
  trayListSignature = signature;
  window.desktop.syncTrayTools(ids).catch((error) => {
    trayListSignature = null;
    console.error('托盘工具列表同步失败', error);
  });
}
function orderedIds() {
  return [...new Set([...state.toolOrder, ...tools.map((tool) => tool.id)])];
}
function moveTool(source, target, after = false) {
  const ids = orderedIds();
  const from = ids.indexOf(source),
    to = ids.indexOf(target);
  if (from < 0 || to < 0 || from === to) return;
  ids.splice(from, 1);
  ids.splice(ids.indexOf(target) + (after ? 1 : 0), 0, source);
  state.toolOrder = ids;
  save('toolOrder');
}
$('#arrange-tools').onclick = () => {
  if (!canArrange()) return;
  managing = !managing;
  draggedId = null;
  if (managing) $('#search').value = '';
  render();
};
window.addEventListener('storage', (event) => {
  if (event.key === 'hiddenTools' || event.key === null) state.hiddenTools = readState('hiddenTools');
  if (event.key === 'toolOrder' || event.key === null) state.toolOrder = readState('toolOrder');
  if (event.key === 'sidebarHidden' || event.key === null) {
    try {
      setSidebarHidden(localStorage.getItem('sidebarHidden') === 'true');
    } catch {
      setSidebarHidden(false);
    }
  }
  render();
});
let toastTimer;
function showToast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $('#toast').hidden = true;
  }, 2400);
}
function save(key) {
  try {
    localStorage.setItem(key, JSON.stringify(state[key]));
  } catch {
    showToast('无法保存偏好，本次使用仍然有效');
  }
}
function canArrange() {
  return state.page === 'tools' && state.view === 'normal';
}
function createCategories() {
  for (const category of new Set(tools.map((tool) => tool.category))) {
    const button = document.createElement('button');
    button.className = 'mode-option';
    button.dataset.mode = 'category:' + category;
    button.textContent = category;
    button.setAttribute('aria-pressed', 'false');
    $('#view-controls').append(button);
  }
}
function render() {
  syncTrayTools();
  if (!canArrange()) managing = false;
  const inventory = state.page === 'all';
  $('#section-title').textContent = '分类';
  $('#breadcrumb').textContent = inventory ? '全部工具' : '我的工具';
  $('#view-controls').hidden = inventory;
  $('#filter-controls').hidden = !inventory;
  const query = $('#search').value.trim().toLowerCase();
  const searchPool = tools.filter((tool) =>
    (tool.name + ' ' + tool.description + ' ' + tool.keywords).toLowerCase().includes(query)
  );
  document.querySelectorAll('[data-mode]').forEach((button) => {
    const mode = button.dataset.mode;
    const label = mode === 'normal' ? '普通模式' : mode === 'hidden' ? '隐藏工具' : mode.slice(9);
    const count = searchPool.filter((tool) => {
      const hidden = state.hiddenTools.includes(tool.id);
      return mode === 'hidden' ? hidden : !hidden && (mode === 'normal' || tool.category === mode.slice(9));
    }).length;
    button.textContent = label + '（' + count + '）';
    button.setAttribute('aria-pressed', String(mode === state.view));
  });
  document.querySelectorAll('[data-filter]').forEach((button) => {
    const filter = button.dataset.filter;
    const label = filter === 'all' ? '所有工具' : filter === 'visible' ? '已显示的工具' : '已隐藏的工具';
    const count = searchPool.filter((tool) => filter === 'all' ||
      (filter === 'hidden' ? state.hiddenTools.includes(tool.id) : !state.hiddenTools.includes(tool.id))).length;
    button.textContent = label + '（' + count + '）';
    button.setAttribute('aria-pressed', String(filter === state.filter));
  });
  $('#arrange-tools').hidden = !canArrange();
  $('#arrange-tools').textContent = managing ? '完成排列' : '排列';
  $('#arrange-tools').setAttribute('aria-pressed', String(managing));
  $('#manage-hint').hidden = !managing;
  $('#manage-hint').textContent = managing
    ? '拖动卡片调整顺序，排列自动保存。点击“完成排列”退出。'
    : '';
  $('#search').disabled = managing;
  $('#tool-grid').classList.toggle('editing-order', managing);
  const matches = searchPool.filter((tool) =>
    inventory || !state.view.startsWith('category:') || tool.category === state.view.slice(9)
  );
  const visible = matches.filter((tool) => {
    const hidden = state.hiddenTools.includes(tool.id);
    if (inventory) return state.filter === 'all' || (state.filter === 'hidden' ? hidden : !hidden);
    return state.view === 'hidden' ? hidden : !hidden;
  });
  const ids = orderedIds();
  visible.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  searchResults = visible;
  $('#tool-grid').replaceChildren();
  for (const tool of visible) $('#tool-grid').append(createToolCard(tool));
  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    const hiddenCount = matches.filter((tool) => state.hiddenTools.includes(tool.id)).length;
    empty.textContent = query
      ? (!inventory && state.view !== 'hidden' && hiddenCount
        ? '匹配的工具已隐藏，请切换到“隐藏工具”查看。'
        : '没有找到匹配的工具，试试其他关键词。')
      : !inventory && state.view === 'hidden' ? '还没有隐藏的工具。' : '当前模式下暂无工具。';
    $('#tool-grid').append(empty);
  }
  $('#hidden-match-hint').hidden = inventory || state.view === 'hidden' || !query;
  const hiddenCount = matches.filter((tool) => state.hiddenTools.includes(tool.id)).length;
  $('#hidden-match-hint').textContent = hiddenCount ? '另有 ' + hiddenCount + ' 个隐藏工具匹配搜索，查看隐藏工具' : '';
  if (!hiddenCount) $('#hidden-match-hint').hidden = true;
}
function setToolHidden(id, hidden) {
  state.hiddenTools = state.hiddenTools.filter((item) => item !== id);
  if (hidden) state.hiddenTools.push(id);
  save('hiddenTools');
  render();
}
function createToolCard(tool) {
  const card = document.createElement('article');
  card.className = 'tool-card';
  card.dataset.toolId = tool.id;
  card.draggable = false;
  let pressTimer;
  let origin;
  let active = false;
  let suppressClickUntil = 0;
  function clearTarget() {
    document.querySelectorAll('.drop-target').forEach((item) => item.classList.remove('drop-target', 'insert-after'));
  }
  function finish(event, cancel = false) {
    clearTimeout(pressTimer);
    if (!origin) return;
    if (active) {
      suppressClickUntil = Date.now() + 400;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.tool-card');
      if (!cancel && target?.dataset.toolId && target !== card) {
        const bounds = target.getBoundingClientRect();
        moveTool(tool.id, target.dataset.toolId, event.clientX >= bounds.left + bounds.width / 2);
      }
    }
    origin = null;
    draggedId = null;
    card.classList.remove('dragging');
    clearTarget();
    if (card.hasPointerCapture(event.pointerId)) card.releasePointerCapture(event.pointerId);
    if (active) { active = false; render(); }
  }
  card.onpointerdown = (event) => {
    if (!canArrange() || event.button !== 0) return;
    origin = { x: event.clientX, y: event.clientY };
    const activate = () => {
      if (!origin || !card.isConnected) return;
      card.setPointerCapture(event.pointerId);
      managing = true;
      active = true;
      draggedId = tool.id;
      $('#search').value = '';
      $('#search').disabled = true;
      $('#arrange-tools').textContent = '完成排列';
      $('#arrange-tools').setAttribute('aria-pressed', 'true');
      $('#manage-hint').hidden = false;
      $('#manage-hint').textContent = '拖动卡片调整顺序，排列自动保存。点击“完成排列”退出。';
      $('#tool-grid').classList.add('editing-order');
      card.classList.add('dragging');
    };
    if (managing) activate();
    else pressTimer = setTimeout(activate, 450);
  };
  card.onpointermove = (event) => {
    if (!origin) return;
    if (!active) {
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 8) clearTimeout(pressTimer);
      return;
    }
    event.preventDefault();
    clearTarget();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.tool-card');
    if (!target?.dataset.toolId || target === card) return;
    const bounds = target.getBoundingClientRect();
    target.classList.add('drop-target');
    target.classList.toggle('insert-after', event.clientX >= bounds.left + bounds.width / 2);
  };
  card.onpointerleave = () => { if (!active) { clearTimeout(pressTimer); origin = null; } };
  card.onpointerup = (event) => finish(event);
  card.onpointercancel = (event) => finish(event, true);
  card.onlostpointercapture = (event) => finish(event, true);
  const open = document.createElement('button');
  open.className = 'tool-open';
  open.innerHTML = `<div class="tool-identity"><span class="tool-icon ${tool.color}" aria-hidden="true"></span><span class="tool-category"></span></div><div class="tool-info"><h3></h3><p></p></div>`;
  open.querySelector('.tool-icon').textContent = tool.icon;
  open.querySelector('.tool-category').textContent = tool.category;
  open.querySelector('h3').textContent = tool.name;
  open.querySelector('p').textContent = tool.description;
  open.onclick = () => {
    if (!managing && Date.now() >= suppressClickUntil) openTool(tool);
  };
  card.append(open);
  card.oncontextmenu = async (event) => {
    event.preventDefault();
    clearTimeout(pressTimer);
    try {
      const hidden = state.hiddenTools.includes(tool.id);
      const action = await window.desktop.showToolMenu(tool.id, hidden, canArrange());
      if (action === 'show') setToolHidden(tool.id, false);
      else if (action === 'hide') setToolHidden(tool.id, true);
      else if (action === 'move-first' && canArrange()) {
        moveTool(tool.id, orderedIds()[0]);
        render();
      }
      else if (action === 'arrange' && canArrange()) {
        managing = true;
        $('#search').value = '';
        render();
      }
    } catch {
      showToast('工具菜单打开失败，请重试');
    }
  };
  if (state.page === 'all' || state.view === 'hidden') {
    const hidden = state.hiddenTools.includes(tool.id);
    card.classList.toggle('is-hidden-tool', hidden);
    const status = document.createElement('span');
    status.className = 'visibility-status';
    status.textContent = hidden ? '已隐藏' : '已显示';
    open.querySelector('.tool-info h3').append(status);
  }
  return card;
}
function showHome() { render(); }
function openTool(tool) {
  window.desktop.openTool(tool.id).catch(() => showToast('工具打开失败，请重试'));
}
function bindNavigation() {
  document.querySelectorAll('[data-page]').forEach((button) => {
    button.onclick = () => {
      state.page = button.dataset.page;
      if (state.page === 'all') state.filter = 'all';
      managing = false;
      $('#search').value = '';
      document.querySelectorAll('[data-page]').forEach((item) => item.classList.toggle('active', item === button));
      render();
    };
  });
}
$('#view-controls').onclick = (event) => {
  const button = event.target.closest('[data-mode]');
  if (!button) return;
  state.view = button.dataset.mode;
  managing = false;
  render();
};
$('#filter-controls').onclick = (event) => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  state.filter = button.dataset.filter;
  render();
};
$('#hidden-match-hint').onclick = () => {
  state.view = 'hidden';
  managing = false;
  render();
};
$('#search').oninput = render;
$('#search').onkeydown = (event) => {
  if (event.isComposing) return;
  if (event.key === 'Enter' && searchResults.length) {
    event.preventDefault();
    openTool(searchResults[0]);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    $('#search').value = '';
    render();
  }
};
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    showHome();
    $('#search').focus();
  }
});
window.desktop
  ?.getVersion()
  .then((version) => {
    $('#version').textContent = `VERSION ${version}`;
  })
  .catch(() => {});
async function initialize() {
  try {
    tools = await window.desktop.listTools();
    state.toolOrder = readState('toolOrder');
    state.hiddenTools = readState('hiddenTools');
    createCategories();
    bindNavigation();
    render();
  } catch {
    $('#tool-grid').textContent = '工具目录加载失败，请重启应用。';
  }
}
initialize();

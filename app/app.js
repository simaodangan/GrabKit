const $ = (selector) => document.querySelector(selector);
function setSidebarHidden(hidden) {
  document.body.classList.toggle('sidebar-hidden', hidden);
  $('#sidebar').hidden = hidden;
  const button = $('#toggle-sidebar');
  button.setAttribute('aria-expanded', String(!hidden));
  button.setAttribute('aria-label', hidden ? '显示导航' : '隐藏导航');
  button.title = hidden ? '显示导航' : '隐藏导航';
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
const state = { view: 'all', favorites: [], recent: [], toolOrder: [] };
let editingOrder = false;
let draggedId = null;
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
$('#edit-order').onclick = () => {
  editingOrder = !editingOrder;
  if (editingOrder) $('#search').value = '';
  render();
};
window.addEventListener('storage', (event) => {
  if (event.key === 'toolOrder' || event.key === null) state.toolOrder = readState('toolOrder');
  if (event.key === 'favorites' || event.key === null) state.favorites = readState('favorites');
  if (event.key === 'recent' || event.key === null) state.recent = readState('recent');
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
const labels = { all: '全部工具', favorites: '我的收藏', recent: '最近使用' };
function createCategories() {
  for (const category of new Set(tools.map((tool) => tool.category))) {
    const button = document.createElement('button');
    button.className = 'nav-item';
    button.dataset.view = category;
    button.textContent = category;
    $('#categories').append(button);
  }
}
function render() {
  $('#edit-order').hidden = state.view !== 'all';
  $('#edit-order').textContent = editingOrder ? '完成' : '编辑顺序';
  $('#edit-order').setAttribute('aria-pressed', String(editingOrder));
  $('#search').disabled = editingOrder;
  $('#tool-grid').classList.toggle('editing-order', editingOrder);
  const query = $('#search').value.trim().toLowerCase();
  let visible = tools.filter((tool) => {
    const inView =
      state.view === 'all' ||
      (state.view === 'favorites'
        ? state.favorites.includes(tool.id)
        : state.view === 'recent'
          ? state.recent.includes(tool.id)
          : tool.category === state.view);
    return (
      inView && `${tool.name} ${tool.description} ${tool.keywords}`.toLowerCase().includes(query)
    );
  });
  if (state.view === 'recent')
    visible.sort((a, b) => state.recent.indexOf(a.id) - state.recent.indexOf(b.id));
  else {
    const ids = orderedIds();
    visible.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  }
  $('#tool-grid').replaceChildren();
  $('#tool-count').textContent = `${visible.length} 个工具`;
  for (const tool of visible) {
    const card = document.createElement('article');
    card.className = 'tool-card';
    card.draggable = editingOrder;
    card.ondragstart = (event) => {
      if (!editingOrder) {
        event.preventDefault();
        return;
      }
      draggedId = tool.id;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', tool.id);
      card.classList.add('dragging');
    };
    card.ondragover = (event) => {
      if (!editingOrder || !draggedId || draggedId === tool.id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.drop-target').forEach((item) => {
        if (item !== card) item.classList.remove('drop-target', 'insert-after');
      });
      card.classList.add('drop-target');
      const bounds = card.getBoundingClientRect();
      card.classList.toggle('insert-after', event.clientX >= bounds.left + bounds.width / 2);
    };
    card.ondragleave = (event) => {
      if (event.relatedTarget && card.contains(event.relatedTarget)) return;
      const bounds = card.getBoundingClientRect();
      if (
        event.clientX >= bounds.left &&
        event.clientX < bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY < bounds.bottom
      )
        return;
      card.classList.remove('drop-target', 'insert-after');
    };
    card.ondragend = () => {
      draggedId = null;
      document
        .querySelectorAll('.dragging, .drop-target')
        .forEach((item) => item.classList.remove('dragging', 'drop-target', 'insert-after'));
    };
    card.ondrop = (event) => {
      event.preventDefault();
      if (!editingOrder || !draggedId) return;
      const bounds = card.getBoundingClientRect();
      moveTool(draggedId, tool.id, event.clientX >= bounds.left + bounds.width / 2);
      draggedId = null;
      render();
    };
    const open = document.createElement('button');
    open.className = 'tool-open';
    open.innerHTML = `<div class="tool-identity"><span class="tool-icon ${tool.color}" aria-hidden="true"></span><span class="tool-category"></span></div><div class="tool-info"><h3></h3><p></p></div>`;
    open.querySelector('.tool-icon').textContent = tool.icon;
    open.querySelector('.tool-category').textContent = tool.category;
    open.querySelector('h3').textContent = tool.name;
    open.querySelector('p').textContent = tool.description;
    open.onclick = () => {
      if (!editingOrder) openTool(tool);
    };
    card.oncontextmenu = async (event) => {
      event.preventDefault();
      if (editingOrder) return;
      try {
        const action = await window.desktop.showToolMenu(
          tool.id,
          state.favorites.includes(tool.id)
        );
        if (action !== 'toggle-favorite') return;
        state.favorites = state.favorites.includes(tool.id)
          ? state.favorites.filter((id) => id !== tool.id)
          : [...state.favorites, tool.id];
        save('favorites');
        render();
      } catch {
        showToast('工具菜单打开失败，请重试');
      }
    };
    card.append(open);
    $('#tool-grid').append(card);
  }
  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = query
      ? '没有找到匹配的工具，试试其他关键词。'
      : state.view === 'favorites'
        ? '右键点击工具卡片，选择“收藏”，把常用工具收藏到这里。'
        : '这里还没有记录，打开一个工具试试吧。';
    $('#tool-grid').append(empty);
  }
}
function showHome() {
  $('#breadcrumb').textContent = labels[state.view] || state.view;
  render();
}
function openTool(tool) {
  state.recent = [tool.id, ...state.recent.filter((id) => id !== tool.id)].slice(0, 20);
  save('recent');
  window.desktop.openTool(tool.id).catch(() => showToast('工具打开失败，请重试'));
  render();
}
function bindNavigation() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.onclick = () => {
      state.view = button.dataset.view;
      editingOrder = false;
      document
        .querySelectorAll('[data-view]')
        .forEach((item) => item.classList.toggle('active', item === button));
      $('#section-title').textContent = labels[state.view] || state.view;
      showHome();
    };
  });
}
$('#search').oninput = render;
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
    state.favorites = readState('favorites');
    state.recent = readState('recent');
    state.toolOrder = readState('toolOrder');
    createCategories();
    bindNavigation();
    render();
  } catch {
    $('#tool-grid').textContent = '工具目录加载失败，请重启应用。';
  }
}
initialize();

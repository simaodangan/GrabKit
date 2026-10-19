const picture = document.querySelector('#picture');
const selection = document.querySelector('#selection');
let start;
let selecting = false;
let submitting = false;
let borderWidth = 3;
let nativeViewport;
const frame = document.createElement('canvas');
frame.id = 'picture-frame';
frame.setAttribute('aria-hidden', 'true');
document.body.append(frame);
function drawFrame() {
  const scale = devicePixelRatio || 1;
  const viewport = document.documentElement.getBoundingClientRect();
  const width = nativeViewport?.[0] || Math.round(viewport.width * scale);
  const height = nativeViewport?.[1] || Math.round(viewport.height * scale);
  const border = selecting ? 0 : Math.round(borderWidth * scale);
  frame.width = width;
  frame.height = height;
  frame.style.width = `${width / scale}px`;
  frame.style.height = `${height / scale}px`;
  document.body.style.width = `${width / scale}px`;
  document.body.style.height = `${height / scale}px`;
  document.body.style.setProperty('--border', `${border / scale}px`);
  const context = frame.getContext('2d');
  context.fillStyle = '#7764d8';
  context.fillRect(0, 0, width, border);
  context.fillRect(0, height - border, width, border);
  context.fillRect(0, 0, border, height);
  context.fillRect(width - border, 0, border, height);
}
window.shot.onBorder((value) => {
  borderWidth = value;
  drawFrame();
});
window.shot.onViewport((pixels) => {
  nativeViewport = pixels;
  drawFrame();
});
new ResizeObserver(drawFrame).observe(document.documentElement);
window.addEventListener('resize', () => {
  nativeViewport = null;
  drawFrame();
});
window.shot
  .ready()
  .then((state) => {
    picture.src = state.dataUrl;
    selecting = state.selection;
    borderWidth = state.border || 0;
    nativeViewport = state.viewport;
    drawFrame();
    document.body.classList.toggle('selecting', selecting);
  })
  .catch(() => window.shot.cancel());
function point(event) {
  return {
    x: Math.max(0, Math.min(innerWidth, event.clientX)),
    y: Math.max(0, Math.min(innerHeight, event.clientY))
  };
}
function rect(end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(start.x - end.x),
    height: Math.abs(start.y - end.y)
  };
}
document.addEventListener('pointerdown', (event) => {
  if (!selecting || submitting || event.button !== 0) return;
  start = point(event);
  document.body.setPointerCapture(event.pointerId);
  selection.style.cssText = `left:${start.x}px;top:${start.y}px;width:0;height:0`;
});
document.addEventListener('pointermove', (event) => {
  if (!start) return;
  const area = rect(point(event));
  selection.style.cssText = `left:${area.x}px;top:${area.y}px;width:${area.width}px;height:${area.height}px`;
});
document.addEventListener('pointerup', async (event) => {
  if (!start || event.button !== 0) return;
  const area = rect(point(event));
  start = null;
  if (area.width < 2 || area.height < 2) return;
  submitting = true;
  try {
    await window.shot.crop({
      x: area.x / innerWidth,
      y: area.y / innerHeight,
      width: area.width / innerWidth,
      height: area.height / innerHeight
    });
  } catch {
    submitting = false;
    document.querySelector('#hint').textContent = '截图失败，请重新框选或按 Esc 取消';
  }
});
document.addEventListener('pointercancel', () => {
  start = null;
});
document.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  if (selecting) window.shot.cancel();
});

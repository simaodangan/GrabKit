const handle = document.querySelector('.handle');
let drag;
handle.addEventListener('pointerdown', event => {
  if (event.button !== 0 || drag) return;
  event.preventDefault();
  handle.setPointerCapture(event.pointerId);
  drag = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY
  };
});
function moveToolbox() {
  drag.frame = undefined;
  window.shot.moveActions({ x: drag.x, y: drag.y }).catch(console.error);
}
handle.addEventListener('pointermove', event => {
  if (drag?.pointerId !== event.pointerId || !(event.buttons & 1)) return;
  if (drag.frame === undefined) drag.frame = requestAnimationFrame(moveToolbox);
});
handle.addEventListener('pointerup', event => {
  if (drag?.pointerId !== event.pointerId || drag.frame === undefined) return;
  cancelAnimationFrame(drag.frame);
  moveToolbox();
});
handle.addEventListener('lostpointercapture', event => {
  if (drag?.pointerId !== event.pointerId) return;
  if (drag.frame !== undefined) cancelAnimationFrame(drag.frame);
  drag = null;
});

const pin = document.querySelector('[data-action="pin"]');
function updateState(state) {
  pin.setAttribute('aria-pressed', String(state.pinned));
  pin.title = state.pinned ? '取消置顶' : '置顶';
  pin.setAttribute('aria-label', pin.title);
}
window.shot.onActionsState(updateState);
window.shot.actionsState().then(updateState).catch(console.error);
document.querySelectorAll('[data-action]').forEach(button => {
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    try { await window.shot.action(button.dataset.action); }
    catch (error) { console.error(error); }
    finally { button.disabled = false; }
  });
});
document.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey) || event.repeat) return;
  const action = { c: 'copy', x: 'cut', s: 'save' }[event.key.toLowerCase()];
  if (!action) return;
  event.preventDefault();
  window.shot.action(action).catch(console.error);
});

const slider = document.querySelector('#opacity');
const output = document.querySelector('#value');
slider.disabled = true;
window.shot
  .ready()
  .then((state) => {
    slider.value = state.opacity;
    output.textContent = `${state.opacity}%`;
    slider.disabled = false;
  })
  .catch(() => window.shot.cancel());
slider.oninput = () => {
  output.textContent = `${slider.value}%`;
  window.shot.opacity(Number(slider.value)).catch(() => window.shot.cancel());
};
document.querySelector('#close').onclick = () => window.shot.cancel();
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.shot.cancel();
});
let lastHeight = 0;
function fitPanel() {
  const height = Math.ceil(document.body.getBoundingClientRect().height);
  if (height === lastHeight) return;
  lastHeight = height;
  window.shot.fitOpacity(height).catch(() => window.shot.cancel());
}
new ResizeObserver(fitPanel).observe(document.body);
document.fonts.ready.then(fitPanel);

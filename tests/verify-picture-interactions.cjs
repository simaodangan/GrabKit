const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Surface {
  constructor() {
    this.listeners = new Map();
    this.style = { setProperty() {} };
    this.classList = { contains: () => false };
  }
  addEventListener(name, callback) {
    const callbacks = this.listeners.get(name) || [];
    callbacks.push(callback);
    this.listeners.set(name, callbacks);
  }
  emit(name, event = {}) {
    for (const callback of this.listeners.get(name) || []) callback(event);
  }
  append() {}
  setAttribute() {}
  setPointerCapture() {}
}
const picture = new Surface(), document = new Surface(), window = new Surface();
const elements = [];
let animations = 0, iterations, canceled = 0;
document.body = new Surface();
document.documentElement = new Surface();
document.querySelector = selector => selector === '#picture' ? picture : new Surface();
document.createElement = () => {
  const element = new Surface();
  element.animate = (_frames, options) => {
    animations++;
    iterations = options.iterations;
    return { cancel() { canceled++; } };
  };
  elements.push(element);
  return element;
};
window.shot = {
  ready: () => new Promise(() => {}),
  onBorder() {}, onViewport() {}, onRemind() {}
};
vm.runInNewContext(fs.readFileSync(require.resolve('../tools/screenshot/picture.js'), 'utf8'), {
  window, document, ResizeObserver: class { observe() {} }
});
document.emit('dblclick', { target: picture });
assert.equal(animations, 1, '截图双击必须触发边框动画');
assert.equal(iterations, 3);
document.emit('dblclick', { target: picture });
assert.equal(canceled, 1, '连续双击应重新开始提醒');
let prevented = false;
document.emit('contextmenu', { preventDefault() { prevented = true; } });
assert.equal(prevented, false, '截图右键必须交给原生菜单');
assert.match(fs.readFileSync(require.resolve('../tools/screenshot/picture.css'), 'utf8'), /body\s*\{[^}]*-webkit-app-region:\s*drag/s);
console.log('截图交互检查通过：闪烁三次、重复触发、原生拖动、右键事件不拦截');

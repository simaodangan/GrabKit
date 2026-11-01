const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require.resolve('../tools/screenshot/backend/screenshot-service'), 'utf8');
const copySource = source.slice(source.indexOf('async function copyImage('), source.indexOf('function setPinned('));
(async () => {
  let fail = false, release, closed = 0, errors = 0;
  const copy = vm.runInNewContext(`(${copySource.trim()})`, {
    clipboard: { writeImage: () => fail ? Promise.reject(new Error('busy')) : new Promise(resolve => { release = resolve; }) },
    dialog: { showMessageBox: async () => { errors++; } }
  });
  const state = { image: {}, window: { isDestroyed: () => false, close: () => { closed++; } } };
  const pending = copy(state, true);
  assert.equal(closed, 0, '复制完成前保留图片');
  await copy(state, true);
  assert.equal(closed, 0, '重复剪切不会提前关闭');
  release();
  await pending;
  assert.equal(closed, 1, '复制成功后关闭图片');
  fail = true;
  await copy(state, true);
  assert.equal(closed, 1, '复制失败保留图片');
  assert.equal(errors, 1);
  console.log('剪切检查通过：等待复制成功、重复操作保护、失败保留图片');
})().catch(error => { console.error(error); process.exitCode = 1; });

const text = document.querySelector('#text');
window.shot.ocrReady().then(async blocks => {
  text.value = blocks.map(block => block.text).join('\n\n');
  await document.fonts.ready;
  const style = getComputedStyle(text);
  const canvas = document.createElement('canvas');
  const measure = canvas.getContext('2d');
  measure.font = style.font;
  const longest = Math.max(0,...text.value.split('\n').map(line=>measure.measureText(line).width));
  const width = Math.ceil(Math.max(240,Math.min(520,longest+48)));
  const probe = text.cloneNode();
  probe.removeAttribute('id'); probe.value = text.value;
  probe.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:0;box-sizing:border-box;border:0;padding:16px;font:${style.font};overflow:hidden`;
  document.body.append(probe);
  const height = Math.max(64,Math.min(640,probe.scrollHeight+2));
  probe.remove();
  await window.shot.ocrFit({width,height});
  text.focus();
}).catch(() => { text.value = ''; });

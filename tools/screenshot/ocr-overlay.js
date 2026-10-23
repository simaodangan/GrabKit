(() => {
  const layer = document.createElement('div');
  layer.id = 'ocr-layer';
  const notice = document.createElement('div');
  notice.id = 'ocr-notice';
  notice.setAttribute('role', 'status');
  document.body.append(layer, notice);
  const measure = document.createElement('canvas').getContext('2d');
  let timer;
  function message(text, busy = false) {
    clearTimeout(timer);
    notice.replaceChildren();
    if (busy) {
      const spinner = document.createElement('span'); spinner.className = 'ocr-spinner'; notice.append(spinner);
    }
    notice.append(document.createTextNode(text)); notice.hidden = false;
    if (!busy) timer = setTimeout(() => { notice.hidden = true; }, 4500);
  }
  // Keep each native selectable text line aligned with its OCR image rectangle.
  function fitText() {
    for (const line of layer.querySelectorAll('.ocr-line')) {
      const span = line.firstElementChild;
      const size = Math.max(1, line.getBoundingClientRect().height);
      span.style.fontSize = `${size}px`;
      measure.font = `${size}px "Microsoft YaHei", sans-serif`;
      const width = measure.measureText(span.textContent).width;
      span.style.transform = `scaleX(${width ? line.getBoundingClientRect().width / width : 1})`;
    }
  }
  new ResizeObserver(fitText).observe(layer);
  document.addEventListener('copy', event => {
    const selection = window.getSelection();
    if (!document.body.classList.contains('ocr-active') || !selection?.rangeCount ||
        !layer.contains(selection.anchorNode) || !layer.contains(selection.focusNode)) return;
    // Copy plain text so the transparent overlay style never reaches rich text editors.
    event.clipboardData.setData('text/plain', selection.toString());
    event.preventDefault();
  });
  notice.hidden = true;
  window.shot.onOcr(result => {
    window.getSelection()?.removeAllRanges();
    layer.replaceChildren();
    document.body.classList.toggle('ocr-active', result.status === 'done' && result.blocks.length > 0);
    if (result.status === 'off') { clearTimeout(timer); notice.hidden = true; return; }
    if (result.status === 'busy') { message('正在识别文字…', true); return; }
    if (result.status === 'error') { message(result.message); return; }
    clearTimeout(timer); notice.hidden = true;
    result.blocks.forEach(block => {
      const paragraph = document.createElement('div');
      paragraph.className = 'ocr-paragraph';
      for (const item of block.lines || [block]) {
        const line = document.createElement('div');
        line.className = 'ocr-line';
        line.style.cssText = `left:${item.x*100}%;top:${item.y*100}%;width:${item.width*100}%;height:${item.height*100}%`;
        const span = document.createElement('span');
        span.textContent = item.text;
        line.append(span); paragraph.append(line);
      }
      layer.append(paragraph);
    });
    fitText();
    if (!result.blocks.length) message('未识别到文字');
  });
})();

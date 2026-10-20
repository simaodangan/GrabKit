/* Annotations stay in original image coordinates; the screenshot is never flattened in memory. */
(() => {
  const image = document.querySelector('#picture');
  const canvas = document.createElement('canvas');
  canvas.id = 'annotations';
  const toolbar = document.createElement('section');
  toolbar.id = 'editor-toolbar';
  toolbar.setAttribute('aria-label', '图片编辑工具栏');
  window.createEditorControls(toolbar);
  const textInput = document.createElement('textarea');
  textInput.id = 'editor-text';
  textInput.setAttribute('aria-label', '文字内容（Ctrl+Enter 确定）');
  document.body.append(canvas, toolbar, textInput);
  const ctx = canvas.getContext('2d');
  let editing = false, tool = 'select', selected = null, gesture = null, textShape = null;
  const shapes = [];
  const field = (name) => toolbar.querySelector('#edit-' + name);
  let lastControls = '';
  function syncControls() {
    const state = { tool, selected:!!selected, properties:properties() };
    const serialized = JSON.stringify(state);
    if (serialized !== lastControls) { lastControls=serialized; window.shot.editorState(state); }
  }
  window.shot.onEditorCommand(command => {
    if (command.type === 'tool') toolbar.querySelector('[data-tool="'+command.value+'"]').click();
    else if (command.type === 'delete') remove();
    else if (command.type === 'done') window.shot.editing(false);
    else if (command.type === 'property') {
      const input=field(command.name);
      if (input) { if(input.type==='checkbox')input.checked=command.value;else input.value=command.value; input.dispatchEvent(new Event('input')); }
    }
  });
  function properties() {
    return { width: Math.max(1, Math.min(100, +field('width').value || 3)), size: Math.max(8, Math.min(300, +field('size').value || 24)), stroke: field('use-stroke').checked ? field('stroke').value : null, fill: field('use-fill').checked ? field('fill').value : null };
  }
  function bounds(s) {
    if (s.type === 'text') {
      ctx.font = `${s.size}px sans-serif`;
      const lines = s.text.split('\n');
      return { x:s.x, y:s.y, w:Math.max(10, ...lines.map(t => ctx.measureText(t).width)), h:lines.length*s.size*1.2 };
    }
    const xs = s.points.map(p => p.x), ys = s.points.map(p => p.y);
    return { x:Math.min(...xs), y:Math.min(...ys), w:Math.max(...xs)-Math.min(...xs), h:Math.max(...ys)-Math.min(...ys) };
  }
  function paint(c, s) {
    c.save(); c.lineWidth = s.width; c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = s.stroke || 'transparent'; c.fillStyle = s.fill || 'transparent';
    const b = bounds(s), a = s.points[0], z = s.points[s.points.length-1];
    c.beginPath();
    if (s.type === 'text') {
      c.font = `${s.size}px sans-serif`; c.textBaseline = 'top';
      if (s.fill) c.fillRect(b.x,b.y,b.w,b.h);
      c.fillStyle = s.stroke || 'transparent';
      s.text.split('\n').forEach((line,i) => c.fillText(line,s.x,s.y+i*s.size*1.2));
    } else {
      if (s.type === 'rect') c.rect(b.x,b.y,b.w,b.h);
      else if (s.type === 'round') c.roundRect(b.x,b.y,b.w,b.h,Math.min(12,b.w/2,b.h/2));
      else if (s.type === 'ellipse') c.ellipse(b.x+b.w/2,b.y+b.h/2,b.w/2,b.h/2,0,0,Math.PI*2);
      else { c.moveTo(a.x,a.y); s.points.slice(1).forEach(p => c.lineTo(p.x,p.y)); }
      if (['rect','round','ellipse'].includes(s.type) && s.fill) c.fill();
      if (s.stroke) c.stroke();
      if (s.type === 'arrow' && s.stroke) {
        const angle = Math.atan2(z.y-a.y,z.x-a.x), length = Math.max(12,s.width*4);
        c.beginPath(); c.moveTo(z.x-length*Math.cos(angle-.45),z.y-length*Math.sin(angle-.45)); c.lineTo(z.x,z.y); c.lineTo(z.x-length*Math.cos(angle+.45),z.y-length*Math.sin(angle+.45)); c.stroke();
      }
    }
    c.restore();
  }
  function draw() {
    if (!image.naturalWidth) return;
    if (canvas.width !== image.naturalWidth || canvas.height !== image.naturalHeight) {canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;}
    const r=image.getBoundingClientRect();
    Object.assign(canvas.style,{left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'});
    ctx.clearRect(0,0,canvas.width,canvas.height);
    shapes.forEach(s => { if (s !== textShape) paint(ctx,s); });
    if (editing && selected && tool === 'select' && !gesture) {
      const b=bounds(selected); ctx.save(); ctx.strokeStyle='#7764d8'; ctx.lineWidth=2*canvas.width/Math.max(1,r.width); ctx.setLineDash([6*canvas.width/Math.max(1,r.width)]); ctx.strokeRect(b.x-4,b.y-4,b.w+8,b.h+8); ctx.restore();
    }
    window.updateEditorColors(toolbar);
    updateTextStyle();
    syncControls();
  }
  function select(s) {
    selected=s;
    if (s) { field('width').value=s.width;field('size').value=s.size;field('use-stroke').checked=!!s.stroke;field('use-fill').checked=!!s.fill;if(s.stroke)field('stroke').value=s.stroke;if(s.fill)field('fill').value=s.fill; }
    draw();
  }
  function position(e) { const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(canvas.width,(e.clientX-r.x)*canvas.width/r.width)),y:Math.max(0,Math.min(canvas.height,(e.clientY-r.y)*canvas.height/r.height))}; }
  function hit(p) {
    const tolerance=8*canvas.width/Math.max(1,canvas.getBoundingClientRect().width);
    return [...shapes].reverse().find(s => { const b=bounds(s);return p.x>=b.x-tolerance && p.x<=b.x+b.w+tolerance && p.y>=b.y-tolerance && p.y<=b.y+b.h+tolerance; });
  }
  function finishText() {
    if (!textShape) return;
    textShape.text=textInput.value;
    if (!textShape.text.trim()) { shapes.splice(shapes.indexOf(textShape),1); if(selected===textShape)selected=null; }
    textShape=null;textInput.hidden=true;setTool('select');
  }
  function updateTextStyle() {
    if (!textShape) return;
    const r=canvas.getBoundingClientRect();
    textInput.style.color=textShape.stroke || 'transparent';
    textInput.style.backgroundColor=textShape.fill || 'transparent';
    textInput.style.fontSize=Math.max(1,textShape.size*r.width/canvas.width)+'px';
  }
  function editText(s) {
    finishText();textShape=s;textInput.value=s.text;textInput.hidden=false;
    const r=canvas.getBoundingClientRect();
    const box=bounds({type:'rect',points:s.points});
    const width=Math.min(r.width,Math.max(100,box.w*r.width/canvas.width));
    const height=Math.min(r.height,Math.max(55,box.h*r.height/canvas.height));
    Object.assign(textInput.style,{
      left:Math.max(r.left,Math.min(r.right-width,r.x+s.x*r.width/canvas.width))+'px',
      top:Math.max(r.top,Math.min(r.bottom-height,r.y+s.y*r.height/canvas.height))+'px',
      width:width+'px',height:height+'px',fontSize:Math.max(12,s.size*r.width/canvas.width)+'px'
    });
    updateTextStyle();
    draw();
    textInput.focus();textInput.select();
  }
  textInput.hidden=true;
  textInput.addEventListener('blur',finishText);
  textInput.addEventListener('input', () => { if(textShape) { textShape.text=textInput.value; draw(); } });
  textInput.addEventListener('keydown',e => {if(e.key==='Enter' && (e.ctrlKey||e.metaKey)){e.preventDefault();finishText();}});
  function setTool(value) {
    tool=value;
    canvas.style.cursor=tool==='select'?'default':tool==='text'?'text':'crosshair';
    toolbar.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.tool===tool)));
    draw();
  }
  toolbar.querySelectorAll('[data-tool]').forEach(button => button.onclick=() => {finishText();setTool(button.dataset.tool);});
  toolbar.querySelector('[data-tool="select"]').click();
  toolbar.querySelectorAll('input').forEach(input => input.addEventListener('input',() => {if(selected)Object.assign(selected,properties());draw();}));
  function remove() {finishText();if(selected){const i=shapes.indexOf(selected);if(i>=0)shapes.splice(i,1);select(null);}}
  field('close').onclick=() => window.shot.editing(false);
  for (const format of ['png','project']) field('save-'+format).onclick=() => window.shot.save(format);
  canvas.addEventListener('pointerdown',e => {
    if(!editing || e.button!==0)return;
    finishText();const p=position(e);
    if(tool !== 'text')canvas.setPointerCapture(e.pointerId);
    if(tool==='select') {
      select(hit(p)||null);
      if(selected)gesture={move:true,p,original:structuredClone(selected)};
      else gesture={background:true,x:e.clientX,y:e.clientY,reminded:false};
      return;
    }
    const s={type:tool,...properties(),points:[p,{...p}],x:p.x,y:p.y,text:''};shapes.push(s);select(s);
    if(tool==='text'){gesture={text:s};return;}
    gesture={shape:s};draw();
  });
  canvas.addEventListener('pointermove',e => {
    if(!gesture)return;const p=position(e);
    if(gesture.background) {
      if(!gesture.reminded && Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>=5) {
        gesture.reminded=true;
        window.dispatchEvent(new Event('screenshot:remind'));
      }
      return;
    }
    if(gesture.text){gesture.text.points[1]=p;const b=bounds({type:'rect',points:gesture.text.points});gesture.text.x=b.x;gesture.text.y=b.y;}
    else if(gesture.move){const dx=p.x-gesture.p.x,dy=p.y-gesture.p.y,o=gesture.original;selected.points=o.points.map(q=>({x:q.x+dx,y:q.y+dy}));selected.x=o.x+dx;selected.y=o.y+dy;}
    else if(tool==='pencil')gesture.shape.points.push(p);
    else gesture.shape.points[1]=p;
    draw();
  });
  function endGesture() {
    const completed=gesture;
    gesture=null;
    if(completed?.text) editText(completed.text);
    else if(completed?.shape) setTool('select');
    draw();
  }
  document.addEventListener('pointerup',endGesture);canvas.addEventListener('pointercancel',endGesture);
  canvas.addEventListener('dblclick',e => {
    if(!editing)return;
    const s=hit(position(e));
    if(s?.type==='text'){select(s);editText(s);}
    else if(!s)window.dispatchEvent(new Event('screenshot:remind'));
  });
  document.addEventListener('keydown',e => {if(editing && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName) && ['Delete','Backspace'].includes(e.key)){e.preventDefault();remove();}});
  window.shot.onEditing(value => {finishText();endGesture();editing=value;document.body.classList.toggle('editing',value);select(null);});
  image.addEventListener('load',draw);new ResizeObserver(draw).observe(image);
  window.screenshotEditor={
    exportProject: () => { finishText(); return structuredClone(shapes); },
    importProject: value => { shapes.splice(0,shapes.length,...structuredClone(value)); selected=null; draw(); },
    exportPNG:async () => {finishText();await image.decode();const output=document.createElement('canvas');output.width=image.naturalWidth;output.height=image.naturalHeight;const c=output.getContext('2d');c.drawImage(image,0,0);shapes.forEach(s=>paint(c,s));return output.toDataURL('image/png');}
  };
})();

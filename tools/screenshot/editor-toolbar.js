(() => {
  const toolbar = document.querySelector('#editor-toolbar');
  window.createEditorControls(toolbar);
  const field = name => toolbar.querySelector('#edit-' + name);
  toolbar.querySelectorAll('[data-tool]').forEach(button => {
    button.onclick = () => window.shot.editorCommand({ type:'tool', value:button.dataset.tool });
  });
  toolbar.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', () => {
      window.updateEditorColors(toolbar);
      window.shot.editorCommand({ type:'property', name:input.id.slice(5), value:input.type==='checkbox'?input.checked:input.value });
    });
  });
  field('close').onclick = () => window.shot.editorCommand({ type:'done' });
  for (const format of ['png','project']) {
    const button = field('save-'+format);
    button.onclick = async () => {
      button.disabled = true;
      try { await window.shot.save(format); } finally { button.disabled = false; }
    };
  }
  function update(state) {
    if (!state) return;
    toolbar.querySelectorAll('[data-tool]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.tool===state.tool)));
    const p=state.properties;
    for(const name of ['width','size'])field(name).value=p[name];
    for(const name of ['stroke','fill']) {
      field('use-'+name).checked=!!p[name];
      if(p[name])field(name).value=p[name];
    }
    window.updateEditorColors(toolbar);
  }
  let lastSize='';
  function fit() {
    const r=toolbar.getBoundingClientRect();
    const size={width:Math.ceil(r.width),height:Math.ceil(r.height)};
    const key=JSON.stringify(size);
    if(key!==lastSize) {lastSize=key;window.shot.fitEditor(size);}
  }
  new ResizeObserver(fit).observe(toolbar);
  document.fonts.ready.then(fit);
  window.shot.onEditorState(update);
  window.shot.ready().then(update);
})();

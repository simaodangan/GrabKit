window.createEditorControls = (toolbar) => { toolbar.innerHTML = `<div class="editor-tool-row"><div class="editor-tools">${[
      ['select','选择','<path d="m5 3 13 9-6 1-3 6z"/>'],
      ['pencil','铅笔','<path d="m4 16-1 5 5-1L20 8l-4-4zM14 6l4 4M4 16l4 4"/>'],
      ['line','直线','<path d="M4 20 20 4"/>'],
      ['arrow','箭头','<path d="M4 20 20 4M9 4h11v11"/>'],
      ['rect','矩形','<rect x="3" y="5" width="18" height="14"/>'],
      ['round','圆角矩形','<rect x="3" y="5" width="18" height="14" rx="4"/>'],
      ['ellipse','椭圆','<ellipse cx="12" cy="12" rx="9" ry="7"/>'],
      ['text','文字','<path d="M5 6V4h14v2M12 4v16M8 20h8"/>']
    ].map(([id,label,icon]) => `<button data-tool="${id}" type="button" title="${label}" aria-label="${label}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icon}</svg></button>`).join('')}</div><div class="editor-file-actions"><button id="edit-save-png" class="editor-save" type="button" title="保存 PNG 图片" aria-label="保存 PNG 图片"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 3h13l4 4v14H3V3zM7 3v6h10V3M7 21v-8h10v8M14 5v2"/></svg><span>PNG</span></button><button id="edit-save-project" class="editor-save" type="button" title="保存源文件 (.zip.gkshot)" aria-label="保存源文件"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 3h13l4 4v14H3V3zM7 3v6h10V3M7 21v-8h10v8M14 5v2"/></svg><span>源文件</span></button><button id="edit-close" type="button" title="关闭工具栏并退出编辑" aria-label="关闭工具栏并退出编辑"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div></div>
    <div class="editor-properties"><label>线宽 <input id="edit-width" type="number" min="1" max="100" value="3"></label><label>字号 <input id="edit-size" type="number" min="8" max="300" value="24"></label>
    <label>前景 <input id="edit-use-stroke" type="checkbox" checked aria-label="启用前景色" title="启用前景色"><input id="edit-stroke" type="color" value="#ff3333" aria-label="前景色"></label>
    <label>背景 <input id="edit-use-fill" type="checkbox" aria-label="启用背景色" title="启用背景色"><input id="edit-fill" type="color" value="#ffffff" aria-label="背景色" disabled></label></div>
`; };

window.updateEditorColors = toolbar => {
  for (const name of ["stroke", "fill"]) toolbar.querySelector("#edit-"+name).disabled=!toolbar.querySelector("#edit-use-"+name).checked;
};

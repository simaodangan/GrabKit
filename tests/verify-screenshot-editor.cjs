const {app,BrowserWindow,ipcMain,nativeImage}=require('electron');
const assert=require('node:assert/strict');
const path=require('node:path');
app.disableHardwareAcceleration();

let win;
let canceled = 0;
ipcMain.handle('shot:cancel', () => { canceled++; });
ipcMain.handle('shot:ready',()=>({dataUrl:nativeImage.createFromBitmap(Buffer.alloc(400*300*4,255),{width:400,height:300}).toDataURL(),selection:false,border:3}));
ipcMain.handle('shot:editing',(_e,value)=>win.webContents.send('shot:editing',value));
ipcMain.handle('shot:editor-state',()=>{});
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:700,height:500,webPreferences:{preload:path.resolve(__dirname,'../tools/screenshot/backend/screenshot-preload.js'),sandbox:true,contextIsolation:true}});
 try {
 await win.loadFile(path.resolve(__dirname,'../tools/screenshot/picture.html'));
 const result=await win.webContents.executeJavaScript(`(async()=>{
 await document.querySelector('#picture').decode();
 await window.shot.editing(true);
 await new Promise(r=>setTimeout(r,30));
 const c=document.querySelector('#annotations');
 const event=(type,x,y)=>c.dispatchEvent(new PointerEvent(type,{clientX:x,clientY:y,button:0,pointerId:1,bubbles:true}));
 // Synthetic pointers cannot capture; disable capture only in this harness.
 c.setPointerCapture=()=>{};
 const baseline=await window.screenshotEditor.exportPNG();
 let autoSelect=true;
 for(const tool of ['pencil','line','arrow','rect','round','ellipse']){
 document.querySelector('[data-tool='+tool+']').click();event('pointerdown',160,220);event('pointermove',280,310);event('pointerup',280,310);autoSelect=autoSelect && document.querySelector('[data-tool=select]').getAttribute('aria-pressed')==='true';
 }
 const drawn=await window.screenshotEditor.exportPNG();
 document.querySelector('[data-tool=text]').click();event('pointerdown',320,230);event('pointermove',420,285);event('pointerup',420,285);
 const textFocused=document.activeElement.id==='editor-text' && !document.querySelector('#editor-text').hidden;
 const text=document.querySelector('#editor-text');text.value='测试文字';text.dispatchEvent(new Event('blur'));
 document.querySelector('#edit-size').value=38;document.querySelector('#edit-size').dispatchEvent(new Event('input'));
 autoSelect=autoSelect && document.querySelector('[data-tool=select]').getAttribute('aria-pressed')==='true';
 const withText=await window.screenshotEditor.exportPNG();
 const fillToggle=document.querySelector('#edit-use-fill'), fill=document.querySelector('#edit-fill');
 const fillInitiallyDisabled=fill.disabled;
 fillToggle.checked=true;fillToggle.dispatchEvent(new Event('input'));
 fill.value='#0044ff';fill.dispatchEvent(new Event('input'));
 const filled=await window.screenshotEditor.exportPNG();
 const sampleImage=new Image();sampleImage.src=filled;await sampleImage.decode();
 const sample=document.createElement('canvas');sample.width=400;sample.height=300;
 const sampleContext=sample.getContext('2d');sampleContext.drawImage(sampleImage,0,0);
 const pixels=sampleContext.getImageData(0,0,400,300).data;
 let textBackground=false;
 for(let i=0;i<pixels.length;i+=4)if(pixels[i]===0 && pixels[i+1]===68 && pixels[i+2]===255){textBackground=true;break;}
 fillToggle.checked=false;fillToggle.dispatchEvent(new Event('input'));
 const fillDisabled=fill.disabled && fillInitiallyDisabled && await window.screenshotEditor.exportPNG()===withText;
 text.blur();document.body.focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}));
 const deleted=await window.screenshotEditor.exportPNG();
 await window.shot.editing(false);await new Promise(r=>setTimeout(r,20));
 event('pointerdown',400,350);event('pointermove',460,390);event('pointerup',460,390);
 const locked=await window.screenshotEditor.exportPNG();
 await window.shot.editing(true);await new Promise(r=>setTimeout(r,20));
 document.querySelector('[data-tool=select]').click();event('pointerdown',220,260);event('pointermove',260,280);event('pointerup',260,280);
 const moved=await window.screenshotEditor.exportPNG();
 const project=window.screenshotEditor.exportProject();
 window.screenshotEditor.importProject([]);
 if(await window.screenshotEditor.exportPNG()!==baseline)throw new Error('清空工程失败');
 window.screenshotEditor.importProject(project);
 if(await window.screenshotEditor.exportPNG()!==moved)throw new Error('源文件恢复后 PNG 不一致');
 document.querySelector('[data-tool=rect]').click();
 const esc=()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 esc();
 if(document.querySelector('[data-tool=select]').getAttribute('aria-pressed')!=='true' || !document.body.classList.contains('editing'))throw new Error('Esc must return to selection first');
 esc();await new Promise(r=>setTimeout(r,30));
 if(document.body.classList.contains('editing'))throw new Error('Second Esc must exit editing');
 text.blur();document.body.focus();
 document.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}));
 await new Promise(r=>setTimeout(r,30));
 const output=new Image();output.src=moved;await output.decode();
 return {drawn:drawn!==baseline,text:withText!==drawn,textFocused,textBackground,fillDisabled,autoSelect,arrowCursor:getComputedStyle(c).cursor==='default',deleted:deleted===drawn,locked:locked===deleted,moved:moved!==locked,width:output.naturalWidth,height:output.naturalHeight};
 })()`);
 assert.equal(canceled,1,'Delete closes an unedited screenshot');
 assert.deepEqual(result,{drawn:true,text:true,textFocused:true,textBackground:true,fillDisabled:true,autoSelect:true,arrowCursor:true,deleted:true,locked:true,moved:true,width:400,height:300});
 console.log('编辑验证通过：六种绘图、文字及字号、删除、退出锁定、重新选择移动、原尺寸 PNG 合成');app.exit(0);
 }catch(error){console.error(error);app.exit(1);}
});
setTimeout(()=>app.exit(1),20000);




const { app, BrowserWindow, ipcMain, nativeImage, clipboard } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const { recognize, paragraphs } = require('../tools/screenshot/backend/screenshot-ocr');
const {decodeImage} = require('../tools/screenshot/backend/screenshot-image');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const manifest = require('../vendor/ocr/manifest.json');
assert.equal(manifest.project, 'hiroi-sora/RapidOCR-json');
assert.equal(manifest.model_family, 'PP-OCRv3');
assert.equal(manifest.models.det, 'models/ch_PP-OCRv3_det_infer.onnx');
assert.equal(manifest.models.rec, 'models/ch_PP-OCRv3_rec_infer.onnx');
for (const [file, info] of Object.entries(manifest.files)) {
  const content = fs.readFileSync(path.join(__dirname, '../vendor/ocr', file));
  assert.equal(createHash('sha256').update(content).digest('hex'), info.sha256, file);
}
assert.equal(fs.existsSync(path.join(__dirname, '../vendor/ocr/runtime')), false);
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const window = new BrowserWindow({width:800,height:400,show:false});
  try {
    await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<body style="background:white;color:black;font:28px Microsoft YaHei;padding:30px"><p>本地文字识别测试</p><p>Hello OCR 12345</p></body>'));
    const image=nativeImage.createFromDataURL(await window.webContents.executeJavaScript(`(() => {
      const c=document.createElement('canvas'); c.width=800;c.height=400;
      const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,800,400);
      ctx.fillStyle='black';ctx.font='28px Microsoft YaHei';ctx.fillText('本地文字识别测试',30,70);ctx.fillText('Hello OCR 12345',30,170);
      return c.toDataURL();
    })()`));
    const dependencies={nativeImage,BrowserWindow};
    const webp=await window.webContents.executeJavaScript(`(() => {const c=document.createElement('canvas');c.width=23;c.height=17;return c.toDataURL('image/webp').split(',')[1];})()`);
    const bmp=Buffer.alloc(70,255);bmp.write('BM');bmp.writeUInt32LE(70,2);bmp.writeUInt32LE(0,6);bmp.writeUInt32LE(54,10);bmp.writeUInt32LE(40,14);bmp.writeInt32LE(2,18);bmp.writeInt32LE(2,22);bmp.writeUInt16LE(1,26);bmp.writeUInt16LE(24,28);bmp.writeUInt32LE(0,30);bmp.writeUInt32LE(16,34);
    for(const [extension,buffer,size] of [
      ['.png',image.toPNG(),image.getSize()],['.jpg',image.toJPEG(90),image.getSize()],
      ['.webp',Buffer.from(webp,'base64'),{width:23,height:17}],['.bmp',bmp,{width:2,height:2}],
      ['.gif',Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64'),{width:1,height:1}]
    ]) assert.deepEqual((await decodeImage(buffer,extension,dependencies)).getSize(),size,extension+' 图片可打开并保留尺寸');
    await assert.rejects(decodeImage(Buffer.from('broken'),'.webp',dependencies),/图片无法读取/);
    const blocks=await recognize(image.toPNG(),image.getSize());
    assert.match(blocks.map(b=>b.text).join('\n'),/Hello OCR 12345/);
    assert.match(blocks.map(b=>b.text).join('\n'),/本地文字识别测试/);
    assert.ok(blocks.length>=2);
    assert.ok(blocks.every(b=>b.x>=0 && b.y>=0 && b.width>0 && b.height>0));
    const blank=nativeImage.createFromBitmap(Buffer.alloc(800*400*4,255),{width:800,height:400});
    assert.deepEqual(await recognize(blank.toPNG(),image.getSize()),[]);
    const controller=new AbortController();
    const pending=recognize(image.toPNG(),image.getSize(),controller.signal); controller.abort();
    await assert.rejects(pending,/取消/);
    const line=(text,x,y)=>({text,box:[[x,y],[x+180,y],[x+180,y+20],[x,y+20]]});
    assert.equal(paragraphs([line('第一行',10,10),line('第二行',10,38),line('另一段',10,100)],400,200).length,2);
    let readyBlocks=blocks;
    const fits=[];
    ipcMain.handle('shot:ocr-ready',()=>readyBlocks);
    ipcMain.handle('shot:ocr-fit',(_event,size)=>{fits.push(size);});
    const result = new BrowserWindow({show:false,webPreferences:{preload:path.resolve(__dirname,'../tools/screenshot/backend/screenshot-preload.js'),sandbox:true,contextIsolation:true}});
    await result.loadFile(path.resolve(__dirname,'../tools/screenshot/ocr.html'));
    await new Promise(resolve=>setTimeout(resolve,150));
    assert.equal(await result.webContents.executeJavaScript("document.querySelectorAll('textarea').length"),1);
    assert.equal(await result.webContents.executeJavaScript("document.querySelectorAll('button,header,.hint').length"),0);
    assert.equal(await result.webContents.executeJavaScript("document.querySelector('#text').value"),blocks.map(b=>b.text).join('\n\n'));
    assert.ok(fits.at(-1).height<200,'少量文字使用紧凑高度');
    readyBlocks=[{text:'短文本'}];
    await result.reload();
    await new Promise(resolve=>setTimeout(resolve,200));
    assert.equal(fits.at(-1).width,240);
    assert.equal(fits.at(-1).height,64);
    readyBlocks=[{text:Array(100).fill('较长的文字段落用于检查自动换行与最大窗口高度。').join('\n')}];
    await result.reload();
    await new Promise(resolve=>setTimeout(resolve,200));
    assert.equal(fits.at(-1).height,640,'大量文字限制高度并滚动');
    ipcMain.handle('shot:ready',()=>({dataUrl:image.toDataURL(),selection:false,border:3}));
    ipcMain.handle('shot:editor-state',()=>{});
    const picture = new BrowserWindow({width:800,height:400,show:false,webPreferences:{preload:path.resolve(__dirname,'../tools/screenshot/backend/screenshot-preload.js'),sandbox:true,contextIsolation:true}});
    await picture.loadFile(path.resolve(__dirname,'../tools/screenshot/picture.html'));
    picture.webContents.send('shot:ocr',{status:'busy'});
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(await picture.webContents.executeJavaScript("!document.querySelector('#ocr-notice').hidden && !!document.querySelector('.ocr-spinner')"),true);
    picture.webContents.send('shot:ocr',{status:'done',blocks});
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(await picture.webContents.executeJavaScript("document.querySelectorAll('.ocr-line').length"),blocks.length);
    const before=await picture.webContents.executeJavaScript("document.querySelector('.ocr-line').getBoundingClientRect().width");
    picture.setSize(400,300);
    await new Promise(resolve=>setTimeout(resolve,150));
    const after=await picture.webContents.executeJavaScript("document.querySelector('.ocr-line').getBoundingClientRect().width");
    assert.ok(after<before,'文字命中区跟随图片缩放');
    picture.show(); picture.focus();
    await new Promise(resolve=>setTimeout(resolve,150));
    const rect=await picture.webContents.executeJavaScript(`(() => {const r=document.querySelector('.ocr-line').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()`);
    const scale=picture.webContents.getZoomFactor();
    const x=Math.round((rect.x+1)*scale), y=Math.round((rect.y+rect.height/2)*scale), endX=Math.round((rect.x+rect.width*.65)*scale);
    picture.webContents.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1});
    await new Promise(resolve=>setTimeout(resolve,80));
    picture.webContents.sendInputEvent({type:'mouseMove',x:endX,y,button:'left',modifiers:['leftButtonDown']});
    await new Promise(resolve=>setTimeout(resolve,80));
    picture.webContents.sendInputEvent({type:'mouseUp',x:endX,y,button:'left',clickCount:1});
    await new Promise(resolve=>setTimeout(resolve,100));
    const selected=await picture.webContents.executeJavaScript("window.getSelection().toString()");
    assert.ok(selected.length>0 && selected.length<blocks[0].text.length,'鼠标可以拖选部分文字: '+JSON.stringify({selected,rect}));
    const previousClipboard=await clipboard.readText();
    await clipboard.writeText('ocr-clipboard-probe');
    const clipboardAvailable=await clipboard.readText()==='ocr-clipboard-probe';
    await clipboard.writeText(previousClipboard);
    await picture.webContents.executeJavaScript("window.__ocrCopyProbe=[];document.addEventListener('copy',e=>window.__ocrCopyProbe.push({plain:e.clipboardData.getData('text/plain'),prevented:e.defaultPrevented,focus:document.hasFocus()}));");
    picture.webContents.focus();
    await picture.webContents.executeJavaScript("document.execCommand('copy')", true);
    for (let attempt=0; clipboardAvailable && attempt<20 && await clipboard.readText()!==selected; attempt++)
      await new Promise(resolve=>setTimeout(resolve,50));
    const copyEvents=await picture.webContents.executeJavaScript('window.__ocrCopyProbe');
    assert.equal(copyEvents.at(-1)?.plain,selected,'copy 事件输出实际选中的纯文本');
    assert.equal(copyEvents.at(-1)?.prevented,true,'copy 事件阻止携带透明富文本样式');
    if (!clipboardAvailable && process.env.OCR_TEST_ALLOW_UNAVAILABLE_CLIPBOARD==='1') {
      console.warn('跳过系统剪贴板断言：独立写入/读取探测失败；已验证真实 copy 事件的选中文字。');
    } else {
      assert.ok(clipboardAvailable,'测试进程必须能够独立读写系统剪贴板');
      assert.equal(await clipboard.readText(),selected,'原生文字选区可复制');
      assert.ok((await clipboard.read()).every(item=>!item.types.includes('text/html')),'复制时不携带透明文字样式');
    }
    picture.webContents.send('shot:ocr',{status:'off'});
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(await picture.webContents.executeJavaScript("document.querySelectorAll('.ocr-line').length"),0);
    assert.equal(await picture.webContents.executeJavaScript("window.getSelection().toString()"),'');
    assert.equal(await picture.webContents.executeJavaScript("document.body.classList.contains('ocr-active')"),false);
    console.log('OCR 检查通过：真实中英文识别、空白图、取消、单文本框、动画、鼠标部分选字与 copy 事件、缩放、退出清理'+(clipboardAvailable?'、系统剪贴板':''));
    app.exit(0);
  }catch(error){console.error(error);app.exit(1);}
});
setTimeout(()=>{console.error('OCR 测试超时');app.exit(1);},90000);

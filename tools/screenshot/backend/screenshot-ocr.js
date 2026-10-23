const { spawn } = require('node:child_process');
const path = require('node:path');

// Group adjacent lines only when their left edges and spacing suggest one paragraph.
function paragraphs(items, width, height) {
  const lines = items.filter(item => typeof item.text === 'string' && item.text.trim() &&
    Array.isArray(item.box) && item.box.length === 4 && item.box.every(p =>
      Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))).map(item => {
    const xs = item.box.map(p => p[0]), ys = item.box.map(p => p[1]);
    return { text: item.text.trim(), x: Math.max(0, Math.min(...xs)), y: Math.max(0, Math.min(...ys)),
      right: Math.min(width, Math.max(...xs)), bottom: Math.min(height, Math.max(...ys)) };
  }).filter(line => line.right > line.x && line.bottom > line.y).sort((a,b) => a.y-b.y || a.x-b.x);
  const groups = [];
  for (const line of lines) {
    const group = groups.filter(g => {
      const prev = g.lines.at(-1), h = prev.bottom-prev.y;
      const gap = line.y-prev.bottom;
      return gap >= -h*0.15 && gap <= h*0.85 &&
        Math.abs(line.x-g.x) <= h*1.5 && Math.min(line.right,g.right)-Math.max(line.x,g.x) > 0;
    }).sort((a,b) => b.bottom-a.bottom)[0];
    if (group) {
      group.lines.push(line); group.x=Math.min(group.x,line.x); group.y=Math.min(group.y,line.y);
      group.right=Math.max(group.right,line.right); group.bottom=Math.max(group.bottom,line.bottom);
    } else groups.push({ ...line, lines: [line] });
  }
  const normalize = line => ({text:line.text,x:line.x/width,y:line.y/height,
    width:(line.right-line.x)/width,height:(line.bottom-line.y)/height});
  return groups.map(g => ({ ...normalize(g), text: g.lines.map(l=>l.text).join('\n'),
    lines:g.lines.map(normalize) }));
}

function recognize(image, size, signal) {
  if (process.platform !== 'win32') return Promise.reject(new Error('本地文字识别目前仅支持 Windows'));
  const directory = path.join(__dirname, '../../../vendor/ocr');
  return new Promise((resolve,reject) => {
    const child = spawn(path.join(directory,'RapidOCR-json.exe'),
      ['--ensureAscii=1','--numThread=2','--maxSideLen=2048'],
      { cwd:directory, windowsHide:true, stdio:['pipe','pipe','pipe'] });
    let buffer='', ready=false, settled=false, diagnostics='';
    const finish=(error,result) => {
      if(settled)return; settled=true; clearTimeout(timer);
      signal?.removeEventListener('abort',abort); child.kill();
      error ? reject(error) : resolve(result);
    };
    const abort=()=>finish(new Error('文字识别已取消'));
    const timer=setTimeout(()=>finish(new Error('识别超时，请缩小图片区域后重试')),120000);
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted) abort();
    child.stdin.on('error',error=>finish(error));
    child.stderr.on('data',data=>{diagnostics=(diagnostics+data.toString()).slice(-2000);});
    child.on('error',()=>finish(new Error('无法启动本地 OCR，请检查安装目录中的 OCR 组件是否完整')));
    child.on('close',()=>finish(new Error('OCR 意外退出。'+diagnostics)));
    child.stdout.on('data',chunk=>{
      buffer+=chunk.toString('utf8');
      if(buffer.length>16*1024*1024)return finish(new Error('识别结果过大'));
      let index;
      while((index=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,index).trim(); buffer=buffer.slice(index+1);
        if(!ready && line.includes('OCR init completed.')) {
          ready=true; child.stdin.write(JSON.stringify({image_base64:image.toString('base64')})+'\n');
        } else if(line.startsWith('{')) {
          try {
            const result=JSON.parse(line);
            if(result.code===101)finish(null,[]);
            else if(result.code===100 && Array.isArray(result.data))finish(null,paragraphs(result.data,size.width,size.height));
            else finish(new Error('OCR 识别失败：'+String(result.data).slice(0,300)));
          }catch(error){finish(error);}
        }
      }
    });
  });
}
module.exports={recognize,paragraphs};

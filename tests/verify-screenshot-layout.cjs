const assert = require('node:assert/strict');
const {placeOcrPanel,overlap}=require('../tools/screenshot/backend/screenshot-layout');
const screen={x:0,y:0,width:1920,height:1040};
const size={width:320,height:160};
for(const image of [
  {x:600,y:300,width:600,height:400},
  {x:1500,y:100,width:420,height:800},
  {x:0,y:0,width:1500,height:1040},
]) {
  const panel=placeOcrPanel(image,size,[screen]);
  assert.equal(overlap(image,panel),0);
  assert.ok(panel.x>=0 && panel.y>=0 && panel.x+panel.width<=1920 && panel.y+panel.height<=1040);
}
const full=placeOcrPanel(screen,size,[screen]);
assert.ok(full.x===0 || full.y===0 || full.x+full.width===1920 || full.y+full.height===1040,'无法避让时贴边');
const second={x:-1280,y:0,width:1280,height:720};
const other=placeOcrPanel(screen,size,[screen,second]);
assert.equal(overlap(screen,other),0,'可使用副屏空位');
assert.ok(other.x<0);
console.log('OCR 窗口位置检查通过：四周避让、屏幕边缘、全屏和多显示器');

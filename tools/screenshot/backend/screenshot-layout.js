const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
function overlap(a, b) {
  return Math.max(0, Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)) *
    Math.max(0, Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
}

// Prefer free space beside the image; if none exists, keep the panel at a screen edge.
function placeOcrPanel(image, size, areas) {
  const candidates = [];
  for (const area of areas) {
    const right=area.x+area.width-size.width, bottom=area.y+area.height-size.height;
    const points = [
      [image.x+image.width+12,image.y], [image.x-size.width-12,image.y],
      [image.x,image.y+image.height+12], [image.x,image.y-size.height-12],
      [area.x,area.y], [right,area.y], [area.x,bottom], [right,bottom]
    ];
    for (const [x,y] of points) {
      const rect = {x:clamp(x,area.x,right),y:clamp(y,area.y,bottom),...size};
      const covered = overlap(rect,image);
      const edge = Math.min(rect.x-area.x,right-rect.x,rect.y-area.y,bottom-rect.y);
      const distance = Math.hypot(rect.x+size.width/2-image.x-image.width/2,
        rect.y+size.height/2-image.y-image.height/2);
      candidates.push({rect,covered,edge:covered ? edge : 0,distance});
    }
  }
  candidates.sort((a,b)=>a.covered-b.covered || a.edge-b.edge || a.distance-b.distance);
  return candidates[0].rect;
}
module.exports = {placeOcrPanel,overlap};

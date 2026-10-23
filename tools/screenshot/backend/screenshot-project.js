const zlib = require('node:zlib');
const MAX = 128 * 1024 * 1024;
function crc32(data) {
  let crc = -1;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}
function validate(project) {
  if (project?.format !== 'GrabKit' || project.version !== 1 || !Array.isArray(project.shapes) || project.shapes.length > 10000)
    throw new Error('不支持的 GrabKit 源文件');
  let count = 0;
  for (const s of project.shapes) {
    if (!s || !['pencil','line','arrow','rect','round','ellipse','text'].includes(s.type) ||
        !Array.isArray(s.points) || s.points.length < 2 || (count += s.points.length) > 1000000 ||
        !s.points.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y)) ||
        ![s.x,s.y,s.width,s.size].every(Number.isFinite) || s.width < 1 || s.width > 100 || s.size < 8 || s.size > 300 ||
        ![s.stroke,s.fill].every(c => c === null || (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))) ||
        typeof s.text !== 'string' || s.text.length > 1000000) throw new Error('源文件中的标注数据无效');
  }
  return project;
}
function encode(image, shapes) {
  const project = validate({ format:'GrabKit', version:1, shapes });
  const entries = [['project.json', Buffer.from(JSON.stringify(project))], ['original.png', image]];
  const locals = [], central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const filename = Buffer.from(name), crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20,4);
    header.writeUInt32LE(crc,14); header.writeUInt32LE(data.length,18); header.writeUInt32LE(data.length,22); header.writeUInt16LE(filename.length,26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20,4); directory.writeUInt16LE(20,6);
    directory.writeUInt32LE(crc,16); directory.writeUInt32LE(data.length,20); directory.writeUInt32LE(data.length,24); directory.writeUInt16LE(filename.length,28); directory.writeUInt32LE(offset,42);
    locals.push(header, filename, data); central.push(directory, filename);
    offset += header.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(2,8); end.writeUInt16LE(2,10); end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16);
  const output = Buffer.concat([...locals,directory,end]);
  if (output.length > MAX) throw new Error('源文件过大');
  return output;
}
function decode(data) {
  try {
    if (data.length > MAX || data.length < 22) throw new Error();
    const end = data.length - 22;
    if (data.readUInt32LE(end) !== 0x06054b50 || data.readUInt16LE(end+10) !== 2 || data.readUInt16LE(end+8) !== 2 || data.readUInt32LE(end+4) !== 0) throw new Error();
    let cursor = data.readUInt32LE(end+16), total = 0;
    if (cursor + data.readUInt32LE(end+12) !== end) throw new Error();
    const files = new Map();
    for (let i=0;i<2;i++) {
      if (data.readUInt32LE(cursor) !== 0x02014b50) throw new Error();
      const method=data.readUInt16LE(cursor+10), crc=data.readUInt32LE(cursor+16), size=data.readUInt32LE(cursor+20), expanded=data.readUInt32LE(cursor+24);
      const nameLength=data.readUInt16LE(cursor+28), extra=data.readUInt16LE(cursor+30), comment=data.readUInt16LE(cursor+32), offset=data.readUInt32LE(cursor+42);
      const name=data.subarray(cursor+46,cursor+46+nameLength).toString();
      if (!['project.json','original.png'].includes(name) || files.has(name) || (total+=expanded)>MAX || data.readUInt16LE(cursor+8)&1 || ![0,8].includes(method)) throw new Error();
      if (data.readUInt32LE(offset)!==0x04034b50) throw new Error();
      const start=offset+30+data.readUInt16LE(offset+26)+data.readUInt16LE(offset+28);
      if (start+size>data.readUInt32LE(end+16)) throw new Error();
      const packed=data.subarray(start,start+size), content=method===8?zlib.inflateRawSync(packed,{maxOutputLength:Math.max(1,expanded)}):packed;
      if(content.length!==expanded || crc32(content)!==crc) throw new Error();
      files.set(name,content); cursor+=46+nameLength+extra+comment;
    }
    if(cursor!==end) throw new Error();
    return { project:validate(JSON.parse(files.get('project.json').toString())), image:files.get('original.png') };
  } catch { throw new Error('源文件损坏或格式不受支持'); }
}
module.exports = { encode, decode, validate, MAX };

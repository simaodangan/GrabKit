import { mml2omml } from '../../node_modules/mathml2omml/dist/index.js';

const mathNS = 'http://www.w3.org/1998/Math/MathML';
const officeNS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
const wordNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const htmlMathNS = 'http://schemas.microsoft.com/office/2004/12/omml';
const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function equationContents(nodes) {
  const math = document.createElementNS(mathNS, 'math');
  for (const node of nodes) math.appendChild(node.cloneNode(true));
  // MathJax omits attributes supplied by the MathML operator dictionary.
  // Make these defaults explicit for the standalone OMML converter.
  for (const token of math.querySelectorAll('mi')) {
    if (token.getAttribute('mathvariant') === 'normal' ||
        (!token.hasAttribute('mathvariant') && Array.from(token.textContent).length > 1))
      token.setAttribute('fontstyle', 'normal');
  }
  for (const over of math.querySelectorAll('mover')) {
    const accent = over.lastElementChild;
    if (!over.hasAttribute('accent') && accent?.localName === 'mo' &&
        /^[\u0300-\u036f˙¨¯˘ˇ´`^~˜→←]$/u.test(accent.textContent))
      over.setAttribute('accent', 'true');
  }
  const xml = mml2omml(new XMLSerializer().serializeToString(math));
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Word 公式结构无效');
  return Array.from(doc.documentElement.childNodes, (node) => new XMLSerializer().serializeToString(node)).join('');
}

function numberedEquation(math) {
  // MathJax puts the label in the outer table, including when the equation
  // body is itself an aligned multi-line array. Preserve that entire body.
  const table = Array.from(math.children).find((node) => node.localName === 'mtable');
  if (!table) throw new Error('缺少带编号的公式行');
  const rows = Array.from(table.children, (row) => {
    const cells = Array.from(row.children);
    const label = cells.find((cell) => cell.hasAttribute('data-equation-label'));
    const body = cells.filter((cell) => cell !== label).flatMap((cell) => Array.from(cell.childNodes));
    let contents = equationContents(body);
    if (label) {
      const number = equationContents(Array.from(label.childNodes));
      // This is the exact native structure Word builds from equation#(1).
      // The # is stored in the math run but rendered as a right-aligned label.
      contents += '<m:r><m:t>#</m:t></m:r>' + number;
    }
    return '<m:e>' + contents + '</m:e>';
  }).join('');
  return '<m:oMathPara xmlns:m="' + officeNS + '"><m:oMath><m:eqArr>' +
    '<m:eqArrPr><m:maxDist m:val="1"/></m:eqArrPr>' + rows +
    '</m:eqArr></m:oMath></m:oMathPara>';
}

// Word's HTML importer uses its legacy OMML namespace and HTML-styled math
// runs, rather than the XML m:t/w:rPr representation used in .docx files.
function officeHTML(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Word 编号结构无效');
  function serialize(node) {
    if (node.nodeType === 3) return escape(node.nodeValue);
    if (node.nodeType !== 1) return '';
    if (node.localName === 'r' && node.namespaceURI === officeNS) {
      const properties = Array.from(node.children).find((child) => child.localName === 'rPr');
      const style = properties?.getElementsByTagNameNS(officeNS, 'sty')[0]?.getAttributeNS(officeNS, 'val');
      const normal = properties?.getElementsByTagNameNS(officeNS, 'nor').length;
      const wordProperties = Array.from(node.children).find((child) => child.namespaceURI === wordNS && child.localName === 'rPr');
      const italic = Boolean(wordProperties?.getElementsByTagNameNS(wordNS, 'i').length) ||
        (!normal && style !== 'p' && style !== 'b');
      const bold = Boolean(wordProperties?.getElementsByTagNameNS(wordNS, 'b').length) || style === 'b' || style === 'bi';
      const text = Array.from(node.children).filter((child) => child.localName === 't').map((child) => escape(child.textContent)).join('');
      return '<span style="font-family:Cambria Math;font-style:' + (italic ? 'italic' : 'normal') +
        ';font-weight:' + (bold ? 'bold' : 'normal') + '"><m:r>' + text + '</m:r></span>';
    }
    const attributes = Array.from(node.attributes).filter((attr) => !attr.name.startsWith('xmlns')).map((attr) =>
      ' ' + attr.name + '="' + escape(attr.value) + '"').join('');
    const children = Array.from(node.childNodes, serialize).join('');
    return '<' + node.nodeName + attributes + '>' + children + '</' + node.nodeName + '>';
  }
  return serialize(doc.documentElement);
}

export function createWordHTML(fragment) {
  const copy = fragment.cloneNode(true);
  for (const math of copy.querySelectorAll('math')) {
    if (!math.querySelector('[data-equation-label]')) continue;
    const native = officeHTML(numberedEquation(math));
    const comment = document.createComment('[if gte msEquation 12]>' + native + '<![endif]');
    // Word needs a paragraph around a display equation, as in its own HTML.
    const paragraph = document.createElement('p');
    paragraph.appendChild(comment);
    const block = math.parentElement;
    if (block?.classList.contains('display-math')) block.replaceWith(paragraph);
    else math.replaceWith(comment);
  }
  return '<html xmlns:m="' + htmlMathNS + '"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body>' +
    copy.innerHTML + '</body></html>';
}

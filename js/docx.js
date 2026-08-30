/* ===========================================================
   docx.js — Tạo tệp Word (.docx) chuẩn OOXML, không cần thư viện ngoài.
   Layout dựng trực tiếp từ bảng đang hiển thị trên web nên giống hệt bản xem.
   =========================================================== */
const Docx = (function(){

/* ---------- ZIP (lưu nguyên, không nén) ---------- */
let CRC=null;
function crcTable(){
  if(CRC) return CRC;
  CRC=new Uint32Array(256);
  for(let n=0;n<256;n++){ let c=n;
    for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320 ^ (c>>>1) : c>>>1;
    CRC[n]=c>>>0;
  }
  return CRC;
}
function crc32(u8){
  const t=crcTable(); let c=0xFFFFFFFF;
  for(let i=0;i<u8.length;i++) c = t[(c ^ u8[i]) & 0xFF] ^ (c>>>8);
  return (c ^ 0xFFFFFFFF)>>>0;
}
function zipStore(files){
  const enc=new TextEncoder(), parts=[], central=[];
  let offset=0, cdSize=0;
  files.forEach(f=>{
    const name=enc.encode(f.name), data=f.data, crc=crc32(data);
    const lh=new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true); lh.setUint16(4,20,true);
    lh.setUint32(14,crc,true); lh.setUint32(18,data.length,true); lh.setUint32(22,data.length,true);
    lh.setUint16(26,name.length,true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const cd=new DataView(new ArrayBuffer(46));
    cd.setUint32(0,0x02014b50,true); cd.setUint16(4,20,true); cd.setUint16(6,20,true);
    cd.setUint32(16,crc,true); cd.setUint32(20,data.length,true); cd.setUint32(24,data.length,true);
    cd.setUint16(28,name.length,true); cd.setUint32(42,offset,true);
    central.push(new Uint8Array(cd.buffer), name);
    cdSize += 46+name.length;
    offset += 30+name.length+data.length;
  });
  const eo=new DataView(new ArrayBuffer(22));
  eo.setUint32(0,0x06054b50,true);
  eo.setUint16(8,files.length,true); eo.setUint16(10,files.length,true);
  eo.setUint32(12,cdSize,true); eo.setUint32(16,offset,true);
  return new Blob(parts.concat(central,[new Uint8Array(eo.buffer)]),
    {type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}

/* ---------- WordprocessingML ---------- */
const X = s => String(s==null?'':s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const FONT = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>';

/* Cỡ chữ toàn tài liệu nhân theo tuỳ chọn «Cỡ chữ (%)» của hộp thoại bản in */
let SCALE=1;
const SZ = n => Math.max(8, Math.round(n*SCALE));

function run(text,o){
  o=o||{};
  const sz=SZ(o.sz||22);
  const rPr=`<w:rPr>${FONT}${o.b?'<w:b/>':''}${o.i?'<w:i/>':''}`
    + `<w:color w:val="${o.color||'000000'}"/><w:sz w:val="${sz}"/>`
    + `<w:szCs w:val="${sz}"/></w:rPr>`;
  return String(text).split('\n').map((line,i)=>
    `<w:r>${rPr}${i?'<w:br/>':''}<w:t xml:space="preserve">${X(line)}</w:t></w:r>`).join('');
}
function para(runs,o){
  o=o||{};
  return `<w:p><w:pPr><w:spacing w:before="${o.before||0}" w:after="${o.after||0}" `
    + `w:line="240" w:lineRule="auto"/><w:jc w:val="${o.align||'center'}"/></w:pPr>${runs}</w:p>`;
}
function cell(inner,o){
  o=o||{};
  return `<w:tc><w:tcPr><w:tcW w:w="${o.w||0}" w:type="dxa"/>`
    + (o.span?`<w:gridSpan w:val="${o.span}"/>`:'')
    + (o.fill?`<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>`:'')
    + `<w:vAlign w:val="center"/></w:tcPr>${inner||para(run(''))}</w:tc>`;
}
const BORDERS = '<w:tblBorders>'
  + ['top','left','bottom','right','insideH','insideV']
      .map(k=>`<w:${k} w:val="single" w:sz="8" w:space="0" w:color="000000"/>`).join('')
  + '</w:tblBorders>';
function table(rows,widths){
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${BORDERS}`
    + `<w:tblLayout w:type="fixed"/></w:tblPr>`
    + `<w:tblGrid>${widths.map(w=>`<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
    + rows.join('') + '</w:tbl>';
}
const PAGEBREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

/* ---------- Đọc bảng trên web ---------- */
function lines(el){
  const doc=el.ownerDocument;
  const tmp=doc.createElement('div');
  tmp.innerHTML=el.innerHTML.replace(/<br\s*\/?>/gi,'\n');
  return tmp.textContent.split('\n').map(x=>x.trim()).filter(Boolean);
}
function fillOf(el,mono){
  const isHead = el.tagName==='TH' || el.classList.contains('day');
  if(mono) return isHead ? 'E8E8E8' : null;
  const m=(el.getAttribute('style')||'').match(/background:\s*(#[0-9a-fA-F]{3,6})/);
  if(m){ let h=m[1].slice(1);
    if(h.length===3) h=h.split('').map(c=>c+c).join('');
    if(h.length===6) return h.toUpperCase();
  }
  if(el.classList.contains('off-cell')) return 'EFEFEF';
  if(isHead) return 'F0F4FB';
  return null;
}
function cellXml(td,mono,w){
  const c=td.querySelector('.cell');
  const fill=fillOf(td,mono);
  let inner='';
  if(c){
    const s=c.querySelector('.s'), t=c.querySelector('.t'),
          r=c.querySelector('.r'), m=c.querySelector('.m');
    if(s) inner+=para(run(s.textContent.trim(),{b:true,sz:21}));
    if(m) inner+=para(run(m.textContent.trim(),{b:true,sz:15,color:mono?'000000':'8A5300'}));
    if(t) inner+=para(run(t.textContent.trim(),{sz:17}));
    if(r) inner+=para(run(r.textContent.trim(),{sz:16,i:true}));
    if(!inner) inner=para(run(c.textContent.trim(),{sz:18,i:true}));
  }else{
    const ls=lines(td);
    inner = ls.length
      ? ls.map((l,i)=>para(run(l,{b:i===0&&td.tagName==='TH',sz:i===0?20:16}))).join('')
      : para(run(''));
  }
  const o={w, fill};
  const span=+(td.getAttribute('colspan')||0); if(span>1) o.span=span;
  return cell(inner,o);
}
function tableXml(tbl,mono,total){
  const rows=[...tbl.rows];
  if(!rows.length) return '';
  let n=0; [...rows[0].cells].forEach(c=>n+=(+(c.getAttribute('colspan')||1)));
  const first = tbl.classList.contains('master') ? Math.round(total*0.06) : Math.round(total*0.11);
  const rest = Math.floor((total-first)/Math.max(1,n-1));
  const widths=[first]; for(let i=1;i<n;i++) widths.push(rest);
  const out=rows.map(tr=>{
    let i=0;
    const tds=[...tr.cells].map(td=>{
      const span=+(td.getAttribute('colspan')||1);
      let w=0; for(let k=0;k<span;k++) w+=widths[Math.min(i+k,widths.length-1)]||rest;
      i+=span;
      return cellXml(td,mono,w);
    }).join('');
    return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${tds}</w:tr>`;
  });
  return table(out,widths);
}

/* ---------- Dựng tài liệu ---------- */
function bodyFromView(root,mono,landscape){
  // bề rộng in được = khổ giấy trừ lề trái phải (567 twip mỗi bên)
  const W = landscape ? 15650 : 10740;
  const blocks=[...root.querySelectorAll('.tt-block')];
  if(!blocks.length) return null;
  let body='';
  blocks.forEach((b,bi)=>{
    if(bi) body+=PAGEBREAK;
    const dept=b.querySelector('.tt-head .dept'),
          sch=b.querySelector('.tt-head .sch'), ttl=b.querySelector('.tt-head .ttl'),
          meta=b.querySelector('.tt-head .meta');
    if(dept) body+=para(run(dept.textContent.trim(),{sz:21}),{after:20});
    if(sch) body+=para(run(sch.textContent.trim(),{sz:22}),{after:40});
    if(ttl) body+=para(run(ttl.textContent.trim(),{b:true,sz:32}),{after:40});
    if(meta) body+=para(run(meta.textContent.trim(),{sz:22}),{after:60});
    const sub=b.querySelector('.tt-head + div');
    if(sub && sub.textContent.trim()) body+=para(run(sub.textContent.trim(),{sz:21}),{after:120});
    const tbl=b.querySelector('table');
    if(tbl) body+=tableXml(tbl,mono,W);
    const lg=[...b.querySelectorAll('.legend span')].map(x=>x.textContent.trim()).filter(Boolean);
    if(lg.length) body+=para(run(lg.join('   •   '),{sz:17}),{before:120,align:'left'});
    const note=b.querySelector('.tt-note');
    if(note && note.textContent.trim())
      body+=para(run(note.textContent.trim(),{sz:21,i:true}),{before:140,align:'left'});
    const place=b.querySelector('.tt-place');
    if(place && place.textContent.trim())
      body+=para(run(place.textContent.trim(),{sz:22,i:true}),{before:160,align:'right'});
    const foot=[...b.querySelectorAll('.tt-foot > div')];
    if(foot.length){
      const w=Math.floor(W/foot.length);
      const cells=foot.map(f=>{
        const t=f.querySelector('b');
        return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>`
          + para(run(t?t.textContent.trim():f.textContent.trim(),{b:true,sz:22}),{before:400,after:1400})
          + '</w:tc>';
      }).join('');
      body += `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>`
        + `<w:tblBorders>${['top','left','bottom','right','insideH','insideV']
            .map(k=>`<w:${k} w:val="none" w:sz="0" w:space="0" w:color="auto"/>`).join('')}</w:tblBorders>`
        + `<w:tblLayout w:type="fixed"/></w:tblPr>`
        + `<w:tblGrid>${foot.map(()=>`<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
        + `<w:tr>${cells}</w:tr></w:tbl>`;
    }
  });
  body += (landscape
        ? '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>'
        : '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>')
        + '<w:pgMar w:top="567" w:right="567" w:bottom="567" w:left="567" '
        + 'w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>';
  return body;
}

/* opt = {mono, scale, orientation} — vẫn nhận opt là boolean (mono) như bản cũ */
function build(root,opt){
  if(typeof opt!=='object' || opt===null) opt={mono:!!opt};
  const mono=!!opt.mono;
  const landscape = opt.orientation!=='portrait';
  SCALE = Math.max(.7, Math.min(1.3, +opt.scale || 1));
  const body=bodyFromView(root,mono,landscape);
  if(!body) return null;
  const enc=new TextEncoder();
  const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + `<w:body>${body}</w:body></w:document>`;
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:docDefaults><w:rPrDefault><w:rPr>' + FONT
    + '<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault>'
    + '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>'
    + '</w:docDefaults></w:styles>';
  const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    + '</Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '</Relationships>';
  const drels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '</Relationships>';
  return zipStore([
    {name:'[Content_Types].xml', data:enc.encode(ct)},
    {name:'_rels/.rels',         data:enc.encode(rels)},
    {name:'word/document.xml',   data:enc.encode(doc)},
    {name:'word/_rels/document.xml.rels', data:enc.encode(drels)},
    {name:'word/styles.xml',     data:enc.encode(styles)}
  ]);
}
return {build};
})();

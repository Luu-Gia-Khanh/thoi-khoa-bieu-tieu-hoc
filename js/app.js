/* ===========================================================
   app.js — Giao diện & điều phối
   =========================================================== */
let ST = load();

/* ---------------- Lưu trữ & chuẩn hoá ----------------
   Một số trình duyệt chặn localStorage khi mở tệp bằng file://
   nên mọi truy cập đều phải bọc lỗi, tránh làm hỏng cả trang. */
let LS_OK=true;
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ LS_OK=false; return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); return true; }catch(e){ LS_OK=false; return false; } }
function lsDel(k){ try{ localStorage.removeItem(k); }catch(e){ LS_OK=false; } }

/* Dọn tham chiếu tới môn / lớp / giáo viên đã bị xoá,
   tránh dữ liệu rác làm sai thống kê và phân công. */
function cleanRefs(s){
  const sid=new Set(s.subjects.map(x=>x.id));
  const cid=new Set(s.classes.map(x=>x.id));
  const tid=new Set(s.teachers.map(x=>x.id));
  const rid=new Set(s.rooms.map(x=>x.id));
  let n=0;
  s.teachers.forEach(t=>{
    const all=(t.subjects||[]);
    const keep=all.filter(x=>sid.has(x));
    if(keep.length!==all.length){ n+=all.length-keep.length; }
    t.subjects=keep;
    const g0=t.grades||{}, g={};
    Object.keys(g0).forEach(k=>{ if(k==='*'||sid.has(k)) g[k]=g0[k]; });
    if(Object.keys(g).length!==Object.keys(g0).length) n++;
    t.grades=g;
  });
  s.subjects.forEach(x=>{ if(x.room && !rid.has(x.room)){ x.room=''; n++; } });
  const p0=(s.pins||[]).length;
  s.pins=(s.pins||[]).filter(p=>cid.has(p.classId) && sid.has(p.subjectId));
  const b0=(s.blocks||[]).length;
  s.blocks=(s.blocks||[]).filter(b=>cid.has(b.classId));
  const l0=(s.locks||[]).length;
  s.locks=(s.locks||[]).filter(l=>cid.has(l.classId));
  n += (p0-s.pins.length)+(b0-s.blocks.length)+(l0-s.locks.length);
  s.classes.forEach(c=>{ if(!tid.has(c.homeroom))
    c.homeroom=(s.teachers.find(t=>t.kind==='GVCN')||s.teachers[0]||{}).id; });
  return n;
}
function afterDelete(msg){
  const n=cleanRefs(ST);
  save(); renderAll();
  toast(n ? `${msg} Đã dọn ${n} tham chiếu liên quan.` : msg, 'ok');
}

function normalize(s){
  const d=defaultState();
  s.config = Object.assign({}, d.config, s.config||{});
  s.config.weights = Object.assign({}, d.config.weights, s.config.weights||{});
  s.config.rules   = Object.assign({}, d.config.rules,   s.config.rules||{});
  s.config.offSessions = s.config.offSessions||[];
  ['subjects','rooms','classes','teachers'].forEach(k=>{ if(!Array.isArray(s[k])||!s[k].length) s[k]=d[k]; });
  s.subjects.forEach(x=>{
    if(!['homeroom','specialist','session2'].includes(x.who)) x.who='homeroom';
    if(x.merge===undefined) x.merge=false;
    if(!x.mergeMax) x.mergeMax=x.merge?2:1;
    if(!['auto','always'].includes(x.mergeMode)) x.mergeMode='auto';
    if(!Array.isArray(x.mergeGrades)) x.mergeGrades=[];
  });
  s.teachers.forEach(t=>{
    if(!t.kind) t.kind = (s.classes.some(c=>c.homeroom===t.id) ? 'GVCN' : 'BOMON');
    if(!t.sessions) t.sessions='both';
    if(t.maxAfternoons===undefined) t.maxAfternoons = t.kind==='GVCN'?2:0;
    if(!t.offMode) t.offMode = t.kind==='GVCN'?'auto-session':'auto-day';
    if(t.offFixed===undefined) t.offFixed='';
    t.busy=t.busy||[]; t.subjects=t.subjects||[];
    if(!t.grades || typeof t.grades!=='object' || Array.isArray(t.grades)) t.grades={};
  });
  s.pins=s.pins||[]; s.blocks=s.blocks||[]; s.locks=s.locks||[];
  cleanRefs(s);
  return s;
}
function load(){
  try{ const raw=lsGet(APP_KEY); if(raw) return normalize(JSON.parse(raw)); }
  catch(e){ console.warn('Không đọc được dữ liệu đã lưu:',e); }
  return defaultState();
}
function save(){ if(!lsSet(APP_KEY, JSON.stringify(ST))) toast('Không lưu được vào trình duyệt — hãy dùng tab «Sao lưu» để tải tệp về máy.','err'); }

/* ---------------- Tiện ích ---------------- */
const $  = s=>document.querySelector(s);
const $$ = s=>Array.from(document.querySelectorAll(s));
const esc = s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastT;
function toast(msg,kind){
  const t=$('#toast'); t.textContent=msg; t.className='toast show '+(kind||'');
  clearTimeout(toastT); toastT=setTimeout(()=>t.className='toast',2800);
}
const subById  = id=>ST.subjects.find(s=>s.id===id);
const teaById  = id=>ST.teachers.find(t=>t.id===id);
const clsById  = id=>ST.classes.find(c=>c.id===id);
const roomById = id=>ST.rooms.find(r=>r.id===id);
function shortName(n){ const p=String(n||'').trim().split(/\s+/); return p.length>1?p[0][0]+'. '+p.slice(-2).join(' '):n; }
function classPeriods(c){ return ST.subjects.reduce((a,s)=>a+(+(s.periods[c.grade]||0)),0); }
function sessionOff(d,ss){ return (ST.config.offSessions||[]).includes(d+'-'+ss); }
function kindBadge(k){ return `<span class="badge ${(k||'').toLowerCase()}">${KIND_NAME[k]||k||'—'}</span>`; }

/* Giới hạn khối (N29): {"CN":[3]} -> "CN:3"   |   {"*":[2,3]} -> "*:2,3" */
function gradesToText(g){
  if(!g) return '';
  return Object.keys(g).filter(k=>(g[k]||[]).length)
    .map(k=>k+':'+g[k].join(',')).join('; ');
}
function textToGrades(txt){
  const out={};
  String(txt||'').split(/[;\n]+/).forEach(part=>{
    const m=part.split(':');
    if(m.length<2) return;
    const key=m[0].trim().toUpperCase();
    const list=m[1].split(/[,\s+]+/).map(x=>parseInt(x,10)).filter(x=>x>=1&&x<=5);
    if(key && list.length) out[key]=[...new Set(list)].sort();
  });
  return out;
}

function solutionStale(){
  const sol=ST.solution; if(!sol) return false;
  if(!sol.slots || sol.slots.length!==Sched.buildSlots(ST.config).length) return true;
  return ST.classes.some(c=>!Array.isArray(sol.grid[c.id]));
}
function staleBanner(){
  return `<div class="issue warn" style="margin-bottom:14px"><b>Thời khoá biểu đã lỗi thời.</b>
    Danh sách lớp hoặc khung tiết đã thay đổi sau lần xếp gần nhất. Hãy chạy lại ở tab «Chạy xếp lịch».</div>`;
}

/* ===========================================================
   Ô CHỌN CÓ TÌM KIẾM  —  bọc ngoài <select> gốc nên mọi
   xử lý cũ (value, change) vẫn chạy nguyên vẹn.
   =========================================================== */
function closeCombos(except){
  $$('.combo.open').forEach(c=>{ if(c!==except && c._close) c._close(); });
}
document.addEventListener('click',e=>{ if(!e.target.closest('.combo,.combo-pop')) closeCombos(); });

function makeCombo(sel){
  if(sel.dataset.combo) return;
  sel.dataset.combo='1';
  const wrap=document.createElement('div'); wrap.className='combo';
  sel.parentNode.insertBefore(wrap,sel); wrap.appendChild(sel);
  sel.classList.add('combo-native'); sel.tabIndex=-1;

  const btn=document.createElement('button'); btn.type='button'; btn.className='combo-btn';
  const pop=document.createElement('div'); pop.className='combo-pop';
  const box=document.createElement('div'); box.className='combo-search';
  const inp=document.createElement('input'); inp.type='text'; inp.placeholder='Gõ để tìm…';
  const list=document.createElement('div'); list.className='combo-list';
  box.appendChild(inp); pop.appendChild(box); pop.appendChild(list);
  wrap.appendChild(btn); wrap.appendChild(pop);

  const label=()=>{ const o=sel.selectedOptions[0]; return o?o.textContent:'— chọn —'; };
  const sync=()=>{ btn.textContent=label(); btn.title=label(); };
  let act=-1, items=[];

  function draw(q){
    q=(q||'').trim().toLowerCase();
    items=[...sel.options].filter(o=>!q || o.textContent.toLowerCase().includes(q));
    list.innerHTML = items.length
      ? items.map((o,k)=>`<div class="combo-opt${o.selected?' sel':''}" data-k="${k}">${esc(o.textContent)}</div>`).join('')
      : '<div class="combo-empty">Không tìm thấy mục nào phù hợp</div>';
    act=items.findIndex(o=>o.selected);
    mark();
  }
  function mark(){
    [...list.children].forEach((n,k)=>n.classList.toggle('act',k===act));
    const n=list.children[act]; if(n && n.scrollIntoView) n.scrollIntoView({block:'nearest'});
  }
  /* Đặt bảng chọn ở lớp trên cùng của trang (position:fixed) để KHÔNG bị
     khung cuộn của bảng dữ liệu cắt mất — đây là lỗi che mất mũi tên trước đây. */
  function place(){
    const r=btn.getBoundingClientRect();
    const w=Math.max(r.width, 260);
    pop.style.width=w+'px';
    pop.style.left=Math.max(8, Math.min(r.left, window.innerWidth-w-12))+'px';
    const below=window.innerHeight-r.bottom, above=r.top;
    const up = below<260 && above>below;
    const room=Math.max(180, (up?above:below)-16);
    const H=Math.min(360, room);
    list.style.maxHeight=(H-64)+'px';
    if(up){ pop.style.top='auto'; pop.style.bottom=(window.innerHeight-r.top+6)+'px'; }
    else  { pop.style.bottom='auto'; pop.style.top=(r.bottom+6)+'px'; }
  }
  function open(){
    if(sel.disabled) return;
    closeCombos(wrap); wrap.classList.add('open');
    document.body.appendChild(pop);
    pop.classList.add('portal','show');
    place(); inp.value=''; draw(''); inp.focus();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
  }
  function close(){
    wrap.classList.remove('open');
    pop.classList.remove('portal','show');
    pop.removeAttribute('style');
    if(pop.parentNode!==wrap) wrap.appendChild(pop);
    window.removeEventListener('scroll', place, true);
    window.removeEventListener('resize', place);
  }
  wrap._close=close;
  function pick(k){
    const o=items[k]; if(!o) return;
    sel.value=o.value; sync(); close();
    sel.dispatchEvent(new Event('change',{bubbles:true}));
  }
  btn.addEventListener('click',e=>{ e.stopPropagation();
    wrap.classList.contains('open') ? close() : open(); });
  pop.addEventListener('click',e=>e.stopPropagation());
  inp.addEventListener('input',()=>draw(inp.value));
  inp.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'){ e.preventDefault(); act=Math.min(act+1,items.length-1); mark(); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); act=Math.max(act-1,0); mark(); }
    else if(e.key==='Enter'){ e.preventDefault(); pick(act<0?0:act); }
    else if(e.key==='Escape'){ close(); btn.focus(); }
  });
  list.addEventListener('click',e=>{ const o=e.target.closest('.combo-opt'); if(o) pick(+o.dataset.k); });
  sync();
}
/* Chỉ nâng cấp những select THẬT SỰ cần tìm kiếm.
   Select ít lựa chọn giữ nguyên bản gốc của trình duyệt cho gọn và không bao giờ bị cắt. */
function enhanceSelects(root){
  document.querySelectorAll('body > .combo-pop').forEach(n=>n.remove());   // dọn bảng chọn mồ côi sau khi vẽ lại
  (root||document).querySelectorAll('select').forEach(sel=>{
    if(sel.dataset.combo || sel.multiple) return;
    if(sel.options.length < 8) return;
    makeCombo(sel);
  });
}

/* Giữ Shift + lăn chuột để cuộn ngang bảng rộng */
document.addEventListener('wheel',e=>{
  const w=e.target.closest && e.target.closest('.table-wrap');
  if(!w) return;
  if(e.shiftKey && Math.abs(e.deltaY)>Math.abs(e.deltaX)){
    w.scrollLeft += e.deltaY; e.preventDefault();
  }
},{passive:false});

/* ===========================================================
   Ô TÌM KIẾM TRÊN BẢNG DỮ LIỆU
   =========================================================== */
function filterTable(id,q){
  const tbl=document.getElementById(id); if(!tbl) return;
  q=(q||'').trim().toLowerCase();
  const rows=[...tbl.querySelectorAll('tbody tr')];
  let n=0;
  rows.forEach(tr=>{
    let txt=tr.textContent.toLowerCase();
    tr.querySelectorAll('input,select').forEach(el=>{
      txt += ' ' + (el.tagName==='SELECT' ? (el.selectedOptions[0]||{textContent:''}).textContent : el.value).toLowerCase();
    });
    const hit=!q || txt.includes(q);
    tr.classList.toggle('hidden-row',!hit); if(hit) n++;
  });
  const c=document.querySelector(`[data-count="${id}"]`);
  if(c) c.textContent = q ? `Hiện ${n}/${rows.length} dòng` : `${rows.length} dòng`;
}
function refreshFilters(){
  $$('.tsearch').forEach(i=>filterTable(i.dataset.table, i.value));
}
document.addEventListener('input',e=>{
  if(e.target.classList && e.target.classList.contains('tsearch'))
    filterTable(e.target.dataset.table, e.target.value);
});

/* ---------------- Tabs ---------------- */
$('#tabs').addEventListener('click',e=>{
  const b=e.target.closest('.tab'); if(!b) return;
  $$('.tab').forEach(x=>x.classList.toggle('active',x===b));
  $$('.panel').forEach(p=>p.classList.toggle('active',p.id==='tab-'+b.dataset.tab));
  if(b.dataset.tab==='run') renderPreflight();
  if(b.dataset.tab==='view') renderView();
  window.scrollTo({top:0,behavior:'smooth'});
});
function goTab(name){
  $$('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));
  $$('.panel').forEach(p=>p.classList.toggle('active',p.id==='tab-'+name));
}
function renderHeader(){
  $('#hdSchool').textContent = ST.config.schoolName;
  $('#hdYear').textContent   = `Năm học ${ST.config.schoolYear} • ${ST.config.semester}`;
}

/* ---------------- Cấu hình ---------------- */
const WEIGHT_LABEL={
  prefSession:'Đúng buổi ưu tiên của môn', prefEarly:'Môn khó vào tiết sớm',
  spread:'Rải đều môn trong tuần', adjacentSame:'Tránh 2 tiết cùng môn liền kề',
  teacherGap:'Giảm tiết trống của GV', teacherConsec:'Hạn chế tiết liên tục',
  teacherBalance:'Cân bằng tiết/ngày của GV', peSafety:'An toàn giờ Thể chất',
  classTail:'Dồn tiết trống về cuối buổi', mergeUse:'Hạn chế dồn lớp',
  minSession:'Đủ tiết tối thiểu mỗi buổi'
};
const RULE_LABEL={
  coreMorning:['Ưu tiên môn khó buổi sáng','Toán, Tiếng Việt vào tiết 1–3 sáng (S1)'],
  spreadWeek:['Rải đều môn trong tuần','Không dồn nhiều tiết cùng môn trong một ngày (S2)'],
  allowDouble:['Cho phép tiết đôi','Tiếng Việt lớp 1–2 và tiết ôn luyện được xếp liền kề (S3)'],
  peSafety:['An toàn giờ Thể chất','Không xếp tiết 1 buổi chiều và tiết cuối buổi sáng (S4)'],
  minTeacherGap:['Giảm tiết trống của GV','Gom tiết dạy liền mạch trong mỗi buổi (S5)'],
  limitConsec:['Giới hạn tiết liên tục','Không quá số tiết liên tục cho phép (S6)'],
  balanceDay:['Cân bằng tải theo ngày','Tránh ngày 7 tiết – ngày 1 tiết (S7)'],
  tailFree:['Tiết trống dồn cuối buổi','Lớp không bị trống giữa buổi (S8)'],
  fixedCeremony:['Ghim Chào cờ & Sinh hoạt lớp','Tiết 1 đầu tuần và tiết cuối cuối tuần (N10, N11)'],
  specialistFirst:['Ưu tiên GV bộ môn & phòng chức năng','Xếp tài nguyên khan hiếm trước (Bước 4)'],
  teacherTimeOff:['Mọi giáo viên đều có buổi/ngày nghỉ','GVCN nghỉ 1 buổi; GV bộ môn và GV buổi 2 nghỉ 1 ngày (N26)'],
  gvcnAfternoonCap:['Giới hạn buổi chiều của GVCN','GVCN chỉ đứng lớp tối đa 1–2 buổi chiều trong tuần (N27)'],
  allowMerge:['Cho phép dồn lớp','GV Tiếng Anh có thể dạy ghép 2 lớp cùng khối trong một tiết (N28)'],
  minSessionLoad:['Đủ tiết tối thiểu mỗi buổi lên lớp','Không để giáo viên nhà xa đến trường dạy 1 tiết rồi về (N30)'],
  gvcnFirstPeriod:['GVCN đón lớp đầu buổi sáng','Các tiết đầu buổi sáng của mỗi lớp dành riêng cho giáo viên chủ nhiệm (H13)'],
  gvcnAdjacentMin:['GVCN dạy 2 tiết sáng phải liền kề','Không để GVCN dạy tiết 1 rồi chờ đến tiết 4 (N32)'],
  gvcnNoMorningOff:['GVCN không nghỉ buổi sáng','Buổi nghỉ của GVCN luôn rơi vào buổi chiều (N31)'],
  gradeLimit:['Áp dụng giới hạn khối của giáo viên','Ví dụ: cô A chỉ dạy Công nghệ khối 3, thầy B chỉ dạy Khoa học khối 4–5 (N29)']
};
function renderConfig(){
  const c=ST.config;
  $('#cfgSchool').value=c.schoolName; $('#cfgYear').value=c.schoolYear;
  const semSel=$('#cfgSemester');
  if(![...semSel.options].some(o=>o.value===c.semester))
    semSel.insertAdjacentHTML('beforeend',`<option value="${esc(c.semester)}">${esc(c.semester)}</option>`);
  semSel.value=c.semester;
  $('#cfgFrom').value=c.appliedFrom;
  $('#cfgMorning').value=c.morningPeriods; $('#cfgAfternoon').value=c.afternoonPeriods;
  $('#cfgMStart').value=c.morningStart; $('#cfgAStart').value=c.afternoonStart;
  $('#cfgLen').value=c.periodMinutes; $('#cfgBreak').value=c.breakMinutes;
  $('#cfgLBAfter').value=c.longBreakAfter; $('#cfgLBMin').value=c.longBreakMinutes;
  $('#cfgMinM').value=c.minMorning; $('#cfgMinC').value=c.minAfternoon;
  $('#cfgGvcnFirst').value=String(c.gvcnFirstPeriods||1);
  $('#cfgRestarts').value=c.restarts; $('#cfgPolish').value=c.polish; $('#cfgConsec').value=c.maxConsecutive;
  $('#cfgDays').innerHTML=[2,3,4,5,6,7].map(d=>
    `<div class="chip ${c.days.includes(d)?'on':''}" data-day="${d}">${DAY_NAME[d]}</div>`).join('');
  $('#cfgOffSessions').innerHTML=c.days.map(d=>['S','C'].map(ss=>
    `<div class="chip ${sessionOff(d,ss)?'on':''}" data-off="${d}-${ss}">${SESSION_NAME[ss]} ${DAY_SHORT[d]}</div>`).join('')).join('');
  $('#cfgWeights').innerHTML=Object.keys(WEIGHT_LABEL).map(k=>
    `<div class="field"><label>${WEIGHT_LABEL[k]}</label><input type="number" data-w="${k}" value="${c.weights[k]}" min="0" max="99"></div>`).join('');
  renderClock();
}
$('#cfgDays').addEventListener('click',e=>{
  const ch=e.target.closest('.chip'); if(!ch) return;
  const d=+ch.dataset.day, i=ST.config.days.indexOf(d);
  if(i>=0){ if(ST.config.days.length<=1) return toast('Phải có ít nhất 1 ngày học.','err'); ST.config.days.splice(i,1); }
  else ST.config.days.push(d);
  ST.config.days.sort((a,b)=>a-b); save(); renderConfig(); renderRules();
});
$('#cfgOffSessions').addEventListener('click',e=>{
  const ch=e.target.closest('.chip'); if(!ch) return;
  const k=ch.dataset.off, arr=ST.config.offSessions, i=arr.indexOf(k);
  if(i>=0) arr.splice(i,1); else arr.push(k);
  save(); renderConfig(); renderRules(); renderView();
});
function renderClock(){
  const ck=Sched.periodClock(ST.config);
  const row=(t,arr)=>arr.length?`<b>${t}:</b> `+arr.map(x=>`Tiết ${x.period} (${x.from}–${x.to})`).join(' &nbsp;·&nbsp; '):'';
  const off=(ST.config.offSessions||[]).map(k=>{const[d,ss]=k.split('-');return SESSION_NAME[ss]+' '+DAY_NAME[+d];});
  $('#clockPreview').innerHTML=`<h3>Khung giờ dự kiến</h3>
    <p style="font-size:13px;margin:0 0 6px">${row('Buổi sáng',ck.S)}</p>
    <p style="font-size:13px;margin:0">${row('Buổi chiều',ck.C)}</p>
    ${off.length?`<p style="font-size:13px;margin:8px 0 0;color:var(--err);font-weight:600">Toàn trường nghỉ: ${off.join(', ')} — tổng ${Sched.buildSlots(ST.config).length} ô/tuần</p>`:''}`;
}
$('#btnSaveConfig').addEventListener('click',()=>{
  const c=ST.config;
  c.schoolName=$('#cfgSchool').value; c.schoolYear=$('#cfgYear').value;
  c.semester=$('#cfgSemester').value; c.appliedFrom=$('#cfgFrom').value;
  c.morningPeriods=Math.max(0,+$('#cfgMorning').value||0);
  c.afternoonPeriods=Math.max(0,+$('#cfgAfternoon').value||0);
  c.morningStart=$('#cfgMStart').value; c.afternoonStart=$('#cfgAStart').value;
  c.periodMinutes=+$('#cfgLen').value||35; c.breakMinutes=+$('#cfgBreak').value||5;
  c.longBreakAfter=+$('#cfgLBAfter').value||2; c.longBreakMinutes=+$('#cfgLBMin').value||20;
  c.minMorning=Math.max(0,+$('#cfgMinM').value||0); c.minAfternoon=Math.max(0,+$('#cfgMinC').value||0);
  c.gvcnFirstPeriods=Math.max(1,+$('#cfgGvcnFirst').value||1);
  c.restarts=+$('#cfgRestarts').value||20; c.polish=+$('#cfgPolish').value||0;
  c.maxConsecutive=+$('#cfgConsec').value||4;
  $$('#cfgWeights input').forEach(i=>c.weights[i.dataset.w]=+i.value||0);
  save(); renderHeader(); renderClock(); renderRules(); toast('Đã lưu cấu hình.','ok');
});

/* ---------------- Môn học ---------------- */
function allGrades(){
  const g=[...new Set(ST.classes.map(c=>+c.grade))].filter(x=>x>0).sort((a,b)=>a-b);
  return g.length?g:[1,2,3,4,5];
}
function gradeLabel(g){
  const c=ST.classes.find(x=>+x.grade===+g);
  return (c && +g>5) ? (c.name||('Khối '+g)) : ('Lớp '+g);
}
function renderSubjects(){
  const grades=allGrades();
  let h=`<thead>
    <tr class="grp">
      <th colspan="2" class="g-id">MÔN HỌC</th>
      <th colspan="2">HIỂN THỊ</th>
      <th colspan="2">AI DẠY &amp; Ở ĐÂU</th>
      <th colspan="6">CÁCH XẾP VÀO THỜI KHOÁ BIỂU</th>
      <th colspan="${grades.length}" class="g-num">SỐ TIẾT MỖI TUẦN THEO KHỐI</th>
      <th></th></tr>
    <tr>
      <th class="g-id">Mã</th><th class="g-id">Tên môn học</th>
      <th title="Tên rút gọn in trên ô thời khoá biểu">Viết tắt</th>
      <th title="Màu nền ô trên bản in">Màu</th>
      <th title="Môn này thuộc về nhóm giáo viên nào">Người dạy</th>
      <th title="Phòng chức năng bắt buộc, để trống nếu học tại lớp">Phòng</th>
      <th title="Ưu tiên xếp vào buổi nào">Buổi</th>
      <th title="0–3: mức ưu tiên xếp vào tiết sớm buổi sáng. Môn khó để 3">Sớm</th>
      <th title="Cho phép 2 tiết liền nhau, hợp với Tiếng Việt lớp 1–2">Tiết đôi</th>
      <th title="Ghép nhiều lớp cùng khối vào một tiết. Ô bên phải: số lớp tối đa và khối áp dụng">Dồn lớp</th>
      <th title="Số tiết tối đa của môn này trong một ngày">Max/ngày</th>
      <th title="Ghim cứng vào đầu tuần (Chào cờ) hoặc cuối tuần (Sinh hoạt lớp)">Ghim</th>
      ${grades.map(g=>`<th class="center g-num">${esc(gradeLabel(g))}</th>`).join('')}
      <th></th></tr></thead><tbody>`;
  ST.subjects.forEach((s,i)=>{
    h+=`<tr data-i="${i}">
      <td class="g-id"><b>${esc(s.id)}</b></td>
      <td class="g-id"><input data-f="name" value="${esc(s.name)}"></td>
      <td><input data-f="short" value="${esc(s.short)}" style="width:96px"></td>
      <td><input type="color" class="swatch" data-f="color" value="${s.color}"></td>
      <td><select data-f="who">${Object.keys(WHO_NAME).map(k=>`<option value="${k}"${s.who===k?' selected':''}>${WHO_NAME[k]}</option>`).join('')}</select></td>
      <td><select data-f="room"><option value="">— không —</option>${ST.rooms.map(r=>`<option value="${r.id}"${s.room===r.id?' selected':''}>${esc(r.name)}</option>`).join('')}</select></td>
      <td><select data-f="prefSession"><option value="any"${s.prefSession==='any'?' selected':''}>Tuỳ</option><option value="S"${s.prefSession==='S'?' selected':''}>Sáng</option><option value="C"${s.prefSession==='C'?' selected':''}>Chiều</option></select></td>
      <td><input class="num" type="number" min="0" max="3" data-f="early" value="${s.early}"></td>
      <td class="center"><input type="checkbox" data-f="double"${s.double?' checked':''}></td>
      <td class="nowrap"><select data-f="mergeSel" style="width:98px">
            <option value="off"${!s.merge?' selected':''}>Không</option>
            <option value="auto"${s.merge&&s.mergeMode!=='always'?' selected':''}>Khi cần</option>
            <option value="always"${s.merge&&s.mergeMode==='always'?' selected':''}>Luôn dồn</option></select>
          <input class="num" type="number" min="1" max="4" data-f="mergeMax" value="${s.mergeMax||1}" style="width:42px" title="Số lớp tối đa được dồn">
          <input data-f="mergeGrades" value="${esc((s.mergeGrades||[]).join(','))}" placeholder="mọi khối" style="width:70px" title="Chỉ dồn ở các khối này, VD: 3 hoặc 3,4"></td>
      <td><input class="num" type="number" min="1" max="6" data-f="maxDay" value="${s.maxDay}"></td>
      <td><select data-f="fixed"><option value=""${!s.fixed?' selected':''}>—</option><option value="start"${s.fixed==='start'?' selected':''}>Đầu tuần</option><option value="end"${s.fixed==='end'?' selected':''}>Cuối tuần</option></select></td>
      ${grades.map(g=>`<td class="center g-num"><input class="num" type="number" min="0" max="15" data-g="${g}" value="${+(s.periods[g]||0)}"></td>`).join('')}
      <td><button class="btn btn-sm btn-danger" data-del="${i}">Xoá</button></td></tr>`;
  });
  $('#tblSubjects').innerHTML=h+'</tbody>';
  $('#tblSubjects').className='data sticky2';
  enhanceSelects($('#tblSubjects')); refreshFilters();
  const slots=Sched.buildSlots(ST.config).length;
  const tot=grades.map(g=>{
    const n=ST.subjects.reduce((a,s)=>a+(+(s.periods[g]||0)),0);
    const cls=n>slots?'style="color:var(--err)"':'';
    return `${esc(gradeLabel(g))}: <b ${cls}>${n}</b>`;
  }).join(' &nbsp;|&nbsp; ');
  $('#subjTotals').innerHTML=`Tổng phân phối (khung tuần có <b>${slots}</b> ô) — `+tot;
}
$('#tblSubjects').addEventListener('change',e=>{
  const tr=e.target.closest('tr'); if(!tr) return;
  const s=ST.subjects[+tr.dataset.i], f=e.target.dataset.f, g=e.target.dataset.g;
  if(g) s.periods[g]=Math.max(0,+e.target.value||0);
  else if(f==='mergeSel'){
    const v=e.target.value;
    s.merge = v!=='off';
    s.mergeMode = v==='always'?'always':'auto';
    if(s.merge && (!s.mergeMax||s.mergeMax<2)) s.mergeMax=2;
    if(!s.merge) s.mergeMax=1;
  }
  else if(f==='mergeGrades') s.mergeGrades=e.target.value.split(/[,\s]+/).map(x=>parseInt(x,10)).filter(x=>x>=1&&x<=5);
  else if(f) s[f]= e.target.type==='checkbox'?e.target.checked : (['early','maxDay','mergeMax'].includes(f)?+e.target.value:e.target.value);
  save(); renderSubjects(); renderRules();
});
$('#tblSubjects').addEventListener('click',e=>{
  const b=e.target.closest('[data-del]'); if(!b) return;
  const sb=ST.subjects[+b.dataset.del];
  const dung=ST.teachers.filter(t=>(t.subjects||[]).includes(sb.id)).length;
  if(!confirm(`Xoá môn «${sb.name}» khỏi chương trình?`
    + (dung?`\n\n${dung} giáo viên đang được phân công môn này, phần phân công đó sẽ bị gỡ theo.`:''))) return;
  ST.subjects.splice(+b.dataset.del,1);
  afterDelete(`Đã xoá môn ${sb.name}.`); return;
});
/* Bảng màu pastel hài hoà — cùng độ sáng nên bản in nhìn đều màu */
const PALETTE={
  TV:'#cfe4ff', TOAN:'#ffe0cc', TA:'#d6f5e0', DD:'#ecdcff', TNXH:'#cdeef2',
  KH:'#d9f2e8',  LSDL:'#fdeec4', TIN:'#dde3ff', CN:'#ece2d6', GDTC:'#ffdfe9',
  AN:'#fff0c2',  MT:'#ffdcdc',   HDTN:'#e0eecd', SHL:'#ffd4d4', CC:'#e8edf5',
  OTV:'#e8f1ff', PDTV:'#e8f1ff', OT:'#fff2e8',  PDT:'#fff2e8', THV:'#ddf0e2'
};
const PALETTE_FALLBACK=['#cfe4ff','#ffe0cc','#d6f5e0','#ecdcff','#cdeef2','#fdeec4',
  '#dde3ff','#ece2d6','#ffdfe9','#fff0c2','#ffdcdc','#e0eecd','#e8edf5','#ddf0e2'];
$('#btnPalette').addEventListener('click',()=>{
  if(!confirm('Gán lại màu hài hoà cho toàn bộ môn học?\nMàu bạn tự chọn trước đó sẽ bị ghi đè.')) return;
  let k=0;
  ST.subjects.forEach(s=>{ s.color = PALETTE[s.id] || PALETTE_FALLBACK[k++ % PALETTE_FALLBACK.length]; });
  save(); renderSubjects(); renderView(true);
  toast('Đã chuẩn hoá bảng màu cho '+ST.subjects.length+' môn học.','ok');
});
$('#btnAddSubject').addEventListener('click',()=>{
  const id=(prompt('Mã môn (viết hoa, không dấu, VD: TDT):')||'').trim().toUpperCase();
  if(!id) return;
  if(subById(id)) return toast('Mã môn đã tồn tại.','err');
  ST.subjects.push({id, name:'Môn mới', short:id, color:'#eef2f7', who:'homeroom', room:'',
    prefSession:'any', early:0, double:false, merge:false, mergeMax:1, mergeMode:'auto', maxDay:1, fixed:'',
    periods:{1:0,2:0,3:0,4:0,5:0}});
  save(); renderSubjects();
});

/* ---------------- Lớp ---------------- */
function renderClasses(){
  const slots=Sched.buildSlots(ST.config).length;
  let h=`<thead><tr><th>Mã</th><th>Tên lớp</th><th>Khối</th><th>Sĩ số</th><th>GV chủ nhiệm</th>
    <th class="center">Tiết/tuần</th><th class="center">Ô trống</th><th>Ghi chú đặc thù</th><th></th></tr></thead><tbody>`;
  ST.classes.forEach((c,i)=>{
    const n=classPeriods(c), free=slots-n;
    h+=`<tr data-i="${i}">
      <td><b>${esc(c.id)}</b></td>
      <td><input data-f="name" value="${esc(c.name)}" style="width:86px"></td>
      <td><select data-f="grade">${allGrades().concat(+c.grade>5?[]:[]).map(g=>`<option value="${g}"${+c.grade===g?' selected':''}>${+g>5?'Nhóm '+g:'Khối '+g}</option>`).join('')}</select></td>
      <td><input class="num" type="number" data-f="size" value="${c.size}"></td>
      <td><select data-f="homeroom">${ST.teachers.map(t=>`<option value="${t.id}"${c.homeroom===t.id?' selected':''}>${esc(t.name)}</option>`).join('')}</select></td>
      <td class="center"><b>${n}</b></td>
      <td class="center"${free<0?' style="color:var(--err);font-weight:700"':''}>${free}</td>
      <td><input data-f="note" value="${esc(c.note||'')}" placeholder="VD: có HS hoà nhập (N19)"></td>
      <td><button class="btn btn-sm btn-danger" data-del="${i}">Xoá</button></td></tr>`;
  });
  $('#tblClasses').innerHTML=h+'</tbody>';
  enhanceSelects($('#tblClasses')); refreshFilters();
}
$('#tblClasses').addEventListener('change',e=>{
  const tr=e.target.closest('tr'); if(!tr) return;
  const c=ST.classes[+tr.dataset.i], f=e.target.dataset.f;
  c[f]=['grade','size'].includes(f)?+e.target.value:e.target.value;
  save(); renderClasses(); renderRules(); renderTeachers();
});
$('#tblClasses').addEventListener('click',e=>{
  const b=e.target.closest('[data-del]'); if(!b) return;
  const cl=ST.classes[+b.dataset.del];
  const rel=(ST.pins||[]).filter(p=>p.classId===cl.id).length
          + (ST.blocks||[]).filter(x=>x.classId===cl.id).length
          + (ST.locks||[]).filter(x=>x.classId===cl.id).length;
  if(!confirm(`Xoá lớp ${cl.name}?`+(rel?`\n\n${rel} tiết ghim / ô cấm / khoá của lớp này cũng bị xoá theo.`:''))) return;
  ST.classes.splice(+b.dataset.del,1);
  afterDelete(`Đã xoá lớp ${cl.name}.`); return;
});
$('#btnAddClass').addEventListener('click',()=>{
  const name=(prompt('Tên lớp (VD: 1C):')||'').trim(); if(!name) return;
  ST.classes.push({id:'L'+name.replace(/\s+/g,''), name, grade:parseInt(name,10)||1, size:35,
    homeroom:(ST.teachers.find(t=>t.kind==='GVCN')||ST.teachers[0]||{}).id, note:''});
  save(); renderClasses(); renderRules();
});

/* ---------------- Giáo viên ---------------- */
function offFixedOptions(t){
  const c=ST.config;
  let h=`<option value=""${!t.offFixed?' selected':''}>— tự chọn —</option>`;
  c.days.forEach(d=>{ h+=`<option value="${d}"${t.offFixed==String(d)?' selected':''}>Trọn ${DAY_NAME[d]}</option>`; });
  c.days.forEach(d=>['S','C'].forEach(ss=>{
    if(sessionOff(d,ss)) return;
    const k=d+'-'+ss;
    h+=`<option value="${k}"${t.offFixed===k?' selected':''}>${SESSION_NAME[ss]} ${DAY_NAME[d]}</option>`;
  }));
  return h;
}
/* ===========================================================
   MÔN PHỤ TRÁCH — hiển thị bằng chip, sửa bằng hộp thoại
   =========================================================== */
function gradesOf(sub){            // các khối thực sự có học môn này
  return allGrades().filter(g=>+(sub.periods[g]||0)>0);
}
function limitOf(t,sid){           // danh sách khối được phép dạy, null = mọi khối
  const g=t.grades||{};
  const l=(g[sid]&&g[sid].length)?g[sid]:((g['*']&&g['*'].length)?g['*']:null);
  return l?l.map(Number):null;
}
function subjCell(t,i){
  const ids=(t.subjects||[]).filter(id=>subById(id));
  if(!ids.length)
    return `<div class="subjcell" data-pick="${i}"><span class="none">Chưa phân công môn nào</span>
            <span class="edit">Bấm để chọn ›</span></div>`;
  const chips=ids.map(id=>{
    const s=subById(id), lim=limitOf(t,id), all=gradesOf(s);
    const short=(lim && lim.length && lim.length<all.length)
      ? `<i>K${lim.join('·')}</i>` : '';
    return `<span class="schip" style="background:${s.color}">${esc(s.short||s.name)}${short}</span>`;
  }).join('');
  return `<div class="subjcell" data-pick="${i}"><span class="chips-wrap">${chips}</span>
          <span class="edit">Sửa ›</span></div>`;
}

let MD={ti:-1, subs:null, grades:null};
function openPicker(i){
  const t=ST.teachers[i]; if(!t) return;
  MD.ti=i;
  MD.subs=new Set((t.subjects||[]).filter(id=>subById(id)));
  MD.grades={};
  const star=(t.grades||{})['*'];
  ST.subjects.forEach(s=>{
    const own=(t.grades||{})[s.id];
    const l = (own&&own.length) ? own : (star&&star.length ? star : null);
    if(l) MD.grades[s.id]=l.map(Number).filter(g=>gradesOf(s).includes(g));
  });
  $('#mdTitle').textContent='Môn phụ trách — '+t.name;
  $('#mdSub').textContent=`${KIND_NAME[t.kind]||''} · định mức ${t.maxWeek} tiết/tuần. `
    + 'Tick chọn môn, rồi chọn khối nếu chỉ dạy một số khối.';
  $('#mdSearch').value='';
  drawPicker('');
  $('#modal').hidden=false;
  setTimeout(()=>$('#mdSearch').focus(),30);
}
function drawPicker(q){
  q=(q||'').trim().toLowerCase();
  const t=ST.teachers[MD.ti]||{};
  const groups=[['homeroom','Môn của giáo viên chủ nhiệm'],
                ['specialist','Môn của giáo viên bộ môn'],
                ['session2','Môn của giáo viên dạy buổi 2']];
  let html='', shown=0;
  groups.forEach(([who,title])=>{
    const list=ST.subjects.filter(s=>s.who===who &&
      (!q || s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)));
    if(!list.length) return;
    html+=`<div class="md-grp">${title}</div>`;
    list.forEach(s=>{
      shown++;
      const on=MD.subs.has(s.id);
      const all=gradesOf(s);
      const sel=MD.grades[s.id]||all;
      const tot=ST.classes.reduce((a,c)=>a+(+(s.periods[c.grade]||0)),0);
      const mismatch = (who==='homeroom' && t.kind!=='GVCN') ||
                       (who!=='homeroom' && t.kind==='GVCN');
      html+=`<label class="md-row${on?' on':''}" data-sid="${s.id}">
        <input type="checkbox" data-chk="${s.id}"${on?' checked':''}>
        <span class="md-dot" style="background:${s.color}"></span>
        <span class="md-name">${esc(s.name)}
          <small>${esc(s.id)} · toàn trường ${tot} tiết/tuần · khối ${all.join(', ')||'—'}</small></span>
        ${mismatch?'<span class="md-warn" title="Môn này thường không thuộc nhóm của giáo viên">⚠ khác nhóm</span>':''}
        <span class="md-grades">${on&&all.length>1?
          '<span class="gl">Khối:</span>'+all.map(g=>
            `<button type="button" class="gchip${sel.includes(g)?' on':''}" data-g="${s.id}:${g}">${g}</button>`).join('')
          :''}</span></label>`;
    });
  });
  $('#mdBody').innerHTML = shown ? html
    : '<div class="md-empty">Không tìm thấy môn nào phù hợp</div>';
  $('#mdCount').textContent=`Đang chọn ${MD.subs.size} môn`;
  $('#mdHint').innerHTML = MD.subs.size
    ? 'Khối được bôi xanh là khối giáo viên này được dạy môn đó. Bỏ chọn bớt khối nếu chỉ dạy một phần.'
    : 'Chưa chọn môn nào — giáo viên này sẽ không được xếp tiết.';
}
$('#mdBody').addEventListener('click',e=>{
  const g=e.target.closest('.gchip');
  if(g){
    e.preventDefault(); e.stopPropagation();
    const [sid,gr]=g.dataset.g.split(':'); const s=subById(sid); if(!s) return;
    const all=gradesOf(s);
    let sel=(MD.grades[sid]||all).slice();
    const n=+gr;
    sel = sel.includes(n) ? sel.filter(x=>x!==n) : sel.concat(n).sort();
    if(!sel.length){ toast('Phải giữ ít nhất một khối.','err'); return; }
    MD.grades[sid]=sel;
    drawPicker($('#mdSearch').value);
    return;
  }
  const cb=e.target.closest('[data-chk]');
  if(cb){
    setTimeout(()=>{
      const id=cb.dataset.chk;
      MD.subs.has(id) ? MD.subs.delete(id) : MD.subs.add(id);
      drawPicker($('#mdSearch').value);
    },0);
  }
});
$('#mdSearch').addEventListener('input',e=>drawPicker(e.target.value));
function closePicker(){ $('#modal').hidden=true; MD.ti=-1; }
$('#mdClose').addEventListener('click',closePicker);
$('#mdCancel').addEventListener('click',closePicker);
$('#modal').addEventListener('click',e=>{ if(e.target.id==='modal') closePicker(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape' && !$('#modal').hidden) closePicker(); });
$('#mdSave').addEventListener('click',()=>{
  const t=ST.teachers[MD.ti]; if(!t) return closePicker();
  t.subjects=ST.subjects.filter(s=>MD.subs.has(s.id)).map(s=>s.id);
  const g={};
  t.subjects.forEach(id=>{
    const s=subById(id), all=gradesOf(s), sel=MD.grades[id];
    if(sel && sel.length && sel.length<all.length) g[id]=sel.slice().sort((a,b)=>a-b);
  });
  t.grades=g;
  save(); closePicker(); renderTeachers(); renderRules(); renderLoad();
  toast(`Đã lưu: ${t.name} phụ trách ${t.subjects.length} môn.`,'ok');
});
$('#tblTeachers').addEventListener('click',e=>{
  const c=e.target.closest('[data-pick]'); if(!c) return;
  openPicker(+c.dataset.pick);
});

function renderTeachers(){
  let h=`<thead>
    <tr class="grp">
      <th colspan="2" class="g-id">GIÁO VIÊN</th>
      <th colspan="3">PHÂN CÔNG CHUYÊN MÔN</th>
      <th colspan="4">BUỔI LÊN LỚP &amp; NGHỈ</th>
      <th colspan="3" class="g-num">ĐỊNH MỨC LAO ĐỘNG</th>
      <th colspan="3">KHÁC</th></tr>
    <tr>
      <th class="g-id">Mã</th><th class="g-id">Họ và tên</th>
      <th title="GVCN dạy lớp mình, GV bộ môn dạy môn chuyên toàn trường, GV buổi 2 chỉ dạy chiều">Nhóm</th>
      <th title="Chức danh in trên thời khoá biểu giáo viên">Nhiệm vụ</th>
      <th title="Bấm vào ô để mở bảng chọn môn và khối được dạy">Môn phụ trách &amp; khối</th>
      <th title="Giáo viên chỉ có mặt buổi nào">Buổi dạy</th>
      <th title="Số buổi chiều tối đa trong tuần. 0 = không giới hạn">Tối đa chiều</th>
      <th title="Nghỉ 1 buổi hay trọn 1 ngày trong tuần">Chế độ nghỉ</th>
      <th title="Chỉ định cứng buổi/ngày nghỉ, chỉ dùng khi chọn Chỉ định cứng">Chỉ định nghỉ</th>
      <th class="g-num" title="Số tiết chuẩn theo quy định">Đ.mức tuần</th>
      <th class="g-num" title="Số tiết tối đa trong một ngày">Max/ngày</th>
      <th class="g-num" title="Số tiết liền nhau tối đa">Max liên tục</th>
      <th class="center" title="Số ô đã đánh dấu bận ở phần dưới trang">Ô bận</th>
      <th>Ghi chú</th><th></th></tr></thead><tbody>`;
  ST.teachers.forEach((t,i)=>{
    h+=`<tr data-i="${i}">
      <td class="g-id"><b>${esc(t.id)}</b></td>
      <td class="g-id"><input data-f="name" value="${esc(t.name)}"></td>
      <td><select data-f="kind">${Object.keys(KIND_NAME).map(k=>`<option value="${k}"${t.kind===k?' selected':''}>${KIND_NAME[k]}</option>`).join('')}</select></td>
      <td><input data-f="role" value="${esc(t.role||'')}" style="min-width:100px"></td>
      <td>${subjCell(t,i)}</td>
      <td><select data-f="sessions">
        <option value="both"${t.sessions==='both'?' selected':''}>Cả ngày</option>
        <option value="S"${t.sessions==='S'?' selected':''}>Chỉ sáng</option>
        <option value="C"${t.sessions==='C'?' selected':''}>Chỉ chiều</option></select></td>
      <td><input class="num" type="number" min="0" max="6" data-f="maxAfternoons" value="${t.maxAfternoons}" title="0 = không giới hạn"></td>
      <td><select data-f="offMode">
        <option value="auto-session"${t.offMode==='auto-session'?' selected':''}>Nghỉ 1 buổi</option>
        <option value="auto-day"${t.offMode==='auto-day'?' selected':''}>Nghỉ 1 ngày</option>
        <option value="fixed"${t.offMode==='fixed'?' selected':''}>Chỉ định cứng</option>
        <option value="none"${t.offMode==='none'?' selected':''}>Không bố trí</option></select></td>
      <td><select data-f="offFixed"${t.offMode==='fixed'?'':' disabled'}>${offFixedOptions(t)}</select></td>
      <td class="g-num"><input class="num" type="number" data-f="maxWeek" value="${t.maxWeek}"></td>
      <td class="g-num"><input class="num" type="number" data-f="maxDay" value="${t.maxDay}"></td>
      <td class="g-num"><input class="num" type="number" data-f="maxConsec" value="${t.maxConsec}"></td>
      <td class="center">${(t.busy||[]).length?`<b style="color:var(--err)">${t.busy.length}</b>`:'0'}</td>
      <td><input data-f="note" value="${esc(t.note||'')}" class="w-wide"></td>
      <td><button class="btn btn-sm btn-danger" data-del="${i}">Xoá</button></td></tr>`;
  });
  $('#tblTeachers').innerHTML=h+'</tbody>';
  $('#tblTeachers').className='data sticky2';
  enhanceSelects($('#tblTeachers')); refreshFilters();
}
$('#tblTeachers').addEventListener('change',e=>{
  const tr=e.target.closest('tr'); if(!tr) return;
  const t=ST.teachers[+tr.dataset.i], f=e.target.dataset.f;
  if(!f) return;
  t[f]=['maxWeek','maxDay','maxConsec','maxAfternoons'].includes(f)?+e.target.value:e.target.value;
  if(f==='kind'){
    if(t.kind==='BUOI2'){ t.sessions='C'; t.offMode='auto-day'; }
    if(t.kind==='GVCN'){ t.sessions='both'; t.offMode='auto-session'; if(!t.maxAfternoons) t.maxAfternoons=2; }
    if(t.kind==='BOMON'){ t.offMode='auto-day'; t.maxAfternoons=0; }
  }
  save(); renderTeachers(); renderRules();
});
$('#tblTeachers').addEventListener('click',e=>{
  const b=e.target.closest('[data-del]'); if(!b) return;
  const t=ST.teachers[+b.dataset.del];
  if(ST.classes.some(c=>c.homeroom===t.id)) return toast('GV này đang chủ nhiệm một lớp — hãy đổi GVCN trước.','err');
  if(!confirm(`Xoá giáo viên ${t.name}?`)) return;
  ST.teachers.splice(+b.dataset.del,1);
  afterDelete(`Đã xoá giáo viên ${t.name}.`); return;
});
$('#btnAddTeacher').addEventListener('click',()=>{
  const name=(prompt('Họ và tên giáo viên:')||'').trim(); if(!name) return;
  let n=ST.teachers.length+1, id;
  do{ id='GV'+String(n++).padStart(2,'0'); }while(teaById(id));
  ST.teachers.push({id, name, role:'GV bộ môn', kind:'BOMON', subjects:[], grades:{}, sessions:'both',
    maxWeek:23, maxDay:6, maxConsec:4, maxAfternoons:0, offMode:'auto-day', offFixed:'', busy:[], note:''});
  save(); renderTeachers(); renderRules();
});

/* ---------------- Phòng ---------------- */
function renderRooms(){
  let h=`<thead><tr><th>Mã</th><th>Tên phòng / khu vực</th><th>Sức chứa đồng thời (số phòng)</th><th>Môn sử dụng</th><th></th></tr></thead><tbody>`;
  ST.rooms.forEach((r,i)=>{
    const used=ST.subjects.filter(s=>s.room===r.id).map(s=>s.short).join(', ')||'—';
    h+=`<tr data-i="${i}">
      <td><b>${esc(r.id)}</b></td>
      <td><input data-f="name" value="${esc(r.name)}" style="min-width:210px"></td>
      <td><input class="num" type="number" min="1" data-f="cap" value="${r.cap}"></td>
      <td>${esc(used)}</td>
      <td><button class="btn btn-sm btn-danger" data-del="${i}">Xoá</button></td></tr>`;
  });
  $('#tblRooms').innerHTML=h+'</tbody>';
  enhanceSelects($('#tblRooms')); refreshFilters();
}
$('#tblRooms').addEventListener('change',e=>{
  const tr=e.target.closest('tr'); if(!tr) return;
  const r=ST.rooms[+tr.dataset.i], f=e.target.dataset.f;
  r[f]=f==='cap'?Math.max(1,+e.target.value||1):e.target.value;
  save(); renderRooms(); renderSubjects();
});
$('#tblRooms').addEventListener('click',e=>{
  const b=e.target.closest('[data-del]'); if(!b) return;
  if(ST.subjects.some(s=>s.room===ST.rooms[+b.dataset.del].id)) return toast('Còn môn học đang dùng phòng này.','err');
  if(!confirm('Xoá phòng này?')) return;
  ST.rooms.splice(+b.dataset.del,1); save(); renderRooms(); renderSubjects();
});
$('#btnAddRoom').addEventListener('click',()=>{
  const name=(prompt('Tên phòng/khu vực:')||'').trim(); if(!name) return;
  const id=(prompt('Mã phòng (VD: PNN):')||'').trim().toUpperCase(); if(!id) return;
  if(roomById(id)) return toast('Mã phòng đã tồn tại.','err');
  ST.rooms.push({id, name, cap:1}); save(); renderRooms(); renderSubjects();
});

/* ---------------- Ràng buộc & ngoại lệ ---------------- */
function allSlots(){ return Sched.buildSlots(ST.config); }
function slotOptions(){ return allSlots().map(s=>`<option value="${s.key}">${Sched.slotLabel(s)}</option>`).join(''); }
function renderRules(){
  $('#ruleToggles').innerHTML=Object.keys(RULE_LABEL).map(k=>
    `<label class="toggle"><input type="checkbox" data-r="${k}"${ST.config.rules[k]?' checked':''}>
      <span><b>${RULE_LABEL[k][0]}</b><small>${RULE_LABEL[k][1]}</small></span></label>`).join('');
  const clsOpt=ST.classes.map(c=>`<option value="${c.id}">Lớp ${esc(c.name)}</option>`).join('');
  const sOpt=slotOptions();
  $('#pinClass').innerHTML=clsOpt; $('#blkClass').innerHTML=clsOpt;
  $('#pinSlot').innerHTML=sOpt;    $('#blkSlot').innerHTML=sOpt;
  $('#pinSubject').innerHTML=ST.subjects.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  $('#busyTeacher').innerHTML=ST.teachers.map(t=>`<option value="${t.id}">${esc(t.name)} — ${KIND_NAME[t.kind]||''}</option>`).join('');
  renderPins(); renderBlocks(); renderBusy(); enhanceSelects($('#tab-rules'));
}
$('#ruleToggles').addEventListener('change',e=>{
  if(!e.target.dataset.r) return;
  ST.config.rules[e.target.dataset.r]=e.target.checked; save();
});
function renderPins(){
  let h=`<thead><tr><th>Lớp</th><th>Môn</th><th>Vị trí</th><th></th></tr></thead><tbody>`;
  if(!ST.pins.length) h+=`<tr><td colspan="4" style="color:var(--ink-3)">Chưa có tiết ghim thủ công. Chào cờ và Sinh hoạt lớp đã ghim tự động.</td></tr>`;
  const slots=allSlots();
  ST.pins.forEach((p,i)=>{
    const s=slots.find(x=>x.key===p.slot);
    h+=`<tr><td>${esc((clsById(p.classId)||{}).name||p.classId)}</td>
      <td>${esc((subById(p.subjectId)||{}).name||p.subjectId)}</td>
      <td>${s?Sched.slotLabel(s):p.slot}</td>
      <td><button class="btn btn-sm btn-danger" data-delpin="${i}">Bỏ</button></td></tr>`;
  });
  $('#tblPins').innerHTML=h+'</tbody>';
}
$('#btnAddPin').addEventListener('click',()=>{
  const p={classId:$('#pinClass').value, subjectId:$('#pinSubject').value, slot:$('#pinSlot').value};
  const c=clsById(p.classId), s=subById(p.subjectId);
  if(!+(s.periods[c.grade]||0)) return toast(`Khối ${c.grade} không học môn ${s.name}.`,'err');
  if(ST.pins.some(x=>x.classId===p.classId&&x.slot===p.slot)) return toast('Ô này đã được ghim.','err');
  ST.pins.push(p); save(); renderPins(); toast('Đã ghim tiết.','ok');
});
$('#tblPins').addEventListener('click',e=>{
  const b=e.target.closest('[data-delpin]'); if(!b) return;
  ST.pins.splice(+b.dataset.delpin,1); save(); renderPins();
});
function renderBlocks(){
  let h=`<thead><tr><th>Lớp</th><th>Vị trí</th><th>Lý do</th><th></th></tr></thead><tbody>`;
  if(!ST.blocks.length) h+=`<tr><td colspan="4" style="color:var(--ink-3)">Chưa khai báo ô cấm nào.</td></tr>`;
  const slots=allSlots();
  ST.blocks.forEach((b,i)=>{
    const s=slots.find(x=>x.key===b.slot);
    h+=`<tr><td>${esc((clsById(b.classId)||{}).name||b.classId)}</td>
      <td>${s?Sched.slotLabel(s):b.slot}</td><td>${esc(b.note||'')}</td>
      <td><button class="btn btn-sm btn-danger" data-delblk="${i}">Bỏ</button></td></tr>`;
  });
  $('#tblBlocks').innerHTML=h+'</tbody>';
}
$('#btnAddBlock').addEventListener('click',()=>{
  const b={classId:$('#blkClass').value, slot:$('#blkSlot').value, note:$('#blkNote').value};
  if(ST.blocks.some(x=>x.classId===b.classId&&x.slot===b.slot)) return toast('Ô này đã bị cấm.','err');
  ST.blocks.push(b); $('#blkNote').value=''; save(); renderBlocks(); toast('Đã thêm ô cấm.','ok');
});
$('#tblBlocks').addEventListener('click',e=>{
  const b=e.target.closest('[data-delblk]'); if(!b) return;
  ST.blocks.splice(+b.dataset.delblk,1); save(); renderBlocks();
});
function renderBusy(){
  const t=teaById($('#busyTeacher').value)||ST.teachers[0]; if(!t) return;
  const busy=new Set(t.busy||[]), cfg=ST.config;
  let h=`<table><thead><tr><th>Tiết</th>${cfg.days.map(d=>`<th>${DAY_NAME[d]}</th>`).join('')}</tr></thead><tbody>`;
  const rows=[];
  for(let p=1;p<=cfg.morningPeriods;p++) rows.push({ss:'S',p});
  for(let p=1;p<=cfg.afternoonPeriods;p++) rows.push({ss:'C',p});
  rows.forEach(r=>{
    h+=`<tr><th>${SESSION_NAME[r.ss]} — tiết ${r.p}</th>`;
    cfg.days.forEach(d=>{
      if(sessionOff(d,r.ss)){ h+=`<td class="off-cell"><div class="busy-cell" style="cursor:default">nghỉ</div></td>`; return; }
      const k=`${d}-${r.ss}-${r.p}`;
      h+=`<td><div class="busy-cell ${busy.has(k)?'busy':''}" data-k="${k}">${busy.has(k)?'BẬN':''}</div></td>`;
    });
    h+='</tr>';
  });
  $('#busyGrid').innerHTML=h+'</tbody></table>';
}
$('#busyTeacher').addEventListener('change',renderBusy);
$('#busyGrid').addEventListener('click',e=>{
  const c=e.target.closest('.busy-cell'); if(!c||!c.dataset.k) return;
  const t=teaById($('#busyTeacher').value); t.busy=t.busy||[];
  const i=t.busy.indexOf(c.dataset.k);
  if(i>=0) t.busy.splice(i,1); else t.busy.push(c.dataset.k);
  save(); renderBusy(); renderTeachers();
});
$('#btnBusyClear').addEventListener('click',()=>{
  const t=teaById($('#busyTeacher').value); t.busy=[]; save(); renderBusy(); renderTeachers();
});
$('#btnBusyMorning').addEventListener('click',()=>{
  const t=teaById($('#busyTeacher').value); t.busy=t.busy||[];
  ST.config.days.forEach(d=>{ const k=`${d}-S-1`; if(!sessionOff(d,'S')&&!t.busy.includes(k)) t.busy.push(k); });
  save(); renderBusy(); renderTeachers(); toast('Đã cấm tiết 1 mỗi sáng.','ok');
});
$('#btnBusyLast').addEventListener('click',()=>{
  const t=teaById($('#busyTeacher').value); t.busy=t.busy||[];
  const p=ST.config.afternoonPeriods;
  ST.config.days.forEach(d=>{ const k=`${d}-C-${p}`; if(p&&!sessionOff(d,'C')&&!t.busy.includes(k)) t.busy.push(k); });
  save(); renderBusy(); renderTeachers(); toast('Đã cấm tiết cuối mỗi chiều.','ok');
});

/* ---------------- Chạy ---------------- */
function renderPreflight(){
  let pf;
  try{ pf=Sched.preflight(ST); }
  catch(err){ $('#preflight').innerHTML=`<div class="pf"><div class="pf-item pf-err">Lỗi dữ liệu: ${esc(err.message)}</div></div>`; return; }
  const order={err:0,warn:1,ok:2};
  const items=pf.items.slice().sort((a,b)=>order[a.level]-order[b.level]);
  const nErr=items.filter(i=>i.level==='err').length, nW=items.filter(i=>i.level==='warn').length;
  $('#preflight').innerHTML=
    `<h3 style="margin-top:14px">Kiểm tra khả thi trước khi xếp — ${nErr} lỗi, ${nW} cảnh báo</h3>
     <div class="pf">${items.map(i=>`<div class="pf-item pf-${i.level}">${esc(i.msg)}</div>`).join('')}</div>`;
  renderOff(pf.ctx);
}
function renderOff(ctx){
  const info=(ST.solution&&!solutionStale()&&ST.solution.offInfo)||(ctx&&ctx.offInfo)||null;
  let h=`<thead><tr><th>Mã</th><th>Họ và tên</th><th>Nhóm</th><th>Chế độ</th><th>Buổi / ngày được nghỉ</th></tr></thead><tbody>`;
  const MODE={'auto-session':'Nghỉ 1 buổi','auto-day':'Nghỉ 1 ngày','fixed':'Chỉ định cứng','none':'Không bố trí'};
  ST.teachers.forEach(t=>{
    const o=info?info[t.id]:null;
    const txt = !o ? '<span style="color:var(--ink-3)">— chưa tính —</span>'
      : (o.none ? '<span style="color:var(--ink-3)">Không bố trí</span>'
      : (o.ok ? `<span class="off-tag">${esc(o.label)}</span>`
      : `<span style="color:var(--warn);font-weight:600">⚠ ${esc(o.label)}</span>`));
    h+=`<tr><td><b>${esc(t.id)}</b></td><td>${esc(t.name)}</td><td>${kindBadge(t.kind)}</td>
        <td>${MODE[t.offMode]||t.offMode}</td><td>${txt}</td></tr>`;
  });
  $('#tblOff').innerHTML=h+'</tbody>';
}
function runSchedule(){
  const logEl=$('#runLog'); let lines=[];
  const log=m=>{ lines.push(m); logEl.textContent=lines.join('\n'); };
  $('#runStatus').textContent='Đang xếp...';
  logEl.textContent='Đang khởi tạo...';
  const basePins=ST.pins.slice();
  setTimeout(()=>{
    try{
      log('▶ Bắt đầu quy trình xếp thời khoá biểu.');
      const lp=lockPins();
      if(lp.length){
        ST.pins=basePins.concat(lp);
        log(`— Giữ nguyên ${lp.length} tiết bạn đã kéo thả / khoá; các lớp khác sẽ xếp lại cho khớp.`);
      }
      log('— Bước 1–2: phân công giáo viên & cân đối định mức.');
      const sol=Sched.run(ST, log);
      sol.generatedAt=new Date().toLocaleString('vi-VN');
      ST.solution=sol; save();
      const bad=sol.unplaced.length;
      if(bad){
        log(`\n⚠ CÒN ${bad} TIẾT CHƯA XẾP ĐƯỢC:`);
        sol.unplaced.forEach(u=>log(`   • Lớp ${(clsById(u.cid)||{}).name} — ${(subById(u.sub)||{}).name}: ${u.reason}`));
        log('\nGợi ý: tăng số lần khởi động lại; nới giới hạn buổi chiều của GVCN; đổi chế độ nghỉ của GV đang căng; bật «Cho phép dồn lớp»; hoặc bổ sung giáo viên.');
        $('#runStatus').innerHTML=`<span style="color:var(--warn)">Hoàn tất — còn ${bad} tiết chưa xếp.</span>`;
        toast(`Đã xếp xong nhưng còn ${bad} tiết chưa vừa.`,'err');
      }else{
        log('\n✔ ĐÃ XẾP ĐỦ 100% SỐ TIẾT THEO PHÂN PHỐI CHƯƠNG TRÌNH.');
        bkSave('Sau khi xếp lịch thành công', true);
        $('#runStatus').innerHTML=`<span style="color:var(--ok)">Hoàn tất — không còn tiết thiếu.</span>`;
        toast('Xếp thời khoá biểu thành công!','ok');
      }
      renderOff(); renderLoad(); renderView(); renderCheck();
    }catch(err){
      console.error(err);
      logEl.textContent='LỖI: '+err.message+'\n'+err.stack;
      $('#runStatus').innerHTML='<span style="color:var(--err)">Có lỗi khi chạy.</span>';
    }finally{
      ST.pins=basePins; save();
    }
  },40);
}
$('#btnRun').addEventListener('click',runSchedule);
$('#btnRunTop').addEventListener('click',()=>{ goTab('run'); renderPreflight(); runSchedule(); });

function renderLoad(){
  const sol=solutionStale()?null:ST.solution;
  let h=`<thead><tr><th>Mã</th><th>Họ và tên</th><th>Nhóm</th><th class="center">Tiết/tuần</th><th class="center">Định mức</th>
    <th class="center">Chênh lệch</th><th class="center">Buổi dạy</th><th class="center">Buổi chiều</th>
    <th class="center">Tiết trống xen kẽ</th><th>Được nghỉ</th></tr></thead><tbody>`;
  let ctx=null; try{ ctx=Sched.buildContext(ST); }catch(e){}
  ST.teachers.forEach(t=>{
    let n=0, sessions=0, gaps=0, aft=0, nTxt=null;
    if(sol){
      ST.config.days.forEach(d=>['S','C'].forEach(ss=>{
        const idxs=sol.slots.map((s,i)=>({s,i})).filter(x=>x.s.day===d&&x.s.session===ss).map(x=>x.i);
        let first=-1,last=-1,cnt=0;
        idxs.forEach((i,k)=>{
          const has=ST.classes.some(c=>{const x=sol.grid[c.id][i];return x&&x.tea===t.id;});
          if(has){ cnt++; if(first<0)first=k; last=k; }
        });
        if(cnt){ sessions++; n+=cnt; gaps+=(last-first+1)-cnt; if(ss==='C') aft++; }
      }));
    } else if(ctx){
      const mx=ctx.teaDemand[t.id]||0;
      const mn=ctx.teaDemandMin&&ctx.teaDemandMin[t.id]!=null?ctx.teaDemandMin[t.id]:mx;
      n=mn; if(mn!==mx) nTxt=`${mn}–${mx}`;
    }
    const diff=n-t.maxWeek;
    const dc=diff>0?`<b style="color:var(--warn)">+${diff}</b>`:(diff<0?`<span style="color:var(--ink-3)">${diff}</span>`:'0');
    const cap=t.maxAfternoons>0?`/${t.maxAfternoons}`:'';
    const over=t.maxAfternoons>0&&aft>t.maxAfternoons;
    const o=sol&&sol.offInfo?sol.offInfo[t.id]:(ctx?ctx.offInfo[t.id]:null);
    h+=`<tr><td><b>${esc(t.id)}</b></td><td>${esc(t.name)}</td><td>${kindBadge(t.kind)}</td>
      <td class="center"><b>${nTxt||n}</b></td><td class="center">${t.maxWeek}</td><td class="center">${dc}</td>
      <td class="center">${sessions||'—'}</td>
      <td class="center"${over?' style="color:var(--err);font-weight:700"':''}>${sol?aft+cap:'—'}</td>
      <td class="center">${sol?(gaps?`<b style="color:var(--warn)">${gaps}</b>`:'0'):'—'}</td>
      <td>${o&&o.ok&&!o.none?esc(o.label):'<span style="color:var(--ink-3)">—</span>'}</td></tr>`;
  });
  $('#tblLoad').innerHTML=h+'</tbody>';
}

/* ---------------- Xem & In ---------------- */
let VIEW={mode:'class', target:null};
$('#viewMode').addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  $$('#viewMode button').forEach(x=>x.classList.toggle('active',x===b));
  VIEW.mode=b.dataset.mode; VIEW.target=null; renderView();
});
$('#viewTarget').addEventListener('change',()=>{ VIEW.target=$('#viewTarget').value; renderView(true); });
$('#viewAll').addEventListener('change',()=>renderView(true));

function ttRows(){
  const cfg=ST.config, rows=[], ck=Sched.periodClock(cfg);
  for(let p=1;p<=cfg.morningPeriods;p++) rows.push({ss:'S',p,clock:ck.S[p-1]});
  for(let p=1;p<=cfg.afternoonPeriods;p++) rows.push({ss:'C',p,clock:ck.C[p-1],sep:p===1});
  return rows;
}
function slotIndexOf(sol,d,ss,p){ return sol.slots.findIndex(s=>s.day===d&&s.session===ss&&s.period===p); }
function offTd(){ return `<td class="off-cell"><div class="cell off">NGHỈ</div></td>`; }

function ttHeader(title, meta){
  const c=ST.config;
  return `<div class="tt-head">
    <div class="sch">${esc(c.schoolName)}</div>
    <div class="ttl">${esc(title)}</div>
    <div class="meta">Năm học ${esc(c.schoolYear)} — ${esc(c.semester)}${c.appliedFrom?' • Áp dụng từ '+esc(c.appliedFrom):''}</div>
  </div>${meta?`<div style="text-align:center;font-size:12.5px;color:var(--ink-2);margin-bottom:8px">${meta}</div>`:''}`;
}
function ttFoot(){
  return `<div class="tt-foot">
    <div><b>GIÁO VIÊN CHỦ NHIỆM</b></div>
    <div><b>TỔ TRƯỞNG CHUYÊN MÔN</b></div>
    <div><b>HIỆU TRƯỞNG</b></div></div>`;
}
function tableOpen(){
  return `<table class="tt"><thead><tr><th class="rh">Tiết</th>${ST.config.days.map(d=>`<th>${DAY_NAME[d]}</th>`).join('')}</tr></thead><tbody>`;
}
function rowHead(r){
  const cl=r.clock?`<br><span style="font-weight:400;font-size:10px;color:#5a6b86">${r.clock.from}–${r.clock.to}</span>`:'';
  return `<th class="rh">${SESSION_NAME[r.ss]} ${r.p}${cl}</th>`;
}
/* ---------- Khoá tiết & kéo thả ---------- */
let DRAG=false, DRAGSRC=null;
function lockKey(cid,key){ return (ST.locks||[]).findIndex(l=>l.classId===cid && l.slot===key); }
function isLocked(cid,key){ return lockKey(cid,key)>=0; }
function setLock(cid,key,on){
  ST.locks=ST.locks||[];
  const i=lockKey(cid,key);
  if(on && i<0) ST.locks.push({classId:cid, slot:key});
  if(!on && i>=0) ST.locks.splice(i,1);
}
/* thuộc tính cho ô <td>: nguồn kéo, đích thả, dấu khoá */
function tdAttr(cid,i){
  if(i==null || i<0) return '';
  const key=ST.solution.slots[i].key;
  const cls=[];
  if(DRAG) cls.push('drag-on');
  if(cid && isLocked(cid,key)) cls.push('locked');
  return ` data-i="${i}"${cid?` data-cid="${cid}"`:''}`
       + (DRAG?' draggable="true"':'')
       + (cls.length?` class="${cls.join(' ')}"`:'');
}
function lockPins(){
  const sol=ST.solution, out=[];
  if(!sol) return out;
  (ST.locks||[]).forEach(l=>{
    const i=sol.slots.findIndex(x=>x.key===l.slot); if(i<0) return;
    if(!sol.grid[l.classId]) return;
    const cell=sol.grid[l.classId][i]; if(!cell) return;
    const sub=subById(cell.sub);
    if(!sub || sub.fixed) return;                                   // Chào cờ / SH lớp đã tự ghim
    if(ST.pins.some(p=>p.classId===l.classId && p.slot===l.slot)) return;
    out.push({classId:l.classId, subjectId:cell.sub, slot:l.slot});
  });
  return out;
}
/* hoán đổi hai ô trong cùng một lớp rồi khoá lại */
function applyMove(cid,i,j){
  const sol=ST.solution; if(!sol||i===j||i==null||j==null) return;
  if(!sol.grid[cid]) return;
  const tgt=sol.grid[cid][j];
  if(tgt && (subById(tgt.sub)||{}).fixed)
    return toast('Không thể đè lên tiết Chào cờ / Sinh hoạt lớp đã ghim cố định.','err');
  const ki=sol.slots[i].key, kj=sol.slots[j].key;
  const blk=ST.blocks.some(b=>b.classId===cid && b.slot===kj);
  if(blk) return toast('Ô đích đã bị cấm cho lớp này.','err');
  const g=sol.grid[cid], a=g[i], b=g[j];
  if(!a && !b) return;
  g[i]=b; g[j]=a;
  setLock(cid,ki,!!g[i]); setLock(cid,kj,!!g[j]);
  save();
  const bad=Sched.verify(ST,sol).filter(x=>x.level==='err').length;
  renderView(true); renderCheck(); renderLockInfo();
  toast(bad ? `Đã hoán đổi — hiện có ${bad} xung đột, xem tab «Kiểm tra».`
            : 'Đã hoán đổi, chưa phát sinh xung đột.', bad?'err':'ok');
}
function renderLockInfo(){
  const n=(ST.locks||[]).length;
  $('#lockInfo').innerHTML = n
    ? `Đang khoá <b style="color:var(--warn)">${n}</b> tiết — sẽ giữ nguyên khi xếp lại`
    : 'Chưa khoá tiết nào';
}

/* Chú giải môn — mỗi thẻ là một nút lọc: bấm để làm nổi môn đó,
   các môn còn lại chìm xuống. Bấm lần nữa để bỏ lọc môn đó. */
function legendOf(ids){
  if(!ids || !ids.length) return '';
  const chips=ids.map(id=>{
    const s=subById(id)||{};
    const txt = (s.short && s.short!==s.name) ? `${esc(s.short)} = ${esc(s.name)}` : esc(s.name||id);
    const on = FILTER.has(id) ? ' on' : '';
    return `<span class="lg-chip${on}" data-sub="${id}" style="background:${s.color}"
             title="Bấm để làm nổi môn này trên thời khoá biểu">${txt}</span>`;
  }).join('');
  return `<div class="legend">${chips}</div>`;
}
let FILTER=new Set();
function applyFilter(){
  const area=$('#viewArea');
  area.classList.toggle('filtering', FILTER.size>0);
  area.querySelectorAll('td[data-sub]').forEach(td=>
    td.classList.toggle('hit', FILTER.has(td.dataset.sub)));
  area.querySelectorAll('.lg-chip').forEach(c=>
    c.classList.toggle('on', FILTER.has(c.dataset.sub)));
  const bar=$('#filterBar');
  if(FILTER.size){
    const names=[...FILTER].map(id=>esc((subById(id)||{}).name||id)).join(', ');
    bar.innerHTML=`<span class="fb-ico">🔍</span>
      <span>Đang làm nổi <b>${names}</b> — các môn khác đã chìm xuống</span>
      <button class="btn btn-sm" id="btnClearFilter">Bỏ lọc</button>`;
    bar.style.display='flex';
  }else{ bar.style.display='none'; bar.innerHTML=''; }
}
$('#viewArea').addEventListener('click',e=>{
  const chip=e.target.closest('.lg-chip'); if(!chip) return;
  const id=chip.dataset.sub;
  FILTER.has(id) ? FILTER.delete(id) : FILTER.add(id);
  applyFilter();
});
document.addEventListener('click',e=>{ if(e.target.id==='btnClearFilter'){ FILTER.clear(); applyFilter(); } });
document.addEventListener('keydown',e=>{ if(e.key==='Escape' && FILTER.size){ FILTER.clear(); applyFilter(); } });

/* các lớp cùng học một tiết với một giáo viên (dồn lớp) */
function mergedWith(sol,i,tea,cid){
  return ST.classes.filter(c=>c.id!==cid && sol.grid[c.id][i] && sol.grid[c.id][i].tea===tea).map(c=>c.name);
}

function renderClassTT(c){
  const sol=ST.solution;
  const blocked=new Set(ST.blocks.filter(b=>b.classId===c.id).map(b=>b.slot));
  let h=`<div class="tt-block">${ttHeader('THỜI KHOÁ BIỂU LỚP '+c.name,
    `Giáo viên chủ nhiệm: <b>${esc((teaById(c.homeroom)||{}).name||'—')}</b> • Sĩ số: ${c.size}${c.note?' • '+esc(c.note):''}`)}${tableOpen()}`;
  ttRows().forEach(r=>{
    h+=`<tr class="${r.sep?'sess-sep':''}">${rowHead(r)}`;
    ST.config.days.forEach(d=>{
      if(sessionOff(d,r.ss)){ h+=offTd(); return; }
      const i=slotIndexOf(sol,d,r.ss,r.p), cell=i>=0?sol.grid[c.id][i]:null;
      if(cell){
        const s=subById(cell.sub)||{}, t=teaById(cell.tea)||{}, rm=roomById(cell.room);
        const mg=mergedWith(sol,i,cell.tea,c.id);
        h+=`<td${tdAttr(c.id,i)} data-sub="${cell.sub}" style="background:${s.color||'#fff'}"><div class="cell">
          <span class="s">${esc(s.short||cell.sub)}</span>
          <span class="t">${esc(shortName(t.name))}</span>
          ${mg.length?`<span class="m">ghép ${esc(mg.join('+'))}</span>`:''}
          ${rm?`<span class="r">${esc(rm.name)}</span>`:''}</div></td>`;
      } else {
        const k=`${d}-${r.ss}-${r.p}`;
        h+=`<td${tdAttr(c.id,i)}><div class="cell free">${blocked.has(k)?'Nghỉ':'—'}</div></td>`;
      }
    });
    h+='</tr>';
  });
  h+='</tbody></table>';
  h+=legendOf([...new Set(sol.grid[c.id].filter(Boolean).map(x=>x.sub))]);
  return h+ttFoot()+'</div>';
}
function renderTeacherTT(t){
  const sol=ST.solution;
  let total=0, aft=0;
  const off=sol.offInfo?sol.offInfo[t.id]:null;
  let h=`<div class="tt-block">${ttHeader('THỜI KHOÁ BIỂU GIÁO VIÊN',
    `<b>${esc(t.name)}</b> — ${KIND_NAME[t.kind]||''}${t.role?' / '+esc(t.role):''}${off&&off.ok&&!off.none?' • <span style="color:#d93025;font-weight:700">'+esc(off.label)+'</span>':''}${t.note?' • '+esc(t.note):''}`)}${tableOpen()}`;
  const busy=new Set(t.busy||[]);
  const aftDays=new Set();
  ttRows().forEach(r=>{
    h+=`<tr class="${r.sep?'sess-sep':''}">${rowHead(r)}`;
    ST.config.days.forEach(d=>{
      if(sessionOff(d,r.ss)){ h+=offTd(); return; }
      const i=slotIndexOf(sol,d,r.ss,r.p);
      const list = i>=0 ? ST.classes.filter(c=>{const x=sol.grid[c.id][i];return x&&x.tea===t.id;}) : [];
      if(list.length){
        const cell=sol.grid[list[0].id][i], s=subById(cell.sub)||{}, rm=roomById(cell.room);
        total++; if(r.ss==='C') aftDays.add(d);
        h+=`<td${tdAttr(list[0].id,i)} data-sub="${cell.sub}" style="background:${s.color||'#fff'}"><div class="cell">
          <span class="s">${esc(list.map(c=>c.name).join(' + '))}</span>
          <span class="t">${esc(s.short)}</span>
          ${list.length>1?'<span class="m">dồn lớp</span>':''}
          ${rm?`<span class="r">${esc(rm.name)}</span>`:''}</div></td>`;
      } else {
        const k=`${d}-${r.ss}-${r.p}`;
        h+=`<td${tdAttr(null,i)}><div class="cell free">${busy.has(k)?'Nghỉ':''}</div></td>`;
      }
    });
    h+='</tr>';
  });
  aft=aftDays.size;
  h+=`</tbody></table>${legendOf([...new Set(sol.slots.map((x,i)=>{
        const c=ST.classes.find(cc=>{const g=sol.grid[cc.id][i];return g&&g.tea===t.id;});
        return c?sol.grid[c.id][i].sub:null; }).filter(Boolean))])}
      <div class="legend">
      <span>Tổng số tiết/tuần: <b>${total}</b> / định mức ${t.maxWeek}</span>
      <span>Số buổi chiều đứng lớp: <b>${aft}</b>${t.maxAfternoons>0?' / tối đa '+t.maxAfternoons:''}</span>
      ${off&&off.ok&&!off.none?`<span>${esc(off.label)}</span>`:''}</div>`;
  return h+ttFoot()+'</div>';
}
function renderRoomTT(r){
  const sol=ST.solution;
  let h=`<div class="tt-block">${ttHeader('LỊCH SỬ DỤNG — '+r.name.toUpperCase(),
    `Sức chứa đồng thời: <b>${r.cap}</b> lớp`)}${tableOpen()}`;
  ttRows().forEach(row=>{
    h+=`<tr class="${row.sep?'sess-sep':''}">${rowHead(row)}`;
    ST.config.days.forEach(d=>{
      if(sessionOff(d,row.ss)){ h+=offTd(); return; }
      const i=slotIndexOf(sol,d,row.ss,row.p);
      const list=[];
      if(i>=0) ST.classes.forEach(c=>{ const cell=sol.grid[c.id][i]; if(cell&&cell.room===r.id) list.push({c,cell}); });
      if(list.length){
        const s=subById(list[0].cell.sub)||{};
        h+=`<td data-sub="${list[0].cell.sub}" style="background:${s.color||'#fff'}"><div class="cell">
          <span class="s">${list.map(x=>esc(x.c.name)).join(' + ')}</span>
          <span class="t">${esc(s.short)}</span>
          <span class="r">${esc(shortName((teaById(list[0].cell.tea)||{}).name))}</span></div></td>`;
      } else h+=`<td><div class="cell free">—</div></td>`;
    });
    h+='</tr>';
  });
  h+=legendOf([...new Set(ST.subjects.filter(x=>x.room===r.id).map(x=>x.id))]);
  return h+ttFoot()+'</div>';
}
function renderMaster(){
  const sol=ST.solution;
  let h=`<div class="tt-block">${ttHeader('BẢNG TỔNG HỢP THỜI KHOÁ BIỂU TOÀN TRƯỜNG','')}
    <table class="master"><thead><tr><th>Thứ</th><th>Tiết</th>${ST.classes.map(c=>`<th>${esc(c.name)}</th>`).join('')}</tr></thead><tbody>`;
  ST.config.days.forEach(d=>{
    const rows=ttRows();
    rows.forEach((r,k)=>{
      h+=`<tr>${k===0?`<td class="day" rowspan="${rows.length}">${DAY_SHORT[d]}</td>`:''}<td class="day">${r.ss}${r.p}</td>`;
      if(sessionOff(d,r.ss)){
        h+=`<td class="off-cell" colspan="${ST.classes.length}" style="color:#8b99b0;font-style:italic">Toàn trường nghỉ</td></tr>`;
        return;
      }
      ST.classes.forEach(c=>{
        const i=slotIndexOf(sol,d,r.ss,r.p), cell=i>=0?sol.grid[c.id][i]:null;
        if(cell){ const s=subById(cell.sub)||{};
          h+=`<td data-sub="${cell.sub}" style="background:${s.color}">${esc(s.short)}</td>`;
        } else h+='<td style="color:#8b99b0">—</td>';
      });
      h+='</tr>';
    });
  });
  h+='</tbody></table>';
  const used=new Set();
  ST.classes.forEach(c=>sol.grid[c.id].forEach(x=>{ if(x) used.add(x.sub); }));
  return h+legendOf([...used])+'</div>';
}
function renderView(keepTarget){
  const area=$('#viewArea'), sol=ST.solution;
  if(!sol){ area.innerHTML='<p class="empty">Chưa có thời khoá biểu. Hãy sang tab «Chạy xếp lịch».</p>'; $('#viewTarget').innerHTML=''; return; }
  if(solutionStale()){ area.innerHTML=staleBanner(); $('#viewTarget').innerHTML=''; return; }
  const sel=$('#viewTarget');
  const lists={ class:ST.classes.map(c=>[c.id,'Lớp '+c.name]),
                teacher:ST.teachers.map(t=>[t.id,t.name+' — '+(KIND_NAME[t.kind]||'')]),
                room:ST.rooms.map(r=>[r.id,r.name]),
                master:[['all','Toàn trường']] };
  const list=lists[VIEW.mode]||[];
  sel.disabled = VIEW.mode==='master';
  if(!keepTarget||!list.some(x=>x[0]===VIEW.target)){
    sel.innerHTML=list.map(x=>`<option value="${x[0]}">${esc(x[1])}</option>`).join('');
    VIEW.target=list.length?list[0][0]:null;
  }
  sel.value=VIEW.target;
  enhanceSelects($('.viewbar'));
  const cb=sel.closest('.combo'); if(cb) cb.querySelector('.combo-btn').textContent=(sel.selectedOptions[0]||{}).textContent||'';
  const all=$('#viewAll').checked;
  let html='';
  if(VIEW.mode==='master') html=renderMaster();
  else if(VIEW.mode==='class') html=(all?ST.classes:ST.classes.filter(c=>c.id===VIEW.target)).map(renderClassTT).join('');
  else if(VIEW.mode==='teacher') html=(all?ST.teachers:ST.teachers.filter(t=>t.id===VIEW.target)).map(renderTeacherTT).join('');
  else html=(all?ST.rooms:ST.rooms.filter(r=>r.id===VIEW.target)).map(renderRoomTT).join('');
  html+=`<p class="no-print" style="text-align:center;color:var(--ink-3);font-size:12px">
    Lập lúc ${esc(sol.generatedAt||'')} • Điểm tối ưu: ${sol.cost} • Thời gian xử lý: ${sol.ms} ms${sol.merges?' • '+sol.merges+' tiết dồn lớp':''}</p>`;
  area.innerHTML=html;
  applyFilter();
  renderLockInfo();
}
$('#btnPrint').addEventListener('click',()=>window.print());

/* ---------------- Xuất Word / PDF ---------------- */
const EXPORT_CSS = `
@page{size:A4 landscape;margin:10mm}
*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important}
body{font-family:"Times New Roman","Arial Unicode MS",serif;font-size:12pt;color:#000;margin:0}
.tt-block{page-break-after:always;margin-bottom:8mm}
.tt-block:last-child{page-break-after:auto}
.tt-head{text-align:center;margin-bottom:8px}
.tt-head .sch{font-size:11pt;text-transform:uppercase}
.tt-head .ttl{font-size:16pt;font-weight:bold;margin:4px 0}
.tt-head .meta{font-size:11pt}
table.tt,table.master{width:100%;border-collapse:collapse}
table.tt td,table.tt th,table.master td,table.master th{
  border:1px solid #000;padding:4px 3px;text-align:center;vertical-align:middle;font-size:10.5pt}
table.tt thead th,table.master th{font-weight:bold}
table.tt th.rh{font-weight:bold;font-size:9.5pt}
.cell{display:block}
.cell .s{font-weight:bold;display:block;font-size:10.5pt}
.cell .t{display:block;font-size:9pt}
.cell .r{display:block;font-size:8.5pt;font-style:italic}
.cell .m{font-size:8pt;font-weight:bold}
.cell.free,.cell.off{font-style:italic}
.legend{margin-top:8px;font-size:9.5pt}
.legend span{display:inline-block;border:1px solid #000;padding:1px 6px;margin:2px}
.tt-foot{display:table;width:100%;margin-top:12mm;font-size:11pt;text-align:center}
.tt-foot div{display:table-cell;width:33.33%}
.tt-foot b{display:block;margin-bottom:16mm}
`;
const EXPORT_MONO = `
*{background:#fff !important;background-color:#fff !important;color:#000 !important}
table.tt td,table.tt th,table.master td,table.master th{border:1px solid #000 !important}
`;
function exportName(){
  const m={class:'lop',teacher:'giao-vien',room:'phong',master:'tong-hop'}[VIEW.mode]||'tkb';
  const all=$('#viewAll').checked && VIEW.mode!=='master';
  const t=all?'tat-ca':(($('#viewTarget').selectedOptions[0]||{}).textContent||'').trim();
  return ('TKB-'+m+'-'+t).normalize('NFD').replace(/[̀-ͯ]/g,'')
         .replace(/đ/g,'d').replace(/Đ/g,'D').replace(/[^A-Za-z0-9\-]+/g,'-').replace(/-+/g,'-');
}
function exportDocHTML(mono){
  const area=$('#viewArea').cloneNode(true);
  area.querySelectorAll('.no-print').forEach(n=>n.remove());          // bỏ dòng "Lập lúc / điểm tối ưu"
  area.querySelectorAll('[data-i]').forEach(n=>{
    n.removeAttribute('data-i'); n.removeAttribute('data-cid'); n.removeAttribute('draggable');
    n.classList.remove('drag-on','locked','dragging','drop-hint');
    if(!n.getAttribute('class')) n.removeAttribute('class');
  });
  const c=ST.config;
  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<meta http-equiv="Content-Type" content="text/html; charset=utf-8">'
    + `<title>${esc(c.schoolName)} — ${esc(c.semester)}</title>`
    + `<style>${EXPORT_CSS}${mono?EXPORT_MONO:''}</style></head><body>`
    + area.innerHTML + '</body></html>';
}
function needSolution(){
  if(!ST.solution || solutionStale()){ toast('Chưa có thời khoá biểu hợp lệ.','err'); return false; }
  return true;
}
$('#btnWord').addEventListener('click',()=>{
  if(!needSolution()) return;
  const clone=$('#viewArea').cloneNode(true);
  clone.querySelectorAll('.no-print').forEach(n=>n.remove());   // bỏ dòng thông tin phần mềm
  let blob=null;
  try{ blob=Docx.build(clone, $('#viewMono').checked); }
  catch(err){ console.error(err); return toast('Lỗi tạo file Word: '+err.message,'err'); }
  if(!blob) return toast('Chưa có bảng nào để xuất.','err');
  dl(blob, exportName()+'.docx');
  toast('Đã xuất .docx — mở và chỉnh sửa trực tiếp trong Microsoft Word.','ok');
});
$('#btnPdf').addEventListener('click',()=>{
  if(!needSolution()) return;
  const html=exportDocHTML($('#viewMono').checked);
  const w=window.open('','_blank');
  if(!w) return toast('Trình duyệt chặn cửa sổ mới — hãy cho phép pop-up rồi thử lại.','err');
  w.document.open(); w.document.write(html); w.document.close();
  const go=()=>{ try{ w.focus(); w.print(); }catch(e){} };
  w.onload=go; setTimeout(go,500);
  toast('Trong hộp thoại in: chọn «Lưu thành PDF» và BỎ chọn «Headers and footers».','ok');
});
$('#viewMono').addEventListener('change',()=>renderView(true));

/* ---------------- Kéo thả & khoá tiết ---------------- */
$('#dragMode').addEventListener('change',e=>{
  DRAG=e.target.checked;
  $('#dragHint').style.display=DRAG?'block':'none';
  renderView(true);
});
$('#btnClearLocks').addEventListener('click',()=>{
  if(!(ST.locks||[]).length) return toast('Không có khoá nào.','err');
  if(!confirm('Bỏ toàn bộ khoá tiết?')) return;
  ST.locks=[]; save(); renderView(true); renderLockInfo(); toast('Đã bỏ mọi khoá.','ok');
});
$('#btnRerun').addEventListener('click',()=>{
  if(!needSolution()) return;
  if(!(ST.locks||[]).length) return toast('Chưa khoá tiết nào — hãy kéo thả hoặc bấm vào ô để khoá trước.','err');
  goTab('run'); renderPreflight(); runSchedule();
});
$('#viewArea').addEventListener('dragstart',e=>{
  const td=e.target.closest('td[data-i]'); if(!td||!DRAG) return;
  const cid=td.dataset.cid; if(!cid){ e.preventDefault(); return; }
  const i=+td.dataset.i;
  const c0=ST.solution.grid[cid] && ST.solution.grid[cid][i];
  if(!c0){ e.preventDefault(); return; }
  if((subById(c0.sub)||{}).fixed){ e.preventDefault(); toast('Chào cờ và Sinh hoạt lớp đã ghim cố định, không kéo được.','err'); return; }
  DRAGSRC={cid, i}; td.classList.add('dragging');
  e.dataTransfer.effectAllowed='move';
  try{ e.dataTransfer.setData('text/plain', cid+'#'+i); }catch(err){}
});
$('#viewArea').addEventListener('dragend',()=>{
  DRAGSRC=null;
  $$('#viewArea td.dragging,#viewArea td.drop-hint').forEach(n=>n.classList.remove('dragging','drop-hint'));
});
$('#viewArea').addEventListener('dragover',e=>{
  if(!DRAG||!DRAGSRC) return;
  const td=e.target.closest('td[data-i]'); if(!td) return;
  e.preventDefault(); e.dataTransfer.dropEffect='move';
  $$('#viewArea td.drop-hint').forEach(n=>n.classList.remove('drop-hint'));
  td.classList.add('drop-hint');
});
$('#viewArea').addEventListener('drop',e=>{
  if(!DRAG||!DRAGSRC) return;
  const td=e.target.closest('td[data-i]'); if(!td) return;
  e.preventDefault();
  const j=+td.dataset.i, src=DRAGSRC; DRAGSRC=null;
  applyMove(src.cid, src.i, j);
});
$('#viewArea').addEventListener('click',e=>{
  if(!DRAG) return;
  const td=e.target.closest('td[data-i]'); if(!td) return;
  const cid=td.dataset.cid; if(!cid) return;
  const i=+td.dataset.i, key=ST.solution.slots[i].key;
  const cc=ST.solution.grid[cid] && ST.solution.grid[cid][i];
  if(!cc) return toast('Ô trống không cần khoá.','err');
  if((subById(cc.sub)||{}).fixed) return toast('Tiết này đã ghim cố định sẵn.','err');
  setLock(cid,key,!isLocked(cid,key)); save(); renderView(true); renderLockInfo();
});
$('#btnCsv').addEventListener('click',()=>{
  const sol=ST.solution; if(!sol||solutionStale()) return toast('Chưa có thời khoá biểu hợp lệ.','err');
  const rows=[['Lớp','Thứ','Buổi','Tiết','Môn học','Giáo viên','Nhóm GV','Phòng','Dồn lớp với']];
  ST.classes.forEach(c=>{
    sol.slots.forEach((s,i)=>{
      const cell=sol.grid[c.id][i]; if(!cell) return;
      const t=teaById(cell.tea)||{};
      rows.push([c.name, DAY_NAME[s.day], SESSION_NAME[s.session], s.period,
        (subById(cell.sub)||{}).name||cell.sub, t.name||cell.tea, KIND_NAME[t.kind]||'',
        cell.room?((roomById(cell.room)||{}).name||cell.room):'',
        mergedWith(sol,i,cell.tea,c.id).join(' + ')]);
    });
  });
  const csv='﻿'+rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n');
  dl(new Blob([csv],{type:'text/csv;charset=utf-8'}),'thoi-khoa-bieu.csv');
});
function dl(blob,name){
  const a=document.createElement('a'), u=URL.createObjectURL(blob);
  a.href=u; a.download=name; document.body.appendChild(a); a.click();
  setTimeout(()=>{URL.revokeObjectURL(u); a.remove();},100);
}

/* ---------------- Kiểm tra ---------------- */
function renderCheck(){
  const box=$('#checkResult');
  if(!ST.solution){ box.innerHTML='<p style="color:var(--ink-3);text-align:center;padding:40px">Chưa có thời khoá biểu để kiểm tra.</p>'; return; }
  if(solutionStale()){ box.innerHTML=staleBanner(); return; }
  const issues=Sched.verify(ST, ST.solution);
  const err=issues.filter(i=>i.level==='err'), warn=issues.filter(i=>i.level==='warn');
  const totalCells=ST.classes.reduce((a,c)=>a+ST.solution.grid[c.id].filter(Boolean).length,0);
  const need=ST.classes.reduce((a,c)=>a+classPeriods(c),0);
  box.innerHTML=`
    <div class="summary-cards">
      <div class="sc ${err.length?'bad':'good'}"><div class="n">${err.length}</div><div class="l">Lỗi ràng buộc cứng</div></div>
      <div class="sc ${warn.length?'mid':'good'}"><div class="n">${warn.length}</div><div class="l">Cảnh báo mềm</div></div>
      <div class="sc ${totalCells<need?'bad':'good'}"><div class="n">${totalCells}/${need}</div><div class="l">Tiết đã xếp</div></div>
      <div class="sc"><div class="n">${ST.solution.merges||0}</div><div class="l">Tiết dồn lớp</div></div>
      <div class="sc"><div class="n">${ST.solution.cost}</div><div class="l">Điểm tối ưu</div></div>
    </div>
    ${!issues.length?'<div class="issue ok"><b>Đạt yêu cầu nghiệm thu.</b>Không phát hiện xung đột nào — thời khoá biểu sẵn sàng trình Hiệu trưởng ký duyệt.</div>':''}
    ${err.length?`<h3 style="margin-top:18px">Lỗi phải xử lý (${err.length})</h3>`+err.map(i=>`<div class="issue err"><b>[${i.code}]</b>${esc(i.msg)}</div>`).join(''):''}
    ${warn.length?`<h3 style="margin-top:18px">Cảnh báo nên xem xét (${warn.length})</h3>`+warn.map(i=>`<div class="issue warn"><b>[${i.code}]</b>${esc(i.msg)}</div>`).join(''):''}`;
}
$('#btnCheck').addEventListener('click',()=>{ renderCheck(); toast('Đã kiểm tra xong.','ok'); });

/* ===========================================================
   SAO LƯU & LỊCH SỬ
   Mỗi bản là ảnh chụp toàn bộ dữ liệu, giữ trong trình duyệt.
   =========================================================== */
const BK_KEY='tkb_history_v1', BK_AUTO='tkb_history_auto', BK_MAX=25, BK_BYTES=3.6e6;

function bkAll(){
  try{ const r=lsGet(BK_KEY); return r?JSON.parse(r):[]; }catch(e){ return []; }
}
function bkWrite(list){
  // cắt bớt cho vừa dung lượng: bỏ bản TỰ ĐỘNG cũ nhất trước, giữ bản đặt tay
  let cur=list.slice(0,BK_MAX);
  const size=()=>cur.reduce((a,x)=>a+x.size,0);
  while(cur.length>1 && size()>BK_BYTES){
    let i=cur.map((x,k)=>({x,k})).filter(o=>o.x.auto).pop();
    cur.splice(i?i.k:cur.length-1,1);
  }
  if(lsSet(BK_KEY, JSON.stringify(cur))) return true;
  while(cur.length>1){ cur.pop(); if(lsSet(BK_KEY, JSON.stringify(cur))) return true; }
  toast('Không lưu được bản sao vào trình duyệt — hãy bấm «Tải thẳng về máy».','err');
  return false;
}
function bkAutoOn(){ return lsGet(BK_AUTO)!=='0'; }
function bkSave(label, auto){
  if(auto && !bkAutoOn()) return null;
  const data=JSON.stringify(ST);
  const list=bkAll();
  if(list.length && list[0].data===data){                 // không lưu trùng
    if(!auto) toast('Dữ liệu chưa đổi so với bản mới nhất.','err');
    return null;
  }
  const c=ST.classes.length, t=ST.teachers.length, sb=ST.subjects.length;
  const cells=(ST.solution&&!solutionStale())
      ? ST.classes.reduce((a,x)=>a+(ST.solution.grid[x.id]||[]).filter(Boolean).length,0) : 0;
  const item={ id:'bk'+Date.now()+Math.random().toString(36).slice(2,6),
    at:new Date().toISOString(), label:label||'', auto:!!auto,
    size:data.length, sum:{c,t,sb,cells,
      year:ST.config.schoolYear, sem:ST.config.semester}, data };
  list.unshift(item);
  if(!bkWrite(list)) return null;
  bkRender();
  return item;
}
function bkRestore(id){
  const it=bkAll().find(x=>x.id===id); if(!it) return;
  if(!confirm('Khôi phục lại bản sao lưu này?\nDữ liệu hiện tại sẽ được tự sao lưu trước khi ghi đè.')) return;
  bkSave('Trước khi khôi phục bản '+bkWhen(it.at), true);
  try{ ST=normalize(JSON.parse(it.data)); }
  catch(e){ return toast('Bản sao lưu bị hỏng: '+e.message,'err'); }
  save(); renderAll();
  toast('Đã khôi phục bản sao lưu '+bkWhen(it.at),'ok');
}
function bkWhen(iso){
  const d=new Date(iso), p=n=>String(n).padStart(2,'0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function bkFileName(it){
  return ('TKB-'+(it.sum.year||'').replace(/\s/g,'')+'-'+bkWhen(it.at).replace(/[\/: ]/g,'-'))+'.json';
}
function bkRender(){
  const list=bkAll(), box=$('#bkList'); if(!box) return;
  const total=list.reduce((a,x)=>a+x.size,0);
  const u=$('#bkUsage');
  if(u) u.textContent = list.length
    ? `${list.length} bản • ${(total/1024).toFixed(0)} KB`
    : '';
  const warn = LS_OK ? '' :
    `<div class="issue warn" style="margin:16px 0"><b>Trình duyệt đang chặn bộ nhớ cục bộ.</b>
      Bạn mở tệp trực tiếp từ ổ đĩa nên không lưu được lịch sử trong trình duyệt.
      Hãy dùng nút «Tải về máy» để giữ bản sao dưới dạng tệp .json.</div>`;
  if(!list.length){
    box.innerHTML=warn+`<div class="bk-empty"><span class="em">🗂️</span>
      <b>Chưa có bản sao lưu nào</b>
      Đặt tên rồi bấm «Lưu bản sao lưu» ở trên. Hoặc cứ để phần mềm tự chụp lại giúp bạn
      trước mỗi thao tác có thể làm mất dữ liệu.</div>`;
    return;
  }
  const today=new Date(); today.setHours(0,0,0,0);
  const dayName=iso=>{
    const d=new Date(iso); d.setHours(0,0,0,0);
    const diff=Math.round((today-d)/86400000);
    if(diff===0) return 'Hôm nay';
    if(diff===1) return 'Hôm qua';
    const p=n=>String(n).padStart(2,'0');
    return `Ngày ${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()}`;
  };
  let html=warn, cur=null;
  list.forEach((it,k)=>{
    const day=dayName(it.at);
    if(day!==cur){ cur=day; html+=`<div class="bk-day"><span>${day}</span><i></i></div>`; }
    const d=new Date(it.at), p=n=>String(n).padStart(2,'0');
    const s2=it.sum||{};
    const tag = it.auto ? '<span class="bk-tag auto">Tự động</span>' : '<span class="bk-tag">Đặt tay</span>';
    const name = it.label || (it.auto?'Bản chụp tự động':'Bản lưu tay');
    html += `<div class="bk${k===0?' newest':''}" data-id="${it.id}">
      <div class="bk-time">${p(d.getHours())}:${p(d.getMinutes())}</div>
      <div class="bk-main">
        <div class="bk-name">${tag}${esc(name)}</div>
        <div class="bk-sum">${s2.c||0} lớp · ${s2.t||0} giáo viên · ${s2.sb||0} môn ·
          ${s2.cells?('đã xếp '+s2.cells+' tiết'):'chưa xếp lịch'} · ${(it.size/1024).toFixed(0)} KB</div>
      </div>
      <div class="bk-acts">
        <button class="btn btn-sm" data-bk="dl">Tải về</button>
        <button class="btn btn-sm btn-primary" data-bk="rs">Khôi phục</button>
        <button class="btn btn-sm btn-danger" data-bk="rm">Xoá</button>
      </div></div>`;
  });
  box.innerHTML=html;
}
$('#bkList').addEventListener('click',e=>{
  const b=e.target.closest('[data-bk]'); if(!b) return;
  const id=b.closest('.bk').dataset.id, it=bkAll().find(x=>x.id===id); if(!it) return;
  if(b.dataset.bk==='dl'){
    dl(new Blob([it.data],{type:'application/json'}), bkFileName(it));
    toast('Đã tải bản sao lưu về máy.','ok');
  }else if(b.dataset.bk==='rs'){ bkRestore(id); }
  else if(b.dataset.bk==='rm'){
    if(!confirm('Xoá vĩnh viễn bản sao lưu này?')) return;
    bkWrite(bkAll().filter(x=>x.id!==id)); bkRender(); toast('Đã xoá.','ok');
  }
});
$('#btnBkSave').addEventListener('click',()=>{
  const it=bkSave($('#bkLabel').value.trim(),false);
  if(it){ $('#bkLabel').value=''; toast('Đã lưu bản sao lưu.','ok'); }
});
$('#btnBkFile').addEventListener('click',()=>{
  dl(new Blob([JSON.stringify(ST,null,2)],{type:'application/json'}),
     `TKB-${(ST.config.schoolYear||'').replace(/\s/g,'')}.json`);
  bkSave($('#bkLabel').value.trim()||'Tải về máy',false);
  $('#bkLabel').value='';
});
$('#btnBkImport').addEventListener('click',()=>$('#fileImport').click());
$('#btnBkClear').addEventListener('click',()=>{
  if(!bkAll().length) return toast('Lịch sử đang trống.','err');
  if(!confirm('Xoá TOÀN BỘ lịch sử sao lưu? Không thể hoàn tác.')) return;
  lsDel(BK_KEY); bkRender(); toast('Đã xoá toàn bộ lịch sử.','ok');
});
$('#bkAuto').addEventListener('change',e=>{
  lsSet(BK_AUTO, e.target.checked?'1':'0');
  toast(e.target.checked?'Đã bật tự động sao lưu.':'Đã tắt tự động sao lưu.','ok');
});

/* ---------------- Nhập / Xuất / Khôi phục ---------------- */
$('#btnExport').addEventListener('click',()=>{
  dl(new Blob([JSON.stringify(ST,null,2)],{type:'application/json'}),
     `TKB-${(ST.config.schoolYear||'').replace(/\s/g,'')}.json`);
  bkSave('Xuất dữ liệu ra tệp',false);
  toast('Đã xuất dữ liệu và lưu một bản vào lịch sử.','ok');
});
$('#btnImport').addEventListener('click',()=>$('#fileImport').click());
$('#fileImport').addEventListener('change',e=>{
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{
    try{
      const s=JSON.parse(r.result);
      if(!s.config||!s.classes) throw new Error('Tệp không đúng định dạng.');
      bkSave('Trước khi nhập tệp '+(f.name||''), true);
      ST=normalize(s); save(); renderAll(); toast('Đã nhập dữ liệu (bản cũ đã được sao lưu).','ok');
    }catch(err){ toast('Lỗi nhập: '+err.message,'err'); }
    e.target.value='';
  };
  r.readAsText(f);
});
$('#btnReset').addEventListener('click',()=>{
  if(!confirm('Khôi phục toàn bộ dữ liệu mẫu?\nDữ liệu hiện tại sẽ được tự sao lưu trước.')) return;
  bkSave('Trước khi khôi phục dữ liệu mẫu', true);
  ST=defaultState(); save(); renderAll(); toast('Đã khôi phục dữ liệu mẫu.','ok');
});

/* ---------------- Khởi động ---------------- */
function renderAll(){
  renderHeader(); renderConfig(); renderSubjects(); renderClasses();
  renderTeachers(); renderRooms(); renderRules(); renderOff(); renderLoad(); renderView(); renderCheck(); renderLockInfo();
  $('#bkAuto').checked=bkAutoOn(); bkRender();
  enhanceSelects(document); refreshFilters();
}
renderAll();

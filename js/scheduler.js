/* ===========================================================
   scheduler.js — Bộ máy xếp thời khoá biểu
   Quy trình: phân công GV -> bố trí buổi/ngày nghỉ -> ghim tiết cố định
              -> dành tiết trống cuối buổi -> xếp tham lam theo độ khó
              -> đẩy chỗ 1 tầng -> khởi động lại -> leo đồi tinh chỉnh
   =========================================================== */
const Sched = (function(){

/* ---------- Khung tiết ---------- */
function buildSlots(cfg){
  const off=new Set(cfg.offSessions||[]);
  const slots=[];
  cfg.days.forEach(d=>{
    if(!off.has(d+'-S')) for(let p=1;p<=cfg.morningPeriods;p++)   slots.push({key:`${d}-S-${p}`,day:d,session:'S',period:p});
    if(!off.has(d+'-C')) for(let p=1;p<=cfg.afternoonPeriods;p++) slots.push({key:`${d}-C-${p}`,day:d,session:'C',period:p});
  });
  slots.forEach((s,i)=>s.idx=i);
  return slots;
}
function slotLabel(s){ return `${DAY_SHORT[s.day]} • ${SESSION_NAME[s.session]} tiết ${s.period}`; }
function offLabel(key,mode){
  if(mode==='auto-day'||!String(key).includes('-')) return `Nghỉ trọn ${DAY_NAME[+key]||key}`;
  const [d,ss]=String(key).split('-');
  return `Nghỉ buổi ${SESSION_NAME[ss]} ${DAY_NAME[+d]}`;
}

function periodClock(cfg){
  const parse=t=>{const[a,b]=(t||'0:0').split(':').map(Number);return a*60+b;};
  const fmt=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
  const build=(start,n)=>{
    let t=parse(start); const out=[];
    for(let p=1;p<=n;p++){
      const s=t,e=t+cfg.periodMinutes;
      out.push({period:p, from:fmt(s), to:fmt(e)});
      t=e+cfg.breakMinutes;
      if(p===cfg.longBreakAfter) t+=(cfg.longBreakMinutes-cfg.breakMinutes);
    }
    return out;
  };
  return {S:build(cfg.morningStart,cfg.morningPeriods), C:build(cfg.afternoonStart,cfg.afternoonPeriods)};
}

/* ---------- Phân công giáo viên ---------- */
/* N29 — giới hạn theo khối: teacher.grades = {"CN":[3]} hoặc {"*":[2,3]} */
function teacherFitsGrade(t, sid, grade){
  const g=t.grades||{};
  const list = (g[sid] && g[sid].length) ? g[sid] : ((g['*'] && g['*'].length) ? g['*'] : null);
  if(!list) return true;
  return list.map(Number).includes(+grade);
}
function assignTeachers(st, log){
  const map={}, load={}, fallback=[];
  const useGrades = st.config.rules.gradeLimit !== false;
  const fits = (t,sid,g)=> !useGrades || teacherFitsGrade(t,sid,g);
  st.teachers.forEach(t=>load[t.id]=0);

  // 1) Môn của GVCN
  st.classes.forEach(c=>st.subjects.forEach(sub=>{
    const n=+(sub.periods[c.grade]||0); if(!n||sub.who!=='homeroom') return;
    map[c.id+'|'+sub.id]=c.homeroom;
    load[c.homeroom]=(load[c.homeroom]||0)+n;
  }));

  // 2) Môn bộ môn / buổi 2 — xếp môn có ÍT giáo viên đủ điều kiện TRƯỚC
  const specials = st.subjects.filter(sub =>
    sub.who!=='homeroom' && st.classes.some(c=>+(sub.periods[c.grade]||0)>0));
  const meta = new Map();
  specials.forEach(sub=>{
    meta.set(sub.id, {
      pool: st.teachers.filter(t=>t.kind!=='GVCN' && (t.subjects||[]).includes(sub.id)).length,
      tot:  st.classes.reduce((a,c)=>a+(+(sub.periods[c.grade]||0)),0)
    });
  });
  specials.sort((a,b)=>{
    const A=meta.get(a.id), B=meta.get(b.id);
    return (A.pool-B.pool) || (B.tot-A.tot);
  });

  specials.forEach(sub=>{
    const kind = sub.who==='session2' ? 'BUOI2' : 'BOMON';
    st.classes.map(c=>({c, n:+(sub.periods[c.grade]||0)})).filter(x=>x.n>0)
      .sort((a,b)=>b.n-a.n)
      .forEach(({c,n})=>{
        let pool=st.teachers.filter(t=>t.kind===kind && (t.subjects||[]).includes(sub.id)
                                    && fits(t,sub.id,c.grade));
        if(!pool.length) pool=st.teachers.filter(t=>t.kind!=='GVCN' && (t.subjects||[]).includes(sub.id)
                                    && fits(t,sub.id,c.grade));
        if(!pool.length){
          // dự phòng: giao lại cho GVCN nếu GVCN có môn này
          const hr=st.teachers.find(t=>t.id===c.homeroom);
          if(hr && (hr.subjects||[]).includes(sub.id)){
            map[c.id+'|'+sub.id]=hr.id; load[hr.id]=(load[hr.id]||0)+n;
            fallback.push(`${sub.name} lớp ${c.name} → GVCN ${hr.name}`);
          }else{
            log&&log(`  ⚠ ${sub.name} lớp ${c.name}: không giáo viên nào đủ điều kiện dạy khối ${c.grade}.`);
          }
          return;
        }
        const cand=pool.slice().sort((a,b)=>{
          const oa=(load[a.id]+n>a.maxWeek)?1:0, ob=(load[b.id]+n>b.maxWeek)?1:0;
          if(oa!==ob) return oa-ob;
          if(load[a.id]!==load[b.id]) return load[a.id]-load[b.id];
          return (a.busy||[]).length-(b.busy||[]).length;
        });
        map[c.id+'|'+sub.id]=cand[0].id; load[cand[0].id]+=n;
      });
  });
  if(fallback.length && log) log(`  Chuyển về GVCN do không có GV bộ môn phù hợp: ${fallback.length} phân công.`);
  return {map, load, fallback};
}

/* ---------- Sức chứa thực tế của một giáo viên ---------- */
function capacityOf(ctx, t, exclude){
  const ex = exclude||new Set();
  const canUse=i=>{
    const s=ctx.slots[i];
    if(ex.has(i)) return false;
    if(t.sessions==='S'&&s.session==='C') return false;
    if(t.sessions==='C'&&s.session==='S') return false;
    return !ctx.tBusySet[t.id].has(s.key);
  };
  let morning=0; const aft=[];
  ctx.cfg.days.forEach(d=>{
    (ctx.daySessIdx[d+'S']||[]).forEach(i=>{ if(canUse(i)) morning++; });
    const n=(ctx.daySessIdx[d+'C']||[]).filter(canUse).length;
    if(n) aft.push(n);
  });
  aft.sort((a,b)=>b-a);
  const cap = (ctx.cfg.rules.gvcnAfternoonCap && t.maxAfternoons>0) ? t.maxAfternoons : aft.length;
  return morning + aft.slice(0,cap).reduce((a,c)=>a+c,0);
}

/* ---------- N26: bố trí buổi / ngày nghỉ cho mọi giáo viên ---------- */
function assignTimeOff(ctx, jitter){
  const cfg=ctx.cfg, info={};
  if(!cfg.rules.teacherTimeOff) return info;
  const spread={};
  const sessionCands=[];
  cfg.days.forEach(d=>['S','C'].forEach(ss=>{
    const idxs=ctx.daySessIdx[d+ss]||[];
    if(idxs.length) sessionCands.push({key:d+'-'+ss, day:d, session:ss, idxs});
  }));

  ctx.st.teachers.slice()
    .sort((a,b)=>(ctx.teaDemand[b.id]||0)-(ctx.teaDemand[a.id]||0))
    .forEach(t=>{
      let mode=t.offMode||'none';
      if(t.kind==='GVCN' && cfg.rules.gvcnNoMorningOff && mode==='auto-day') mode='auto-session';
      if(mode==='none'){ info[t.id]={ok:true, none:true, label:'Không bố trí nghỉ'}; return; }
      const demand=ctx.teaDemand[t.id]||0;
      const pinned=new Set(ctx.fixedList.filter(f=>f.tea===t.id).map(f=>f.idx));

      let cands=[];
      if(mode==='fixed' && t.offFixed){
        const k=String(t.offFixed);
        cands = k.includes('-')
          ? sessionCands.filter(s=>s.key===k)
          : [{key:k, idxs:(ctx.dayIdx[+k]||[]).slice()}];
      } else if(mode==='auto-day'){
        cands = cfg.days.map(d=>({key:String(d), idxs:(ctx.dayIdx[d]||[]).slice(), whole:true}));
      } else {
        cands = sessionCands.map(s=>({...s, idxs:s.idxs.slice()}));
      }
      // N31 — GVCN không được nghỉ buổi sáng
      if(t.kind==='GVCN' && cfg.rules.gvcnNoMorningOff)
        cands = cands.filter(c=>c.session==='C' || (c.whole===true && false));

      const scored=[];
      cands.forEach(c=>{
        if(!c.idxs.length) return;
        if(c.idxs.some(i=>pinned.has(i))) return;              // trùng tiết ghim
        const ex=new Set(c.idxs);
        if(capacityOf(ctx,t,ex) < demand) return;              // nghỉ xong không đủ chỗ dạy
        let sc=(spread[c.key]||0)*100;                          // rải đều giữa các GV
        if(t.kind==='GVCN' && c.session==='S') sc+=70;          // GVCN ưu tiên nghỉ buổi chiều
        if(t.sessions==='C' && !c.idxs.some(i=>ctx.slots[i].session==='C')) sc+=800; // nghỉ ngày không có buổi chiều là vô nghĩa
        sc += c.idxs.filter(i=>{
          const s=ctx.slots[i];
          return !(t.sessions==='S'&&s.session==='C') && !(t.sessions==='C'&&s.session==='S');
        }).length*2;
        scored.push({c, sc: sc + (jitter?Math.random()*jitter:0)});
      });

      if(!scored.length){ info[t.id]={ok:false, label:'Chưa bố trí được — lịch quá kín'}; return; }
      scored.sort((a,b)=>a.sc-b.sc);
      const pick=scored[0].c;
      spread[pick.key]=(spread[pick.key]||0)+1;
      pick.idxs.forEach(i=>ctx.tBusySet[t.id].add(ctx.slots[i].key));
      info[t.id]={ok:true, key:pick.key, whole:!!pick.whole, idxs:pick.idxs.slice(),
                  label:offLabel(pick.key, pick.whole?'auto-day':'auto-session')};
    });
  return info;
}

/* ---------- N30: phân BUỔI LÊN LỚP cho GIÁO VIÊN CHỦ NHIỆM ----------
   GVCN chiếm phần lớn ô buổi sáng của lớp mình. Nếu để họ rải đều cả 5 buổi
   sáng thì mỗi lớp chỉ còn 1 ô sáng trống — GV bộ môn không thể gom đủ 3 tiết.
   Vì vậy ép GVCN dồn vào ÍT buổi sáng nhất có thể, chừa hẳn 1–2 buổi sáng
   trống trọn vẹn cho giáo viên bộ môn.                                      */
function assignSessionPlan(ctx, jitter){
  const info={};
  if(!ctx.cfg.rules.minSessionLoad || !ctx.cfg.rules.gvcnSessionPlan) return info;
  const spread={};
  ctx.st.teachers.filter(t=>t.kind==='GVCN')
    .sort((x,y)=>(ctx.teaDemand[y.id]||0)-(ctx.teaDemand[x.id]||0))
    .forEach(t=>{
      const D=ctx.teaDemand[t.id]||0;
      if(!D){ info[t.id]={ok:true, sessions:[]}; return; }
      const pinnedSess=new Set(ctx.fixedList.filter(f=>f.tea===t.id)
        .map(f=>ctx.slots[f.idx].day+'-'+ctx.slots[f.idx].session));
      const cands=[];
      ctx.cfg.days.forEach(d=>['S','C'].forEach(ss=>{
        const list=ctx.daySessIdx[d+ss]||[]; if(!list.length) return;
        if(t.sessions==='S'&&ss==='C') return;
        if(t.sessions==='C'&&ss==='S') return;
        const free=list.filter(i=>!ctx.tBusySet[t.id].has(ctx.slots[i].key));
        const need=minFor(ctx,t,ss,d);
        if(free.length<Math.max(1,need)) return;
        cands.push({key:d+'-'+ss, day:d, sess:ss, cap:free.length, need, idxs:free,
                    must:pinnedSess.has(d+'-'+ss)});
      }));
      const maxAft=(ctx.cfg.rules.gvcnAfternoonCap && t.maxAfternoons>0)?t.maxAfternoons:99;
      const key=c=>(c.must?-1e6:0)+(spread[c.key]||0)*6+(jitter?Math.random()*jitter:0);
      const morns=cands.filter(c=>c.sess==='S').sort((x,y)=>key(x)-key(y));
      const afts =cands.filter(c=>c.sess==='C').sort((x,y)=>key(x)-key(y));
      const mustM=morns.filter(c=>c.must).length;
      const mustA=afts.filter(c=>c.must).length;

      let best=null;
      for(let m=Math.max(1,mustM); m<=morns.length; m++){
        const pickM=morns.slice(0,m);
        if(pickM.filter(c=>c.must).length<mustM) continue;      // buổi có tiết ghim phải có mặt
        for(let aN=Math.max(0,mustA); aN<=Math.min(maxAft,afts.length); aN++){
          const pickA=afts.slice(0,aN);
          if(pickA.filter(c=>c.must).length<mustA) continue;
          const pick=pickM.concat(pickA);
          const needSum=pick.reduce((s2,c)=>s2+c.need,0);
          const capSum =pick.reduce((s2,c)=>s2+c.cap,0);
          if(needSum>D || D>capSum) continue;
          // ưu tiên: ÍT buổi sáng nhất → rồi nhiều dư địa nhất
          const sc=m*1000 - Math.min(D-needSum, capSum-D);
          if(!best || sc<best.sc) best={pick, sc, m, aN};
        }
      }
      if(!best){ info[t.id]={ok:false, label:'Không lập được kế hoạch buổi lên lớp'}; return; }
      const keep=new Set(best.pick.map(c=>c.key));
      ctx.cfg.days.forEach(d=>['S','C'].forEach(ss=>{
        if(keep.has(d+'-'+ss)) return;
        (ctx.daySessIdx[d+ss]||[]).forEach(i=>ctx.tBusySet[t.id].add(ctx.slots[i].key));
      }));
      best.pick.forEach(c=>spread[c.key]=(spread[c.key]||0)+1);
      info[t.id]={ok:true, D, morn:best.m, aft:best.aN,
                  sessions:best.pick.map(c=>({key:c.key, day:c.day, sess:c.sess, cap:c.cap, need:c.need}))};
    });
  return info;
}

/* ---------- Lời giải ---------- */
function newSolution(ctx){
  const n=ctx.slots.length, sol={grid:{},tBusy:{},rUse:{},reserved:{},unplaced:[],
                                 tSess:{}, tDef:{}, remain:{}};
  ctx.st.classes.forEach(c=>{ sol.grid[c.id]=new Array(n).fill(null); sol.reserved[c.id]=new Set(); });
  ctx.st.teachers.forEach(t=>{
    sol.tBusy[t.id]=new Array(n).fill(null);
    sol.tSess[t.id]={}; sol.tDef[t.id]=0;
    sol.remain[t.id]=ctx.teaLessons[t.id]||0;     // số tiết còn phải xếp của GV
  });
  ctx.st.rooms.forEach(r=>sol.rUse[r.id]=new Array(n).fill(0));
  return sol;
}
/* đóng góp thiếu hụt của một buổi */
function defOf(cnt, need){ return (cnt>0 && cnt<need) ? need-cnt : 0; }
function place(ctx,sol,cid,idx,cell){
  const b=sol.tBusy[cell.tea][idx];
  sol.grid[cid][idx]=cell;
  if(b) b.n++;
  else{
    sol.tBusy[cell.tea][idx]={sub:cell.sub, grade:ctx.classGrade[cid], n:1};
    if(cell.room) sol.rUse[cell.room][idx]++;
    const k=ctx.sessKey[idx], need=ctx.needOf[cell.tea][k];
    const c0=sol.tSess[cell.tea][k]||0;
    sol.tSess[cell.tea][k]=c0+1;
    sol.tDef[cell.tea] += defOf(c0+1,need)-defOf(c0,need);
  }
  if(sol.remain[cell.tea]!=null) sol.remain[cell.tea]--;
}
function unplace(ctx,sol,cid,idx){
  const cell=sol.grid[cid][idx]; if(!cell) return null;
  sol.grid[cid][idx]=null;
  const b=sol.tBusy[cell.tea][idx];
  if(b){
    b.n--;
    if(b.n<=0){
      sol.tBusy[cell.tea][idx]=null;
      if(cell.room) sol.rUse[cell.room][idx]--;
      const k=ctx.sessKey[idx], need=ctx.needOf[cell.tea][k];
      const c0=sol.tSess[cell.tea][k]||0;
      sol.tSess[cell.tea][k]=c0-1;
      sol.tDef[cell.tea] += defOf(c0-1,need)-defOf(c0,need);
    }
  }
  if(sol.remain[cell.tea]!=null) sol.remain[cell.tea]++;
  return cell;
}

/* ---------- N30: buổi lên lớp phải đủ số tiết tối thiểu ---------- */
function minFor(ctx, t, sess, day){
  if(!ctx.cfg.rules.minSessionLoad) return 0;
  const gl = sess==='S' ? ctx.cfg.minMorning : ctx.cfg.minAfternoon;
  const ov = sess==='S' ? t.minMorning : t.minAfternoon;
  let v = Math.max(0, +((ov===undefined||ov===null||ov==='')?gl:ov)||0);
  // Mức tối thiểu không thể vượt số tiết giáo viên THỰC SỰ dạy được trong buổi đó.
  // VD: sáng thứ Sáu chỉ còn tiết 2 và 3 (tiết 1 GVCN đón lớp, tiết 4 Sinh hoạt lớp)
  //     ⇒ giáo viên bộ môn chỉ có thể đạt tối đa 2 tiết.
  if(day!=null && ctx.usable && ctx.usable[t.id]){
    const u=ctx.usable[t.id][day+sess];
    if(u!=null) v=Math.min(v,u);
  }
  return v;
}
/* Số tiết trong một buổi mà giáo viên thực sự có thể được xếp */
function computeUsable(ctx){
  const st=ctx.st, cfg=ctx.cfg;
  const byTea={};
  st.classes.forEach(c=>st.subjects.forEach(sub=>{
    if(!+(sub.periods[c.grade]||0)) return;
    const t=ctx.assign[c.id+'|'+sub.id]; if(!t) return;
    (byTea[t]=byTea[t]||new Set()).add(c.id);
  }));
  const pinCell=new Set(ctx.fixedList.map(f=>f.cid+'#'+f.idx));
  const pinTea={}; ctx.fixedList.forEach(f=>pinTea[f.cid+'#'+f.idx]=f.tea);
  ctx.usable={};
  st.teachers.forEach(t=>{
    const cls=[...(byTea[t.id]||[])];
    const m={};
    cfg.days.forEach(d=>['S','C'].forEach(ss=>{
      const list=ctx.daySessIdx[d+ss]||[]; if(!list.length) return;
      let n=0;
      for(const i of list){
        if(ctx.tBusySet[t.id].has(ctx.slots[i].key)) continue;
        const sl=ctx.slots[i];
        const ok=cls.some(cid=>{
          const key=cid+'#'+i;
          if(pinCell.has(key)) return pinTea[key]===t.id;
          if(ctx.blocked[cid] && ctx.blocked[cid].has(i)) return false;
          if(cfg.rules.gvcnFirstPeriod && sl.session==='S'
             && sl.period <= Math.max(1,+cfg.gvcnFirstPeriods||1))
            return (ctx.classById[cid]||{}).homeroom===t.id;
          return true;
        });
        if(ok) n++;
      }
      m[d+ss]=n;
    }));
    ctx.usable[t.id]=m;
  });
}
function sessionLoad(ctx,sol,tid,day,sess){
  const list=ctx.daySessIdx[day+sess]||[];
  let n=0; for(const i of list) if(sol.tBusy[tid][i]) n++;
  return n;
}
/* các tiết của một giáo viên trong một buổi */
function lessonsOf(ctx,sol,tid,list){
  const out=[];
  for(const i of list){
    if(!sol.tBusy[tid][i]) continue;
    for(const c of ctx.st.classes){
      const cell=sol.grid[c.id][i];
      if(cell && cell.tea===tid) out.push({cid:c.id, idx:i, cell:{...cell}});
    }
  }
  return out;
}
/* Vị trí đầu / cuối của giáo viên trong một buổi */
function sessionSpan(ctx,sol,tid,list){
  let first=-1,last=-1,n=0;
  list.forEach((idx,k)=>{ if(sol.tBusy[tid][idx]){ n++; if(first<0)first=k; last=k; } });
  return {first,last,n};
}
/* N32 — GVCN chỉ dạy 2 tiết buổi sáng thì 2 tiết đó phải LIỀN KỀ */
function needAdjacent(ctx,t,sess,n){
  return !!(ctx.cfg.rules.gvcnAdjacentMin && t.kind==='GVCN' && sess==='S' && n===2);
}
function minViolations(ctx,sol){
  const out=[];
  if(!ctx.cfg.rules.minSessionLoad) return out;
  ctx.st.teachers.forEach(t=>{
    ctx.cfg.days.forEach(d=>['S','C'].forEach(ss=>{
      const list=ctx.daySessIdx[d+ss]||[]; if(!list.length) return;
      const need=minFor(ctx,t,ss,d);
      const sp=sessionSpan(ctx,sol,t.id,list);
      if(need>=2 && sp.n>0 && sp.n<need){
        out.push({tid:t.id, day:d, sess:ss, n:sp.n, need, list, kind:'few'});
      } else if(needAdjacent(ctx,t,ss,sp.n) && (sp.last-sp.first)!==1){
        out.push({tid:t.id, day:d, sess:ss, n:sp.n, need:2, list, kind:'adj'});
      }
    }));
  });
  return out;
}

/* Đếm số buổi vi phạm của riêng vài giáo viên (dùng để đo lãi/lỗ khi hoán đổi) */
function vCountOf(ctx,sol,tids){
  let n=0;
  tids.forEach(tid=>{
    const t=ctx.teacher[tid]; if(!t) return;
    for(const d of ctx.cfg.days) for(const ss of ['S','C']){
      const list=ctx.daySessIdx[d+ss]||[]; if(!list.length) continue;
      const need=minFor(ctx,t,ss,d);
      const sp=sessionSpan(ctx,sol,tid,list);
      if(need>=2 && sp.n>0 && sp.n<need) n++;
      else if(needAdjacent(ctx,t,ss,sp.n) && (sp.last-sp.first)!==1) n++;
    }
  });
  return n;
}
/* Hoán đổi hai ô trong cùng một lớp (ô đích có thể trống). Trả về true nếu đổi được. */
function trySwap(ctx,sol,cid,i,j){
  if(i===j) return false;
  if(ctx.pinnedIdx.has(cid+'#'+i) || ctx.pinnedIdx.has(cid+'#'+j)) return false;
  if(ctx.blocked[cid] && (ctx.blocked[cid].has(i)||ctx.blocked[cid].has(j))) return false;
  const A=sol.grid[cid][i], B=sol.grid[cid][j];
  if(!A && !B) return false;
  const ca=A?{...A}:null, cb=B?{...B}:null;
  if(A) unplace(ctx,sol,cid,i);
  if(B) unplace(ctx,sol,cid,j);
  const okA = !ca || feasible(ctx,sol,cid,j,ca);
  let okB=false;
  if(okA){
    if(ca) place(ctx,sol,cid,j,ca);
    okB = !cb || feasible(ctx,sol,cid,i,cb);
    if(cb && okB) place(ctx,sol,cid,i,cb);
    else if(ca && !okB) unplace(ctx,sol,cid,j);
  }
  if(okA && okB) return true;
  if(ca) place(ctx,sol,cid,i,ca);
  if(cb) place(ctx,sol,cid,j,cb);
  return false;
}

/* Sửa chữa có định hướng: gỡ dần các buổi lên lớp không đủ tiết tối thiểu.
   Vì thời khoá biểu đã kín, mọi thao tác đều là HOÁN ĐỔI trong cùng một lớp. */
function repairMinSession(ctx,sol,rounds){
  if(!ctx.cfg.rules.minSessionLoad) return {fixed:0, left:0};
  let fixed=0;
  const W=ctx.cfg.weights;
  for(let r=0; r<(rounds||120); r++){
    const V=minViolations(ctx,sol);
    if(!V.length) break;
    V.sort((x,y)=>(x.need-x.n)-(y.need-y.n));
    let improved=false;
    for(const bad of V){
      let items=lessonsOf(ctx,sol,bad.tid,bad.list);
      if(bad.kind==='adj'){
        // ngoài việc dời 2 tiết cho sát nhau, còn thử KÉO một tiết từ buổi khác
        // của chính giáo viên đó về lấp chỗ hở (khi đó buổi này có 3 tiết, hết vi phạm)
        const extra=[];
        ctx.cfg.days.forEach(d=>['S','C'].forEach(ss=>{
          if(d===bad.day && ss===bad.sess) return;
          lessonsOf(ctx,sol,bad.tid,ctx.daySessIdx[d+ss]||[]).forEach(x=>extra.push(x));
        }));
        items=items.concat(extra.slice(0,18));
      }
      for(const it of items){
        for(const j of ctx.slotOrder){
          const sl=ctx.slots[j];
          if(bad.kind!=='adj' && sl.day===bad.day && sl.session===bad.sess) continue;
          const partner = sol.grid[it.cid][j];
          const tids=[bad.tid]; if(partner && partner.tea!==bad.tid) tids.push(partner.tea);
          const vBefore=vCountOf(ctx,sol,tids);
          const cBefore=costClass(ctx,sol,it.cid)+tids.reduce((a2,t2)=>a2+costTeacher(ctx,sol,t2),0);
          if(!trySwap(ctx,sol,it.cid,it.idx,j)) continue;
          const vAfter=vCountOf(ctx,sol,tids);
          const cAfter=costClass(ctx,sol,it.cid)+tids.reduce((a2,t2)=>a2+costTeacher(ctx,sol,t2),0);
          if(vAfter<vBefore || (vAfter===vBefore && cAfter<cBefore-1e-9)){
            if(vAfter<vBefore){ fixed++; improved=true; }
            else improved=improved||false;
            if(vAfter<vBefore) break;
            continue;                       // giữ cải thiện điểm, đi tiếp
          }
          trySwap(ctx,sol,it.cid,j,it.idx);  // hoàn tác
        }
        if(improved) break;
      }
      if(improved) break;
    }
    if(!improved) break;
  }
  sol.cost=totalCost(ctx,sol);
  return {fixed, left:minViolations(ctx,sol).length};
}

/* ---------- N28: có được dồn lớp vào tiết này không? ---------- */
function mergeAllowedGrade(sub, grade){
  const g=sub.mergeGrades;
  if(!g || !g.length) return true;                 // để trống = mọi khối
  return g.map(Number).indexOf(+grade)>=0;
}
function canMerge(ctx,sol,cid,idx,cell){
  const b=sol.tBusy[cell.tea][idx]; if(!b) return false;
  const sub=ctx.subject[cell.sub], grade=ctx.classGrade[cid];
  return !!(ctx.cfg.rules.allowMerge && sub.merge
    && mergeAllowedGrade(sub, grade)                         // chỉ dồn ở khối được phép
    && b.sub===cell.sub && b.grade===grade                   // chỉ dồn lớp CÙNG KHỐI, cùng môn
    && b.n < Math.max(1,+sub.mergeMax||1));
}

/* ---------- Ràng buộc cứng ---------- */
function feasible(ctx,sol,cid,idx,cell){
  if(sol.grid[cid][idx]) return false;                              // H1
  if(ctx.blocked[cid] && ctx.blocked[cid].has(idx)) return false;   // H8
  const tea=ctx.teacher[cell.tea]; if(!tea) return false;
  const slot=ctx.slots[idx];
  // H13 — GVCN đón lớp tiết 1 mỗi sáng: ô đó chỉ dành cho giáo viên chủ nhiệm
  const pinnedHere = ctx.pinnedIdx.has(cid+'#'+idx);   // tiết ghim tay: ý chí người xếp, miễn quy tắc tự động
  if(ctx.cfg.rules.gvcnFirstPeriod && slot.session==='S' && !pinnedHere){
    const hr=(ctx.classById[cid]||{}).homeroom;
    if(hr && cell.tea!==hr){
      const K=Math.max(1,+ctx.cfg.gvcnFirstPeriods||1);
      const list=(ctx.daySessIdx[slot.day+'S']||[])
        .filter(j=>!(ctx.blocked[cid] && ctx.blocked[cid].has(j)));
      if(list.slice(0,K).indexOf(idx)>=0) return false;
    }
  }
  // H15 — GVCN dạy LIỀN MẠCH từ tiết 1 buổi sáng: trong mỗi buổi sáng của một lớp,
  //        các tiết của GVCN là một khối liền từ đầu buổi, sau đó mới đến GV bộ môn.
  //        Nhờ vậy nếu GVCN chỉ dạy 2 tiết thì chắc chắn là tiết 1 + tiết 2.
  if(ctx.cfg.rules.gvcnMorningBlock===true && slot.session==='S'){
    const hr=(ctx.classById[cid]||{}).homeroom;
    if(hr){
      const list=ctx.daySessIdx[slot.day+'S']||[];
      const pos=list.indexOf(idx);
      if(cell.tea===hr){
        for(let k=0;k<pos;k++){ const g=sol.grid[cid][list[k]]; if(g && g.tea!==hr) return false; }
      }else{
        for(let k=pos+1;k<list.length;k++){ const g=sol.grid[cid][list[k]]; if(g && g.tea===hr) return false; }
      }
    }
  }
  // H14 — GVCN phải đạt tối thiểu N tiết mỗi sáng ⇒ mỗi lớp mỗi sáng chỉ nhường
  //        được (số tiết sáng − N) ô cho giáo viên bộ môn.
  if(ctx.cfg.rules.gvcnNoMorningOff && ctx.cfg.rules.minSessionLoad && slot.session==='S' && !pinnedHere){
    const hr=(ctx.classById[cid]||{}).homeroom, hrT=ctx.teacher[hr];
    if(hrT && cell.tea!==hr){
      const list=ctx.daySessIdx[slot.day+'S']||[];
      const room=list.length - minFor(ctx,hrT,'S',slot.day);
      let others=0;
      for(const j of list){ const g=sol.grid[cid][j]; if(g && g.tea!==hr) others++; }
      if(others>=room) return false;
    }
  }
  if(tea.sessions==='S' && slot.session==='C') return false;        // H9 — GV chỉ dạy buổi sáng
  if(tea.sessions==='C' && slot.session==='S') return false;        // H9 — GV buổi 2 chỉ dạy chiều
  if(ctx.tBusySet[cell.tea].has(slot.key)) return false;            // H4 (gồm cả buổi/ngày nghỉ)

  const merging = sol.tBusy[cell.tea][idx] ? canMerge(ctx,sol,cid,idx,cell) : false;
  if(sol.tBusy[cell.tea][idx] && !merging) return false;            // H2

  if(cell.room && !merging){                                        // H3
    const r=ctx.room[cell.room];
    if(!r || sol.rUse[cell.room][idx]>=r.cap) return false;
  }
  if(!merging){
    // H10 — GVCN chỉ dạy tối đa N buổi chiều/tuần
    if(slot.session==='C' && ctx.cfg.rules.gvcnAfternoonCap && tea.maxAfternoons>0){
      let used=0, already=false;
      for(const d of ctx.cfg.days){
        const list=ctx.daySessIdx[d+'C']||[];
        const has=list.some(j=>sol.tBusy[cell.tea][j]);
        if(has){ used++; if(d===slot.day) already=true; }
      }
      if(!already && used>=tea.maxAfternoons) return false;
    }
    // H6 — số tiết/ngày của GV
    let tc=0;
    for(const j of ctx.dayIdx[slot.day]) if(sol.tBusy[cell.tea][j]) tc++;
    if(tc >= (tea.maxDay||7)) return false;
  }
  // số tiết tối đa của môn trong 1 ngày của lớp
  const sub=ctx.subject[cell.sub];
  let sc=0;
  for(const j of ctx.dayIdx[slot.day]){ const g=sol.grid[cid][j]; if(g&&g.sub===cell.sub) sc++; }
  if(sc >= (+sub.maxDay||3)) return false;

  // N30 — nhìn trước: sau khi đặt tiết này, tổng số tiết còn thiếu của các buổi
  // đang mở KHÔNG được vượt quá số tiết GV còn phải xếp. Nhờ vậy đến tiết cuối
  // cùng thiếu hụt chắc chắn về 0.
  if(ctx.cfg.rules.minSessionLoad && !merging){
    const k=ctx.sessKey[idx], need=ctx.needOf[cell.tea][k];
    const c0=sol.tSess[cell.tea][k]||0;
    const defAfter = sol.tDef[cell.tea] + defOf(c0+1,need) - defOf(c0,need);
    if(defAfter > sol.remain[cell.tea]-1+(+ctx.cfg.minSessionSlack||0)) return false;
  }
  return true;
}

/* ---------- Chi phí mềm theo lớp ---------- */
function costClass(ctx,sol,cid){
  const W=ctx.cfg.weights, R=ctx.cfg.rules, g=sol.grid[cid];
  let cost=0;
  for(const day of ctx.cfg.days){
    for(const sess of ['S','C']){
      const list=ctx.daySessIdx[day+sess]||[];
      if(!list.length) continue;
      const counts={};
      let seenFilled=false;
      for(let k=list.length-1;k>=0;k--){
        const idx=list[k], cell=g[idx];
        if(ctx.blocked[cid]&&ctx.blocked[cid].has(idx)) continue;
        if(cell) seenFilled=true;
        else if(seenFilled && R.tailFree) cost += W.classTail;
      }
      list.forEach((idx,k)=>{
        const cell=g[idx]; if(!cell) return;
        const sub=ctx.subject[cell.sub], slot=ctx.slots[idx];
        counts[cell.sub]=(counts[cell.sub]||0)+1;
        if(R.coreMorning){
          if(sub.prefSession!=='any' && sub.prefSession!==slot.session) cost+=W.prefSession;
          cost += W.prefEarly*(+sub.early||0)*ctx.quality[idx]/3;
        }
        if(R.peSafety && sub.room==='SAN'){
          if(slot.session==='C' && slot.period===1) cost+=W.peSafety;
          if(slot.session==='S' && slot.period===ctx.cfg.morningPeriods) cost+=W.peSafety*0.6;
        }
        if(sol.reserved[cid].has(idx)) cost += W.classTail*0.5;
        const nxt=list[k+1]!=null?g[list[k+1]]:null;
        if(nxt && nxt.sub===cell.sub){
          if(R.allowDouble && sub.double && counts[cell.sub]===1) cost -= W.adjacentSame*0.9;
          else cost += W.adjacentSame;
        }
      });
      if(R.spreadWeek) Object.keys(counts).forEach(s=>{ if(counts[s]>1) cost += W.spread*(counts[s]-1); });
    }
    if(R.spreadWeek){
      const dc={};
      ctx.dayIdx[day].forEach(idx=>{ const c=g[idx]; if(c) dc[c.sub]=(dc[c.sub]||0)+1; });
      Object.keys(dc).forEach(s=>{ if(dc[s]>1) cost += W.spread*0.5*(dc[s]-1); });
    }
  }
  return cost;
}

/* ---------- Chi phí mềm theo giáo viên ---------- */
function costTeacher(ctx,sol,tid){
  const W=ctx.cfg.weights, R=ctx.cfg.rules, b=sol.tBusy[tid];
  const tea=ctx.teacher[tid]; let cost=0; const dayCounts=[];
  for(const day of ctx.cfg.days){
    let dc=0;
    for(const sess of ['S','C']){
      const list=ctx.daySessIdx[day+sess]||[];
      if(!list.length) continue;
      let first=-1,last=-1,cnt=0,run=0,maxRun=0;
      list.forEach((idx,k)=>{
        if(b[idx]){
          cnt++; if(first<0)first=k; last=k; run++; if(run>maxRun)maxRun=run;
          if(b[idx].n>1){
            const sb=ctx.subject[b[idx].sub];
            // môn đặt chế độ "luôn dồn" thì việc ghép lớp được THƯỞNG điểm, không bị phạt
            cost += (sb && sb.mergeMode==='always' ? -1 : 1) * W.mergeUse * (b[idx].n-1);
          }
        }
        else run=0;
      });
      dc+=cnt;
      if(cnt>0){
        if(R.minTeacherGap) cost += W.teacherGap*((last-first+1)-cnt);
        if(R.limitConsec)   cost += W.teacherConsec*Math.max(0,maxRun-(tea.maxConsec||ctx.cfg.maxConsecutive));
        if(R.minSessionLoad){                                   // N30
          const need=minFor(ctx,tea,sess,day);
          if(cnt<need) cost += W.minSession*(need-cnt);
          // N32 — GVCN dạy đúng 2 tiết buổi sáng thì phải liền kề
          else if(needAdjacent(ctx,tea,sess,cnt) && (last-first)!==1) cost += W.minSession;
        }
      }
    }
    dayCounts.push(dc);
  }
  if(R.balanceDay && dayCounts.length){
    const tot=dayCounts.reduce((a,c)=>a+c,0), mean=tot/dayCounts.length;
    if(tot>0) cost += W.teacherBalance*dayCounts.reduce((a,c)=>a+Math.abs(c-mean),0);
  }
  return cost;
}
function totalCost(ctx,sol){
  let c=0;
  ctx.st.classes.forEach(x=>c+=costClass(ctx,sol,x.id));
  ctx.st.teachers.forEach(t=>c+=costTeacher(ctx,sol,t.id));
  return c;
}
function placeCost(ctx,sol,cid,idx,cell){
  const before=costClass(ctx,sol,cid)+costTeacher(ctx,sol,cell.tea);
  place(ctx,sol,cid,idx,cell);
  const after=costClass(ctx,sol,cid)+costTeacher(ctx,sol,cell.tea);
  unplace(ctx,sol,cid,idx);
  return after-before;
}

/* ---------- Dành sẵn tiết trống về cuối buổi chiều ---------- */
function reserveFree(ctx,sol){
  const total=ctx.slots.length;
  ctx.st.classes.forEach(c=>{
    const blocked=ctx.blocked[c.id]?ctx.blocked[c.id].size:0;
    let free=total-blocked-(ctx.demand[c.id]||0);
    if(free<=0) return;
    const cand=[];
    for(let p=ctx.cfg.afternoonPeriods;p>=1;p--)
      for(let di=ctx.cfg.days.length-1;di>=0;di--){
        const s=ctx.slotByKey[`${ctx.cfg.days[di]}-C-${p}`]; if(s) cand.push(s.idx);
      }
    for(const idx of cand){
      if(free<=0) break;
      if(sol.grid[c.id][idx]) continue;
      if(ctx.blocked[c.id]&&ctx.blocked[c.id].has(idx)) continue;
      sol.reserved[c.id].add(idx); free--;
    }
  });
}

/* ---------- Ghép ngay lớp cùng khối vào tiết vừa đặt (môn "luôn dồn") ---------- */
function pairUp(ctx,sol,units,done,ui,idx){
  const u=units[ui], sub=ctx.subject[u.sub];
  if(!(ctx.cfg.rules.allowMerge && sub.merge && sub.mergeMode==='always')) return;
  if(!mergeAllowedGrade(sub, ctx.classGrade[u.cid])) return;
  const cap=Math.max(1,+sub.mergeMax||1);
  const grade=ctx.classGrade[u.cid];
  for(let j=0;j<units.length;j++){
    const b=sol.tBusy[u.tea][idx];
    if(!b || b.n>=cap) return;
    if(done[j]) continue;
    const v=units[j];
    if(v.sub!==u.sub || v.tea!==u.tea || v.cid===u.cid) continue;
    if(ctx.classGrade[v.cid]!==grade) continue;
    const cell={sub:v.sub, tea:v.tea, room:v.room};
    if(feasible(ctx,sol,v.cid,idx,cell)){ place(ctx,sol,v.cid,idx,cell); done[j]=true; }
  }
}

/* ---------- Xếp tham lam ---------- */
function greedy(ctx, jitter){
  const sol=newSolution(ctx);
  for(const p of ctx.fixedList){
    const cell={sub:p.sub, tea:p.tea, room:p.room};
    if(feasible(ctx,sol,p.cid,p.idx,cell)) place(ctx,sol,p.cid,p.idx,cell);
    else sol.unplaced.push({cid:p.cid, sub:p.sub, tea:p.tea,
      reason:'Không đặt được tiết ghim tại '+slotLabel(ctx.slots[p.idx])});
  }
  reserveFree(ctx,sol);

  const units=ctx.units.map(u=>({...u, d:u.diff+(jitter?Math.random()*jitter:0)}))
                       .sort((a,b)=>b.d-a.d);
  const done=new Array(units.length).fill(false);
  for(let ui=0; ui<units.length; ui++){
    if(done[ui]) continue;
    const u=units[ui]; done[ui]=true;
    const cell={sub:u.sub, tea:u.tea, room:u.room};
    let best=-1,bestC=Infinity;
    for(const idx of ctx.slotOrder){
      if(!feasible(ctx,sol,u.cid,idx,cell)) continue;
      let c=placeCost(ctx,sol,u.cid,idx,cell);
      if(sol.reserved[u.cid].has(idx)) c+=ctx.cfg.weights.classTail*2;
      if(c<bestC-1e-9){ bestC=c; best=idx; }
    }
    if(best>=0){ place(ctx,sol,u.cid,best,cell); pairUp(ctx,sol,units,done,ui,best); continue; }

    // đẩy chỗ 1 tầng
    let ok=false;
    for(const idx of ctx.slotOrder){
      const occ=sol.grid[u.cid][idx];
      if(!occ) continue;
      if(ctx.blocked[u.cid]&&ctx.blocked[u.cid].has(idx)) continue;
      if(ctx.pinnedIdx.has(u.cid+'#'+idx)) continue;
      unplace(ctx,sol,u.cid,idx);
      if(feasible(ctx,sol,u.cid,idx,cell)){
        // đặt tiết mới TRƯỚC rồi mới tìm chỗ cho tiết bị đẩy —
        // nếu không, tính khả thi của tiết bị đẩy sẽ được đánh giá trên trạng thái cũ
        place(ctx,sol,u.cid,idx,cell);
        let alt=-1;
        for(const j of ctx.slotOrder){ if(j!==idx && feasible(ctx,sol,u.cid,j,occ)){ alt=j; break; } }
        if(alt>=0){ place(ctx,sol,u.cid,alt,occ); pairUp(ctx,sol,units,done,ui,idx); ok=true; break; }
        unplace(ctx,sol,u.cid,idx);
      }
      place(ctx,sol,u.cid,idx,occ);
    }
    if(!ok) sol.unplaced.push({cid:u.cid, sub:u.sub, tea:u.tea,
      reason:'Hết ô khả dụng (kẹt giáo viên / phòng / buổi nghỉ / giới hạn buổi chiều / giới hạn tiết mỗi ngày của môn)'});
  }
  sol.cost=totalCost(ctx,sol);
  return sol;
}

/* ---------- Vét tiết còn kẹt: đẩy dây nhiều tầng ----------
   Khi chỉ còn 1–2 tiết chưa xếp, lớp vẫn còn ô trống nhưng ô đó vướng
   giáo viên/phòng. Ta đẩy tiết đang chiếm chỗ sang ô khác, nếu vẫn kẹt
   thì đẩy tiếp tầng nữa — giống dồn toa tàu.                             */
function ejectChain(ctx,sol,cid,cell,depth,seen){
  seen=seen||new Set();
  for(const idx of ctx.slotOrder){
    const occ=sol.grid[cid][idx];
    if(!occ) continue;
    if(ctx.pinnedIdx.has(cid+'#'+idx)) continue;
    if(ctx.blocked[cid] && ctx.blocked[cid].has(idx)) continue;
    if(seen.has(idx)) continue;
    unplace(ctx,sol,cid,idx);
    if(feasible(ctx,sol,cid,idx,cell)){
      place(ctx,sol,cid,idx,cell);
      let moved=false;
      for(const j of ctx.slotOrder){
        if(j===idx || sol.grid[cid][j]) continue;
        if(ctx.blocked[cid] && ctx.blocked[cid].has(j)) continue;
        if(feasible(ctx,sol,cid,j,occ)){ place(ctx,sol,cid,j,occ); moved=true; break; }
      }
      if(!moved && depth>1){
        seen.add(idx);
        moved=ejectChain(ctx,sol,cid,occ,depth-1,seen);
        seen.delete(idx);
      }
      if(moved) return true;
      unplace(ctx,sol,cid,idx);
    }
    place(ctx,sol,cid,idx,occ);
  }
  return false;
}
function placeLeftovers(ctx,sol,depth){
  if(!sol.unplaced.length) return 0;
  const left=sol.unplaced.slice();
  sol.unplaced=[];
  let done=0;
  for(const u of left){
    const sub=ctx.subject[u.sub];
    const cell={sub:u.sub, tea:u.tea, room:(sub&&sub.room)||''};
    let ok=false;
    for(const idx of ctx.slotOrder){
      if(sol.grid[u.cid][idx]) continue;
      if(ctx.blocked[u.cid] && ctx.blocked[u.cid].has(idx)) continue;
      if(feasible(ctx,sol,u.cid,idx,cell)){ place(ctx,sol,u.cid,idx,cell); ok=true; break; }
    }
    if(!ok) ok=ejectChain(ctx,sol,u.cid,cell,depth||3);
    if(ok) done++; else sol.unplaced.push(u);
  }
  if(done) sol.cost=totalCost(ctx,sol);
  return done;
}

/* ---------- Leo đồi ---------- */
function polish(ctx,sol,iters){
  const cls=ctx.st.classes.map(c=>c.id), n=ctx.slots.length;
  let improved=0;
  for(let it=0; it<iters; it++){
    const cid=cls[(Math.random()*cls.length)|0];
    const i=(Math.random()*n)|0, j=(Math.random()*n)|0;
    if(i===j) continue;
    if(ctx.pinnedIdx.has(cid+'#'+i)||ctx.pinnedIdx.has(cid+'#'+j)) continue;
    if(ctx.blocked[cid]&&(ctx.blocked[cid].has(i)||ctx.blocked[cid].has(j))) continue;
    const a=sol.grid[cid][i], b=sol.grid[cid][j];
    if(!a&&!b) continue;
    const tset=new Set(); if(a)tset.add(a.tea); if(b)tset.add(b.tea);
    let before=costClass(ctx,sol,cid); tset.forEach(t=>before+=costTeacher(ctx,sol,t));
    if(a) unplace(ctx,sol,cid,i);
    if(b) unplace(ctx,sol,cid,j);
    const okA = !a || feasible(ctx,sol,cid,j,a);
    let okB=false;
    if(okA){ if(a) place(ctx,sol,cid,j,a); okB = !b || feasible(ctx,sol,cid,i,b); if(a&&!okB) unplace(ctx,sol,cid,j); }
    if(okA&&okB){
      if(b) place(ctx,sol,cid,i,b);
      let after=costClass(ctx,sol,cid); tset.forEach(t=>after+=costTeacher(ctx,sol,t));
      if(after<before-1e-9){ sol.cost+=(after-before); improved++; continue; }
      if(a) unplace(ctx,sol,cid,j);
      if(b) unplace(ctx,sol,cid,i);
    }
    if(a) place(ctx,sol,cid,i,a);
    if(b) place(ctx,sol,cid,j,b);
  }
  return improved;
}

/* ---------- Ngữ cảnh ---------- */
function buildContext(st, log, offJitter){
  const cfg=st.config;
  const slots=buildSlots(cfg);
  const ctx={st, cfg, slots};
  ctx.slotByKey={}; slots.forEach(s=>ctx.slotByKey[s.key]=s);
  ctx.subject={}; st.subjects.forEach(s=>ctx.subject[s.id]=s);
  ctx.teacher={}; st.teachers.forEach(t=>ctx.teacher[t.id]=t);
  ctx.room={};    st.rooms.forEach(r=>ctx.room[r.id]=r);
  ctx.classGrade={}; ctx.classById={};
  st.classes.forEach(c=>{ ctx.classGrade[c.id]=+c.grade; ctx.classById[c.id]=c; });
  ctx.tBusySet={}; st.teachers.forEach(t=>ctx.tBusySet[t.id]=new Set(t.busy||[]));

  ctx.dayIdx={}; ctx.daySessIdx={};
  cfg.days.forEach(d=>{ ctx.dayIdx[d]=[]; ctx.daySessIdx[d+'S']=[]; ctx.daySessIdx[d+'C']=[]; });
  slots.forEach(s=>{ ctx.dayIdx[s.day].push(s.idx); ctx.daySessIdx[s.day+s.session].push(s.idx); });

  ctx.quality = slots.map(s=> s.session==='S'
    ? (s.period<=1?0 : s.period<=2?0.4 : s.period<=3?1.2 : 2.2)
    : 3+(s.period-1)*0.6);
  ctx.slotOrder = slots.map(s=>s.idx).sort((a,b)=>ctx.quality[a]-ctx.quality[b]);

  ctx.blocked={}; st.classes.forEach(c=>ctx.blocked[c.id]=new Set());
  (st.blocks||[]).forEach(b=>{ const s=ctx.slotByKey[b.slot]; if(s&&ctx.blocked[b.classId]) ctx.blocked[b.classId].add(s.idx); });

  const asg=assignTeachers(st, log);
  ctx.assign=asg.map; ctx.load=asg.load;

  /* tiết ghim */
  ctx.fixedList=[]; ctx.pinnedIdx=new Set();
  const addPin=(cid,sid,idx)=>{
    const tea=ctx.assign[cid+'|'+sid]; if(!tea||idx==null) return;
    ctx.fixedList.push({cid, sub:sid, tea, room:ctx.subject[sid].room||'', idx});
    ctx.pinnedIdx.add(cid+'#'+idx);
  };
  const firstDay=cfg.days[0], lastDay=cfg.days[cfg.days.length-1];
  const firstIdx=(ctx.dayIdx[firstDay]||[])[0];
  const lastArr=ctx.dayIdx[lastDay]||[]; const lastIdx=lastArr[lastArr.length-1];
  st.classes.forEach(c=>st.subjects.forEach(sub=>{
    if(!+(sub.periods[c.grade]||0)) return;
    if(sub.fixed==='start' && cfg.rules.fixedCeremony) addPin(c.id, sub.id, firstIdx);
    if(sub.fixed==='end'   && cfg.rules.fixedCeremony) addPin(c.id, sub.id, lastIdx);
  }));
  (st.pins||[]).forEach(p=>{ const s=ctx.slotByKey[p.slot]; if(s) addPin(p.classId,p.subjectId,s.idx); });

  /* nhu cầu tiết */
  const pinCount={};
  ctx.fixedList.forEach(f=>{ pinCount[f.cid+'|'+f.sub]=(pinCount[f.cid+'|'+f.sub]||0)+1; });
  ctx.demand={}; ctx.units=[];
  const teaDemand={}, teaDemandMin={}, roomDemand={}, groups={};
  st.classes.forEach(c=>{
    let tot=0;
    st.subjects.forEach(sub=>{
      const n=+(sub.periods[c.grade]||0); if(!n) return;
      tot+=n;
      const tea=ctx.assign[c.id+'|'+sub.id]; if(!tea) return;
      const k=tea+'|'+sub.id+'|'+c.grade;
      if(!groups[k]) groups[k]={tea, sub:sub.id, p:n, cnt:0, grade:c.grade};
      groups[k].cnt++;
      if(sub.room) roomDemand[sub.room]=(roomDemand[sub.room]||0)+n;
      const rest=n-(pinCount[c.id+'|'+sub.id]||0);
      for(let k2=0;k2<rest;k2++) ctx.units.push({cid:c.id, sub:sub.id, tea, room:sub.room||''});
    });
    ctx.demand[c.id]=tot;
  });
  // nhu cầu Ô của giáo viên: môn "luôn dồn lớp" chỉ chiếm 1 ô cho mỗi nhóm lớp cùng khối
  Object.keys(groups).forEach(k=>{
    const g=groups[k], sub=ctx.subject[g.sub];
    const canMg = cfg.rules.allowMerge && sub.merge && mergeAllowedGrade(sub, g.grade);
    // teaDemand: mức CHẮC CHẮN phải dạy (chỉ trừ phần "luôn dồn") — dùng để kiểm sức chứa
    const mm  = (canMg && sub.mergeMode==='always') ? Math.max(1,+sub.mergeMax||1) : 1;
    // teaDemandMin: mức THẤP NHẤT nếu tận dụng hết khả năng dồn lớp — dùng để đối chiếu định mức
    const mmA = canMg ? Math.max(1,+sub.mergeMax||1) : 1;
    teaDemand[g.tea]    = (teaDemand[g.tea]||0)    + g.p*Math.ceil(g.cnt/mm);
    teaDemandMin[g.tea] = (teaDemandMin[g.tea]||0) + g.p*Math.ceil(g.cnt/mmA);
  });
  ctx.teaDemand=teaDemand; ctx.teaDemandMin=teaDemandMin; ctx.roomDemand=roomDemand;

  // N30 — dữ liệu phụ trợ
  ctx.teaLessons={};
  st.teachers.forEach(t=>ctx.teaLessons[t.id]=0);
  st.classes.forEach(c=>st.subjects.forEach(sub=>{
    const n=+(sub.periods[c.grade]||0); if(!n) return;
    const tea=ctx.assign[c.id+'|'+sub.id]; if(!tea) return;
    ctx.teaLessons[tea]=(ctx.teaLessons[tea]||0)+n;
  }));

  /* buổi / ngày nghỉ — làm SAU khi biết nhu cầu, TRƯỚC khi tính độ khó */
  ctx.offInfo=assignTimeOff(ctx, offJitter);

  /* N30 — phân buổi lên lớp (làm sau ngày nghỉ, trước khi tính độ khó) */
  ctx.sessKey = slots.map(s2=>s2.day+s2.session);
  computeUsable(ctx);
  ctx.needOf={};
  st.teachers.forEach(t=>{ ctx.needOf[t.id]={}; cfg.days.forEach(d=>{ ctx.needOf[t.id][d+'S']=minFor(ctx,t,'S',d); ctx.needOf[t.id][d+'C']=minFor(ctx,t,'C',d); }); });
  ctx.planInfo = assignSessionPlan(ctx, offJitter);

  const N=slots.length;
  ctx.units.forEach(u=>{
    const sub=ctx.subject[u.sub], tea=ctx.teacher[u.tea];
    const avail=tea?capacityOf(ctx,tea):N;
    let d=(teaDemand[u.tea]||0)/Math.max(1,avail)*140;
    if(u.room){ const r=ctx.room[u.room]; d+=(roomDemand[u.room]||0)/Math.max(1,N*(r?r.cap:1))*160; }
    if(sub.prefSession!=='any') d+=18;
    if(tea && tea.sessions!=='both') d+=45;
    // môn "luôn dồn lớp" xếp sớm để còn chỗ ghép bạn cùng khối
    if(cfg.rules.allowMerge && sub.merge && sub.mergeMode==='always') d+=70;
    d+=(+sub.early||0)*6;
    if(sub.who!=='homeroom') d+=25;
    u.diff=d;
  });
  return ctx;
}

/* ---------- Tiền kiểm ---------- */
function preflight(st){
  const ctx=buildContext(st);
  const out=[], N=ctx.slots.length;
  const mSlots=ctx.cfg.days.reduce((a,d)=>a+(ctx.daySessIdx[d+'S']||[]).length,0);
  const aSlots=N-mSlots;

  st.subjects.forEach(sub=>{
    const need=st.classes.reduce((a,c)=>a+(+(sub.periods[c.grade]||0)),0);
    if(!need) return;
    if(sub.who==='homeroom'){
      const miss=st.classes.filter(c=>+(sub.periods[c.grade]||0)>0 &&
        !((ctx.teacher[c.homeroom]||{}).subjects||[]).includes(sub.id));
      if(miss.length) out.push({level:'err', msg:`Môn "${sub.name}": GVCN của lớp ${miss.map(c=>c.name).join(', ')} chưa được phân công môn này — thêm mã "${sub.id}" vào cột Môn phụ trách.`});
      return;
    }
    const kind=sub.who==='session2'?'BUOI2':'BOMON';
    const pool=st.teachers.filter(t=>(t.subjects||[]).includes(sub.id) && t.kind!=='GVCN');
    if(!pool.length){
      out.push({level:'err', msg:`Môn "${sub.name}" cần ${need} tiết nhưng chưa có ${KIND_NAME[kind]} nào được phân công — thêm mã "${sub.id}" vào cột Môn phụ trách.`});
      return;
    }
    // kiểm tra từng khối sau khi áp giới hạn khối trong ghi chú
    const bad=[];
    st.classes.forEach(c=>{
      if(!+(sub.periods[c.grade]||0)) return;
      if(ctx.cfg.rules.gradeLimit===false || pool.some(t=>teacherFitsGrade(t,sub.id,c.grade))) return;
      const hr=ctx.teacher[c.homeroom];
      if(hr && (hr.subjects||[]).includes(sub.id)) return;   // GVCN đỡ được
      bad.push(c.name);
    });
    if(bad.length) out.push({level:'err', msg:`Môn "${sub.name}" lớp ${bad.join(', ')}: không giáo viên nào được phép dạy khối đó (do giới hạn khối) và GVCN cũng không có môn này.`});
  });
  st.classes.forEach(c=>{ if(!ctx.teacher[c.homeroom]) out.push({level:'err', msg:`Lớp ${c.name} chưa có giáo viên chủ nhiệm hợp lệ.`}); });

  // môn có số tiết/tuần vượt quá (số ngày × giới hạn tiết mỗi ngày)
  st.subjects.forEach(sub=>{
    const md=Math.max(1,+sub.maxDay||1), roof=ctx.cfg.days.length*md;
    const bad=st.classes.filter(c=>+(sub.periods[c.grade]||0) > roof);
    if(bad.length) out.push({level:'err', msg:`Môn "${sub.name}" giới hạn ${md} tiết/ngày × ${ctx.cfg.days.length} ngày = tối đa ${roof} tiết/tuần, nhưng lớp ${bad.map(c=>c.name).join(', ')} cần ${+(sub.periods[bad[0].grade]||0)} tiết — tăng cột «Max/ngày» của môn này.`});
  });

  st.classes.forEach(c=>{
    const blocked=ctx.blocked[c.id].size, cap=N-blocked, need=ctx.demand[c.id];
    if(need>cap) out.push({level:'err', msg:`Lớp ${c.name}: cần ${need} tiết nhưng chỉ còn ${cap} ô khả dụng — giảm phân phối chương trình hoặc tăng số tiết/ngày.`});
    else if(need===cap) out.push({level:'warn', msg:`Lớp ${c.name}: kín 100% (${need}/${cap} ô) — không còn dư địa.`});
    else out.push({level:'ok', msg:`Lớp ${c.name}: ${need}/${cap} tiết, còn ${cap-need} ô trống.`});

    // cơ cấu sáng / chiều
    let s2=0, hr=0;
    st.subjects.forEach(sub=>{
      const n=+(sub.periods[c.grade]||0);
      if(sub.who==='session2') s2+=n;
      if(sub.who==='homeroom') hr+=n;
    });
    const t=ctx.teacher[c.homeroom];
    const hrCap=mSlots + (ctx.cfg.rules.gvcnAfternoonCap && t && t.maxAfternoons>0
                          ? t.maxAfternoons*ctx.cfg.afternoonPeriods : aSlots);
    if(s2>aSlots) out.push({level:'err', msg:`Lớp ${c.name}: ${s2} tiết buổi 2 nhưng chỉ có ${aSlots} ô buổi chiều.`});
    if(hr>hrCap) out.push({level:'err', msg:`Lớp ${c.name}: GVCN phải dạy ${hr} tiết nhưng chỉ được đứng lớp tối đa ${hrCap} ô (${mSlots} ô sáng + tối đa ${t?t.maxAfternoons:0} buổi chiều) — nới giới hạn buổi chiều hoặc chuyển bớt môn sang GV buổi 2.`});
  });

  if(ctx.cfg.rules.gvcnFirstPeriod && ctx.cfg.rules.minSessionLoad){
    const mornDays=ctx.cfg.days.filter(d=>(ctx.daySessIdx[d+'S']||[]).length).length;
    st.classes.forEach(c=>{
      const t=ctx.teacher[c.homeroom]; if(!t) return;
      const K=Math.max(1,+ctx.cfg.gvcnFirstPeriods||1);
      const floor=ctx.cfg.days.reduce((a,d)=>a+Math.max(K,minFor(ctx,t,'S',d)),0);
      const dem=ctx.teaDemand[t.id]||0;
      if(dem<floor) out.push({level:'err', msg:`GVCN ${t.name} (lớp ${c.name}) chỉ có ${dem} tiết/tuần, nhưng phải đón lớp cả ${mornDays} buổi sáng × tổng tối thiểu ${floor} tiết. Cần giao thêm ${floor-dem} tiết cho GVCN hoặc hạ mức tối thiểu buổi sáng.`});
    });
  }

  const minAny = ctx.cfg.rules.minSessionLoad
    ? Math.min(+ctx.cfg.minMorning||0, +ctx.cfg.minAfternoon||0) : 0;
  st.teachers.forEach(t=>{
    const need=ctx.teaDemand[t.id]||0;
    const needMin=ctx.teaDemandMin[t.id]!=null?ctx.teaDemandMin[t.id]:need;
    const cap=capacityOf(ctx,t);
    if(minAny>1 && need>0 && need<minAny)
      out.push({level:'err', msg:`GV ${t.name} chỉ có ${need} tiết/tuần, không đủ lập một buổi lên lớp tối thiểu (${ctx.cfg.minMorning} tiết sáng / ${ctx.cfg.minAfternoon} tiết chiều) — phân công thêm môn hoặc tắt quy định này.`});
    const off=ctx.offInfo[t.id];
    const offTxt=off?(off.ok?(off.none?'':' • '+off.label):' • ⚠ '+off.label):'';
    if(off && !off.ok) out.push({level:'warn', msg:`GV ${t.name}: chưa bố trí được buổi/ngày nghỉ — lịch quá kín.`});
    const rng = needMin!==need ? `${needMin}–${need}` : String(need);
    if(needMin>cap) out.push({level:'err', msg:`GV ${t.name}: ${rng} tiết > ${cap} ô khả dụng${offTxt} — bất khả thi.`});
    else if(needMin>t.maxWeek) out.push({level:'warn', msg:`GV ${t.name}: ${rng} tiết/tuần vượt định mức ${t.maxWeek} (thừa ít nhất ${needMin-t.maxWeek} tiết)${offTxt}.`});
    else if(need>t.maxWeek) out.push({level:'ok', msg:`GV ${t.name} (${KIND_NAME[t.kind]||''}): ${rng} tiết tuỳ mức dồn lớp — dồn đủ thì còn ${needMin}/${t.maxWeek}, trong định mức${offTxt}.`});
    else if(need>0) out.push({level:'ok', msg:`GV ${t.name} (${KIND_NAME[t.kind]||''}): ${need}/${t.maxWeek} tiết, sức chứa ${cap} ô${offTxt}.`});
    else out.push({level:'warn', msg:`GV ${t.name}: chưa được phân công tiết nào.`});
  });

  st.rooms.forEach(r=>{
    const need=ctx.roomDemand[r.id]||0, cap=N*r.cap;
    if(need>cap) out.push({level:'err', msg:`${r.name}: cần ${need} lượt > sức chứa ${cap}.`});
    else if(need>cap*0.8) out.push({level:'warn', msg:`${r.name}: dùng ${need}/${cap} lượt (>80%) — rất căng.`});
    else if(need>0) out.push({level:'ok', msg:`${r.name}: ${need}/${cap} lượt.`});
  });
  return {items:out, ctx};
}

/* ---------- Chạy ---------- */
function run(st, log){
  const t0=performance.now();
  const OUTER=Math.max(1, +st.config.outerTries || 5);
  const R=Math.max(1,+st.config.restarts||20);
  let best=null, bestCtx=null, bestV=1e9, firstV=null;

  for(let a=0; a<OUTER; a++){
    const ctx=buildContext(st, a===0?log:null, a===0?0:80);
    if(a===0){
      const mS=ctx.cfg.days.reduce((x,d)=>x+(ctx.daySessIdx[d+'S']||[]).length,0);
      const offTxt=(ctx.cfg.offSessions||[]).map(k=>{const[d,ss]=k.split('-');return SESSION_NAME[ss]+' '+DAY_NAME[+d];}).join(', ');
      log(`Khung tuần: ${ctx.slots.length} ô/lớp (${mS} ô sáng + ${ctx.slots.length-mS} ô chiều)${offTxt?' — toàn trường nghỉ '+offTxt:''}.`);
      log(`Tổng số tiết cần xếp: ${ctx.units.length+ctx.fixedList.length} (${ctx.fixedList.length} tiết ghim cố định).`);
      const ok=Object.keys(ctx.offInfo).filter(k=>ctx.offInfo[k].ok&&!ctx.offInfo[k].none).length;
      if(ok) log(`Đã bố trí buổi/ngày nghỉ cho ${ok} giáo viên.`);
      Object.keys(ctx.offInfo).filter(k=>!ctx.offInfo[k].ok)
        .forEach(k=>log(`  ⚠ ${ctx.teacher[k].name}: chưa bố trí được buổi nghỉ (lịch quá kín).`));
    }
    let cur=null;
    const RR = a===0 ? R : Math.max(8, Math.round(R/2));
    for(let r=0;r<RR;r++){
      const sol=greedy(ctx, r===0?0:40);
      if(!cur || sol.unplaced.length<cur.unplaced.length ||
         (sol.unplaced.length===cur.unplaced.length && sol.cost<cur.cost)) cur=sol;
      if(cur.unplaced.length===0 && r>=6) break;
    }
    if(cur.unplaced.length){
      const got=placeLeftovers(ctx,cur,3);
      if(got && a===0) log(`Vét tiết còn kẹt bằng đẩy dây nhiều tầng: xếp thêm được ${got} tiết.`);
    }
    polish(ctx,cur,Math.max(0,+ctx.cfg.polish||0));
    if(cur.unplaced.length) placeLeftovers(ctx,cur,3);
    if(ctx.cfg.rules.minSessionLoad){
      repairMinSession(ctx,cur,80);
      polish(ctx,cur,Math.round(Math.max(0,+ctx.cfg.polish||0)/2));
      repairMinSession(ctx,cur,80);
    }
    const v=ctx.cfg.rules.minSessionLoad ? minViolations(ctx,cur).length : 0;
    if(firstV===null) firstV=v;
    const better = !best ||
      cur.unplaced.length<best.unplaced.length ||
      (cur.unplaced.length===best.unplaced.length && v<bestV) ||
      (cur.unplaced.length===best.unplaced.length && v===bestV && cur.cost<best.cost);
    if(better){ best=cur; bestCtx=ctx; bestV=v; }
    if(best.unplaced.length===0 && bestV===0) break;
    if(a===0 && (best.unplaced.length||bestV))
      log(`Lượt 1: ${best.unplaced.length} tiết chưa xếp, ${bestV} buổi chưa đủ tiết tối thiểu — thử lại với phương án bố trí buổi nghỉ khác...`);
  }

  const ctx=bestCtx;
  log(`Kết quả tốt nhất: ${best.unplaced.length} tiết chưa xếp, điểm phạt ${Math.round(best.cost)}.`);
  if(ctx.cfg.rules.minSessionLoad){
    log(`Buổi lên lớp tối thiểu (${ctx.cfg.minMorning} tiết sáng / ${ctx.cfg.minAfternoon} tiết chiều): còn ${bestV} buổi chưa đạt.`);
    if(bestV) minViolations(ctx,best).forEach(v=>
      log(`   • ${ctx.teacher[v.tid].name}: ${SESSION_NAME[v.sess]} ${DAY_NAME[v.day]} chỉ có ${v.n}/${v.need} tiết.`));
  }
  let merges=0;
  st.teachers.forEach(t=>best.tBusy[t.id].forEach(b=>{ if(b&&b.n>1) merges+=b.n-1; }));
  if(merges) log(`Có ${merges} tiết được dồn lớp (ghép 2 lớp cùng khối, cùng môn).`);
  log(`Hoàn tất trong ${Math.round(performance.now()-t0)} ms.`);

  const result={
    slots:ctx.slots.map(s2=>({...s2})), grid:{}, assign:ctx.assign,
    offInfo:ctx.offInfo, unplaced:best.unplaced, merges, minLeft:bestV,
    needOf:ctx.needOf, usable:ctx.usable,
    cost:Math.round(best.cost), ms:Math.round(performance.now()-t0), generatedAt:''
  };
  st.classes.forEach(c=>result.grid[c.id]=best.grid[c.id].map(x=>x?{...x}:null));
  return result;
}

/* ---------- Nghiệm thu ---------- */
function verify(st, sol){
  const issues=[]; if(!sol) return issues;
  const cfg=st.config, slots=sol.slots;
  const subj={}; st.subjects.forEach(s=>subj[s.id]=s);
  const tea={};  st.teachers.forEach(t=>tea[t.id]=t);
  const room={}; st.rooms.forEach(r=>room[r.id]=r);
  const cls={};  st.classes.forEach(c=>cls[c.id]=c);
  const L=i=>slotLabel(slots[i]);
  const has=(tid,i)=>st.classes.some(c=>{const x=sol.grid[c.id][i]; return x&&x.tea===tid;});

  // H2 — GV trùng tiết (trừ trường hợp dồn lớp hợp lệ)
  slots.forEach((s,i)=>{
    const seen={};
    st.classes.forEach(c=>{ const cell=sol.grid[c.id][i]; if(cell) (seen[cell.tea]=seen[cell.tea]||[]).push({c,cell}); });
    Object.keys(seen).forEach(t=>{
      const g=seen[t]; if(g.length<2) return;
      const sub=subj[g[0].cell.sub];
      const sameSub=g.every(x=>x.cell.sub===g[0].cell.sub);
      const sameGrade=g.every(x=>+x.c.grade===+g[0].c.grade);
      const gOk = !sub || !sub.mergeGrades || !sub.mergeGrades.length
                  || sub.mergeGrades.map(Number).indexOf(+g[0].c.grade)>=0;
      const ok=cfg.rules.allowMerge && sub && sub.merge && sameSub && sameGrade && gOk
               && g.length<=Math.max(1,+sub.mergeMax||1);
      if(!ok) issues.push({level:'err',code:'H2',
        msg:`GV ${tea[t]?tea[t].name:t} bị xếp ${g.length} lớp cùng lúc (${g.map(x=>x.c.name).join(', ')}) tại ${L(i)} — không đủ điều kiện dồn lớp.`});
    });
  });
  // H3 — quá tải phòng (nhóm dồn lớp tính là 1 lượt)
  slots.forEach((s,i)=>{
    const use={};
    st.classes.forEach(c=>{ const cell=sol.grid[c.id][i]; if(cell&&cell.room) (use[cell.room]=use[cell.room]||new Map()).set(cell.tea,(use[cell.room].get(cell.tea)||[]).concat(c.name)); });
    Object.keys(use).forEach(r=>{
      const n=use[r].size, cap=room[r]?room[r].cap:1;
      if(n>cap) issues.push({level:'err',code:'H3',
        msg:`${room[r]?room[r].name:r} quá tải tại ${L(i)}: ${n} nhóm / sức chứa ${cap}.`});
    });
  });
  // H4 — lịch bận
  st.teachers.forEach(t=>{
    new Set(t.busy||[]).forEach(k=>{
      const i=slots.findIndex(s=>s.key===k); if(i<0) return;
      st.classes.forEach(c=>{
        const cell=sol.grid[c.id][i];
        if(cell&&cell.tea===t.id) issues.push({level:'err',code:'H4',
          msg:`GV ${t.name} được xếp dạy lớp ${c.name} vào ô đã đăng ký bận (${L(i)}).`});
      });
    });
  });
  // H5 — đủ số tiết
  st.classes.forEach(c=>{
    const cnt={};
    sol.grid[c.id].forEach(cell=>{ if(cell) cnt[cell.sub]=(cnt[cell.sub]||0)+1; });
    st.subjects.forEach(s=>{
      const need=+(s.periods[c.grade]||0), got=cnt[s.id]||0;
      if(need!==got) issues.push({level:got<need?'err':'warn', code:'H5',
        msg:`Lớp ${c.name} — ${s.name}: xếp ${got}/${need} tiết${got<need?' (THIẾU '+(need-got)+')':' (THỪA)'}.`});
    });
  });
  // H6 — tiết/ngày của GV
  st.teachers.forEach(t=>cfg.days.forEach(d=>{
    let n=0;
    slots.forEach((s,i)=>{ if(s.day===d && has(t.id,i)) n++; });
    if(n>(t.maxDay||7)) issues.push({level:'warn',code:'H6',
      msg:`GV ${t.name} dạy ${n} tiết ${DAY_NAME[d]} (giới hạn ${t.maxDay}).`});
  }));
  // H8 — ô cấm
  (st.blocks||[]).forEach(b=>{
    const i=slots.findIndex(s=>s.key===b.slot); if(i<0) return;
    if(sol.grid[b.classId] && sol.grid[b.classId][i]) issues.push({level:'err',code:'H8',
      msg:`Lớp ${cls[b.classId]?cls[b.classId].name:b.classId} bị xếp tiết vào ô đã cấm (${L(i)}).`});
  });
  // H9 — buổi được phép đứng lớp
  st.teachers.forEach(t=>{
    if(t.sessions==='both'||!t.sessions) return;
    slots.forEach((s,i)=>{
      if(s.session!==t.sessions && has(t.id,i)) issues.push({level:'err',code:'H9',
        msg:`GV ${t.name} chỉ đứng lớp buổi ${SESSION_NAME[t.sessions]} nhưng bị xếp tiết ${L(i)}.`});
    });
  });
  // H10 — GVCN chỉ dạy tối đa N buổi chiều/tuần
  if(cfg.rules.gvcnAfternoonCap) st.teachers.forEach(t=>{
    if(!(t.maxAfternoons>0)) return;
    const days=cfg.days.filter(d=>slots.some((s,i)=>s.day===d&&s.session==='C'&&has(t.id,i)));
    if(days.length>t.maxAfternoons) issues.push({level:'err',code:'H10',
      msg:`GV ${t.name} dạy ${days.length} buổi chiều (${days.map(d=>DAY_SHORT[d]).join(', ')}) — vượt giới hạn ${t.maxAfternoons}.`});
  });
  // N26 — mọi GV phải có buổi / ngày nghỉ
  if(cfg.rules.teacherTimeOff) st.teachers.forEach(t=>{
    if((t.offMode||'none')==='none') return;
    if(!slots.some((s,i)=>has(t.id,i))) return;   // GV không có tiết nào thì bỏ qua
    if((t.offMode||'').includes('day')||t.offMode==='fixed'){
      const freeDay=cfg.days.find(d=>!slots.some((s,i)=>s.day===d&&has(t.id,i)));
      if(!freeDay) issues.push({level:'warn',code:'N26',
        msg:`GV ${t.name} (${KIND_NAME[t.kind]||''}) không có ngày nghỉ trọn vẹn nào trong tuần.`});
    } else {
      let free=null;
      cfg.days.forEach(d=>['S','C'].forEach(ss=>{
        if(free) return;
        const idxs=slots.map((s,i)=>({s,i})).filter(x=>x.s.day===d&&x.s.session===ss).map(x=>x.i);
        if(idxs.length && !idxs.some(i=>has(t.id,i))) free=`${SESSION_NAME[ss]} ${DAY_NAME[d]}`;
      }));
      if(!free) issues.push({level:'warn',code:'N26',
        msg:`GV ${t.name} (${KIND_NAME[t.kind]||''}) không có buổi nghỉ nào trong tuần.`});
    }
  });
  // H13 — tiết 1 buổi sáng phải do GVCN đứng lớp
  if(cfg.rules.gvcnFirstPeriod) st.classes.forEach(c=>{
    const blk=new Set((st.blocks||[]).filter(b=>b.classId===c.id).map(b=>b.slot));
    const pin=new Set((st.pins||[]).filter(x=>x.classId===c.id).map(x=>x.slot));
    const K=Math.max(1,+cfg.gvcnFirstPeriods||1);
    const head=new Set();
    cfg.days.forEach(d=>{
      slots.map((s3,i)=>({s3,i})).filter(x=>x.s3.day===d&&x.s3.session==='S'&&!blk.has(x.s3.key))
        .slice(0,K).forEach(x=>head.add(x.i));
    });
    slots.forEach((s2,i)=>{
      if(!head.has(i) || pin.has(s2.key)) return;
      const cell=sol.grid[c.id][i];
      if(!cell) issues.push({level:'err', code:'H13',
        msg:`Lớp ${c.name} trống tiết ${s2.period} sáng ${DAY_NAME[s2.day]} — ${Math.max(1,+cfg.gvcnFirstPeriods||1)} tiết đầu buổi sáng phải do GVCN dạy.`});
      else if(cell.tea!==c.homeroom) issues.push({level:'err', code:'H13',
        msg:`Lớp ${c.name} tiết ${s2.period} sáng ${DAY_NAME[s2.day]} do ${(tea[cell.tea]||{}).name||cell.tea} dạy — ${Math.max(1,+cfg.gvcnFirstPeriods||1)} tiết đầu buổi sáng phải do GVCN ${(tea[c.homeroom]||{}).name} dạy.`});
    });
  });
  // N31 — GVCN không được nghỉ buổi sáng
  if(cfg.rules.gvcnNoMorningOff) st.classes.forEach(c=>{
    const t=tea[c.homeroom]; if(!t) return;
    const blkM=new Set((st.blocks||[]).filter(b=>b.classId===c.id).map(b=>b.slot));
    cfg.days.forEach(d=>{
      const idxs=slots.map((s2,i)=>({s2,i}))
        .filter(x=>x.s2.day===d && x.s2.session==='S' && !blkM.has(x.s2.key)).map(x=>x.i);
      if(!idxs.length) return;
      if(!idxs.some(i=>has(t.id,i))) issues.push({level:'err', code:'N31',
        msg:`GVCN ${t.name} (lớp ${c.name}) nghỉ trọn buổi sáng ${DAY_NAME[d]} — GVCN phải có mặt mọi buổi sáng.`});
    });
  });

  // H15 — GVCN phải dạy liền mạch từ tiết 1 buổi sáng
  if(cfg.rules.gvcnMorningBlock) st.classes.forEach(c=>{
    cfg.days.forEach(d=>{
      const idxs=slots.map((s2,i)=>({s2,i})).filter(x=>x.s2.day===d&&x.s2.session==='S').map(x=>x.i);
      let seenOther=false;
      idxs.forEach((i,k)=>{
        const cell=sol.grid[c.id][i]; if(!cell) return;
        if(cell.tea===c.homeroom){
          if(seenOther) issues.push({level:'err', code:'H15',
            msg:`Lớp ${c.name} sáng ${DAY_NAME[d]}: GVCN dạy tiết ${k+1} nhưng đã có giáo viên khác dạy trước đó — GVCN phải dạy liền mạch từ tiết 1.`});
        } else seenOther=true;
      });
    });
  });

  // N30 — buổi lên lớp phải đủ số tiết tối thiểu
  if(cfg.rules.minSessionLoad) st.teachers.forEach(t=>{
    cfg.days.forEach(d=>['S','C'].forEach(ss=>{
      const idxs=slots.map((s2,i)=>({s2,i})).filter(x=>x.s2.day===d&&x.s2.session===ss).map(x=>x.i);
      if(!idxs.length) return;
      let need;
      if(sol.needOf && sol.needOf[t.id] && sol.needOf[t.id][d+ss]!=null) need=sol.needOf[t.id][d+ss];
      else{
        const gl = ss==='S' ? cfg.minMorning : cfg.minAfternoon;
        const ov = ss==='S' ? t.minMorning : t.minAfternoon;
        need = Math.max(0, +((ov===undefined||ov===null||ov==='')?gl:ov)||0);
      }
      const hit=idxs.map((i,k)=>has(t.id,i)?k:-1).filter(k=>k>=0);
      const n=hit.length;
      if(n>0 && n<need) issues.push({level:'err', code:'N30',
        msg:`GV ${t.name} chỉ dạy ${n} tiết buổi ${SESSION_NAME[ss]} ${DAY_NAME[d]} (tối thiểu ${need}) — đến trường dạy quá ít tiết rồi về.`});
      else if(cfg.rules.gvcnAdjacentMin && t.kind==='GVCN' && ss==='S' && n===2
              && (hit[1]-hit[0])!==1) issues.push({level:'err', code:'N32',
        msg:`GVCN ${t.name} dạy 2 tiết sáng ${DAY_NAME[d]} nhưng không liền kề (tiết ${hit[0]+1} và tiết ${hit[1]+1}) — phải dạy liền mạch rồi mới bàn giao lớp.`});
    }));
  });

  // S6 — tiết liên tục
  st.teachers.forEach(t=>cfg.days.forEach(d=>['S','C'].forEach(ss=>{
    const idxs=slots.map((s,i)=>({s,i})).filter(x=>x.s.day===d&&x.s.session===ss).map(x=>x.i);
    let run=0,mx=0;
    idxs.forEach(i=>{ if(has(t.id,i)){run++; if(run>mx)mx=run;} else run=0; });
    const lim=t.maxConsec||cfg.maxConsecutive;
    if(mx>lim) issues.push({level:'warn',code:'S6',
      msg:`GV ${t.name} dạy ${mx} tiết liên tục buổi ${SESSION_NAME[ss]} ${DAY_NAME[d]} (khuyến nghị ≤ ${lim}).`});
  })));
  // S8 — tiết trống giữa buổi của lớp (bỏ qua ô đã bị cấm)
  st.classes.forEach(c=>{
    const blkC=new Set((st.blocks||[]).filter(b=>b.classId===c.id).map(b=>b.slot));
    cfg.days.forEach(d=>['S','C'].forEach(ss=>{
      const idxs=slots.map((s,i)=>({s,i}))
        .filter(x=>x.s.day===d && x.s.session===ss && !blkC.has(x.s.key)).map(x=>x.i);
      let seen=false;
      for(let k=idxs.length-1;k>=0;k--){
        if(sol.grid[c.id][idxs[k]]) seen=true;
        else if(seen){ issues.push({level:'warn',code:'S8',
          msg:`Lớp ${c.name} có tiết trống giữa buổi ${SESSION_NAME[ss]} ${DAY_NAME[d]} (${L(idxs[k])}).`}); break; }
      }
    }));
  });
  (sol.unplaced||[]).forEach(u=>issues.push({level:'err',code:'N24',
    msg:`Chưa xếp được: lớp ${cls[u.cid]?cls[u.cid].name:u.cid} — ${subj[u.sub]?subj[u.sub].name:u.sub}. ${u.reason||''}`}));
  return issues;
}

return {buildSlots, slotLabel, offLabel, periodClock, buildContext, preflight, run, verify, assignTeachers, capacityOf, teacherFitsGrade, minViolations};
})();

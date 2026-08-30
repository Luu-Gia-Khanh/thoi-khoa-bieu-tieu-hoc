/* ===========================================================
   data.js — Dữ liệu mẫu & phân phối chương trình GDPT 2018
   Khung tuần: T2–T6, nghỉ chiều thứ Sáu  =>  5×4 sáng + 4×3 chiều = 32 ô
   =========================================================== */
const APP_KEY = 'tkb_tieuhoc_v2';
const DAY_NAME = {2:'Thứ Hai',3:'Thứ Ba',4:'Thứ Tư',5:'Thứ Năm',6:'Thứ Sáu',7:'Thứ Bảy'};
const DAY_SHORT = {2:'T2',3:'T3',4:'T4',5:'T5',6:'T6',7:'T7'};
const SESSION_NAME = {S:'Sáng', C:'Chiều'};

/* Ba nhóm giáo viên */
const KIND_NAME = {GVCN:'GV chủ nhiệm', BOMON:'GV bộ môn', BUOI2:'GV dạy buổi 2'};
/* Ba nhóm phụ trách môn học */
const WHO_NAME  = {homeroom:'GVCN', specialist:'GV bộ môn', session2:'GV buổi 2'};

/* --- Bản in / bản xuất Word & PDF ---------------------------
   Quyết định NHỮNG GÌ hiện lên tờ giấy, không đụng tới bản xem trên web.
   Sửa và xem trước ngay trong hộp thoại «Tuỳ chỉnh bản in» ở tab Xem & In.
------------------------------------------------------------ */
function defaultExportCfg(){
  return {
    /* --- nội dung trong mỗi ô tiết --- */
    showSubject:true,  subjectName:'short',   // 'short' = Tiếng Việt | 'full' = tên đầy đủ
    showTeacher:true,  teacherName:'short',   // 'short' = N. Thị Lan | 'full' = Nguyễn Thị Lan
    showRoom:true,     showMerge:true,
    showEmpty:true,    textEmpty:'—',         // chữ in ở ô trống

    /* --- đầu mỗi trang --- */
    showDept:false,    tplDept:'PHÒNG GD&ĐT ……………',
    showSchool:true,   tplSchool:'{gt}',
    showTitle:true,
    tplTitleClass:'THỜI KHOÁ BIỂU LỚP {gt}',
    tplTitleTeacher:'THỜI KHOÁ BIỂU GIÁO VIÊN',
    tplTitleRoom:'LỊCH SỬ DỤNG PHÒNG — {gt}',
    tplTitleMaster:'BẢNG TỔNG HỢP THỜI KHOÁ BIỂU TOÀN TRƯỜNG',
    showYear:true,     tplYear:'Năm học {gt}',
    showSemester:true, tplSemester:'{gt}',
    showFrom:true,     tplFrom:'Áp dụng từ {gt}',
    sepMeta:' • ',                             // dấu ngăn giữa các mục cùng dòng

    /* --- dòng phụ dưới tiêu đề --- */
    showHomeroom:true,  tplHomeroom:'Giáo viên chủ nhiệm: {gt}',
    showSize:true,      tplSize:'Sĩ số: {gt}',
    showClassNote:true, tplClassNote:'{gt}',
    showTeaName:true,   tplTeaName:'{gt}',
    showTeaKind:true,   tplTeaKind:'{gt}',
    showTeaRole:true,   tplTeaRole:'{gt}',
    showTeaOff:true,    tplTeaOff:'{gt}',
    showTeaNote:true,   tplTeaNote:'{gt}',
    showRoomCap:true,   tplRoomCap:'Sức chứa đồng thời: {gt} lớp',
    showTeaTotal:true,  tplTeaTotal:'Tổng số tiết/tuần: {gt}',
    showTeaAft:true,    tplTeaAft:'Số buổi chiều đứng lớp: {gt}',

    /* --- bảng --- */
    textPeriodCol:'Tiết', textMorning:'Sáng', textAfternoon:'Chiều',
    tplRowHead:'{buoi} {tiet}',
    dayStyle:'full',                           // 'full' Thứ Hai | 'short' T2 | 'upper' THỨ HAI
    showClock:true,  mono:false,
    fontScale:100,                             // 70–130 %
    orientation:'landscape',                   // 'landscape' | 'portrait'
    rowHeight:0,                               // chiều cao tối thiểu mỗi dòng, mm (0 = tự động)
    showLegend:true,

    /* --- cuối mỗi trang --- */
    showNote:false,     textNote:'',            noteAlign:'left',
    showPlaceDate:true, textPlaceDate:'…………, ngày …… tháng …… năm ………', placeAlign:'right',
    /* Ba cột ký cố định Trái – Giữa – Phải. Cột để trống vẫn giữ chỗ,
       nên xoá bớt chữ ký thì các chữ ký còn lại KHÔNG bị dồn vào giữa. */
    showSign:true,
    signLeft:'GIÁO VIÊN CHỦ NHIỆM',
    signCenter:'TỔ TRƯỞNG CHUYÊN MÔN',
    signRight:'HIỆU TRƯỞNG',
    showSignHint:false, textSignHint:'(Ký, ghi rõ họ tên)',
    signGap:22                                 // khoảng trống chừa để ký, mm
  };
}

function defaultConfig(){
  return {
    schoolName:'TRƯỜNG TIỂU HỌC HOA SEN',
    schoolYear:'2025 - 2026',
    semester:'Học kỳ I',
    appliedFrom:'08/09/2025',
    days:[2,3,4,5,6],
    morningPeriods:4,
    afternoonPeriods:3,
    offSessions:['6-C'],          // N25 — buổi nghỉ của toàn trường (chiều thứ Sáu)
    morningStart:'07:30',
    afternoonStart:'13:45',
    periodMinutes:35,
    breakMinutes:5,
    longBreakAfter:2,
    longBreakMinutes:20,
    maxConsecutive:4,
    minMorning:2,                 // N30 — đã lên lớp buổi sáng thì tối thiểu 2 tiết
    minAfternoon:2,               // N30 — đã lên lớp buổi chiều thì tối thiểu 2 tiết
    minSessionSlack:0,            // độ nới của ràng buộc N30 (0 = chặt tuyệt đối)
    gvcnFirstPeriods:2,           // H13 — số tiết ĐẦU buổi sáng dành riêng cho GVCN
    restarts:60,
    outerTries:5,                 // số phương án bố trí buổi/ngày nghỉ được thử
    polish:8000,
    exportCfg: defaultExportCfg(),
    weights:{
      prefSession:12,   // đúng buổi ưu tiên của môn
      prefEarly:9,      // môn khó vào tiết sớm
      spread:16,        // rải đều môn trong tuần
      adjacentSame:11,  // tránh 2 tiết cùng môn liền kề
      teacherGap:7,     // tiết trống xen kẽ của GV
      teacherConsec:9,  // chuỗi tiết liên tục quá dài
      teacherBalance:5, // cân bằng tiết/ngày của GV
      peSafety:14,      // an toàn giờ Thể chất
      classTail:20,     // dồn tiết trống về cuối buổi
      mergeUse:25,      // hạn chế ghép lớp — chỉ dùng khi cần
      minSession:34     // buổi lên lớp phải đủ số tiết tối thiểu
    },
    rules:{
      coreMorning:true, spreadWeek:true, allowDouble:true, peSafety:true,
      limitConsec:true, balanceDay:true, fixedCeremony:true, specialistFirst:true,
      minTeacherGap:true, tailFree:true,
      teacherTimeOff:true,      // N26 — mọi GV đều có buổi/ngày nghỉ
      gvcnAfternoonCap:true,    // N27 — GVCN chỉ dạy tối đa 2 buổi chiều/tuần
      allowMerge:true,          // N28 — cho phép dồn lớp (Tiếng Anh)
      gradeLimit:true,          // N29 — áp dụng giới hạn khối của từng giáo viên
      minSessionLoad:true,      // N30 — không để GV đến trường chỉ dạy 1 tiết rồi về
      gvcnSessionPlan:false,    // (thử nghiệm) dồn GVCN vào ít buổi sáng
      gvcnFirstPeriod:true,     // H13 — GVCN đón lớp tiết 1 mỗi buổi sáng
      gvcnNoMorningOff:true,    // N31 — GVCN không được nghỉ buổi sáng
      gvcnAdjacentMin:true,     // N32 — GVCN dạy đúng 2 tiết sáng thì 2 tiết phải liền kề
      gvcnMorningBlock:false    // H15 — (tuỳ chọn) GVCN dạy liền mạch trọn buổi sáng
    }
  };
}

/* --- Môn học -------------------------------------------------
   who: 'homeroom' (GVCN) | 'specialist' (GV bộ môn) | 'session2' (GV buổi 2)
   merge/mergeMax: cho phép dồn nhiều lớp CÙNG KHỐI vào một tiết
------------------------------------------------------------ */
function defaultSubjects(){
  return [
 {id:'TV',   name:'Tiếng Việt',            short:'Tiếng Việt', color:'#dbe8ff', who:'homeroom',  room:'',     prefSession:'S',  early:3, double:true,  maxDay:3, fixed:'', merge:false, mergeMax:1, periods:{1:12,2:10,3:7,4:7,5:7}},
 {id:'TOAN', name:'Toán',                  short:'Toán',       color:'#ffe3d6', who:'homeroom',  room:'',     prefSession:'S',  early:3, double:false, maxDay:2, fixed:'', merge:false, mergeMax:1, periods:{1:3,2:5,3:5,4:5,5:5}},
 {id:'TA',   name:'Tiếng Anh',             short:'T.Anh',      color:'#e2f7e6', who:'specialist',room:'',     prefSession:'any',early:2, double:false, maxDay:2, fixed:'', merge:true,  mergeMax:2, periods:{1:2,2:2,3:4,4:4,5:4}},
 {id:'DD',   name:'Đạo đức',               short:'Đạo đức',    color:'#f6e6ff', who:'homeroom',  room:'',     prefSession:'any',early:1, double:false, maxDay:1, fixed:'', merge:false, mergeMax:1, periods:{1:1,2:1,3:1,4:1,5:1}},
 {id:'TNXH', name:'Tự nhiên và Xã hội',    short:'TN&XH',      color:'#dff5f7', who:'homeroom',  room:'',     prefSession:'any',early:1, double:false, maxDay:1, fixed:'', merge:false, mergeMax:1, periods:{1:2,2:2,3:2,4:0,5:0}},
 {id:'KH',   name:'Khoa học',              short:'Khoa học',   color:'#dff5f7', who:'homeroom',  room:'',     prefSession:'any',early:2, double:false, maxDay:1, fixed:'', merge:false, mergeMax:1, periods:{1:0,2:0,3:0,4:2,5:2}},
 {id:'LSDL', name:'Lịch sử và Địa lí',     short:'Sử & Địa',   color:'#fdf0cf', who:'homeroom',  room:'',     prefSession:'any',early:2, double:false, maxDay:1, fixed:'', merge:false, mergeMax:1, periods:{1:0,2:0,3:0,4:2,5:2}},
 {id:'TIN',  name:'Tin học',               short:'Tin học',    color:'#e0e7ff', who:'specialist',room:'PTIN', prefSession:'any',early:1, double:false, maxDay:1, fixed:'', merge:false, mergeMax:1, periods:{1:0,2:0,3:1,4:1,5:1}},
 {id:'CN',   name:'Công nghệ',             short:'Công nghệ',  color:'#efe7dd', who:'homeroom',  room:'',     prefSession:'any',early:1, double:false, maxDay:1, fixed:'', merge:false, mergeMax:1, periods:{1:0,2:0,3:1,4:1,5:1}},
 {id:'GDTC', name:'Giáo dục thể chất',     short:'Thể chất',   color:'#ffe9f0', who:'specialist',room:'SAN',  prefSession:'any',early:0, double:false, maxDay:1, fixed:'', merge:false, mergeMax:1, periods:{1:2,2:2,3:2,4:2,5:2}},
 {id:'AN',   name:'Âm nhạc',               short:'Âm nhạc',    color:'#fff2cc', who:'specialist',room:'PAN',  prefSession:'any',early:0, double:false, maxDay:1, fixed:'', merge:false, mergeMax:1, periods:{1:1,2:1,3:1,4:1,5:1}},
 {id:'MT',   name:'Mĩ thuật',              short:'Mĩ thuật',   color:'#ffe0e0', who:'specialist',room:'PMT',  prefSession:'any',early:0, double:false, maxDay:1, fixed:'', merge:false, mergeMax:1, periods:{1:1,2:1,3:1,4:1,5:1}},
 {id:'CC',   name:'Chào cờ',               short:'Chào cờ',    color:'#ffd9d9', who:'homeroom',  room:'',     prefSession:'S',  early:0, double:false, maxDay:1, fixed:'start', merge:false, mergeMax:1, periods:{1:1,2:1,3:1,4:1,5:1}},
 {id:'HDTN', name:'Hoạt động trải nghiệm', short:'HĐ trải ngh.',color:'#e6f0d9',who:'homeroom',  room:'',     prefSession:'any',early:0, double:false, maxDay:1, fixed:'', merge:false, mergeMax:1, periods:{1:1,2:1,3:1,4:1,5:1}},
 {id:'SHL',  name:'Sinh hoạt lớp',         short:'SH lớp',     color:'#ffd9d9', who:'homeroom',  room:'',     prefSession:'any',early:0, double:false, maxDay:1, fixed:'end',   merge:false, mergeMax:1, periods:{1:1,2:1,3:1,4:1,5:1}},
 {id:'OTV',  name:'Phụ đạo Tiếng Việt',   short:'Phụ đạo TV',  color:'#eef3ff', who:'session2',  room:'',     prefSession:'C',  early:0, double:true,  maxDay:2, fixed:'', merge:false, mergeMax:1, periods:{1:2,2:2,3:1,4:0,5:0}},
 {id:'OT',   name:'Phụ đạo Toán',         short:'Phụ đạo Toán',    color:'#fff0e8', who:'session2',  room:'',     prefSession:'C',  early:0, double:true,  maxDay:2, fixed:'', merge:false, mergeMax:1, periods:{1:0,2:0,3:0,4:0,5:0}},
 {id:'THV',  name:'Đọc sách thư viện',     short:'Thư viện',   color:'#e8f4ea', who:'session2',  room:'THV',  prefSession:'C',  early:0, double:false, maxDay:1, fixed:'', merge:false, mergeMax:1, periods:{1:1,2:1,3:1,4:0,5:0}}
  ];
}

function defaultRooms(){
  return [
    {id:'PTIN', name:'Phòng Tin học',            cap:1},
    {id:'PAN',  name:'Phòng Âm nhạc',            cap:1},
    {id:'PMT',  name:'Phòng Mĩ thuật',           cap:1},
    {id:'SAN',  name:'Sân trường / Nhà đa năng', cap:2},
    {id:'THV',  name:'Thư viện',                 cap:1}
  ];
}

function defaultClasses(){
  const out=[]; let i=1;
  [1,2,3,4,5].forEach(g=>['A','B'].forEach(s=>{
    out.push({id:'L'+g+s, name:g+s, grade:g, size:34, homeroom:'GV'+String(i).padStart(2,'0'), note:''});
    i++;
  }));
  return out;
}

/* offMode: 'auto-session' (nghỉ 1 buổi) | 'auto-day' (nghỉ 1 ngày) | 'fixed' | 'none'
   offFixed: '3-C' (buổi) hoặc '4' (ngày) — chỉ dùng khi offMode='fixed'
   sessions: 'both' | 'S' | 'C' — buổi được phép đứng lớp
   maxAfternoons: số buổi CHIỀU tối đa được dạy trong tuần (0 = không giới hạn) */
function defaultTeachers(){
  const hr = ['Nguyễn Thị Lan','Trần Thị Mai','Lê Thị Hồng','Phạm Thị Thu','Hoàng Văn Nam',
              'Đỗ Thị Nga','Vũ Thị Hà','Bùi Văn Dũng','Ngô Thị Yến','Đặng Thị Kim'];
  const list = hr.map((n,i)=>({
    id:'GV'+String(i+1).padStart(2,'0'), name:n, role:'GVCN', kind:'GVCN',
    subjects:['TV','TOAN','DD','TNXH','KH','LSDL','CN','CC','HDTN','SHL'],
    sessions:'both', maxWeek:26, maxDay:7, maxConsec:4, maxAfternoons:2,
    offMode:'auto-session', offFixed:'', busy:[], note:''
  }));

  const spec = [
    {id:'GV11', name:'Trịnh Minh Anh', role:'GV Tiếng Anh', subjects:['TA'],  maxWeek:23, note:''},
    {id:'GV12', name:'Lý Thu Trang',   role:'GV Tiếng Anh', subjects:['TA'],  maxWeek:20, note:'Nuôi con nhỏ dưới 12 tháng (N1)'},
    {id:'GV13', name:'Phan Quốc Việt', role:'GV Tin học',   subjects:['TIN'], maxWeek:23, note:'Sáng thứ Hai họp tổ CNTT (N12)'},
    {id:'GV14', name:'Hồ Thị Ngọc',    role:'GV Âm nhạc',   subjects:['AN'],  maxWeek:23, note:''},
    {id:'GV15', name:'Cao Văn Sơn',    role:'GV Mĩ thuật',  subjects:['MT'],  maxWeek:23, note:''},
    {id:'GV16', name:'Nguyễn Văn Hùng',role:'GV Thể chất',  subjects:['GDTC'],maxWeek:23, note:''},
    {id:'GV17', name:'Trương Thị Bích',role:'GV Thể chất',  subjects:['GDTC'],maxWeek:23, note:''}
  ].map(t=>({...t, kind:'BOMON', sessions:'both', maxDay:6, maxConsec:4, maxAfternoons:0,
             offMode:'auto-day', offFixed:'', busy:[]}));

  const s2 = [
    {id:'GV18', name:'Nguyễn Thu Hiền', role:'GV buổi 2'},
    {id:'GV19', name:'Trần Văn Khoa',   role:'GV buổi 2'},
    {id:'GV20', name:'Lê Thị Phương',   role:'GV buổi 2'}
  ].map(t=>({...t, kind:'BUOI2', subjects:['OTV','OT','THV'], sessions:'C',
             maxWeek:20, maxDay:3, maxConsec:3, maxAfternoons:0,
             offMode:'auto-day', offFixed:'', busy:[], note:'Chỉ đứng lớp buổi chiều'}));

  // Ngoại lệ mẫu
  spec.find(t=>t.id==='GV12').busy = ['2-S-1','3-S-1','4-S-1','5-S-1','6-S-1'];
  spec.find(t=>t.id==='GV13').busy = ['2-S-1','2-S-2','2-S-3','2-S-4'];
  return list.concat(spec, s2);
}

function defaultState(){
  return {
    config: defaultConfig(),
    subjects: defaultSubjects(),
    rooms: defaultRooms(),
    classes: defaultClasses(),
    teachers: defaultTeachers(),
    pins: [],
    blocks: [],
    solution: null
  };
}

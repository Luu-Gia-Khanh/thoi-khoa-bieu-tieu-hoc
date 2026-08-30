# PHẦN MỀM XẾP THỜI KHOÁ BIỂU TRƯỜNG TIỂU HỌC

Ứng dụng web chạy hoàn toàn ngoại tuyến (offline), không cần cài đặt, không cần internet.

## Cách chạy
Mở tệp `index.html` bằng trình duyệt (Chrome, Safari, Edge). Dữ liệu tự lưu vào trình duyệt;
dùng **Xuất dữ liệu** để sao lưu ra tệp `.json` và **Nhập dữ liệu** để phục hồi hoặc chuyển máy.

## Cấu trúc
```
ThoiKhoaBieu-TieuHoc/
├── index.html          Giao diện 11 tab
├── css/style.css       Giao diện + định dạng bản in A4
├── js/data.js          Chương trình GDPT 2018 + dữ liệu mẫu (10 lớp, 20 GV, 5 phòng)
├── js/scheduler.js     Bộ máy xếp lịch (ràng buộc cứng/mềm, tối ưu)
├── js/docx.js          Xuất tệp Word .docx chuẩn OOXML, không cần thư viện ngoài
└── js/app.js           Điều phối giao diện
```

---

# PHẦN I — KẾ HOẠCH XẾP THỜI KHOÁ BIỂU

## 1. Căn cứ
- **TT 32/2018/TT-BGDĐT** — Chương trình GDPT 2018 cấp Tiểu học.
- **TT 28/2020/TT-BGDĐT** — Điều lệ trường tiểu học: dạy 2 buổi/ngày, **không quá 7 tiết/ngày**.
- **TT 28/2009 & 15/2017** — Định mức: GVCN và GV bộ môn **23 tiết/tuần**, trừ giờ kiêm nhiệm.
- Kế hoạch giáo dục nhà trường đã được Phòng GD&ĐT phê duyệt.

## 2. Khung tuần & ba nhóm giáo viên

Trường học **thứ Hai → thứ Sáu, nghỉ chiều thứ Sáu**:
`5 buổi sáng × 4 tiết + 4 buổi chiều × 3 tiết = **32 ô/lớp/tuần**`.
Phân phối chương trình cân về **30 tiết/tuần**, dôi 2 ô làm dư địa.
Tiết **Sinh hoạt lớp** vì thế nằm ở **tiết 4 sáng thứ Sáu** (tiết cuối của buổi cuối tuần).

| Nhóm | Phụ trách | Buổi đứng lớp | Chế độ nghỉ |
|---|---|---|---|
| **GVCN** | Tiếng Việt, Toán, Đạo đức, TN&XH, Khoa học, Sử & Địa, Công nghệ, Chào cờ, HĐTN, Sinh hoạt lớp | Cả ngày, **tối đa 2 buổi chiều/tuần** | **Nghỉ 1 buổi** |
| **GV bộ môn** | Tiếng Anh, Tin học, Thể chất, Âm nhạc, Mĩ thuật | Cả ngày | **Nghỉ 1 ngày** (đổi được sang 1 buổi) |
| **GV buổi 2** | Phụ đạo Tiếng Việt, Phụ đạo Toán, Đọc sách thư viện | **Chỉ buổi chiều** | **Nghỉ 1 ngày** (đổi được sang 1 buổi) |

### Phân phối chương trình được cài sẵn (tiết/tuần)

| Môn học | Phụ trách | L1 | L2 | L3 | L4 | L5 |
|---|---|:--:|:--:|:--:|:--:|:--:|
| Tiếng Việt | GVCN | 12 | 10 | 7 | 7 | 7 |
| Toán | GVCN | 3 | 5 | 5 | 5 | 5 |
| Đạo đức | GVCN | 1 | 1 | 1 | 1 | 1 |
| Tự nhiên và Xã hội | GVCN | 2 | 2 | 2 | – | – |
| Khoa học | GVCN | – | – | – | 2 | 2 |
| Lịch sử và Địa lí | GVCN | – | – | – | 2 | 2 |
| Công nghệ | GVCN | – | – | 1 | 1 | 1 |
| Chào cờ | GVCN | 1 | 1 | 1 | 1 | 1 |
| Hoạt động trải nghiệm | GVCN | 1 | 1 | 1 | 1 | 1 |
| Sinh hoạt lớp | GVCN | 1 | 1 | 1 | 1 | 1 |
| *Cộng GVCN* | | *21* | *21* | *19* | *21* | *21* |
| Tiếng Anh | Bộ môn | 2\* | 2\* | 4 | 4 | 4 |
| Tin học | Bộ môn | – | – | 1 | 1 | 1 |
| Giáo dục thể chất | Bộ môn | 2 | 2 | 2 | 2 | 2 |
| Âm nhạc | Bộ môn | 1 | 1 | 1 | 1 | 1 |
| Mĩ thuật | Bộ môn | 1 | 1 | 1 | 1 | 1 |
| *Cộng bộ môn* | | *6* | *6* | *9* | *9* | *9* |
| Phụ đạo Tiếng Việt | Buổi 2 | 2 | 2 | 1 | – | – |
| Đọc sách thư viện | Buổi 2 | 1 | 1 | 1 | – | – |
| *Cộng buổi 2* | | *3* | *3* | *2* | *0* | *0* |
| **TỔNG** | | **30** | **30** | **30** | **30** | **30** |

\* Tiếng Anh lớp 1–2 là môn tự chọn — đặt về 0 nếu trường không tổ chức.

## 3. Quy trình 7 bước
1. **Thu thập dữ liệu** — lớp, sĩ số, phân công GV, phòng chức năng, lịch bận cố định.
2. **Cân đối định mức** — tính tổng cầu từng môn → chia GV → phát hiện quá tải *trước khi xếp*.
3. **Khoá tiết cố định** — Chào cờ (T2 tiết 1), Sinh hoạt lớp (T6 tiết cuối), tiết chuyên đề.
4. **Xếp tài nguyên khan hiếm** — Tin học → Âm nhạc/Mĩ thuật → Thể chất → Tiếng Anh → Thư viện.
5. **Lấp môn của GVCN** — Tiếng Việt/Toán vào khung giờ vàng còn lại, môn ít tiết rải đều.
6. **Tối ưu mềm** — giảm tiết trống GV, chuỗi tiết liên tục, lệch tải theo ngày.
7. **Duyệt – Công bố – Điều chỉnh** — tổ trưởng rà soát → Hiệu trưởng ký → niêm yết → phản hồi 3 ngày.

## 4. Ba tầng ràng buộc

### Tầng 1 — Ràng buộc cứng (vi phạm ⇒ TKB không hợp lệ)
| Mã | Nội dung |
|---|---|
| H1 | Một lớp tại một tiết chỉ học một môn |
| H2 | Một giáo viên tại một tiết chỉ dạy một lớp |
| H3 | Phòng chức năng không vượt sức chứa đồng thời |
| H4 | Không xếp vào ô giáo viên đã đăng ký bận |
| H5 | Đủ 100% số tiết theo phân phối chương trình |
| H6 | Không quá 7 tiết/ngày với lớp; đúng định mức tiết/ngày với GV |
| H7 | Tiết ghim đứng đúng vị trí đã khoá |
| H8 | Không xếp vào ô lớp đã bị khoá nghỉ |
| H9 | GV chỉ đứng lớp trong buổi được phép (GV buổi 2 chỉ dạy chiều) |
| H10 | GVCN không vượt quá số buổi chiều cho phép (mặc định 2/tuần) |
| H11 | GV chỉ dạy đúng những khối được phân công (cột *Giới hạn khối*) |
| H12 | Số tiết/tuần của môn ≤ số ngày học × giới hạn tiết mỗi ngày của môn |
| H13 | Tiết 1 mỗi buổi sáng dành riêng cho GVCN đón lớp |
| H14 | Mỗi lớp mỗi sáng chỉ nhường cho GV bộ môn (số tiết sáng − mức tối thiểu của GVCN) ô |

### Tầng 2 — Ràng buộc mềm (chấm điểm phạt, tối ưu để giảm)
| Mã | Nội dung | Lý do sư phạm |
|---|---|---|
| S1 | Toán, Tiếng Việt ưu tiên tiết 1–3 sáng | Đỉnh chú ý của HS tiểu học là 7h30–9h30 |
| S2 | Rải đều môn trong tuần | Bảo đảm nhịp lặp lại kiến thức |
| S3 | Cho phép tiết đôi Tiếng Việt lớp 1–2 | Trẻ mới học đọc–viết cần mạch liền |
| S4 | Không xếp Thể chất tiết 1 chiều / tiết cuối sáng | Ngay sau ăn trưa và giờ nắng gắt |
| S5 | Giảm tiết trống xen kẽ của GV | Tránh chờ vô ích |
| S6 | Không quá 4 tiết liên tục | Bảo vệ chất lượng tiết dạy |
| S7 | Cân bằng tiết/ngày của GV | Tránh ngày 7 tiết – ngày 1 tiết |
| S8 | Tiết trống của lớp dồn cuối buổi chiều | Không vỡ buổi, phụ huynh đón ổn định |
| S9 | Môn năng khiếu đặt sau tiết văn hoá nặng | Điều tiết trạng thái tâm lý |
| S10 | Hạn chế GV dạy 2 buổi tách rời trong ngày | Giảm số buổi di chuyển |

### Tầng 3 — 24 tình huống ngoại lệ và cách xử lý

| Mã | Tình huống | Thao tác trên phần mềm |
|---|---|---|
| N1 | GV nuôi con dưới 12 tháng | Nút *Cấm tiết 1 mỗi sáng* + *Cấm tiết cuối mỗi chiều*, hạ định mức |
| N2 | GV dạy liên trường | Đánh dấu bận trọn buổi ở trường bạn |
| N3 | GV đi học nâng chuẩn | Đánh dấu bận buổi học cố định |
| N4 | GV nghỉ thai sản / ốm dài ngày | Xoá GV hoặc đổi phân công môn sang GV dạy thay |
| N5 | Thiếu phòng Tin học | Đặt sức chứa = 1, hệ thống tự rải các lớp |
| N6 | Sân dùng chung | Đặt sức chứa = 2 (sân + nhà đa năng) |
| N7 | Lớp nghỉ một buổi | Khai báo *Ô cấm của lớp* |
| N8 | Lớp bán trú / không bán trú | Cấu hình số tiết chiều + ô cấm |
| N9 | Tiết chuyên đề, thao giảng | Ghim tiết cố định |
| N10 | Chào cờ đầu tuần | Bật *Ghim Chào cờ & Sinh hoạt lớp* |
| N11 | Sinh hoạt lớp cuối tuần | Như trên |
| N12 | Họp tổ chuyên môn | Đánh dấu bận cùng khung tiết cho cả tổ |
| N13 | Hội đồng sư phạm | Ô cấm cho toàn bộ lớp |
| N14 | Tuần kiểm tra định kỳ | Xuất JSON bản gốc, tạo bản riêng cho tuần thi |
| N15 | Nghỉ lễ, nghỉ bù | Bỏ ngày khỏi cấu hình tuần; tiền kiểm cảnh báo nếu không đủ chỗ |
| N16 | GV kiêm nhiệm | Hạ *Định mức/tuần* tương ứng |
| N17 | Môn tự chọn | Đặt số tiết theo khối, để 0 nếu không tổ chức |
| N18 | Câu lạc bộ, tăng cường chiều | Thêm môn mới, đặt *Buổi = Chiều* |
| N19 | HS khuyết tật học hoà nhập | Ghi chú ở lớp; ưu tiên môn hỗ trợ buổi sáng |
| N20 | GV lớn tuổi | Hạ *Max liên tục* xuống 3 cho riêng GV đó |
| N21 | GV xin nghỉ một buổi cố định | Đánh dấu bận; hệ thống báo ngay nếu bất khả thi |
| N22 | Hai GV cùng môn | Tự động chia lớp cân tải |
| N23 | Thêm lớp / tách lớp giữa kỳ | Thêm lớp và chạy lại |
| N24 | Không tìm được lời giải | Nhật ký liệt kê chính xác tiết chưa xếp + gợi ý nới ràng buộc |
| **N25** | **Toàn trường nghỉ 1 buổi cố định** | Cấu hình → *Buổi nghỉ của toàn trường* (mặc định **chiều thứ Sáu**); Sinh hoạt lớp tự dời về tiết cuối buổi còn học |
| **N26** | **Mọi GV đều có buổi/ngày nghỉ** | GVCN nghỉ 1 buổi, GV bộ môn & GV buổi 2 nghỉ 1 ngày — tự chọn và **rải đều**, hoặc chỉ định cứng ở cột *Chỉ định nghỉ* |
| **N27** | **GVCN chỉ dạy 1–2 buổi chiều** | Cột *Tối đa buổi chiều* trong tab Giáo viên (0 = không giới hạn) |
| **N28** | **Dồn 2 lớp vào 1 tiết** | Cột *Dồn lớp* của môn: **Không** / **Khi cần** (van xả cuối cùng) / **Luôn dồn** (chủ động ghép cả năm). Chỉ ghép **2 lớp cùng khối, cùng môn, cùng giáo viên** |
| **N30** | **Không đến trường dạy 1 tiết rồi về** | Cấu hình → *Tối thiểu tiết mỗi buổi sáng / chiều*. Mức này **tự co** theo số tiết thực sự dùng được của buổi đó |
| **N31** | **GVCN không nghỉ buổi sáng** | Buổi nghỉ của GVCN luôn là buổi chiều; GVCN đón lớp đầu buổi sáng |
| **N32** | **GVCN dạy 2 tiết sáng phải liền kề** | Không để GVCN dạy tiết 1 rồi chờ đến tiết 4. Cấu hình → *Số tiết đầu buổi sáng dành riêng cho GVCN*: chọn **2** để bảo đảm tuyệt đối |
| **N29** | **GV chỉ dạy một số khối** | Cột *Giới hạn khối*: `CN:3` (chỉ môn đó) hoặc `*:1,2` (mọi môn). Để trống = mọi khối. Khối không có GV bộ môn phù hợp sẽ **tự trả về GVCN** |

## 5. Thuật toán
1. **Phân công GV cân tải** — mỗi cặp (lớp, môn) gán cho GV có tải thấp nhất trong đúng nhóm phụ trách.
2. **Bố trí buổi/ngày nghỉ** cho từng GV, rải đều trong tuần, kiểm tra còn đủ chỗ dạy trước khi chốt.
3. **Ghim tiết cố định** (Chào cờ, Sinh hoạt lớp, tiết ghim tay).
3. **Dành sẵn ô trống** ở cuối buổi chiều đúng bằng phần dôi ra.
4. **Xếp tham lam theo độ khó giảm dần** — độ khó = áp lực tài nguyên (tiết cần / ô rảnh của GV và phòng).
5. **Đẩy chỗ 1 tầng** — khi bí, dời tiết đang chiếm chỗ sang ô khác thay vì bỏ cuộc.
6. **Khởi động lại ngẫu nhiên** nhiều lượt, giữ lời giải tốt nhất.
7. **Leo đồi tinh chỉnh** — hoán đổi hai ô cùng lớp, chỉ nhận khi điểm phạt giảm.
8. **Thử lại với phương án nghỉ khác** nếu vẫn còn tiết chưa xếp — một phương án nghỉ sai có thể khoá chết toàn bộ lời giải.

## 6. Kết quả kiểm thử

Dữ liệu mẫu: **10 lớp / 20 giáo viên (10 GVCN + 7 bộ môn + 3 buổi 2) / 5 phòng chức năng**.
Chạy 12 lần liên tiếp: **300/300 tiết được xếp, 0 lỗi ràng buộc cứng**, trung bình 531 ms.

| Kịch bản | Chưa xếp | Lỗi | Cảnh báo | Ghi chú |
|---|:--:|:--:|:--:|---|
| Mặc định (nghỉ chiều T6) | 0 | 0 | 0–2 | |
| Chỉ 1 GV Tiếng Anh, **bật dồn lớp** | 0 | 0 | 3 | 5 tiết ghép 2 lớp cùng khối |
| Chỉ 1 GV Tiếng Anh, **tắt dồn lớp** | 6 | 10 | 2 | Bất khả thi — báo đúng tiết thiếu |
| GV bộ môn nghỉ 1 **buổi** thay vì 1 ngày | 0 | 0 | 0 | |
| GV buổi 2 nghỉ 1 buổi | 0 | 0 | 1–2 | |
| Chỉ định cứng: GV Âm nhạc nghỉ thứ Năm | 0 | 0 | 0–1 | |
| GVCN chỉ được dạy **1** buổi chiều | 1 | 2 | 3 | Cực căng — cần nới hoặc thêm GV |
| Chỉ 2 GV buổi 2 | 0 | 0 | 0–1 | |
| Trường 20 lớp | 0 | 0 | 3 | ~1,3 giây |
| Nghỉ cả chiều T5 **và** chiều T6 | — | tiền kiểm chặn kèm số liệu | | 29 ô < 30 tiết |

Kiểm thử giao diện (jsdom): 10 tab, 4 chế độ xem, xuất CSV, phát hiện TKB lỗi thời,
hiển thị nhãn dồn lớp và lịch nghỉ — **đạt toàn bộ**.

---

# PHẦN II — HƯỚNG DẪN SỬ DỤNG

| Tab | Việc cần làm |
|---|---|
| **Kế hoạch** | Đọc quy trình, ràng buộc, danh mục ngoại lệ |
| **Cấu hình** | Tên trường, năm học, **học kỳ I / II / cả năm**, số ngày/tiết, giờ vào lớp, trọng số tối ưu |
| **Môn học** | Sửa phân phối chương trình theo từng khối; thêm/bớt môn |
| **Lớp học** | Danh sách lớp, khối, sĩ số, GVCN |
| **Giáo viên** | Họ tên, **nhóm** (GVCN / bộ môn / buổi 2), buổi được dạy, tối đa buổi chiều, chế độ nghỉ. Cột **Môn phụ trách** hiện dạng chip — bấm vào để mở bảng chọn môn và khối |
| **Phòng học** | Phòng chức năng và sức chứa đồng thời |
| **Ràng buộc** | Bật/tắt tiêu chí • ghim tiết • ô cấm • lịch bận từng GV |
| **Chạy xếp lịch** | Xem tiền kiểm → bấm chạy → đọc nhật ký → **bảng lịch nghỉ của GV** → thống kê định mức |
| **Xem & In** | TKB theo lớp / GV / phòng / bảng tổng hợp • **xuất Word (.docx), PDF, CSV** • **⚙ Tuỳ chỉnh bản in** (chọn nội dung in ra, xem trước đúng khổ giấy, lưu lại định dạng) • **kéo thả & khoá tiết** |
| **Kiểm tra** | Rà soát toàn bộ ràng buộc cứng và mềm trước khi trình ký |
| **Sao lưu & Lịch sử** | Ảnh chụp toàn bộ dữ liệu theo thời điểm — khôi phục bản cũ khi lỡ sửa hỏng, tải về máy dạng .json |

### Phân công môn cho giáo viên

Ở tab **Giáo viên**, cột *Môn phụ trách* hiện các môn dạng **chip màu**. Bấm vào ô để mở bảng chọn:

- Môn được chia sẵn theo ba nhóm: của GVCN, của GV bộ môn, của GV buổi 2.
- Có ô tìm kiếm; mỗi dòng ghi rõ mã môn, tổng số tiết toàn trường và các khối có học môn đó.
- Tick chọn môn, rồi bấm các nút số để chọn **khối được dạy** — bỏ bớt khối nếu giáo viên chỉ dạy một phần.
- Chip hiện hậu tố như `K2·3` khi môn đó bị giới hạn khối.
- Cảnh báo ⚠ nếu chọn môn không thuộc nhóm của giáo viên.

## Kéo thả & khoá tiết

1. Tab **Xem & In** → tick **«Bật kéo thả & khoá tiết»**.
2. **Kéo** một ô thả sang ô khác *trong cùng lớp* để hoán đổi hai tiết. **Bấm** vào ô để khoá / mở khoá.
3. Ô đã khoá hiện viền cam kèm 🔒 và sẽ được **giữ nguyên vị trí**.
4. Bấm **«Xếp lại theo phần đã kéo»** — phần mềm giữ các ô đã khoá rồi xếp lại toàn bộ lớp khác cho khớp.
5. Sang tab **Kiểm tra xung đột** để soát kết quả.

Chào cờ và Sinh hoạt lớp đã ghim cố định theo quy định nên không kéo được.

## Xuất Word / PDF

- **Xuất Word** tạo tệp **`.docx` chuẩn OOXML** (không phải HTML đổi đuôi), mở và **chỉnh sửa trực tiếp** trong Microsoft Word như tài liệu bình thường. Layout dựng từ đúng bảng đang xem trên web: giữ nguyên màu môn, khung viền, cỡ chữ, chú giải và các ô ký tên; mỗi lớp một trang.
- **Xuất PDF** mở hộp thoại in — chọn *Lưu thành PDF* và **bỏ chọn «Headers and footers»** để bản in không dính URL, ngày giờ và tên trình duyệt. Bản in đã bật `print-color-adjust: exact` nên **màu nền ô luôn được in**, không cần chỉnh gì thêm.
- Bản xuất đã tự bỏ dòng thông tin phần mềm (thời gian lập, điểm tối ưu).

### Tuỳ chỉnh bản in — nút **⚙ Tuỳ chỉnh bản in** ở tab Xem & In

Hộp thoại chia hai nửa: **bên trái là tuỳ chọn, bên phải là bản xem trước đúng khổ giấy thật**.
Sửa bên trái thấy đổi ngay bên phải. Bản xem trước, bản PDF và bản Word đều dựng từ cùng một
nguồn nên **xem sao thì in ra đúng vậy**.

**Mỗi mẩu chữ là một mục riêng** — có công tắc ẩn/hiện riêng và ô sửa chữ riêng, không gộp
chung. Trong ô sửa chữ, **`{gt}` là chỗ phần mềm điền giá trị thật**: đặt
`GVCN phụ trách: {gt}` thì in ra `GVCN phụ trách: Nguyễn Thị Lan`.

| Nhóm | Từng mục chỉnh riêng được |
|---|---|
| **Đầu trang** | Cơ quan chủ quản • tên trường • **4 mẫu tiêu đề** (bản theo lớp / giáo viên / phòng / tổng hợp) • năm học • học kỳ • ngày áp dụng • dấu ngăn giữa các mục |
| **Dòng phụ — theo lớp** | Giáo viên chủ nhiệm • sĩ số • ghi chú của lớp |
| **Dòng phụ — theo giáo viên** | Họ tên • nhóm giáo viên • nhiệm vụ • buổi nghỉ • ghi chú • tổng tiết/tuần • số buổi chiều |
| **Dòng phụ — theo phòng** | Sức chứa của phòng |
| **Nội dung ô tiết** | Tên môn • tên giáo viên • phòng • nhãn dồn lớp — mỗi thứ một công tắc, tên chọn **viết tắt** hay **đầy đủ** • dấu ở ô trống |
| **Bảng & trang giấy** | A4 **ngang / dọc** • cỡ chữ 70–130 % • **chiều cao tối thiểu mỗi dòng (mm)** • tên cột đầu • chữ chỉ buổi sáng / chiều • mẫu chữ đầu dòng `{buoi} {tiet}` • kiểu tên thứ (*Thứ Hai / THỨ HAI / T2*) • giờ vào–ra • bản không màu • chú giải môn |
| **Cuối trang & chữ ký** | Ghi chú + **vị trí** • dòng ngày tháng + **vị trí** • **3 cột ký Trái – Giữa – Phải** • dòng nhắc *(Ký, ghi rõ họ tên)* • khoảng trống chừa để ký (mm) |

### Vị trí chữ ký

Khối chữ ký luôn là **ba cột cố định: Trái – Giữa – Phải**. Cột để trống vẫn giữ chỗ, nên
xoá bớt chữ ký thì các chữ ký còn lại **đứng nguyên vị trí, không bị dồn vào giữa**.
Muốn một chữ ký nằm bên phải thì điền vào ô *Chữ ký cột PHẢI* và để trống hai ô kia.

### Bản Word đã căn chỉnh sẵn

Bản `.docx` xuất ra dùng ngay, không phải mở Word chỉnh lại:
ô bảng có lề trong nên chữ không dính khung • dòng tiêu đề tự lặp lại khi bảng tràn sang
trang sau • bảng căn giữa trang • khoảng cách giữa các khối chữ theo một nhịp thống nhất •
khoảng trống ký đúng số mm đã đặt • luôn có đoạn ngăn giữa bảng thời khoá biểu và bảng chữ ký
(nếu không Word sẽ nhập hai bảng làm một).

- **Lưu cấu hình** ghi vào dữ liệu nên đi theo cả bản sao lưu và tệp `.json` xuất ra — mở máy khác vẫn giữ đúng định dạng.
- **Huỷ** trả mọi tuỳ chọn về nguyên trạng lúc mở hộp thoại; **Về mặc định** đưa lại thiết lập gốc.
- Xuất Word / PDF được ngay trong hộp thoại, không cần đóng lại.

## Sao lưu & khôi phục

Tab **Sao lưu & Lịch sử** giữ các ảnh chụp toàn bộ dữ liệu ngay trong trình duyệt.

- **Tự động sao lưu** trước khi nhập tệp, khôi phục mẫu, khôi phục bản cũ và sau mỗi lần xếp lịch thành công.
- Mỗi bản ghi rõ thời điểm, tên do bạn đặt, số lớp / giáo viên / môn và đã xếp bao nhiêu tiết.
- Ba nút cho từng bản: **Tải về** (.json), **Khôi phục** (ghi đè dữ liệu hiện tại, có tự sao lưu trước), **Xoá**.
- Giữ tối đa 25 bản, ưu tiên xoá bản tự động cũ nhất khi đầy.
- Nếu trình duyệt chặn bộ nhớ cục bộ (mở tệp trực tiếp từ ổ đĩa), phần mềm báo rõ và bạn dùng nút **Tải thẳng về máy**.

## Tiện ích giao diện

- Mỗi màn hình có phần mô tả chức năng ở đầu trang; mỗi ô cấu hình có dòng giải thích ngắn bên dưới.
- Các ô chọn nhiều lựa chọn (giáo viên, môn, tiết) có **ô tìm kiếm** ngay trong danh sách, gõ vài chữ là lọc ra, dùng phím mũi tên và Enter để chọn.
- Bốn bảng dữ liệu (môn, lớp, giáo viên, phòng) đều có **ô tìm kiếm** lọc nhanh theo bất kỳ nội dung nào trong dòng.

## Xử lý khi còn tiết chưa xếp
1. Tăng **Số lần khởi động lại** (40 → 150) và **Số vòng tinh chỉnh**.
2. Nới bớt ô bận của GV đang căng nhất (xem tab Chạy → thống kê định mức).
3. Tăng sức chứa phòng chức năng hoặc bổ sung GV bộ môn.
4. Nới **Tối đa buổi chiều** của GVCN (2 → 3) hoặc đổi chế độ nghỉ của GV đang căng.
5. Bật **Cho phép dồn lớp** cho môn thiếu giáo viên nhất.
6. Giảm số tiết môn có áp lực cao nhất, hoặc tăng số tiết/ngày.

/* ============================================================
   i18n.js — Song ngữ Việt/Anh, dịch theo DOM (không sửa 30 file JS).
   • Nguồn gốc DOM là tiếng Việt → khi chọn EN thì dịch text node +
     thuộc tính (placeholder/title/alt/aria-label) khớp từ điển.
   • Cache bản gốc để chuyển lại VI.
   • MutationObserver dịch nội dung render động (toast, thẻ màu, gate…).
   • Switch VI|EN trong header, lưu localStorage, mặc định theo trình duyệt.
   Classic script (không module) — chạy trước main.js, gắn window.i18n.
   ============================================================ */
(function () {
  'use strict';

  // ── Từ điển vi → en (key đã chuẩn hoá khoảng trắng về 1 space) ──
  var DICT = {
    // Header / chrome
    'AOC — AI for OneCoat Colormind: phối màu sơn ngôi nhà bằng AI':
      'AOC — AI for OneCoat Colormind: AI-powered house paint color matching',
    'Lịch sử': 'History',
    'Lịch sử phối màu': 'Color history',
    // "Bước N." đứng riêng trong <strong> đã có RULE regex /^Bước (\d+)\.$/
    // xử lý chung (xem cuối file) — không cần liệt kê từng số ở đây.
    'Tối đa 50 MB': 'Max 50 MB',
    'Tải ảnh ngoại thất ngôi nhà.': 'Upload a photo of the house exterior.',
    'Màu yêu / không thích': 'Liked / disliked colors',
    'Gợi ý màu từ ảnh tham khảo': 'Suggest colors from a reference photo',
    'Bấm vùng muốn áp cho từng màu:': 'Click the zone to apply each color to:',
    'Sản phẩm Paint&More gợi ý': 'Paint&More recommended products',
    'Bạn muốn giải quyết vấn đề gì?': 'What problem do you want to solve?',
    'Hoặc mô tả nhu cầu của bạn': 'Or describe your needs',
    'VD: nhà tôi ở gần biển, muốn sàn để xe không bị mài mòn…':
      'E.g. my house is near the sea, I want a garage floor that won’t wear down…',
    'Tìm sản phẩm': 'Find products',
    'Chưa nhận diện được vấn đề nào trong mô tả — thử chọn thủ công ở trên hoặc mô tả rõ hơn.':
      'Could not recognize a need from that description — try picking manually above or describe it more clearly.',
    'Đã tìm thấy vấn đề phù hợp': 'Matching needs found',
    'Chọn 1 vấn đề ở trên (hoặc mô tả nhu cầu) để xem dòng sơn chuyên dụng phù hợp.':
      'Pick a need above (or describe it) to see matching specialty paint lines.',
    'Giải quyết:': 'Solves:',
    // CONCERNS (data/paint-products.js) — nhãn checkbox tư vấn theo nhu cầu
    'Tường chịu lực, chống trầy/mài mòn': 'Durable walls, scratch/wear resistant',
    'Hút ẩm, chống nấm mốc, khử mùi': 'Moisture-absorbing, anti-mold, odor removal',
    'Chống thấm nước': 'Waterproofing',
    'Sàn chịu tải xe ô tô / nhà xưởng': 'Car-load floors / warehouses',
    'Nhà vùng biển / duyên hải': 'Coastal / seaside homes',
    // PRODUCTS (data/paint-products.js) — tagline + traits (render động qua JS)
    'Độ cứng tương đương epoxy — chống trầy, chịu va đập': 'Epoxy-level hardness — scratch and impact resistant',
    'Chống trầy xước/va đập': 'Scratch/impact resistant',
    'Dễ lau chùi': 'Easy to clean',
    'Kháng nấm mốc': 'Mold resistant',
    'Tủ bếp/cửa/khu vực qua lại nhiều': 'Cabinets/doors/high-traffic areas',
    'Tự điều hoà độ ẩm 40–60%, khử mùi — công nghệ Nhật Bản': 'Self-regulates humidity 40–60%, deodorizes — Japanese technology',
    'Hút ẩm/chống nấm mốc': 'Moisture-absorbing/anti-mold',
    'Khử mùi (thuốc lá, thú cưng, đồ ăn)': 'Deodorizes (tobacco, pets, food)',
    'An toàn cho phòng trẻ em': 'Safe for children’s rooms',
    'Sơn công nghiệp — chịu tải nặng, kháng hoá chất': 'Industrial coating — heavy-duty, chemical resistant',
    'Sàn để xe/nhà xưởng': 'Garage/warehouse floors',
    'Chịu tải xe nâng/ô tô': 'Withstands forklift/car loads',
    'Chống rỉ sét/ăn mòn': 'Rust/corrosion resistant',
    'Kháng hoá chất, cứng 4H+': 'Chemical resistant, 4H+ hardness',
    'Chuyên dụng vùng biển/duyên hải — công nghệ lá sen': 'Specialized for coastal areas — lotus-leaf technology',
    'Chống ăn mòn muối biển': 'Salt-corrosion resistant',
    'Đàn hồi cao 200–300%': 'High elasticity 200–300%',
    'Chống bám bẩn (lá sen)': 'Dirt-repellent (lotus effect)',
    'Dùng cho:': 'Used for:',
    '+ Khuyên dùng lót': '+ Recommended primer',
    'trước khi sơn màu.': 'before painting the color coat.',
    'Giá & định mức phủ chính xác: liên hệ Paint&More': 'For exact pricing & coverage, contact Paint&More at',
    'để được báo giá.': 'for a quote.',
    'Sơn nội thất 1 lớp — không mùi, VOC thấp': 'One-coat interior paint — odorless, low VOC',
    'Sơn ngoại thất 1 lớp — chống UV, chống thấm': 'One-coat exterior paint — UV and water resistant',
    'Sơn lót mọi bề mặt': 'Primer for all surfaces',
    'Sơn tường cao cấp': 'Premium wall paint',
    'Sơn chống thấm chuyên dụng': 'Specialized waterproofing paint',
    'Bề mặt mịn bóng, dễ vệ sinh — độ bền tương đương epoxy': 'Smooth, glossy, easy to clean — epoxy-level durability',
    'Bề mặt sần chống trơn trượt — chịu tải xe, chống nứt chân chim': 'Textured anti-slip finish — vehicle load rated, crack resistant',
    'Sơn lót kim loại — chống rỉ sét cho cổng/lan can/mái tôn': 'Metal primer — rust protection for gates/railings/roofing',
    'Keo Silicone trám khe nứt — đàn hồi 800%': 'Silicone sealant for cracks — 800% elasticity',
    'Xử lý dột/rò rỉ tại chỗ — mái, ống nước, vết nứt': 'Spot leak repair — roofs, pipes, cracks',
    'Tường sang trọng, bóng mịn, dễ lau chùi': 'Elegant, glossy, easy-to-clean walls',
    'Sân / lối đi ngoài trời chống trơn trượt': 'Anti-slip outdoor patios / walkways',
    'Kim loại/sắt chống rỉ sét (cổng, lan can, mái tôn)': 'Rust-proof metal/iron (gates, railings, roofing)',
    'Trám khe nứt, chống nứt tường': 'Crack sealing, wall crack prevention',
    'Xử lý dột / rò rỉ (mái, ống nước, vết nứt)': 'Leak repair (roof, pipes, cracks)',
    'Đang phân tích màu…': 'Analyzing colors…',
    'Không tìm được màu nổi bật trong ảnh này — thử ảnh khác rõ màu hơn.': 'No standout colors found in this photo — try a clearer one.',
    'Chọn màu cho tường/viền/cửa hoặc bề mặt ở bước 3 để xem gợi ý sản phẩm phù hợp.': 'Pick a color for walls/trim/accent or a surface in step 3 to see matching product suggestions.',
    'Không đọc được ảnh': 'Could not read the image',
    'Không đọc được pixel ảnh (ảnh lỗi định dạng?)': 'Could not read image pixels (unsupported format?)',
    'Đã áp dụng màu từ ảnh': 'Color applied from photo',
    'Đã áp dụng màu': 'Color applied',
    'Chưa có ảnh kết quả để chia sẻ.': 'No result image to share yet.',
    'Đã copy link chia sẻ — gửi cho người thân là xem được ngay.': 'Share link copied — send it and they can view it instantly.',
    'Không tạo được link chia sẻ.': 'Could not create the share link.',
    'Chia sẻ thất bại': 'Share failed',
    'Soi màu': 'Color Picker',
    'Soi màu trên ảnh — trỏ chuột để xem mã HEX và mã KM gần nhất':
      'Color Picker — hover the image to see the HEX code and nearest KM match',
    'Ảnh mới': 'New photo',
    'Bắt đầu ảnh mới': 'Start a new photo',
    'Ẩn/hiện bảng thao tác': 'Show/hide the control panel',
    'Mở bảng thao tác': 'Open the control panel',
    'Thu gọn bảng điều khiển': 'Collapse panel',
    'Mở bảng điều khiển': 'Open panel',
    'Thu gọn / mở bảng điều khiển': 'Collapse / open panel',
    'Mã màu sơn đã dùng': 'Paint color codes used',
    'Dự toán sơn': 'Paint cost estimate',
    'Chia sẻ': 'Share',
    'Dự toán sơn & sản phẩm': 'Cost estimate & products',
    'tham khảo': 'estimate',
    'Tham khảo': 'Estimate',
    'Diện tích tường (m²)': 'Wall area (m²)',
    'Diện tích sàn (m²)': 'Floor area (m²)',
    'Tạm tính:': 'Estimated:',
    'Khách đã phối với P&M': 'Customers styled with P&M',
    'AI tô tốt nhất các mảng sơn lớn (tường, cột, viền). Chi tiết nhỏ, kim loại, kính, cửa sắt có thể kém chính xác.':
      'AI works best on large painted areas (walls, columns, trim). Small details, metal, glass and iron doors may be less accurate.',
    'Công cụ phối màu được phát triển bởi P&M từ các bảng màu hàng trăm năm sang trọng của nước Mỹ.':
      'A color tool developed by P&M, drawing on centuries of elegant American color palettes.',
    'Sẵn sàng': 'Ready',
    'Ảnh đã tải': 'Uploaded image',
    'Tiến trình': 'Progress',

    // Stepper
    'Tải ảnh': 'Upload',
    'Nhận diện': 'Detect',
    'Phong cách màu': 'Color style',
    'Phương án màu': 'Palette',
    'Chỉnh màu': 'Adjust',
    'Phối màu': 'Apply',
    // Stepper sau khi gộp 7→5 bước
    'Chọn màu': 'Colors',
    'Tinh chỉnh': 'Refine',
    // Tiêu đề + hint 2 panel gộp
    'Chọn màu & phương án': 'Colors & palettes',
    'Tinh chỉnh & phối màu': 'Refine & apply',
    'Chọn nhóm màu yêu/ghét và độ sáng tổng thể — AI gợi ý phương án màu ngay bên dưới. Không bắt buộc.':
      'Pick liked/disliked color groups and overall brightness — AI suggests palettes right below. Optional.',
    'Tinh chỉnh màu tường, viền, điểm nhấn nếu cần — rồi bấm "Phối màu ngay".':
      'Fine-tune wall, trim, and accent colors if needed — then click "Apply now".',
    'Kết quả': 'Result',

    // Step 1
    'Tải ảnh ngôi nhà': 'Upload house photo',
    'Tải ảnh ngoại thất ngôi nhà — kéo & thả, bấm chọn file, hoặc dán bằng Ctrl + V.':
      'Upload an exterior photo of the house — drag & drop, click to choose a file, or paste with Ctrl + V.',
    'Kéo thả · Chọn ảnh · hoặc dán (Ctrl+V)': 'Drag & drop · Choose image · or paste (Ctrl+V)',
    'JPG · PNG · WEBP — Tối đa 50 MB': 'JPG · PNG · WEBP — Max 50 MB',
    'Xóa ảnh': 'Remove image',
    'Nhận diện →': 'Detect →',

    // Step 2
    'Nhận diện & chọn phong cách': 'Detect & choose style',
    'AI tự kiểm tra ảnh có phải ngôi nhà và nhận diện vùng có thể sơn. Chọn một phong cách, hoặc để AI tô màu tự động.':
      'AI checks whether the photo is a house and detects paintable areas. Pick a style, or let AI color it automatically.',
    'Đang nhận diện kiến trúc…': 'Detecting architecture…',
    'Chọn phong cách bạn thích': 'Choose a style you like',
    'Hiện đại': 'Modern',
    'Sạch, khoẻ khoắn, tương phản': 'Clean, bold, high-contrast',
    'Tối giản': 'Minimalist',
    'Sáng, nhẹ, ít màu': 'Bright, light, few colors',
    'Cổ điển': 'Classic',
    'Be/taupe trầm, lịch lãm': 'Muted beige/taupe, elegant',
    'Sang trọng': 'Luxury',
    'Tông sâu, ấm, cao cấp': 'Deep, warm, premium tones',
    'Tô màu tự động': 'Auto color',
    'AI sẽ tự chọn phương án màu phù hợp — bạn vẫn có thể tinh chỉnh sau.':
      'AI will pick a suitable palette — you can still fine-tune later.',
    'Bất ngờ cho tôi': 'Surprise me',
    'Chọn ngẫu nhiên một phương án đẹp': 'Pick a beautiful palette at random',
    'Ghim để so sánh': 'Pin to compare',
    'Ghim thêm để so sánh (tối đa 3) — ghim cái mới nhất sẽ thay cái cũ nhất.':
      'Pin more to compare (up to 3) — pinning a new one replaces the oldest.',
    'Dùng phương án này →': 'Use this palette →',
    '✨ Phối màu bất ngờ': '✨ Surprise palette',
    'Chưa có phương án để chọn — hãy nới dải tông hoặc đổi màu yêu/ghét.':
      'No palettes to pick yet — widen the tone range or change liked/disliked colors.',
    'Loại công trình:': 'Building type:',
    'Loại công trình': 'Building type',
    'Công trình:': 'Project type:',
    'Ngoại thất': 'Exterior',
    'Nội thất': 'Interior',
    '← Quay lại': '← Back',
    'Bỏ qua & phối màu thủ công': 'Skip & color manually',
    'Tự phối màu →': 'Color it myself →',

    // Step 3
    'Chọn phong cách màu': 'Choose color style',
    'Tinh chỉnh sở thích: màu yêu thích, màu không thích và độ sáng tổng thể (không bắt buộc).':
      'Fine-tune preferences: liked colors, disliked colors, and overall brightness (optional).',
    'Màu yêu thích': 'Liked colors',
    'Màu không thích': 'Disliked colors',
    'Nhóm màu yêu thích': 'Liked color group',
    'Nhóm màu không thích': 'Disliked color group',
    'Độ sáng tổng thể': 'Overall brightness',
    'Tạo phương án màu': 'Generate palettes',
    'Chưa có phương án nào': 'No palettes yet',
    'Chọn nhóm màu yêu / không thích và độ sáng ở trên, rồi bấm "Tạo phương án màu".':
      'Pick liked / disliked color groups and brightness above, then press "Generate palettes".',
    'Nhạt': 'Light',
    'Vừa': 'Medium',
    'Đậm': 'Dark',
    'Tất cả': 'All',
    'Tiếp theo →': 'Next →',

    // Step 4
    'Chọn phương án màu': 'Choose a palette',
    'Chọn một phương án AI gợi ý, hoặc tự phối màu cho từng đối tượng.':
      'Pick an AI-suggested palette, or color each element yourself.',
    'AI Tạo Phương Án': 'AI Palettes',
    'Tự Phối Màu': 'Custom Colors',
    'Phương án AI gợi ý': 'AI-suggested palettes',
    'Tự gợi ý combo 3 màu Tường · Viền · Cửa theo sở thích của bạn':
      'Auto-suggests 3-color combos for Walls · Trim · Doors based on your preferences',
    'Đang gợi ý phương án màu phù hợp…': 'Suggesting suitable palettes…',
    'Tự phối từng đối tượng': 'Color each element',
    'Chọn màu cho Tường, Mái, Sàn… hoặc thêm mới': 'Pick colors for Walls, Roof, Floor… or add new',
    'Chọn màu Kelly-Moore cụ thể…': 'Choose a specific Kelly-Moore color…',
    'Dùng combo này →': 'Use this combo →',

    // Step 5
    'Chỉnh màu chi tiết': 'Fine-tune colors',
    'Tinh chỉnh màu của tường, viền và điểm nhấn nếu cần — hoặc bỏ qua.':
      'Adjust the wall, trim, and accent colors if needed — or skip.',
    'Tinh chỉnh chi tiết màu sắc của tường, viền và điểm nhấn.':
      'Fine-tune the wall, trim, and accent colors in detail.',

    // Step 6
    'Hệ thống sẽ tự động tạo': 'The system will automatically generate',
    'cả ảnh ban ngày và ban đêm': 'both day and night images',
    'Phối màu ngay': 'Apply now',
    'Thường mất 30–90 giây · có thể lâu hơn nếu AI đang khởi động':
      'Usually takes 30–90 seconds · may take longer if AI is warming up',

    // Step 7
    'Kết quả & tải xuống': 'Result & download',
    'Kéo thanh giữa để so sánh trước/sau, phóng to để xem chi tiết, rồi tải ảnh kèm mã màu.':
      'Drag the middle slider to compare before/after, zoom in for detail, then download the image with color codes.',
    'Chỉnh màu nhanh tại đây': 'Quick color edit here',

    // Right panel + placeholder
    'Tải ảnh để bắt đầu nhận diện và phối màu.': 'Upload a photo to start detection and coloring.',
    'Tải ảnh công trình để bắt đầu nhận diện và phối màu.': 'Upload a building photo to start detection and coloring.',
    'Ban ngày': 'Day',
    'Ban đêm': 'Night',
    'Tải ảnh phối màu': 'Download colored image',
    'Không khí theo mùa': 'Season',
    'Không khí & môi trường theo mùa': 'Seasonal Environment',
    'Mùa xuân': 'Spring',
    'Mùa xuân — Trong lành, ấm áp, tươi mới': 'Spring — Fresh, warm, vibrant',
    'Mùa hạ': 'Summer',
    'Mùa hạ — Rực rỡ, nắng gắt, tương phản cao': 'Summer — Bright, sunny, high contrast',
    'Mùa thu': 'Autumn',
    'Mùa thu — Hoàng hôn vàng, ấm cúng, sang trọng': 'Autumn — Golden hour, cozy, elegant',
    'Mùa đông': 'Winter',
    'Mùa đông — Mát dịu, u ám nhẹ, tĩnh lặng': 'Winter — Cool, overcast, tranquil',
    'Về mặc định (không phủ mùa)': 'Reset (no seasonal overlay)',
    'Bắt đầu phối màu AI': 'Start AI coloring',
    'Tải ảnh công trình lên — AI sẽ nhận diện kiến trúc, gợi ý bảng màu Kelly-Moore và phối màu trực tiếp lên ảnh.':
      'Upload a building photo — AI will detect the architecture, suggest a Kelly-Moore palette, and color directly on the image.',
    'kiến trúc': 'architecture',
    'Bảng màu': 'Palette',
    'thông minh': 'smart',
    'Giữ nguyên': 'Preserve',
    'tỉ lệ ảnh': 'image ratio',
    'Ảnh gốc': 'Original image',
    'Kết quả phối màu': 'Colored result',

    // Zones / surfaces (labels)
    'Tường': 'Walls',
    'Viền': 'Trim',
    'Cửa': 'Doors',
    'Mái': 'Roof',
    'Sàn': 'Floor',
    'Cột': 'Columns',
    'Trần': 'Ceiling',
    'Cổng': 'Gate',
    'Hàng rào': 'Fence',
    'Hồ bơi': 'Pool',
    'Màu tường chính': 'Main wall color',
    'Viền / cột / phào chỉ': 'Trim / columns / molding',
    'Điểm nhấn / cửa-cổng': 'Accent / doors-gate',
    'Đối tượng được phối màu': 'Colored elements',
    'Mái / mái ngói': 'Roof / tiles',
    'Mái nhà, mái ngói, mái tôn.': 'House roof, tile roof, metal roof.',
    'Sàn / nền / lối đi': 'Floor / ground / path',
    'Sàn sân, nền bê tông, lối đi.': 'Yard floor, concrete, walkway.',
    'Hàng rào, tường rào.': 'Fence, boundary wall.',
    'Cổng chính, cổng phụ. Cổng sắt có thể kém ổn định.': 'Main/side gate. Iron gates may be less stable.',
    'Tường gạch trần': 'Exposed brick wall',
    'Mảng gạch để mộc.': 'Bare brickwork.',
    'Mảng đá ốp': 'Stone cladding',
    'Đá ốp, đá trang trí.': 'Cladding stone, decorative stone.',
    'Chi tiết kim loại': 'Metal details',
    'Lan can sắt, khung kim loại. Có thể kém ổn định.': 'Iron railings, metal frames. May be less stable.',
    'Cửa chớp / lá sách': 'Shutters / louvers',
    'Cửa chớp, lá sách che nắng.': 'Shutters, sun louvers.',
    'Lan can / ban công': 'Railing / balcony',
    'Lan can, tay vịn ban công.': 'Railings, balcony handrails.',
    'Cột / trụ': 'Columns / pillars',
    'Cột, trụ, hàng cột.': 'Columns, pillars, colonnades.',
    'Mái hiên / mái che': 'Awning / canopy',
    'Mái hiên, mái che cửa.': 'Awnings, door canopies.',
    'Cầu thang / bậc thềm': 'Stairs / steps',
    'Bậc thềm, cầu thang ngoài.': 'Steps, outdoor stairs.',
    'Trần (nội thất)': 'Ceiling (interior)',
    'Trần nhà, trần thạch cao.': 'Ceilings, gypsum ceilings.',
    'Thành / đáy hồ bơi.': 'Pool walls / floor.',

    // Color names (love/hate grid)
    'Đỏ': 'Red', 'Hồng': 'Pink', 'Tím': 'Purple', 'Chàm': 'Indigo', 'Lục': 'Green',
    'Vàng': 'Yellow', 'Nâu': 'Brown', 'Trắng': 'White', 'Xám': 'Gray', 'Đen': 'Black',
    'Trung tính': 'Neutral', 'Xanh ngọc': 'Teal', 'Cam': 'Orange',
    'Đỏ đô': 'Maroon', 'Cam đất': 'Terracotta', 'Kem': 'Cream', 'Lục nhạt': 'Light green',
    'Lam': 'Blue', 'Lam nhạt': 'Light blue', 'Xanh navy': 'Navy', 'Tím nhạt': 'Light purple',

    // Progress popup (job stages)
    'Đang chuẩn bị…': 'Preparing…',
    'AI đang đọc ảnh': 'AI is reading the image',
    'AI đang chuẩn bị ảnh cho bạn': 'AI is preparing your image',
    'Gửi lên hoàn tất': 'Upload complete',
    'AI đang khởi động (lần đầu hơi lâu)…': 'AI is starting up (first run is slower)…',
    'AI đang tô màu': 'AI is coloring',
    'AI đang hoàn thiện ảnh': 'AI is finishing the image',
    'Tạo ảnh thành công': 'Image created successfully',
    'Đang kiểm tra ảnh': 'Checking the image',
    'Đang tải ảnh lên': 'Uploading the image',
    'Đang chờ trong hàng đợi': 'Waiting in queue',
    'AI đang khởi động lần đầu, có thể mất 1–2 phút': 'AI is starting for the first time, this may take 1–2 minutes',
    'Đang phối màu': 'Coloring',
    'Đang kiểm tra tỉ lệ & hoàn thiện ảnh': 'Checking ratio & finishing the image',
    'Hoàn tất': 'Done',
    'Đã xảy ra lỗi.': 'An error occurred.',
    'Huỷ': 'Cancel',

    // Errors (error-service catalog)
    'Không kết nối được AI': 'Cannot connect to AI',
    'Dịch vụ AI hiện chưa sẵn sàng. Vui lòng kiểm tra ComfyUI đang chạy rồi thử lại.':
      'The AI service is not ready. Please make sure ComfyUI is running and try again.',
    'AI đang khởi động': 'AI is warming up',
    'AI đang nạp model lần đầu (có thể mất 1–2 phút). Vui lòng chờ trong giây lát.':
      'AI is loading the model for the first time (may take 1–2 minutes). Please wait a moment.',
    'Ảnh không hợp lệ': 'Invalid image',
    'Ảnh không hợp lệ hoặc quá lớn. Hãy chọn ảnh JPG/PNG/WEBP của công trình.':
      'The image is invalid or too large. Please choose a JPG/PNG/WEBP photo of the building.',
    'Chưa chắc đây là công trình': 'Not sure this is a building',
    'AI chưa chắc đây là ảnh mặt tiền công trình. Bạn có muốn tiếp tục phối màu không?':
      'AI is not sure this is a building facade. Do you want to continue coloring?',
    'AI chưa chắc đây là ảnh mặt tiền công trình. Bạn muốn tiếp tục phối màu không?':
      'AI is not sure this is a building facade. Do you want to continue coloring?',
    'Không thể kết nối dịch vụ AI': 'Cannot reach the AI service',
    'Phân loại thất bại': 'Classification failed',
    'Không phân loại được kiến trúc. Bạn có thể thử lại hoặc bỏ qua bước này để phối màu thủ công.':
      'Could not classify the architecture. You can retry or skip this step to color manually.',
    'Phối màu thất bại': 'Coloring failed',
    'AI không hoàn tất phối màu. Vui lòng thử lại; nếu vẫn lỗi, hãy thử ảnh hoặc màu khác.':
      'AI could not finish coloring. Please retry; if it keeps failing, try another image or colors.',
    'Quá thời gian xử lý': 'Processing timed out',
    'AI xử lý lâu hơn bình thường và đã hết thời gian chờ. Có thể do model đang khởi động — vui lòng thử lại.':
      'AI took longer than usual and timed out. The model may be warming up — please try again.',
    'Tỉ lệ ảnh ra không đúng': 'Output ratio is incorrect',
    'Ảnh kết quả bị lệch tỉ lệ so với ảnh gốc. Hãy thử tạo lại; nếu lặp lại, báo cho quản trị viên.':
      'The result image ratio differs from the original. Try again; if it repeats, contact the administrator.',
    'Tải ảnh thất bại': 'Download failed',
    'Không tải được ảnh kết quả. Vui lòng thử lại.': 'Could not download the result image. Please try again.',
    'Mất kết nối mạng': 'Network offline',
    'Trình duyệt đang ngoại tuyến. Hãy kiểm tra kết nối mạng rồi thử lại.':
      'Your browser is offline. Please check your connection and try again.',
    'Đã xảy ra lỗi': 'An error occurred',
    'Có lỗi không xác định. Vui lòng thử lại.': 'An unknown error occurred. Please try again.',
    'Thử lại': 'Retry',
    'Tiếp tục chờ': 'Keep waiting',
    'Chọn ảnh khác': 'Choose another image',
    'Tiếp tục': 'Continue',
    'Tạo lại': 'Regenerate',

    // Toasts / status (main.js + components)
    'Vui lòng tải ảnh trước': 'Please upload an image first',
    'Vui lòng tải ảnh trước.': 'Please upload an image first.',
    'Workflow chưa tải xong': 'Workflow is still loading',
    'Workflow template chưa tải': 'Workflow template not loaded',
    'Không tải được cấu hình workflow. Hãy kiểm tra file workflow.':
      'Could not load workflow config. Please check the workflow file.',
    'Đang phối màu…': 'Coloring…',
    'Đã huỷ': 'Cancelled',
    'Đã huỷ phối màu': 'Coloring cancelled',
    'Phối màu hoàn tất!': 'Coloring complete!',
    'Phối màu AI hoàn tất! Bạn có thể tải xuống hoặc thử lại phương án khác.':
      'AI coloring complete! You can download or try another palette.',
    'Đã chọn màu': 'Color selected',
    'Đã tải ảnh': 'Image downloaded',
    'Không có dữ liệu để xuất': 'No data to export',
    'Đã mở lại kết quả từ lịch sử': 'Reopened result from history',
    'Đã nhận diện kiến trúc': 'Architecture detected',
    'Nhận diện kiến trúc thành công. Bấm "Tiếp theo" để chọn màu.':
      'Architecture detected. Click "Next" to choose colors.',
    'Đã bỏ qua nhận diện — bạn có thể phối màu thủ công.': 'Detection skipped — you can color manually.',
    'Lỗi nhận diện': 'Detection error',
    'Lỗi nhận diện kiến trúc. Bạn có thể bỏ qua để phối màu thủ công.':
      'Architecture detection error. You can skip and color manually.',
    'Đã chọn phương án màu tự động — kiểm tra rồi bấm "Phối màu ngay".':
      'Auto palette selected — review it, then click "Apply now".',
    'Chưa tạo được phương án tự động. Hãy thử chọn phong cách khác.':
      'Could not create an automatic palette. Try another style.',
    'Hãy chọn một phương án màu (AI) hoặc tự phối màu ở tab "Tự Phối Màu".':
      'Pick an (AI) palette or color it yourself in the "Custom Colors" tab.',
    'Hãy xác nhận tiếp tục ở phần cảnh báo phía trên.': 'Please confirm to continue in the warning above.',
    'Kiểm tra các đối tượng đã chọn màu, sau đó bấm "Phối màu ngay".':
      'Check the elements you have colored, then click "Apply now".',

    // Classification gate
    'AI đã phân tích thành công': 'AI analysis complete',
    'AI chưa chắc về ảnh này': 'AI is unsure about this image',
    'Ảnh có vẻ không phải công trình': 'This may not be a building',
    'Ảnh có vẻ không phải công trình. Hãy đổi ảnh hoặc bấm "Vẫn tiếp tục".':
      'This does not look like a building. Change the image or click "Continue anyway".',
    'Ảnh này có vẻ không phải ảnh công trình/mặt tiền.': 'This does not look like a building/facade photo.',
    // Nguyên văn message BLOCK trong classification-gate.js (3 đoạn nối thành 1 câu).
    'Ảnh này có vẻ không phải ảnh công trình/mặt tiền. Hãy tải ảnh ngôi nhà, toà nhà hoặc không gian cần phối màu. Nếu bạn chắc đây là công trình, có thể bỏ qua cảnh báo để tiếp tục.':
      'This does not look like a building/facade photo. Upload a photo of the house, building, or space you want to color. If you are sure this is a building, you can dismiss the warning and continue.',
    'Vui lòng tải lên ảnh ngoại thất của một ngôi nhà để sử dụng công cụ phối màu.':
      'Please upload an exterior photo of a house to use the color tool.',
    'Vui lòng kiểm tra lại ảnh': 'Please review the image',
    'Hãy tải ảnh ngôi nhà, toà nhà hoặc không gian cần phối màu.':
      'Upload a photo of the house, building, or space you want to color.',
    'Nếu bạn chắc đây là công trình, có thể bỏ qua cảnh báo để tiếp tục.':
      'If you are sure this is a building, you can dismiss the warning and continue.',
    'Cần xác nhận để tiếp tục': 'Confirmation required to continue',
    'Phát hiện cảnh báo nhận diện. Hãy kiểm tra và xác nhận ở cột trái.':
      'A detection warning was found. Please review and confirm in the left column.',
    'Kết quả có thể chưa chính xác': 'Result may be inaccurate',
    'Kết quả phối màu vẫn có thể dùng, nhưng AI có thể nhận diện chưa chính xác.':
      'The coloring result is still usable, but AI detection may be inaccurate.',
    'Ảnh có thể chứa nhiều phong cách hoặc chưa đủ rõ.': 'The image may mix styles or be unclear.',
    // Nguyên văn message WARN trong classification-gate.js (2 đoạn nối thành 1 câu).
    'Ảnh có thể chứa nhiều phong cách hoặc chưa đủ rõ. Kết quả phối màu vẫn có thể dùng, nhưng AI có thể nhận diện chưa chính xác.':
      'The image may mix styles or be unclear. The coloring result is still usable, but AI detection may be inaccurate.',
    'Ảnh pha trộn nhiều phong cách': 'Image mixes multiple styles',
    'Ảnh có thể chưa rõ hoặc pha trộn nhiều phong cách.': 'The image may be unclear or blend multiple styles.',
    'Không nhận được kết quả phân loại rõ ràng. Bạn vẫn có thể tiếp tục phối màu thủ công.':
      'No clear classification result. You can still continue coloring manually.',
    'Không đọc được kết quả phân loại': 'Could not read classification result',
    'Trạng thái nhận diện': 'Detection status',
    'Mức độ chắc chắn của AI': 'AI confidence level',
    'Mức độ chắc chắn': 'Confidence',
    'Phong cách gợi ý': 'Suggested style',
    'Phong cách kiến trúc': 'Architectural style',
    'AI cân nhắc thêm giữa các phong cách sau': 'AI also weighed these other styles',
    'AI so khớp toàn bộ hình ảnh với hàng nghìn công trình đã học để ước tính phong cách gần nhất — không phân tích riêng từng chi tiết như mái, cửa sổ hay vật liệu.':
      'AI matches the whole image against thousands of learned examples to estimate the closest style — it does not analyze individual details like the roof, windows, or materials.',
    'Thời kỳ / ngôn ngữ kiến trúc': 'Period / architectural language',
    'chắc chắn': 'confident',
    'Rõ ràng': 'Clear',
    'Chưa chắc chắn': 'Uncertain',
    'Không xác định': 'Unknown',
    'Vẫn tiếp tục': 'Continue anyway',
    'Cận hiện đại': 'Near-modern',
    'Đương đại': 'Contemporary',
    'Trung cổ': 'Medieval',
    'Phục Hưng': 'Renaissance',
    'Phục cổ điển': 'Revival',
    'Cổ đại': 'Ancient',
    'Bản địa': 'Vernacular',
    'Khác': 'Other',
    'Pha trộn phong cách': 'Mixed styles',
    'Biệt thự / nhà ở': 'Villa / residence',
    'Nhà phố': 'Townhouse',
    'Nhà phố thương mại': 'Commercial townhouse',
    'Nhà trệt': 'Single-story house',
    'Dinh thự': 'Mansion',
    'Toà nhà': 'Building',
    'Công trình công cộng': 'Public building',
    'Công trình thể chế': 'Institutional building',
    'Công trình tưởng niệm': 'Memorial',
    'Bảo tàng': 'Museum',
    'Thánh đường': 'Cathedral',
    'Không gian loft': 'Loft space',

    // Palette names / moods
    'Thanh lịch hiện đại': 'Modern elegance',
    'Sáng thoáng đương đại': 'Bright contemporary',
    'Trầm ấm sang trọng': 'Warm luxury',
    'Tươi mát thanh bình': 'Fresh & serene',
    'Trung tính tinh tế, sang trọng nhẹ nhàng': 'Refined neutral, understated luxury',
    'Ấm áp tự nhiên': 'Natural warmth',
    'Tông đất ấm, gần gũi thiên nhiên': 'Warm earth tones, close to nature',
    'Xanh mát, dịu, thư thái': 'Cool, soft, relaxing blue',
    'Xám lạnh, sạch sẽ, hiện đại': 'Cool gray, clean, modern',
    'Màu rõ nét, cá tính, nổi bật': 'Bold, distinctive, eye-catching',
    'Sáng, nhẹ, rộng rãi': 'Bright, light, spacious',
    'Be/taupe trầm, lịch lãm cổ điển': 'Muted beige/taupe, classic elegance',
    'Cổ điển tinh tế': 'Refined classic',
    'Tối giản đô thị': 'Urban minimalist',
    'Tương phản mạnh': 'High contrast',
    'Viền sáng làm nổi mảng tường; điểm nhấn tối tạo chiều sâu cho cửa/cổng.':
      'Light trim highlights the walls; dark accents add depth to doors/gates.',
    'theo màu bạn yêu thích': 'based on your favorite colors',
    'Bảng màu lần trước': 'Your last palette',
    'Gợi ý từ lần bạn dùng trước': 'Suggested from your last visit',
    'Lần trước': 'Last time',

    // Component labels
    '+ Thêm đối tượng': '+ Add element',
    'Tên đối tượng': 'Element name',
    'Tên đối tượng…': 'Element name…',
    'Bật': 'On',
    'Xoá dòng': 'Delete row',
    'Xoá': 'Delete',
    'Xóa': 'Delete',
    'Xoá tất cả': 'Delete all',
    'Hoàn tác': 'Undo',
    'Đóng': 'Close',
    'Chưa chọn': 'Not selected',
    'Bỏ màu (giữ nguyên)': 'No color (keep as is)',
    'Bỏ màu': 'No color',
    'Về màu palette': 'Back to palette color',
    'Về mặc định': 'Reset to default',
    'Màu hiện tại': 'Current color',
    'Bảng màu trực tiếp': 'Live color picker',
    'Mã HEX': 'HEX code',
    'Nhập HEX': 'Enter HEX',
    'Mã màu Kelly-Moore': 'Kelly-Moore color code',
    'Chọn mã màu KM…': 'Choose a KM color code…',
    'Chọn màu Kelly-Moore': 'Choose Kelly-Moore color',
    'Sao chép màu': 'Copy color',
    'Tìm màu': 'Find color',
    'Tìm theo tên hoặc mã màu…': 'Search by name or color code…',
    'code · tên': 'code · name',
    'Gần đây:': 'Recent:',
    'Phóng to': 'Zoom in',
    'Thu nhỏ': 'Zoom out',
    'Tiếp →': 'Next →',
    '← Trước': '← Previous',
    'Trước': 'Before',
    'Đêm': 'Night',
    'Ngày': 'Day',
    'Ngày + Đêm': 'Day + Night',
    'Phối màu ban ngày': 'Daytime coloring',
    'Phối màu ban đêm': 'Nighttime coloring',
    'Phối màu công trình': 'Building coloring',

    // History panel
    'Chưa có lịch sử. Hãy phối màu một ảnh.': 'No history yet. Color an image to start.',
    'Tìm trong lịch sử…': 'Search history…',
    'Xuất JSON': 'Export JSON',
    'Xoá hết': 'Clear all',
    'mục': 'items',
    'Mở lại': 'Open',
    'Dùng lại combo này': 'Reuse this combo',
    'Vui lòng tải ảnh lên trước khi dùng lại combo màu này.': 'Please upload an image before reusing this color combo.',
    'Mục này không có đủ màu Tường/Viền/Cửa để dùng lại.': 'This item does not have enough Walls/Trims/Accent colors to reuse.',
    'Đã nạp lại bảng màu cũ — kiểm tra rồi bấm "Phối màu ngay".': 'Old color combo loaded — check it, then click "Colorize now".',
    'Lỗi': 'Error',
    'Tuỳ chỉnh': 'Custom',
    'Không tìm thấy mục phù hợp.': 'No matching items found.',
    'Chưa có dữ liệu': 'No data',
    'Không tìm thấy màu phù hợp.': 'No matching color found.',
    'Không tìm được phương án phù hợp. Hãy nới dải tông hoặc đổi màu yêu/ghét.':
      'No suitable palette found. Widen the tone range or change liked/disliked colors.',
    'Bạn có chắc muốn xóa TẤT CẢ lịch sử? Hành động này không thể hoàn tác.':
      'Are you sure you want to delete ALL history? This cannot be undone.',
    'Bạn có chắc muốn xóa mục này?': 'Delete this item?',
    'Đã xóa mục': 'Item deleted',
    'Đã xóa tất cả lịch sử': 'All history deleted',
    'Không thể tải dữ liệu': 'Could not load data',

    // Misc warnings / notes
    'Định dạng không hỗ trợ. Vui lòng dùng ảnh JPG, PNG hoặc WEBP.':
      'Unsupported format. Please use a JPG, PNG, or WEBP image.',
    'Mảng sơn lớn — AI xử lý tốt nhất.': 'Large paint areas — AI handles these best.',
    'Luôn được phối màu. Lưu ý: cửa sắt, kim loại, hoa văn có thể kém ổn định.':
      'Always colored. Note: iron doors, metal, and patterns may be less stable.',
    'Lưu ý: AI xử lý tốt nhất các mảng sơn lớn (tường, cột, viền).':
      'Note: AI works best on large paint areas (walls, columns, trim).',
    'Các chi tiết nhỏ, vật liệu kim loại, kính, cửa sắt, hoa văn hoặc vùng bị che khuất':
      'Small details, metal, glass, iron doors, patterns, or hidden areas',
    'có thể không đổi màu chính xác.': 'may not recolor accurately.',
    'Chi tiết nhỏ, kim loại, kính, cửa sắt hoặc vùng bị che khuất có thể không đổi màu chính xác.':
      'Small details, metal, glass, iron doors, or hidden areas may not recolor accurately.',
    // Ghép nguyên văn AI_LIMIT_NOTE trong classification-gate.js (gate.note) —
    // code nối 2 chuỗi thành 1 câu liền, DICT phải khớp NGUYÊN CÂU đã nối.
    'Lưu ý: AI xử lý tốt nhất các mảng sơn lớn (tường, cột, viền). Chi tiết nhỏ, kim loại, kính, cửa sắt hoặc vùng bị che khuất có thể không đổi màu chính xác.':
      'Note: AI works best on large paint areas (walls, columns, trim). Small details, metal, glass, iron doors, or hidden areas may not recolor accurately.',
    '* Kết quả phối màu có thể không chính xác so với thực tế, mong quý khách thông cảm':
      '* Coloring results may differ from reality; thank you for your understanding',
    'Bảng màu sử dụng — Kelly-Moore': 'Palette used — Kelly-Moore',
    'Để AI tạo phương án màu, hoặc tự phối combo theo ý bạn.':
      'Let AI create a palette, or build your own combo.',
    'Chọn màu yêu thích / không thích và độ sáng tổng thể.':
      'Choose liked/disliked colors and overall brightness.',

    // ── Bổ sung phủ kín song ngữ (viewer, editor, surface, progress) ──
    'TRƯỚC': 'BEFORE',
    'SAU': 'AFTER',
    'Kết quả ban ngày': 'Daytime result',
    'Kết quả ban đêm': 'Nighttime result',
    'Mức phóng đại': 'Zoom level',
    'Kéo thanh giữa để so sánh · Lăn chuột / double-click để phóng to':
      'Drag the middle bar to compare · Scroll / double-click to zoom',
    'Tải xuống': 'Download',
    'Thử phương án khác': 'Try another palette',
    'Chỉnh màu rồi tạo lại': 'Edit colors & regenerate',
    'Bề mặt khác': 'Other surfaces',
    'Mái · Sàn · Cổng · Hàng rào…': 'Roof · Floor · Gate · Fence…',
    'Chọn màu cho bề mặt bạn muốn AI sơn. Để trống = giữ nguyên (mặc định).':
      'Pick colors for the surfaces you want AI to paint. Leave empty = keep as is (default).',
    'Chọn mã màu KM…': 'Choose a KM color code…',
    'Chọn màu cho từng đối tượng. Để trống = không đổi (mặc định).':
      'Choose a color for each element. Leave empty = unchanged (default).',
    'Kéo để đổi màu với đối tượng khác': 'Drag to swap color with another element',
    'Dùng HEX': 'Use HEX',
    'Tìm theo tên hoặc mã màu…': 'Search by name or code…',
    'AI đang khởi động (lần đầu hơi lâu)…': 'AI is warming up (first run is slower)…',
    'Đang chuẩn bị…': 'Preparing…',
    // wz-intro bị <strong>P&M</strong> tách thành 2 mảnh text
    'Công cụ phối màu được phát triển bởi': 'A color tool developed by',
    'từ các bảng màu hàng trăm năm sang trọng của nước Mỹ.':
      'from centuries of elegant American color palettes.',
    // Bề mặt / đối tượng còn sót
    'Cầu thang': 'Staircase',
    'Đường nét, gờ chỉ.': 'Lines and moldings.',
    'Thêm đối tượng…': 'Add element…',
    '(gói 72.000 ₫/m²)': '(package 72,000 ₫/m²)',

    // ── Upload zone (thiết kế lại) + placeholder kéo-thả ──
    'Kéo & thả ảnh vào đây': 'Drag & drop your photo here',
    'hoặc': 'or',
    'Chọn ảnh từ máy': 'Choose from device',
    'Dán bằng Ctrl+V cũng được · Mọi định dạng ảnh · Tối đa 50 MB':
      'Pasting with Ctrl+V works too · Any image format · Max 50 MB',
    'Kéo & thả ảnh vào đây, hoặc tải lên ở cột bên trái — AI sẽ nhận diện kiến trúc, gợi ý bảng màu Kelly-Moore và phối màu trực tiếp lên ảnh.':
      'Drag & drop a photo here, or upload from the left column — AI will detect the architecture, suggest a Kelly-Moore palette, and color directly on the image.',

    // ── Mini-accordion Bước 3 (tóm tắt) ──
    'Bỏ qua (không bắt buộc)': 'Skipped (optional)',
    'Đã chọn 1 phương án': 'Palette selected',
    'Tự phối màu thủ công': 'Custom manual colors',

    // ── Popup tiến trình (progress-panel.js — MESSAGES hiện tại) ──
    'Đang khởi động AI': 'Starting AI',
    'AI đang đọc yêu cầu của bạn': 'AI is reading your request',
    'AI đang phân tích ảnh': 'AI is analyzing the image',
    'AI đang khởi động mô hình (lần đầu hơi lâu)': 'AI is loading the model (first run is slower)',
    'AI đang xử lý yêu cầu': 'AI is processing your request',
    'AI đang đóng gói ảnh cho bạn': 'AI is packaging your image',
    'Đang chuẩn bị': 'Preparing',
    'Đang xử lý': 'Processing',

    // ── km-picker.js: tab chế độ + phong thuỷ (Mệnh) + màu cho bé ──
    'Theo tên/mã · phong thuỷ theo Mệnh · gợi ý màu cho phòng bé':
      "By name/code · Feng Shui by element · color suggestions for a kid's room",
    '🎨 Nhóm màu': '🎨 Color group',
    '☯️ Phong thuỷ (Mệnh)': '☯️ Feng Shui (Element)',
    '🧸 Màu cho bé': '🧸 Colors for kids',
    '⚪ Kim': '⚪ Metal', '🟢 Mộc': '🟢 Wood', '🔵 Thuỷ': '🔵 Water', '🔴 Hoả': '🔴 Fire', '🟤 Thổ': '🟤 Earth',
    'Chọn mệnh của bạn — gợi ý màu HỢP với bản mệnh.': "Pick your element — see colors that SUIT it.",
    'Trắng sáng, be, kem — tông ánh kim nhẹ nhàng.': 'Bright white, beige, cream — a soft metallic tone.',
    'Xanh lá (Lục).': 'Green.',
    'Xanh dương (Lam, Chàm).': 'Blue (Lam, Chàm).',
    'Đỏ.': 'Red.',
    'Nâu, Đen.': 'Brown, Black.',
    'Chọn 1 mệnh ở trên để xem màu hợp.': 'Pick an element above to see matching colors.',
    'Chọn 1 độ tuổi ở trên để xem gợi ý màu.': 'Pick an age group above to see color suggestions.',
    'Gợi ý màu tham khảo theo độ tuổi — không thay thế tư vấn thiết kế/y khoa chuyên sâu.':
      "Reference color suggestions by age — not a substitute for professional design/medical advice.",
    '0 – 2 tuổi (nằm nôi – biết bò)': '0 – 2 years (crib – crawling)',
    '2 – 4 tuổi': '2 – 4 years',
    '4 – 6 tuổi': '4 – 6 years',
    '👦 Bé trai — mạnh mẽ, năng động': '👦 Boy — bold, energetic',
    '👧 Bé gái — nhẹ nhàng, dịu dàng': '👧 Girl — soft, gentle',
    'Bé chủ yếu ăn/ngủ, nhìn tường rất nhiều mỗi ngày — chọn tông DỊU NHẸ, ẤM ÁP, ít tương phản để mắt bé thoải mái và dễ ngủ.':
      "At this age babies mostly eat/sleep and stare at the walls a lot — pick SOFT, WARM, low-contrast tones for comfortable eyes and better sleep.",
    'Bé bắt đầu chơi đồ chơi, tô vẽ — tông NÓNG, MẠNH (giống màu đồ chơi trẻ em) giúp kích thích thị giác, hỗ trợ phát triển não bộ.':
      "Kids start playing and drawing — BOLD, WARM tones (like toy colors) stimulate vision and support brain development.",
    'Tính cách bắt đầu phân hoá theo giới — chọn thêm bên dưới cho đúng gu của bé.':
      'Personality starts to diverge by gender — pick below for the right fit.',
    'Bé trai giai đoạn này thường hiếu động, thích tông màu MẠNH, NÓNG.':
      'Boys at this age tend to be energetic and prefer BOLD, WARM tones.',
    'Bé gái giai đoạn này thường thích tông màu NHẸ NHÀNG, DỊU DÀNG.':
      'Girls at this age tend to prefer SOFT, GENTLE tones.',
    'Chọn thêm bé trai / bé gái ở trên để xem gợi ý phù hợp.': 'Pick boy / girl above to see matching suggestions.',

    // Badge hoà sắc (palette-card) — đứng riêng, không nằm trong câu mood
    'Đơn sắc': 'Monochrome', 'Tương đồng': 'Analogous', 'Bổ túc': 'Complementary', 'Tương phản': 'Contrast'
  };

  // ── Regex cho chuỗi có biến nội suy ──
  function look(s) {
    if (s == null) return null;
    var k = String(s).replace(/\s+/g, ' ').trim();
    return DICT[k] != null ? DICT[k] : null;
  }
  // Hoà sắc + nhiệt màu của palette (mood/reason sinh động ở palette-service.js)
  var HARM_EN = { 'Trung tính': 'Neutral', 'Đơn sắc': 'Monochrome', 'Tương đồng': 'Analogous', 'Bổ túc': 'Complementary', 'Tương phản': 'Contrast' };
  var TEMP_EN = { 'ấm': 'warm', 'lạnh': 'cool', 'trung tính': 'neutral' };
  var MENH_EN = { 'Kim': 'Metal', 'Mộc': 'Wood', 'Thuỷ': 'Water', 'Hoả': 'Fire', 'Thổ': 'Earth' };
  var RULES = [
    // km-picker.js: "Mệnh Kim" (chữ đậm) + " — {hint}" (text node kế bên,
    // tách nhau bởi thẻ <b> nên KHÔNG gộp chung 1 chuỗi được).
    [/^Mệnh (Kim|Mộc|Thuỷ|Hoả|Thổ)$/, function (_, m) { return MENH_EN[m] + ' element (' + m + ')'; }],
    [/^— (.+)$/, function (_, h) { return '— ' + (look(h) || h); }],
    // Mini-accordion Bước 3: "Yêu {màu}" / "Ghét {màu}" và số phương án gợi ý.
    [/^Yêu (.+)$/, function (_, x) { return 'Loves ' + (look(x) || x); }],
    [/^Ghét (.+)$/, function (_, x) { return 'Dislikes ' + (look(x) || x); }],
    [/^(\d+) phương án gợi ý$/, function (_, n) { return n + ' suggested palettes'; }],
    [/^(?:(Hiện đại|Tối giản|Cổ điển|Sang trọng) · )?(Trung tính|Đơn sắc|Tương đồng|Bổ túc|Tương phản) · tông (ấm|lạnh|trung tính)$/, function (_, g, h, t) {
      var G = { 'Hiện đại': 'Modern', 'Tối giản': 'Minimalist', 'Cổ điển': 'Classic', 'Sang trọng': 'Luxury' };
      return (g ? G[g] + ' · ' : '') + HARM_EN[h] + ' · ' + TEMP_EN[t] + ' tones';
    }],
    [/^Hoà sắc (.+?) · cùng tông (.+?) · LRV (.+?) · tương phản ΔL (.+?) · điểm (\d+)\/100$/, function (_, h, t, lrv, dl, sc) {
      return (HARM_EN[h.charAt(0).toUpperCase() + h.slice(1)] || h) + ' harmony · matching ' + (TEMP_EN[t] || t) + ' tones · LRV ' + lrv + ' · contrast ΔL ' + dl + ' · score ' + sc + '/100';
    }],
    [/^Bước (\d+)\.$/, function (_, n) { return 'Step ' + n + '.'; }],
    // main.js renderCompareTray(): số phương án ghim thay đổi 2..COMPARE_MAX.
    [/^So sánh (\d+) phương án$/, function (_, n) { return 'Compare ' + n + ' palettes'; }],
    [/^Đã (\d+) giây…$/, function (_, n) { return n + 's elapsed…'; }],
    [/^Đã sao chép: (.+)$/, function (_, x) { return 'Copied: ' + x; }],
    [/^Đã sao chép màu (.+)$/, function (_, x) { return 'Copied color ' + x; }],
    [/^Phong cách gợi ý: (.+?) \((\d+)% chắc chắn\)\.$/, function (_, a, b) { return 'Suggested style: ' + (look(a) || a) + ' (' + b + '% confident).'; }],
    [/^Phong cách gợi ý: (.+?)\.$/, function (_, a) { return 'Suggested style: ' + (look(a) || a) + '.'; }],
    [/^gợi ý theo phong cách (.+)$/, function (_, a) { return 'suggested for ' + (look(a) || a) + ' style'; }],
    [/^Tỉ lệ chuẩn · (.+)$/, function (_, x) { return 'Standard ratio · ' + x; }],
    [/^Tỉ lệ lệch (.+)$/, function (_, x) { return 'Ratio off by ' + x; }],
    [/^Đã xuất (\d+) mục$/, function (_, n) { return 'Exported ' + n + ' items'; }],
    [/^Ảnh quá lớn \(tối đa (.+) MB\)\.$/, function (_, n) { return 'Image too large (max ' + n + ' MB).'; }],
    [/^Không đọc được ảnh: (.+)$/, function (_, x) { return "Couldn't read image: " + x; }],
    [/^Mã KM (.+)$/, function (_, x) { return 'KM code ' + x; }],
    [/^(.+) bảng màu$/, function (_, a) { return (look(a) || a) + ' palette'; }],
    [/^(.+) mã HEX$/, function (_, a) { return (look(a) || a) + ' HEX code'; }]
  ];

  function translateCore(norm) {
    var hit = DICT[norm];
    if (hit != null) return hit;
    for (var i = 0; i < RULES.length; i++) {
      if (RULES[i][0].test(norm)) return norm.replace(RULES[i][0], RULES[i][1]);
    }
    return null;
  }

  // ── Trạng thái + cache để khôi phục VI ──
  var lang = 'vi';
  var touchedText = new Set();   // text nodes đã dịch (giữ __viOrig)
  var touchedAttr = new Set();   // "elements" có thuộc tính đã dịch (giữ __viAttr map)
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, CODE: 1, PRE: 1 };

  function splitWS(raw) {
    var lead = raw.match(/^\s*/)[0];
    var trail = raw.match(/\s*$/)[0];
    var core = raw.slice(lead.length, raw.length - trail.length);
    return { lead: lead, core: core, trail: trail };
  }

  function translateTextNode(node) {
    var raw = node.nodeValue;
    if (!raw || !/\S/.test(raw)) return;
    var parts = splitWS(raw);
    var norm = parts.core.replace(/\s+/g, ' ');
    if (!norm) return;
    var en = translateCore(norm);
    if (en == null) return;
    var next = parts.lead + en + parts.trail;
    if (next === raw) return;              // KHÔNG ghi lại giá trị y hệt → tránh
    // vòng lặp vô hạn của MutationObserver
    // (vd bản dịch trùng bản gốc như "Menu").
    if (node.__viOrig == null) node.__viOrig = raw;
    node.nodeValue = next;
    touchedText.add(node);
  }

  function translateAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var name = ATTRS[i];
      if (!el.hasAttribute || !el.hasAttribute(name)) continue;
      var val = el.getAttribute(name);
      var en = translateCore((val || '').replace(/\s+/g, ' ').trim());
      if (en == null || en === val) continue;   // trùng giá trị cũ → bỏ qua để
      // không kích hoạt observer vô hạn
      if (!el.__viAttr) el.__viAttr = {};
      if (el.__viAttr[name] == null) el.__viAttr[name] = val;
      el.setAttribute(name, en);
      touchedAttr.add(el);
    }
  }

  function walkEN(root) {
    if (!root) return;
    if (root.nodeType === 3) { translateTextNode(root); return; }
    if (root.nodeType !== 1) return;
    if (SKIP_TAGS[root.tagName] || root.hasAttribute('data-no-i18n')) return;
    translateAttrs(root);
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (n) {
        if (n.nodeType === 1) {
          if (SKIP_TAGS[n.tagName] || (n.hasAttribute && n.hasAttribute('data-no-i18n'))) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_SKIP; // duyệt con nhưng chỉ xử lý ở dưới
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    var elems = [];
    // xử lý text nodes
    while ((n = walker.nextNode())) translateTextNode(n);
    // xử lý thuộc tính của phần tử con
    var els = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (var i = 0; i < els.length; i++) {
      if (!SKIP_TAGS[els[i].tagName] && !els[i].hasAttribute('data-no-i18n')) translateAttrs(els[i]);
    }
  }

  function restoreVI() {
    touchedText.forEach(function (node) { if (node.__viOrig != null) node.nodeValue = node.__viOrig; });
    touchedText.clear();
    touchedAttr.forEach(function (el) {
      if (el.__viAttr) { for (var k in el.__viAttr) el.setAttribute(k, el.__viAttr[k]); }
    });
    touchedAttr.clear();
  }

  // ── Observer cho nội dung render động (chỉ khi đang EN) ──
  var observer = null;
  var applying = false;
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(function (muts) {
      if (lang !== 'en' || applying) return;
      applying = true;
      try {
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          if (m.type === 'childList') {
            for (var j = 0; j < m.addedNodes.length; j++) walkEN(m.addedNodes[j]);
          } else if (m.type === 'characterData') {
            translateTextNode(m.target);
          } else if (m.type === 'attributes' && m.target.nodeType === 1) {
            translateAttrs(m.target);
          }
        }
      } finally { applying = false; }
    });
    observer.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS
    });
  }

  function applyLang(next) {
    lang = (next === 'en') ? 'en' : 'vi';
    document.documentElement.setAttribute('lang', lang === 'en' ? 'en' : 'vi');
    applying = true;
    try {
      if (lang === 'en') walkEN(document.body);
      else restoreVI();
    } finally { applying = false; }
    // cập nhật nút switch
    var btns = document.querySelectorAll('#langSwitch .lang-btn');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].getAttribute('data-lang') === lang);
    // báo cho các module khác (vd tour) render lại theo ngôn ngữ mới
    try { window.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang: lang } })); } catch (e) { }
  }

  function setLang(next) {
    try { localStorage.setItem('aoc_lang', next); } catch (e) { }
    applyLang(next);
  }

  function detect() {
    try {
      var saved = localStorage.getItem('aoc_lang');
      if (saved === 'vi' || saved === 'en') return saved;
    } catch (e) { }
    var nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
    return nav.indexOf('vi') === 0 ? 'vi' : 'en';
  }

  function buildSwitch() {
    if (document.getElementById('langSwitch')) return;
    var header = document.querySelector('.header');
    if (!header) return;
    var wrap = document.createElement('div');
    wrap.className = 'lang-switch';
    wrap.id = 'langSwitch';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Language');
    wrap.setAttribute('data-no-i18n', '');
    wrap.innerHTML =
      '<button type="button" class="lang-btn" data-lang="vi">VI</button>' +
      '<button type="button" class="lang-btn" data-lang="en">EN</button>';
    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('.lang-btn');
      if (b) setLang(b.getAttribute('data-lang'));
    });
    // chèn trước nút lịch sử nếu có, không thì cuối nhóm nút bên phải
    // (Bootstrap navbar: nhóm nút nằm trong .ms-auto, không phải con trực tiếp .header)
    var group = header.querySelector('.ms-auto') || header;
    var hist = document.getElementById('historyBtn');
    if (hist && hist.parentNode === group) group.insertBefore(wrap, hist);
    else group.appendChild(wrap);
  }

  function init() {
    buildSwitch();
    startObserver();
    applyLang(detect());
  }

  // Script đặt cuối <body> → body đã sẵn sàng; init ngay để observer bắt
  // được nội dung do main.js (module, chạy sau) render.
  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);

  window.i18n = { setLang: setLang, getLang: function () { return lang; }, t: function (s) { return lang === 'en' ? (translateCore(String(s).replace(/\s+/g, ' ').trim()) || s) : s; } };
})();

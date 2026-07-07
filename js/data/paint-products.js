/* ============================================================
   data/paint-products.js — Danh mục sản phẩm sơn Paint & More (thật)
   Nguồn: https://paintandmore.vn/san-pham/ + trang chi tiết từng sản phẩm
   (đặc tính công khai trên web; Paint&More KHÔNG niêm yết định mức phủ/giá
   lẻ — mô hình liên hệ báo giá — nên KHÔNG bịa số m²/lít hay đơn giá riêng
   từng sản phẩm ở đây).
   Dùng để GỢI Ý sản phẩm theo 2 cách:
     1) TỰ ĐỘNG theo vùng màu/bề mặt khách đã chọn (productForZone/Surface).
     2) TƯ VẤN theo VẤN ĐỀ khách muốn giải quyết (CONCERNS + matchConcernsFromText)
        — khách tick chọn hoặc gõ mô tả tự do, hệ thống dò từ khoá rồi trỏ
        đúng dòng sơn chuyên dụng thay vì chỉ gợi ý theo màu.
   ============================================================ */

'use strict';

export const PRODUCTS = Object.freeze([
  {
    key: 'onecoat247',
    name: 'One Coat 247',
    tagline: 'Sơn nội thất 1 lớp — không mùi, VOC thấp',
    traits: ['Nội thất', 'Kháng kiềm pH13', 'Chống nứt/ẩm mốc', '1 lớp phủ kín'],
    url: 'https://paintandmore.vn/product/onecoat-247/',
  },
  {
    key: 'onecoat365',
    name: 'One Coat 365',
    tagline: 'Sơn ngoại thất 1 lớp — chống UV, chống thấm',
    traits: ['Ngoại thất', 'Chống UV/nứt/thấm/kiềm cao', 'Kháng khuẩn, chống rêu mốc', '1 lớp phủ kín'],
    url: 'https://paintandmore.vn/product/onecoat-365/',
  },
  {
    key: 'onecoatmono',
    name: 'One Coat Mono',
    tagline: 'Sơn lót mọi bề mặt',
    traits: ['Lót trước khi sơn màu', 'Dùng cho mọi bề mặt'],
    url: 'https://paintandmore.vn/product/onecoat-mono/',
  },
  {
    key: 'onecoathp',
    name: 'Onecoat HP',
    tagline: 'Sơn tường cao cấp',
    traits: ['Tường ngoại thất', 'Độ bền màu cao'],
    url: 'https://paintandmore.vn/product/onecoat-hp/',
  },
  {
    key: 'watertite',
    name: 'WATERTITE',
    tagline: 'Sơn chống thấm chuyên dụng',
    traits: ['Chống thấm', 'Sàn/mái/hồ bơi/khu vực ẩm ướt'],
    url: 'https://paintandmore.vn/san-pham/',
  },
  {
    key: 'durapoxyhp',
    name: 'DuraPoxy HP',
    tagline: 'Độ cứng tương đương epoxy — chống trầy, chịu va đập',
    traits: ['Chống trầy xước/va đập', 'Dễ lau chùi', 'Kháng nấm mốc', 'Tủ bếp/cửa/khu vực qua lại nhiều'],
    url: 'https://paintandmore.vn/product/durapoxy-hp/',
  },
  {
    key: 'keisoudo',
    name: 'KEISOUDO (đất tảo cát)',
    tagline: 'Tự điều hoà độ ẩm 40–60%, khử mùi — công nghệ Nhật Bản',
    traits: ['Hút ẩm/chống nấm mốc', 'Khử mùi (thuốc lá, thú cưng, đồ ăn)', 'An toàn cho phòng trẻ em'],
    url: 'https://paintandmore.vn/product/keisoudo-paint-plaster-dat-tao-cat/',
  },
  {
    key: 'paint9100dtm',
    name: '9100 DTM',
    tagline: 'Sơn công nghiệp — chịu tải nặng, kháng hoá chất',
    traits: ['Sàn để xe/nhà xưởng', 'Chịu tải xe nâng/ô tô', 'Chống rỉ sét/ăn mòn', 'Kháng hoá chất, cứng 4H+'],
    url: 'https://paintandmore.vn/product/9100-dtm/',
  },
  {
    key: 'onecoatbien',
    name: 'One Coat — Chuyên Sơn biển',
    tagline: 'Chuyên dụng vùng biển/duyên hải — công nghệ lá sen',
    traits: ['Chống ăn mòn muối biển', 'Đàn hồi cao 200–300%', 'Chống bám bẩn (lá sen)', '1 lớp phủ kín'],
    url: 'https://paintandmore.vn/product/onecoat-bien/',
  },
  {
    key: 'onecoatdexsmooth',
    name: 'One Coat DEX Smooth',
    tagline: 'Bề mặt mịn bóng, dễ vệ sinh — độ bền tương đương epoxy',
    traits: ['Đàn hồi 150–200%, chống nứt', 'Kháng nước/kiềm/mài mòn', 'Giữ màu & độ bóng lâu dài', 'Nội & ngoại thất'],
    url: 'https://paintandmore.vn/product/onecoat-dex-smooth/',
  },
  {
    key: 'onecoatdextextured',
    name: 'One Coat DEX Textured',
    tagline: 'Bề mặt sần chống trơn trượt — chịu tải xe, chống nứt chân chim',
    traits: ['Chống trơn trượt', 'Chịu tải xe (sân/lối đi)', 'Kháng nước/kiềm, chống mài mòn', 'Ngoại thất'],
    url: 'https://paintandmore.vn/product/onecoat-dex-textured/',
  },
  {
    key: 'k7781',
    name: 'K7781',
    tagline: 'Sơn lót kim loại — chống rỉ sét cho cổng/lan can/mái tôn',
    traits: ['Lót + phủ cho sắt/kim loại', 'Chống rỉ sét/ăn mòn', 'Độ phủ cao', 'Màu xám/đen'],
    url: 'https://paintandmore.vn/product/k7781/',
  },
  {
    key: 'pro2080',
    name: 'PRO 2080',
    tagline: 'Keo Silicone trám khe nứt — đàn hồi 800%',
    traits: ['Trám khe nứt tới 5cm', 'Dính nhôm/kính/đá/gỗ', 'Đàn hồi 800%, chống nứt', 'Chống UV, không mùi'],
    url: 'https://paintandmore.vn/product/pro-2080/',
  },
  {
    key: 'leakseal',
    name: 'Leak Seal',
    tagline: 'Xử lý dột/rò rỉ tại chỗ — mái, ống nước, vết nứt',
    traits: ['Bịt kín điểm rò rỉ', 'Chống ẩm/ăn mòn/rỉ sét', 'Mái, ống nước, khe nứt', 'Có màu, phủ được'],
    url: 'https://paintandmore.vn/product/leak-seal/',
  },
]);

export const PRODUCT_BY_KEY = Object.freeze(
  PRODUCTS.reduce((m, p) => { m[p.key] = p; return m; }, {}),
);

// Vùng màu cố định (walls/trims/accent) → sản phẩm theo LOẠI CÔNG TRÌNH
// (store.projectType: 'exterior' | 'interior') — ngoại thất dùng 365
// (chống UV/thấm), nội thất dùng 247 (không mùi, VOC thấp, ở ngay được).
const ZONE_PRODUCT = {
  exterior: { walls: 'onecoat365', trims: 'onecoat365', accent: 'onecoat365' },
  interior: { walls: 'onecoat247', trims: 'onecoat247', accent: 'onecoat247' },
};

// Bề mặt mở rộng (data/surfaces.js) → sản phẩm phù hợp theo đặc tính bề mặt.
const SURFACE_PRODUCT = {
  roof: 'watertite',
  floor: 'watertite',
  pool: 'watertite',
  fence: 'onecoat365',
  gate: 'onecoat365',
  brick: 'onecoat365',
  stone: 'onecoat365',
  metal: 'onecoat365',
  shutters: 'onecoat365',
  balcony: 'onecoat365',
  columns: 'onecoat365',
  awning: 'onecoat365',
  stairs: 'watertite',
  ceiling: 'onecoat247',
};

/** Sản phẩm gợi ý cho 1 vùng màu cố định (walls/trims/accent) theo loại công trình. */
export function productForZone(zoneKey, projectType = 'exterior') {
  const map = ZONE_PRODUCT[projectType === 'interior' ? 'interior' : 'exterior'];
  return PRODUCT_BY_KEY[map[zoneKey]] || null;
}

/** Sản phẩm gợi ý cho 1 bề mặt mở rộng (data/surfaces.js key). */
export function productForSurface(surfaceKey) {
  return PRODUCT_BY_KEY[SURFACE_PRODUCT[surfaceKey]] || null;
}

/** Sơn lót luôn được gợi ý kèm khi có ít nhất 1 vùng đã chọn màu. */
export function primerProduct() {
  return PRODUCT_BY_KEY.onecoatmono;
}

// ── Tư vấn theo VẤN ĐỀ khách muốn giải quyết ────────────────────
// Mỗi concern: nhãn hiển thị (checkbox) + sản phẩm gợi ý + từ khoá để dò
// trong ô mô tả tự do (không dấu, chữ thường — so khớp sau khi chuẩn hoá).
export const CONCERNS = Object.freeze([
  {
    key: 'durability',
    label: 'Tường chịu lực, chống trầy/mài mòn',
    productKeys: ['durapoxyhp'],
    keywords: ['chiu luc', 'chong tray', 'tray xuoc', 'chong mai mon', 'mai mon', 'chiu va dap', 'va dap', 'de trau', 'do ben cao', 'cung nhu epoxy'],
  },
  {
    key: 'humidity',
    label: 'Hút ẩm, chống nấm mốc, khử mùi',
    productKeys: ['keisoudo'],
    keywords: ['hut am', 'chong am', 'nam moc', 'am moc', 'khu mui', 'mui thuoc la', 'mui thu cung', 'kiem soat do am'],
  },
  {
    key: 'waterproof',
    label: 'Chống thấm nước',
    productKeys: ['watertite'],
    keywords: ['chong tham', 'tham nuoc', 'tham dot', 'dot noc', 'ri nuoc', 'ngam nuoc'],
  },
  {
    key: 'carfloor',
    label: 'Sàn chịu tải xe ô tô / nhà xưởng',
    productKeys: ['paint9100dtm'],
    keywords: ['san chiu luc', 'san de xe', 'de xe oto', 'do xe hoi', 'do oto', 'nha xuong', 'san cong nghiep', 'xe nang', 'gara', 'ga ra'],
  },
  {
    key: 'coastal',
    label: 'Nhà vùng biển / duyên hải',
    productKeys: ['onecoatbien'],
    keywords: ['vung bien', 'ven bien', 'duyen hai', 'gan bien', 'muoi bien', 'khong khi bien', 'nhiem man'],
  },
  {
    key: 'premiumwall',
    label: 'Tường sang trọng, bóng mịn, dễ lau chùi',
    productKeys: ['onecoatdexsmooth'],
    keywords: ['bong min', 'mong min', 'sang bong', 'de lau chui', 'de ve sinh', 'sang trong', 'cao cap'],
  },
  {
    key: 'antislip',
    label: 'Sân / lối đi ngoài trời chống trơn trượt',
    productKeys: ['onecoatdextextured'],
    keywords: ['tron truot', 'chong tron truot', 'chong truot', 'ngoai troi', 'loi di', 'ban cong tron'],
  },
  {
    key: 'metalrust',
    label: 'Kim loại/sắt chống rỉ sét (cổng, lan can, mái tôn)',
    productKeys: ['k7781'],
    keywords: ['chong ri set', 'ri set', 'cong sat', 'lan can', 'mai ton', 'kim loai', 'cua sat'],
  },
  {
    key: 'cracksealing',
    label: 'Trám khe nứt, chống nứt tường',
    productKeys: ['pro2080'],
    keywords: ['tram khe', 'khe nut', 'nut tuong', 'chong nut', 'nut chan chim', 'khe ho'],
  },
  {
    key: 'leakrepair',
    label: 'Xử lý dột / rò rỉ (mái, ống nước, vết nứt)',
    productKeys: ['leakseal'],
    keywords: ['dot mai', 'ro ri', 'ong nuoc bi ro', 'dot nuoc', 'ri set duong ong', 'thung mai'],
  },
]);

export const CONCERN_BY_KEY = Object.freeze(
  CONCERNS.reduce((m, c) => { m[c.key] = c; return m; }, {}),
);

/** Bỏ dấu tiếng Việt + hạ chữ thường, dùng để so khớp từ khoá không phân biệt dấu/hoa-thường. */
function stripDiacritics(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
}

/** Dò các concern khớp với 1 đoạn mô tả tự do (không cần đúng dấu/hoa-thường). */
export function matchConcernsFromText(text) {
  const norm = stripDiacritics(text);
  if (!norm.trim()) return [];
  return CONCERNS.filter((c) => c.keywords.some((kw) => norm.includes(kw))).map((c) => c.key);
}

/** Sản phẩm gợi ý cho 1 danh sách concern key đã chọn (bỏ trùng). */
export function productsForConcerns(concernKeys) {
  const seen = new Set();
  const out = [];
  (concernKeys || []).forEach((ck) => {
    const c = CONCERN_BY_KEY[ck];
    if (!c) return;
    c.productKeys.forEach((pk) => {
      if (seen.has(pk)) return;
      seen.add(pk);
      const p = PRODUCT_BY_KEY[pk];
      if (p) out.push({ product: p, concern: c });
    });
  });
  return out;
}

export default {
  PRODUCTS, PRODUCT_BY_KEY, productForZone, productForSurface, primerProduct,
  CONCERNS, CONCERN_BY_KEY, matchConcernsFromText, productsForConcerns,
};

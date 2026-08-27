'use strict';

// 极简 EXIF 解析：只提取拍摄时间（DateTimeOriginal，其次 DateTime）。
// 用于服务器侧把照片 EXIF 时间与提交的 capturedAt 交叉核对（防改时间/换图），
// 解析失败或缺失一律返回 null（不因此惩罚记录）。

function exifDateTime(buf) {
  try {
    if (!buf || buf.length < 8) return null;
    // sharp 的 metadata().exif 直接给出 'Exif\0\0' 开头的负载；完整 JPEG 则扫描 APP1 段。
    if (buf.subarray(0, 6).toString('ascii') === 'Exif\0\0') return tiffDate(buf.subarray(6));
    if (buf.readUInt16BE(0) !== 0xFFD8) return null;
    let off = 2;
    while (off + 4 <= buf.length) {
      if (buf[off] !== 0xFF) return null;
      const marker = buf[off + 1];
      if (marker === 0xE1) {
        const len = buf.readUInt16BE(off + 2);
        const seg = buf.subarray(off + 4, off + 2 + len);
        if (seg.length >= 6 && seg.toString('ascii', 0, 6) === 'Exif\0\0') return tiffDate(seg.subarray(6));
        return null;
      }
      if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD9)) { off += 2; continue; }
      if (marker === 0xDA) return null; // 图像数据开始，后面不会有 EXIF
      off += 2 + buf.readUInt16BE(off + 2);
    }
  } catch {}
  return null;
}

function tiffDate(t) {
  try {
    if (t.length < 8) return null;
    const little = t.readUInt16BE(0) === 0x4949;
    const r16 = (o) => (little ? t.readUInt16LE(o) : t.readUInt16BE(o));
    const r32 = (o) => (little ? t.readUInt32LE(o) : t.readUInt32BE(o));
    if (r16(2) !== 42) return null;
    let ifd = r32(4);
    while (ifd >= 8 && ifd + 2 <= t.length) {
      const n = r16(ifd);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 12 > t.length) return null;
        const tag = r16(e);
        if (tag === 0x9003 || tag === 0x0132) {
          const type = r16(e + 2);
          const count = r32(e + 4);
          if (type === 2 && count >= 19) {
            const vo = count > 4 ? r32(e + 8) : e + 8;
            if (vo + 19 > t.length) continue;
            const s = t.toString('ascii', vo, vo + 19).replace(/\0.*$/, '').trim();
            if (/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s;
          }
        }
      }
      const next = r32(ifd + 2 + n * 12);
      if (!next || next <= ifd || next + 2 > t.length) break;
      ifd = next;
    }
  } catch {}
  return null;
}

// 'YYYY:MM:DD HH:MM:SS' → Date（EXIF 无时区，按设备本地时间即北京时间解释）。
function parseExifDate(s) {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(s || ''));
  return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+08:00`) : null;
}

module.exports = { exifDateTime, parseExifDate };

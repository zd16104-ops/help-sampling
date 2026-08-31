'use strict';

const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');

const MM = 72 / 25.4;
const PAGE_WIDTH = 210 * MM;
const PAGE_HEIGHT = 297 * MM;
const COLUMNS = 5;
const ROWS = 12;
const LABELS_PER_PAGE = COLUMNS * ROWS;
const CELL_WIDTH = PAGE_WIDTH / COLUMNS;
const CELL_HEIGHT = PAGE_HEIGHT / ROWS;
const TYPE_NAMES = { R: '河水', T: '支流', S: '土壤', P: '植物', Y: '雨水', L: '湖水' };

function labelFontPath() {
  const windows = process.env.WINDIR || 'C:/Windows';
  const candidates = [
    process.env.LABEL_FONT_PATH,
    path.join(windows, 'Fonts', 'simhei.ttf'),
    path.join(windows, 'Fonts', 'msyh.ttc'),
    path.join(windows, 'Fonts', 'simsun.ttc')
  ].filter(Boolean);
  const font = candidates.find(file => fs.existsSync(file));
  if (!font) throw new Error('生成标签 PDF 需要中文字体，请设置 LABEL_FONT_PATH');
  return font;
}

function labelText(task) {
  return {
    code: String(task.sample_code || ''),
    type: String(TYPE_NAMES[task.sample_type] || task.sample_type || ''),
    site: `${String(task.site_code || '')} · ${String(task.site_name || '')}`
  };
}

function truncateToWidth(doc, value, width) {
  const text = String(value || '');
  if (doc.widthOfString(text) <= width) return text;
  const suffix = '…';
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (doc.widthOfString(text.slice(0, middle) + suffix) <= width) low = middle;
    else high = middle - 1;
  }
  return text.slice(0, low) + suffix;
}

function fittedLine(doc, value, x, y, width, maxSize, minSize, options = {}) {
  doc.fontSize(maxSize);
  const measured = doc.widthOfString(String(value || '')) || 1;
  const size = Math.max(minSize, Math.min(maxSize, maxSize * width * 0.96 / measured));
  doc.fontSize(size);
  const text = truncateToWidth(doc, value, width * 0.96);
  doc.text(text, x, y, { width, height: options.height || size * 1.25, lineBreak: false, align: options.align || 'left' });
}

function drawLabel(doc, task, x, y) {
  const border = 0.35 * MM;
  const qrSize = 21.8 * MM;
  const qrX = x + 1 * MM;
  const qrY = y + (CELL_HEIGHT - qrSize) / 2;
  const sideX = x + 23.2 * MM;
  const sideWidth = CELL_WIDTH - (sideX - x) - 1.2 * MM;
  const text = labelText(task);

  doc.save().lineWidth(border).strokeColor('#555555').rect(x, y, CELL_WIDTH, CELL_HEIGHT).stroke().restore();
  const qr = String(task.qr_data_url || '').replace(/^data:image\/png;base64,/, '');
  if (qr) doc.image(Buffer.from(qr, 'base64'), qrX, qrY, { width: qrSize, height: qrSize });

  doc.font('LabelFont').fillColor('#111111');
  const badgeWidth = Number(task.co_sited || 1) > 1 ? 5 * MM : 0;
  fittedLine(doc, text.code, sideX, y + 3.1 * MM, sideWidth - badgeWidth, 8.2, 4.2, { height: 3.5 * MM });

  if (badgeWidth) {
    const badgeX = x + CELL_WIDTH - 5 * MM;
    doc.save().roundedRect(badgeX, y + 1 * MM, 4 * MM, 3.2 * MM, 1 * MM).fill('#FDE4E2').restore();
    doc.fillColor('#9F332E').fontSize(5.4).text(`×${task.co_sited}`, badgeX, y + 1.55 * MM, { width: 4 * MM, align: 'center', lineBreak: false });
  }

  doc.fillColor('#0B7F6E');
  fittedLine(doc, text.type, sideX, y + 8.7 * MM, sideWidth, 15.5, 9.5, { height: 6.2 * MM });

  doc.fillColor('#333333').fontSize(6.2);
  doc.text(text.site, sideX, y + 16.6 * MM, { width: sideWidth, height: 6 * MM, lineGap: 0, ellipsis: true });
}

function renderLabelPdf(tasks) {
  if (!Array.isArray(tasks) || !tasks.length) throw new Error('没有可生成的标签');
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ autoFirstPage: false, size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0, compress: true,
      info: { Title: `瓶子标签 ${tasks.length} 枚`, Creator: '水样采集管理系统' } });
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      doc.registerFont('LabelFont', labelFontPath());
      tasks.forEach((task, index) => {
        if (index % LABELS_PER_PAGE === 0) doc.addPage({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0 });
        const pageIndex = index % LABELS_PER_PAGE;
        const column = pageIndex % COLUMNS;
        const row = Math.floor(pageIndex / COLUMNS);
        drawLabel(doc, task, column * CELL_WIDTH, row * CELL_HEIGHT);
      });
      doc.end();
    } catch (error) {
      doc.removeAllListeners();
      reject(error);
    }
  });
}

module.exports = { renderLabelPdf, labelText, TYPE_NAMES, LABELS_PER_PAGE };

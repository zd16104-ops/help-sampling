'use strict';

// A4 bottle label print page: 5 columns × 8 rows = 40 labels per page,
// fixed millimetre sizes, no reliance on browser scaling (spec section 8.3).
// Each label shows the QR code and the complete text sample code, plus the
// historical site code, Chinese sample type, planned date and project code.

const TYPE_NAMES = { R: '河流水', T: '支流', S: '土壤', P: '植物', Y: '雨水', L: '湖水' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// tasks: [{ sample_code, qr_value, qr_data_url, site_code, sample_type, planned_date, project_code }]
function renderLabelPage(tasks) {
  const pages = [];
  for (let i = 0; i < tasks.length; i += 40) {
    const cells = tasks.slice(i, i + 40).map(task => `
      <div class="label">
        <img class="qr" alt="二维码" src="${task.qr_data_url}">
        <div class="text">
          <div class="code">${escapeHtml(task.sample_code)}</div>
          <div class="meta">${escapeHtml(task.site_code)} · ${escapeHtml(TYPE_NAMES[task.sample_type] || task.sample_type)} · ${escapeHtml(task.planned_date)}</div>
          <div class="meta">${escapeHtml(task.project_code || 'BSC')} · 巴松措采样</div>
        </div>
      </div>`).join('');
    pages.push(`<div class="page">${cells}</div>`);
  }
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>瓶子标签 ${tasks.length} 枚</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; font-family: "Microsoft YaHei", sans-serif; }
  .page { width: 210mm; height: 297mm; page-break-after: always; display: flex; align-content: flex-start; flex-wrap: wrap; padding: 6mm 5mm 4mm 5mm; box-sizing: border-box; }
  .page:last-child { page-break-after: auto; }
  .label { width: 40mm; height: 30mm; box-sizing: border-box; border: 0.35mm solid #555; display: flex; align-items: center; gap: 1.5mm; padding: 1.5mm; margin: 0 0 2.5mm 0; }
  .qr { width: 15mm; height: 15mm; flex: none; }
  .text { min-width: 0; }
  .code { font-size: 3.2mm; font-weight: 900; letter-spacing: .1mm; word-break: break-all; }
  .meta { font-size: 2.4mm; color: #333; margin-top: 0.8mm; word-break: break-all; }
  @media print { .page { padding: 0; } }
</style>
</head>
<body>
${pages.join('\n')}
</body>
</html>`;
}

module.exports = { renderLabelPage, TYPE_NAMES };

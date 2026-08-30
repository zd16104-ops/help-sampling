'use strict';

// A4 bottle label print page: 5 columns × 12 rows = 60 labels per page,
// the grid fills the whole 210×297mm sheet with no gaps between labels.
// Each label: square QR (24.75mm, full cell height) on the left; on the right
// the site code (top, bold) and the Chinese sample type (bottom, enlarged).
// The complete sample code is encoded inside the QR (BSC-SAMPLE|code|token).

const TYPE_NAMES = { R: '河流水', T: '支流', S: '土壤', P: '植物', Y: '雨水', L: '湖水' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// tasks: [{ sample_code, qr_value, qr_data_url, site_code, sample_type, planned_date, project_code }]
function renderLabelPage(tasks) {
  const pages = [];
  for (let i = 0; i < tasks.length; i += 60) {
    const cells = tasks.slice(i, i + 60).map(task => `
      <div class="label">
        <img class="qr" alt="二维码" src="${task.qr_data_url}">
        <div class="side">
          <div class="site">${escapeHtml(task.site_code)}</div>
          <div class="type">${escapeHtml(TYPE_NAMES[task.sample_type] || task.sample_type)}</div>
        </div>
        ${task.co_sited > 1 ? `<div class="multi">×${task.co_sited}</div>` : ''}
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
  .page { width: 210mm; height: 297mm; page-break-after: always; display: grid; grid-template-columns: repeat(5, 42mm); grid-auto-rows: 24.75mm; box-sizing: border-box; }
  .page:last-child { page-break-after: auto; }
  .label { position: relative; box-sizing: border-box; border: 0.35mm solid #555; display: flex; align-items: center; }
  .qr { width: 24.75mm; height: 24.75mm; flex: none; }
  .side { min-width: 0; flex: 1; padding: 0 1.2mm; display: flex; flex-direction: column; justify-content: center; gap: 1mm; }
  .site { font-size: 5mm; font-weight: 900; word-break: break-all; }
  .type { font-size: 6.5mm; font-weight: 900; color: #0b5b45; word-break: break-all; }
  .multi { position: absolute; top: 0; right: 0; font-size: 2.6mm; font-weight: 900; color: #a02020; background: #ffe3e0; border: 0.3mm solid #c0392b; border-radius: 0 0 0 1mm; padding: .3mm .6mm; }
</style>
</head>
<body>
${pages.join('\n')}
</body>
</html>`;
}

module.exports = { renderLabelPage, TYPE_NAMES };

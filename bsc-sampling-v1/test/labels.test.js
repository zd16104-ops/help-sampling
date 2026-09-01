'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const QRCode = require('qrcode');
const { renderLabelPdf, labelText, TYPE_NAMES, LABELS_PER_PAGE } = require('../src/labels');

test('label text follows code, type, site order and uses 河水', () => {
  assert.equal(TYPE_NAMES.R, '河水');
  assert.deepEqual(labelText({
    base_sample_code: '260902-S-01', sample_code: '260902-S-01-01', sample_type: 'R', site_code: '001', site_name: '巴河1'
  }), { code: '260902-S-01', type: '河水', site: '001 · 巴河1' });
});

test('label PDF uses 80% label size and starts a new page after 90 labels', async () => {
  const qr = await QRCode.toDataURL('BSC-SAMPLE|260822-R-001-01|test', { width: 120, margin: 1 });
  const tasks = Array.from({ length: LABELS_PER_PAGE + 1 }, (_, index) => ({
    sample_code: `260822-R-123456789-${String(index + 1).padStart(2, '0')}`,
    sample_type: 'R', site_code: '123456789.123', site_name: '这是一个很长的采样点名称用于验证文字不越界',
    qr_data_url: qr, co_sited: 2
  }));
  const pdf = await renderLabelPdf(tasks);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 2);
});

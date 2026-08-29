'use strict';
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('water-sampling-system/data/sampling.sqlite', { readOnly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
console.log('tables:', JSON.stringify(tables));
for (const t of ['projects','sites','villagers','tasks','records','devices','activation_codes']) {
  if (!tables.includes(t)) { console.log(t, ': MISSING'); continue; }
  const c = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  console.log(`${t}: ${c} rows`);
}
if (tables.includes('tasks')) {
  const cols = db.prepare('PRAGMA table_info(tasks)').all().map(r => r.name);
  console.log('tasks columns:', JSON.stringify(cols));
  console.log('sample tasks:', JSON.stringify(db.prepare('SELECT * FROM tasks LIMIT 5').all()).slice(0, 800));
  console.log('null planned_date count:', db.prepare('SELECT COUNT(*) c FROM tasks WHERE planned_date IS NULL').get().c);
}
if (tables.includes('villagers')) console.log('villagers:', JSON.stringify(db.prepare('SELECT id,username,display_name FROM villagers').all()));
if (tables.includes('records')) console.log('records by date:', JSON.stringify(db.prepare("SELECT substr(captured_at,1,10) d, COUNT(*) c FROM records GROUP BY d ORDER BY d DESC LIMIT 10").all()));

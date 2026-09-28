'use strict';
// Link orphaned tracks only when their collector, site and actual track dates
// identify one task. Ambiguous matches remain available for manual review.
// node tools/backfill-journey-task.js          # dry-run (no writes)
// node tools/backfill-journey-task.js --apply  # write the backfill

const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { ORPHAN_JOURNEY_LINKS_SQL } = require('../src/task-collaboration');

const dryRun = !process.argv.includes('--apply');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data', 'v1'));
const dbPath = path.join(dataDir, 'bsc-v1.sqlite');
const db = new DatabaseSync(dbPath, { readOnly: dryRun });
console.log(`Database: ${dbPath}`);
db.exec('PRAGMA busy_timeout=5000');
db.exec('PRAGMA foreign_keys=ON');

try {
  if (!dryRun) db.exec('BEGIN IMMEDIATE');
  const orphans = db.prepare(`WITH orphan_journey_links AS MATERIALIZED (${ORPHAN_JOURNEY_LINKS_SQL})
    SELECT j.id,j.site_id,s.code site_code,
      (SELECT MIN(date(tp.recorded_at,'+8 hours')) FROM track_points tp WHERE tp.journey_id=j.id) min_d,
      (SELECT MAX(date(tp.recorded_at,'+8 hours')) FROM track_points tp WHERE tp.journey_id=j.id) max_d,
      (SELECT COUNT(*) FROM track_points tp WHERE tp.journey_id=j.id) pts,
      links.task_id
    FROM orphan_journey_links links JOIN journeys j ON j.id=links.journey_id
    LEFT JOIN sites s ON s.id=j.site_id
    ORDER BY j.id`).all();
  const updates = orphans.filter(o => o.task_id != null);
  console.log(`\nOrphan journeys with track points: ${orphans.length} | matched: ${updates.length} | skipped: ${orphans.length - updates.length}\n`);
  for (const o of orphans) {
    console.log(`${o.task_id == null ? 'SKIP ' : 'MATCH'} j#${o.id} site=${o.site_code} range=${o.min_d}..${o.max_d} pts=${o.pts} ${o.task_id == null ? '(no unique matching task)' : `-> task ${o.task_id}`}`);
  }
  if (dryRun) {
    console.log('\n[DRY-RUN] No changes written. Re-run with --apply to commit.');
  } else {
    const update = db.prepare('UPDATE journeys SET task_id=? WHERE id=? AND task_id IS NULL');
    for (const o of updates) update.run(o.task_id, o.id);
    db.exec('COMMIT');
    console.log(`\n[APPLIED] ${updates.length} journeys backfilled.`);
  }
} catch (error) {
  if (!dryRun) { try { db.exec('ROLLBACK'); } catch {} }
  throw error;
} finally {
  db.close();
}

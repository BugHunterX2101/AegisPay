import { migrate } from './migrate.ts';
import { closePool, getPool } from './pool.ts';

try {
  const { applied, skipped } = await migrate(getPool());
  console.log(`migrations: ${applied.length} applied, ${skipped.length} already up to date`);
  for (const n of applied) console.log(`  + ${n}`);
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await closePool();
}

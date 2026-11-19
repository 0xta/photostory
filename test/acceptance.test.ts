// test/acceptance.test.ts — Main test suite runner
import { execSync } from 'node:child_process';

const testFiles = [
  'test/phase1a.test.ts',
  'test/server.test.ts',
  'test/phase1b.test.ts',
  'test/phase1c.test.ts',
  'test/phase1d.test.ts',
  'test/phase1e.test.ts',
];

console.log('========================================================');
console.log('🧪 RUNNING FULL ACCEPTANCE TEST SUITE');
console.log('========================================================\n');

for (const file of testFiles) {
  console.log(`\n▶ Running ${file}...`);
  execSync(`npx tsx ${file}`, {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test' },
  });
}

console.log('\n========================================================');
console.log('🎉 ALL SUITES PASSED CLEANLY');
console.log('========================================================\n');

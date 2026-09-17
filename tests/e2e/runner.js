/**
 * Master E2E Test Suite Runner
 * Discord Talent Management & Automated YouTube Settlement Bot
 */

import { runTier1Tests } from './tier1_feature.test.js';
import { runTier2Tests } from './tier2_boundary.test.js';
import { runTier3Tests } from './tier3_pairwise.test.js';
import { runTier4Tests } from './tier4_workload.test.js';
import { runTier5Tests } from './tier5_adversarial.test.js';

const Colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

export async function runAll() {
  console.log(`\n${Colors.bright}${Colors.cyan}=================================================================${Colors.reset}`);
  console.log(`${Colors.bright}${Colors.cyan}  DISCORD TALENT MANAGEMENT & YOUTUBE SETTLEMENT BOT - E2E SUITE${Colors.reset}`);
  console.log(`${Colors.bright}${Colors.cyan}=================================================================${Colors.reset}\n`);

  const startTime = Date.now();
  const allResults = [];

  const tiers = [
    { name: 'Tier 1: Feature Coverage (R1 - R6)', runner: runTier1Tests },
    { name: 'Tier 2: Boundary Value Analysis & Edge Cases', runner: runTier2Tests },
    { name: 'Tier 3: Pairwise Combinations & State Shifts', runner: runTier3Tests },
    { name: 'Tier 4: Real-World Workload Scenarios', runner: runTier4Tests },
    { name: 'Tier 5: Adversarial Coverage Hardening', runner: runTier5Tests }
  ];

  for (const tier of tiers) {
    console.log(`${Colors.bright}${Colors.blue}--- Running ${tier.name} ---${Colors.reset}`);
    const tierResults = await tier.runner();
    allResults.push(...tierResults);

    for (const res of tierResults) {
      if (res.passed) {
        console.log(`  ${Colors.green}✔ PASS${Colors.reset} : ${res.name}`);
      } else {
        console.log(`  ${Colors.red}✖ FAIL${Colors.reset} : ${res.name}`);
        if (res.error) {
          console.log(`    ${Colors.red}${res.error.stack || res.error.message}${Colors.reset}`);
        }
      }
    }
    console.log('');
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const total = allResults.length;
  const passed = allResults.filter(r => r.passed).length;
  const failed = allResults.filter(r => !r.passed).length;

  console.log(`${Colors.bright}${Colors.cyan}=================================================================${Colors.reset}`);
  console.log(`${Colors.bright}TEST SUITE EXECUTION SUMMARY${Colors.reset}`);
  console.log(`${Colors.bright}${Colors.cyan}=================================================================${Colors.reset}`);

  // Summary per tier
  for (const tier of tiers) {
    const tierItems = allResults.filter(r => r.tier.startsWith(tier.name.split(' (')[0].split(':')[0]));
    const tPassed = tierItems.filter(r => r.passed).length;
    const tTotal = tierItems.length;
    const status = tPassed === tTotal ? `${Colors.green}PASS (${tPassed}/${tTotal})${Colors.reset}` : `${Colors.red}FAIL (${tPassed}/${tTotal})${Colors.reset}`;
    console.log(`  • ${tier.name.padEnd(50, ' ')} : ${status}`);
  }

  console.log('-----------------------------------------------------------------');
  console.log(`  Total Test Cases : ${total}`);
  console.log(`  Passed           : ${Colors.green}${passed}${Colors.reset}`);
  console.log(`  Failed           : ${failed > 0 ? Colors.red + failed + Colors.reset : Colors.green + '0' + Colors.reset}`);
  console.log(`  Duration         : ${duration}s`);
  console.log(`${Colors.bright}${Colors.cyan}=================================================================${Colors.reset}\n`);

  if (failed > 0) {
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }

  return { total, passed, failed, duration, results: allResults };
}

// Auto-run if executed directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('runner.js')) {
  runAll();
}

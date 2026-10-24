import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { audit } from '../src/audit.js';
import { findBrowser, launchBrowser } from '../src/browser.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', 'fixtures');
const fixtureUrl = name => pathToFileURL(join(fixtures, name)).href;

const cases = [
  { file: 'ignored.html', expected: 'ignored', scroll: false },
  { file: 'partial.html', expected: 'partial', scroll: false },
  { file: 'respected.html', expected: 'respected', scroll: false },
  { file: 'static.html', expected: 'none', scroll: false },
  { file: 'scroll-triggered.html', expected: 'ignored', scroll: true }
];

const browser = await launchBrowser(findBrowser());
let failures = 0;

try {
  for (const testCase of cases) {
    const result = await audit(browser, fixtureUrl(testCase.file), {
      settle: 150,
      window: 900,
      scroll: testCase.scroll,
      timeout: 15000
    });

    const pass = result.verdict === testCase.expected;
    if (!pass) failures += 1;

    const summary = `${result.verdict} (expected ${testCase.expected}) · score ${result.score} · still ${result.counts.still}/${result.counts.baseline} · events ${result.counts.events}`;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${testCase.file.padEnd(22)} ${summary}`);

    if (testCase.file === 'ignored.html') {
      assert.ok(result.counts.still > 0, 'ignored fixture should keep animations running');
      assert.ok(result.counts.infinite > 0, 'ignored fixture should report infinite loops');
    }
    if (testCase.expected === 'respected') {
      assert.equal(result.counts.still, 0, 'respected fixture should stop every animation');
    }
    if (testCase.expected === 'partial') {
      assert.ok(result.counts.still > 0, 'partial fixture should keep at least one animation');
    }
    if (testCase.file === 'partial.html') {
      assert.ok(result.counts.baseline > result.counts.still, 'partial fixture should stop at least one animation');
    }
    if (testCase.expected === 'none') {
      assert.equal(result.counts.baseline, 0, 'static fixture should have no animations');
    }
    if (testCase.file === 'scroll-triggered.html') {
      assert.ok(result.counts.events > 0, 'scroll-triggered transitions should be captured from events');
    }
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nall fixtures behaved as expected' : `\n${failures} fixture(s) failed`);
process.exitCode = failures === 0 ? 0 : 1;

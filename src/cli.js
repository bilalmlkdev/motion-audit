import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { audit } from './audit.js';
import { findBrowser, launchBrowser } from './browser.js';
import { renderHtml } from './report/html.js';
import { renderTerminal } from './report/terminal.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const SEVERITY = { none: 0, respected: 1, partial: 2, ignored: 3 };

const HELP = `
  motion-audit ${pkg.version} — does this page respect prefers-reduced-motion?

  Usage
    motion-audit <url> [options]

  Options
    --json                print the raw result as JSON
    --html <file>         write a standalone HTML report
    --settle <ms>         wait after load before observing (default 400)
    --window <ms>         how long to watch for motion (default 1500)
    --timeout <ms>        navigation timeout (default 30000)
    --no-scroll           skip scrolling (faster, misses scroll-triggered motion)
    --fail-on <level>     exit 1 on this verdict or worse: partial | ignored
    --chrome <path>       browser binary to drive (default: auto-detect)
    --quiet               one line of output, good for scripts
    -h, --help            show this help
    -v, --version         show the version

  Examples
    motion-audit https://example.com
    motion-audit https://example.com --html report.html
    motion-audit https://example.com --fail-on ignored --quiet

  Exit codes
    0  audit finished, within threshold
    1  verdict met the --fail-on threshold
    2  usage error or the audit could not run
`.trimEnd();

function parseNumber(name, value, fallback) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${name} expects a positive number, got "${value}"`);
  }
  return number;
}

export function parseArgs(argv) {
  const args = {
    url: null,
    json: false,
    html: null,
    quiet: false,
    scroll: true,
    chrome: null,
    settle: 400,
    window: 1500,
    timeout: 30000,
    failOn: null,
    help: false,
    version: false
  };

  const takeValue = (index, flag) => {
    const value = argv[index + 1];
    if (value == null || value.startsWith('-')) throw new Error(`${flag} needs a value`);
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const [flag, inline] = arg.startsWith('--') ? arg.split(/=(.*)/s) : [arg, undefined];

    switch (flag) {
      case '-h':
      case '--help':
        args.help = true;
        break;
      case '-v':
      case '--version':
        args.version = true;
        break;
      case '--json':
        args.json = true;
        break;
      case '--quiet':
        args.quiet = true;
        break;
      case '--no-scroll':
        args.scroll = false;
        break;
      case '--html':
        args.html = inline ?? takeValue(i, '--html');
        if (inline == null) i += 1;
        break;
      case '--chrome':
        args.chrome = inline ?? takeValue(i, '--chrome');
        if (inline == null) i += 1;
        break;
      case '--settle':
        args.settle = parseNumber('--settle', inline ?? takeValue(i, '--settle'));
        if (inline == null) i += 1;
        break;
      case '--window':
        args.window = parseNumber('--window', inline ?? takeValue(i, '--window'));
        if (inline == null) i += 1;
        break;
      case '--timeout':
        args.timeout = parseNumber('--timeout', inline ?? takeValue(i, '--timeout'));
        if (inline == null) i += 1;
        break;
      case '--fail-on': {
        const value = inline ?? takeValue(i, '--fail-on');
        if (inline == null) i += 1;
        if (!['partial', 'ignored'].includes(value)) {
          throw new Error('--fail-on accepts "partial" or "ignored"');
        }
        args.failOn = value;
        break;
      }
      default:
        if (arg.startsWith('-')) throw new Error(`unknown option "${arg}"`);
        if (args.url) throw new Error('only one URL can be audited at a time');
        args.url = arg;
    }
  }

  return args;
}

export function normaliseUrl(input) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) return input;
  if (input.startsWith('//')) return `https:${input}`;

  const asPath = resolve(input);
  if (existsSync(asPath)) return pathToFileURL(asPath).href;

  return `https://${input}`;
}

export async function run(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(`motion-audit: ${error.message}`);
    console.error('Try: motion-audit --help');
    return 2;
  }

  if (args.help) {
    console.log(HELP);
    return 0;
  }
  if (args.version) {
    console.log(pkg.version);
    return 0;
  }
  if (!args.url) {
    console.error(HELP);
    return 2;
  }

  const url = normaliseUrl(args.url);
  let browser;

  try {
    const executablePath = findBrowser(args.chrome);
    browser = await launchBrowser(executablePath);

    const result = await audit(browser, url, {
      settle: args.settle,
      window: args.window,
      timeout: args.timeout,
      scroll: args.scroll
    });

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (args.quiet) {
      console.log(`${result.verdict}\t${result.score}\t${result.url}`);
    } else {
      console.log(renderTerminal(result));
    }

    if (args.html) {
      await writeFile(args.html, renderHtml(result), 'utf8');
      if (!args.quiet) console.log(`  report written to ${args.html}\n`);
    }

    if (args.failOn && SEVERITY[result.verdict] >= SEVERITY[args.failOn]) return 1;
    return 0;
  } catch (error) {
    console.error(`motion-audit: ${error.message}`);
    return 2;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import puppeteer from 'puppeteer-core';

const PATH_NAMES = {
  linux: [
    'brave-browser',
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    'microsoft-edge',
    'microsoft-edge-stable'
  ],
  darwin: ['Google Chrome', 'Chromium', 'Brave Browser', 'Microsoft Edge'],
  win32: ['chrome.exe', 'msedge.exe', 'brave.exe']
};

const ABSOLUTE = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
  ],
  linux: []
};

function which(name) {
  const path = process.env.PATH || '';
  for (const dir of path.split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function findBrowser(explicit) {
  const requested = explicit || process.env.MOTION_AUDIT_CHROME || process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (requested) {
    if (!existsSync(requested)) {
      throw new Error(`Browser not found at ${requested}`);
    }
    return requested;
  }

  const platform = process.platform;
  for (const candidate of ABSOLUTE[platform] || []) {
    if (existsSync(candidate)) return candidate;
  }

  for (const name of PATH_NAMES[platform] || PATH_NAMES.linux) {
    const found = which(name);
    if (found) return found;
  }

  throw new Error(
    'No Chromium-based browser found. Install Chrome, Chromium, Edge or Brave, or pass --chrome <path>.'
  );
}

export async function launchBrowser(browserPath) {
  return puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--hide-scrollbars',
      '--mute-audio',
      // Software-rendered WebGL can pin the main thread for tens of seconds on
      // demo-heavy pages. The audit only reads DOM/CSS animation, so turn it off.
      '--disable-webgl',
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });
}

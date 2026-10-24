import { readFileSync } from 'node:fs';
import { startObservation, stopObservation } from './collect.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const animationKey = animation => `${animation.selector}|${animation.kind}|${animation.name}`;

function mergeObservation(started, stopped) {
  const merged = new Map();

  const add = animation => {
    if (!animation || !animation.selector) return;
    const key = animationKey(animation);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, animation);
      return;
    }
    if (animation.infinite && !existing.infinite) {
      merged.set(key, { ...existing, infinite: true, iterations: 'infinite' });
    }
  };

  stopped.after.forEach(add);
  started.before.forEach(add);
  stopped.events.forEach(add);

  return {
    url: stopped.url,
    title: stopped.title,
    viewport: stopped.viewport,
    reducedMotionMatches: stopped.reducedMotionMatches,
    running: Array.from(merged.values()),
    autoplayVideos: stopped.autoplayVideos,
    smoothScroll: stopped.smoothScroll,
    marquees: stopped.marquees,
    events: stopped.events.length
  };
}

async function scrollPage(page, height) {
  // Fixed step count rather than one step per 640px: lazy-loaded pages can be
  // tens of thousands of pixels tall, and walking them steals the whole run.
  const steps = Math.min(14, Math.max(4, Math.ceil(height / 700)));
  const step = Math.ceil(height / steps);

  for (let index = 1; index <= steps; index += 1) {
    const top = Math.min(height, step * index);
    await page.evaluate(
      value => window.scrollTo({ top: value, left: 0, behavior: 'instant' }),
      top
    );
    await sleep(80);
  }

  await page.evaluate(() =>
    window.scrollTo({ top: document.documentElement.scrollHeight, left: 0, behavior: 'instant' })
  );
  await sleep(120);
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await sleep(120);
}

async function collectPass(browser, url, mode, options) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: mode }]);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeout });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      throw new Error(`Could not load ${url}: ${message}`);
    }

    await page.waitForNetworkIdle({ idleTime: 400, timeout: 2500 }).catch(() => {});
    await sleep(options.settle);

    const started = await page.evaluate(startObservation);

    if (options.scroll) await scrollPage(page, started.scrollHeight);
    await sleep(options.window);

    const stopped = await page.evaluate(stopObservation);
    if (!stopped) {
      throw new Error('Observation state was lost — the page may have navigated during the audit.');
    }

    return mergeObservation(started, stopped);
  } finally {
    await page.close().catch(() => {});
  }
}

function dedupe(animations) {
  const seen = new Map();
  for (const animation of animations) seen.set(animationKey(animation), animation);
  return Array.from(seen.values());
}

function rank(a, b) {
  if (a.infinite !== b.infinite) return a.infinite ? -1 : 1;
  if (a.coversViewport !== b.coversViewport) return a.coversViewport ? -1 : 1;
  return b.duration - a.duration;
}

export function summarise(passes, options = {}) {
  const allowed = passes['no-preference'];
  const reduced = passes.reduce;

  const baseline = allowed.running.length;
  const still = reduced.running.length;
  const ratio = baseline > 0 ? still / baseline : still > 0 ? 1 : 0;

  const offenders = dedupe(reduced.running).sort(rank);
  const infinite = offenders.filter(item => item.infinite);
  const large = infinite.filter(item => item.coversViewport);
  const videos = reduced.autoplayVideos.filter(video => !video.paused);
  const unmuted = videos.filter(video => !video.muted);

  let verdict;
  if (still === 0 && baseline === 0) verdict = 'none';
  else if (still === 0) verdict = 'respected';
  else if (baseline > 0 && ratio >= 0.75) verdict = 'ignored';
  else verdict = 'partial';

  let score = 100;
  if (verdict === 'ignored') score -= 45;
  if (verdict === 'partial') score -= 18;
  score -= Math.min(24, infinite.length * 3);
  score -= Math.min(16, large.length * 4);
  if (reduced.smoothScroll) score -= 8;
  score -= Math.min(10, unmuted.length * 10);
  if (reduced.marquees > 0) score -= 8;
  if (verdict === 'partial' && ratio >= 0.5) score -= 8;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const warnings = [];
  if (!reduced.reducedMotionMatches) {
    warnings.push('prefers-reduced-motion emulation did not report as active — results may be unreliable.');
  }
  if (options.scroll === false) {
    warnings.push('Page was not scrolled, so scroll-triggered animations may be missing.');
  }
  if (baseline === 0 && still > 0) {
    warnings.push('The motion-allowed pass saw no animations, so this comparison is weak — try a longer --window.');
  }

  return {
    tool: 'motion-audit',
    version: pkg.version,
    url: options.url || allowed.url,
    finalUrl: reduced.url,
    title: reduced.title || allowed.title,
    generatedAt: new Date().toISOString(),
    viewport: reduced.viewport,
    verdict,
    score,
    emulated: reduced.reducedMotionMatches === true,
    counts: {
      baseline,
      still,
      infinite: infinite.length,
      large: large.length,
      events: reduced.events,
      autoplayVideos: videos.length,
      unmutedAutoplay: unmuted.length,
      smoothScroll: reduced.smoothScroll,
      marquees: reduced.marquees
    },
    offenders: offenders.slice(0, 40),
    videos,
    warnings
  };
}

export async function audit(browser, url, options = {}) {
  const resolved = {
    settle: 400,
    window: 1500,
    timeout: 30000,
    scroll: true,
    ...options
  };

  const allowed = await collectPass(browser, url, 'no-preference', resolved);
  const reduced = await collectPass(browser, url, 'reduce', resolved);

  return summarise({ 'no-preference': allowed, reduce: reduced }, { ...resolved, url });
}

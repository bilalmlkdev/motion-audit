/**
 * These functions run inside the page. They must stay self-contained: puppeteer
 * serialises them and evaluates them in the browser, so they cannot close over
 * anything. Shared state lives on `window.__motionAudit`.
 *
 * Pacing happens on the Node side (see audit.js) because browsers throttle
 * timers in background tabs, which would stretch a 1.5s observation window into
 * tens of seconds.
 */

export function startObservation() {
  const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);

  function selectorFor(el) {
    if (!el || el.nodeType !== 1) return null;
    const parts = [];
    let node = el;
    let depth = 0;

    while (node && node.nodeType === 1 && depth < 6) {
      let part = node.tagName.toLowerCase();

      if (node.id) {
        parts.unshift(`${part}#${node.id}`);
        break;
      }

      const classes = Array.from(node.classList || [])
        .filter(name => name && !/^[0-9]/.test(name))
        .slice(0, 2);
      if (classes.length) part += `.${classes.join('.')}`;

      const parent = node.parentElement;
      if (parent) {
        const index = Array.prototype.indexOf.call(parent.children, node) + 1;
        part += `:nth-child(${index})`;
      }

      parts.unshift(part);
      node = parent;
      depth += 1;
    }

    return parts.join(' > ').slice(0, 160);
  }

  function rectOf(el) {
    if (!el || el.nodeType !== 1 || typeof el.getBoundingClientRect !== 'function') return null;
    const box = el.getBoundingClientRect();
    const area = Math.max(0, box.width) * Math.max(0, box.height);
    return {
      width: Math.round(box.width),
      height: Math.round(box.height),
      share: Math.round((area / viewportArea) * 100)
    };
  }

  function describeTarget(target, kind, name, duration, iterations, selector) {
    const rect = rectOf(target);
    const infinite = iterations === Infinity || iterations === 'infinite';
    return {
      selector: selector || selectorFor(target),
      kind,
      name,
      duration: Math.round(duration),
      iterations: infinite ? 'infinite' : iterations,
      infinite,
      rect,
      coversViewport: rect ? rect.share >= 25 : false
    };
  }

  function snapshot() {
    const running = [];

    for (const animation of document.getAnimations()) {
      if (animation.playState !== 'running') continue;

      const effect = animation.effect;
      const target = effect && effect.target;
      if (!target || target.nodeType !== 1) continue;

      const timing = typeof effect.getTiming === 'function' ? effect.getTiming() : {};
      const iterations = timing.iterations == null ? 1 : timing.iterations;
      const duration = typeof timing.duration === 'number' ? timing.duration : 0;
      const kind = animation.constructor && animation.constructor.name ? animation.constructor.name : 'Animation';
      const name = animation.animationName || animation.transitionProperty || '(script)';

      running.push(describeTarget(target, kind, name, duration, iterations));
    }

    const autoplayVideos = Array.from(document.querySelectorAll('video[autoplay]')).map(video => ({
      selector: selectorFor(video),
      muted: Boolean(video.muted) || video.volume === 0,
      paused: Boolean(video.paused),
      src: (video.currentSrc || video.src || '').slice(0, 120)
    }));

    const rootStyle = getComputedStyle(document.documentElement);
    const bodyStyle = document.body ? getComputedStyle(document.body) : null;

    return {
      running,
      autoplayVideos,
      smoothScroll:
        rootStyle.scrollBehavior === 'smooth' || (bodyStyle ? bodyStyle.scrollBehavior === 'smooth' : false),
      marquees: document.querySelectorAll('marquee').length
    };
  }

  const state = { events: new Map() };

  function recordEvent(event) {
    const target = event.target;
    if (!target || target.nodeType !== 1) return;

    const isAnimation = event.type === 'animationstart';
    const name = isAnimation ? event.animationName : event.propertyName;
    if (!name) return;

    const kind = isAnimation ? 'CSSAnimation' : 'CSSTransition';
    const selector = selectorFor(target);
    if (!selector) return;

    // Dedupe before touching computed style: a page with a global
    // `transition: all` can fire the same event hundreds of times while
    // scrolling, and every getComputedStyle call forces layout.
    const key = `${selector}|${kind}|${name}`;
    if (state.events.has(key) || state.events.size >= 400) return;

    const computed = getComputedStyle(target);
    const durations = String(isAnimation ? computed.animationDuration : computed.transitionDuration)
      .split(',')
      .map(value => parseFloat(value) || 0);
    const iterations = isAnimation ? String(computed.animationIterationCount).split(',')[0].trim() : '1';
    const parsedIterations = iterations === 'infinite' ? Infinity : Number(iterations) || 1;
    const hasDuration = durations.some(value => value > 0);
    if (!hasDuration && parsedIterations !== Infinity) return;

    state.events.set(
      key,
      describeTarget(target, kind, name, (durations[0] || 0) * 1000, parsedIterations, selector)
    );
  }

  document.addEventListener('animationstart', recordEvent, true);
  document.addEventListener('transitionrun', recordEvent, true);

  const before = snapshot();
  window.__motionAudit = { state, recordEvent, snapshot };

  return {
    url: location.href,
    title: document.title,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    reducedMotionMatches: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    before: before.running,
    autoplayVideos: before.autoplayVideos,
    smoothScroll: before.smoothScroll,
    marquees: before.marquees,
    scrollHeight: Math.max(
      document.body ? document.body.scrollHeight : 0,
      document.documentElement ? document.documentElement.scrollHeight : 0
    )
  };
}

export function stopObservation() {
  const bag = window.__motionAudit;
  if (!bag) return null;

  document.removeEventListener('animationstart', bag.recordEvent, true);
  document.removeEventListener('transitionrun', bag.recordEvent, true);

  const after = bag.snapshot();
  const events = Array.from(bag.state.events.values());
  delete window.__motionAudit;

  return {
    url: location.href,
    title: document.title,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    reducedMotionMatches: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    after: after.running,
    events,
    autoplayVideos: after.autoplayVideos,
    smoothScroll: after.smoothScroll,
    marquees: after.marquees
  };
}

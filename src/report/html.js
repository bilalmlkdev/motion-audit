const ACCENTS = {
  ignored: '#ff5d73',
  partial: '#ffb020',
  respected: '#35d07f',
  none: '#8b94a8'
};

const COPY = {
  ignored: {
    heading: 'Ignores prefers-reduced-motion',
    blurb: count =>
      `${count} animation${count === 1 ? '' : 's'} kept running after the user asked for less motion.`
  },
  partial: {
    heading: 'Partially respects prefers-reduced-motion',
    blurb: count =>
      `Most motion stopped, but ${count} animation${count === 1 ? '' : 's'} kept running.`
  },
  respected: {
    heading: 'Respects prefers-reduced-motion',
    blurb: () => 'Every animation stopped once the preference was applied.'
  },
  none: {
    heading: 'No motion detected',
    blurb: () => 'Nothing was animating at the time of the audit.'
  }
};

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function formatDuration(ms) {
  if (!ms) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function statCard(label, value, note) {
  return `
      <div class="stat">
        <div class="stat-label">${escapeHtml(label)}</div>
        <div class="stat-value">${escapeHtml(value)}</div>
        ${note ? `<div class="stat-note">${escapeHtml(note)}</div>` : ''}
      </div>`;
}

export function renderHtml(result) {
  const accent = ACCENTS[result.verdict] || ACCENTS.none;
  const copy = COPY[result.verdict] || COPY.none;
  const { counts } = result;
  const host = hostnameOf(result.url);
  const generated = new Date(result.generatedAt);

  const rows = result.offenders
    .map(item => {
      const share = item.rect && item.rect.share ? `${item.rect.share}%` : '—';
      const loops = item.infinite ? '<span class="pill pill-loop">∞ infinite</span>' : 'once';
      return `
        <tr>
          <td class="mono sel" title="${escapeHtml(item.selector)}">${escapeHtml(item.selector)}</td>
          <td class="mono">${escapeHtml(item.name)}</td>
          <td>${escapeHtml(formatDuration(item.duration))}</td>
          <td>${escapeHtml(share)}</td>
          <td>${loops}</td>
        </tr>`;
    })
    .join('');

  const videoSection = result.videos.length
    ? `
    <section class="panel">
      <h2>Autoplaying video</h2>
      <ul class="videos">
        ${result.videos
          .map(
            video => `<li>
          <span class="mono">${escapeHtml(video.selector)}</span>
          <span class="tag ${video.muted ? 'ok' : 'warn'}">${video.muted ? 'muted' : 'unmuted'}</span>
        </li>`
          )
          .join('')}
      </ul>
    </section>`
    : '';

  const warningSection = result.warnings.length
    ? `<div class="warnings">${result.warnings
        .map(warning => `<p>! ${escapeHtml(warning)}</p>`)
        .join('')}</div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>motion-audit · ${escapeHtml(host)}</title>
<style>
  :root {
    --bg: #080a0f;
    --panel: #10131b;
    --panel-2: #141824;
    --line: rgba(255, 255, 255, 0.07);
    --text: #e8ebf2;
    --muted: #8b94a8;
    --accent: ${accent};
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background:
      radial-gradient(900px 420px at 18% -10%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 70%),
      var(--bg);
    color: var(--text);
    font-family: ui-sans-serif, -apple-system, "Segoe UI", Inter, Roboto, sans-serif;
    font-size: 15px;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }
  .mono { font-family: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace; font-size: 12.5px; }
  main { max-width: 940px; margin: 0 auto; padding: 46px 28px 64px; }

  header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .brand { font-weight: 700; letter-spacing: -0.02em; font-size: 17px; }
  .brand span { color: var(--accent); }
  .url { color: var(--muted); font-size: 13px; word-break: break-all; }

  .hero { display: flex; align-items: center; gap: 30px; margin: 40px 0 34px; flex-wrap: wrap; }
  .score-ring {
    --score: ${result.score};
    width: 132px; height: 132px; flex: 0 0 auto; border-radius: 50%;
    background: conic-gradient(var(--accent) calc(var(--score) * 1%), rgba(255,255,255,0.06) 0);
    display: grid; place-items: center; position: relative;
  }
  .score-ring::after {
    content: ""; position: absolute; inset: 9px; border-radius: 50%; background: #0b0e15;
    border: 1px solid var(--line);
  }
  .score-inner { position: relative; z-index: 1; text-align: center; }
  .score-num { font-size: 40px; font-weight: 700; letter-spacing: -0.03em; line-height: 1; }
  .score-max { color: var(--muted); font-size: 12px; }

  .verdict { min-width: 260px; flex: 1; }
  .verdict .eyebrow { color: var(--accent); font-size: 12px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; }
  .verdict h1 { font-size: 30px; line-height: 1.15; letter-spacing: -0.025em; margin: 8px 0 10px; }
  .verdict p { color: var(--muted); margin: 0; max-width: 48ch; }

  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 34px; }
  .stat { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; }
  .stat-label { color: var(--muted); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.08em; }
  .stat-value { font-size: 24px; font-weight: 650; letter-spacing: -0.02em; margin-top: 4px; }
  .stat-note { color: var(--muted); font-size: 11.5px; margin-top: 2px; }

  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 22px 24px; margin-bottom: 18px; }
  .panel h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.09em; color: var(--muted); margin: 0 0 16px; font-weight: 600; }

  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); font-weight: 600; padding-bottom: 10px; }
  td { padding: 9px 12px 9px 0; border-top: 1px solid var(--line); vertical-align: top; }
  .sel { max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #cfd6e6; }

  .pill { display: inline-block; font-size: 11px; padding: 1px 7px; border-radius: 999px; white-space: nowrap; }
  .pill-loop { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); }

  .videos { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .videos li { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
  .tag { font-size: 11px; padding: 1px 7px; border-radius: 999px; }
  .tag.ok { background: rgba(53, 208, 127, 0.12); color: #35d07f; }
  .tag.warn { background: rgba(255, 176, 32, 0.12); color: #ffb020; }

  .warnings { border: 1px dashed var(--line); border-radius: 12px; padding: 12px 16px; margin-bottom: 18px; }
  .warnings p { margin: 0; color: var(--muted); font-size: 12.5px; }

  .note { color: var(--muted); font-size: 13px; margin: 26px 0 0; }
  .note code { background: var(--panel-2); padding: 1px 6px; border-radius: 5px; font-size: 12px; }
  footer { margin-top: 34px; padding-top: 18px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }

  @media (max-width: 620px) {
    .verdict h1 { font-size: 24px; }
    .score-ring { width: 108px; height: 108px; }
    .score-num { font-size: 32px; }
    td:nth-child(2), th:nth-child(2) { display: none; }
  }
  @media print { body { background: #fff; color: #111; } }
</style>
</head>
<body>
<main>
  <header>
    <div class="brand">motion<span>·</span>audit</div>
    <div class="url">${escapeHtml(result.url)}</div>
  </header>

  <section class="hero">
    <div class="score-ring">
      <div class="score-inner">
        <div class="score-num">${result.score}</div>
        <div class="score-max">out of 100</div>
      </div>
    </div>
    <div class="verdict">
      <div class="eyebrow">prefers-reduced-motion · reduce</div>
      <h1>${escapeHtml(copy.heading)}</h1>
      <p>${escapeHtml(copy.blurb(counts.still))}</p>
    </div>
  </section>

  <section class="stats">
    ${statCard('motion allowed', `${counts.baseline}`, 'animations running')}
    ${statCard('reduced motion', `${counts.still}`, 'animations running')}
    ${statCard('infinite loops', `${counts.infinite}`, 'never end')}
    ${statCard('large area', `${counts.large}`, '≥ 25% of viewport')}
    ${statCard('smooth scroll', counts.smoothScroll ? 'on' : 'off', 'scroll-behavior')}
    ${statCard('autoplay video', `${counts.autoplayVideos}`, counts.autoplayVideos === 0 ? 'none' : counts.unmutedAutoplay ? `${counts.unmutedAutoplay} unmuted` : 'all muted')}
  </section>

  ${warningSection}

  ${
    rows
      ? `<section class="panel">
    <h2>Motion observed with reduced motion</h2>
    <table>
      <thead>
        <tr><th>Element</th><th>Animation</th><th>Length</th><th>Viewport</th><th>Repeat</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`
      : ''
  }

  ${videoSection}

  <p class="note">
    Motion that never stops is the usual culprit. Gate it behind
    <code>@media (prefers-reduced-motion: no-preference)</code>, or provide a pause control —
    <a href="https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html" style="color: inherit">WCAG 2.3.3</a>.
  </p>

  <footer>
    <span>Generated ${escapeHtml(generated.toISOString().replace('T', ' ').slice(0, 19))} UTC · motion-audit ${escapeHtml(result.version)}</span>
    <span>Viewport ${escapeHtml(`${result.viewport.width}×${result.viewport.height}`)}</span>
  </footer>
</main>
</body>
</html>
`;
}

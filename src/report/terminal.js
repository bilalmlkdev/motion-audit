const useColor = () => {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout.isTTY);
};

const paint = (code, text) => (useColor() ? `\x1b[${code}m${text}\x1b[0m` : text);

const bold = text => paint('1', text);
const dim = text => paint('2', text);
const red = text => paint('31', text);
const green = text => paint('32', text);
const yellow = text => paint('33', text);
const cyan = text => paint('36', text);

const VERDICT = {
  none: { symbol: '○', label: 'no motion detected', color: dim },
  respected: { symbol: '✔', label: 'respects prefers-reduced-motion', color: green },
  partial: { symbol: '◐', label: 'partially respects prefers-reduced-motion', color: yellow },
  ignored: { symbol: '✖', label: 'ignores prefers-reduced-motion', color: red }
};

function truncate(text, max) {
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function formatDuration(ms) {
  if (!ms) return '0ms';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function row(label, value) {
  return `  ${dim(label.padEnd(20))}${value}`;
}

export function renderTerminal(result) {
  const verdict = VERDICT[result.verdict] || VERDICT.none;
  const lines = [];

  lines.push('');
  lines.push(`  ${bold('motion-audit')} ${dim(result.version)}`);
  lines.push(`  ${cyan(result.url)}`);
  if (result.title) lines.push(`  ${dim(truncate(result.title, 80))}`);
  lines.push('');

  lines.push(
    `  ${verdict.color(`${verdict.symbol} ${verdict.label}`)}  ${dim(
      `${result.score}/100`
    )}`
  );
  lines.push('');

  const { counts } = result;
  lines.push(row('motion allowed', `${counts.baseline} running`));
  lines.push(row('reduced motion', `${counts.still} running`));
  if (counts.infinite) lines.push(row('infinite loops', String(counts.infinite)));
  if (counts.large) lines.push(row('large-area motion', String(counts.large)));
  if (counts.smoothScroll) lines.push(row('smooth scrolling', 'on'));
  if (counts.autoplayVideos) {
    const suffix = counts.unmutedAutoplay ? ` (${counts.unmutedAutoplay} unmuted)` : '';
    lines.push(row('autoplay video', `${counts.autoplayVideos}${suffix}`));
  }
  if (counts.marquees) lines.push(row('marquee elements', String(counts.marquees)));

  if (result.offenders.length) {
    lines.push('');
    lines.push(`  ${bold('motion observed with reduced motion')}`);
    lines.push(`  ${dim('─'.repeat(72))}`);

    const shown = result.offenders.slice(0, 10);
    for (const item of shown) {
      const selector = truncate(item.selector || '(unknown)', 42).padEnd(43);
      const kind = (item.infinite ? 'infinite' : 'running').padEnd(9);
      const length = formatDuration(item.duration).padEnd(7);
      const share = item.rect && item.rect.share ? `${item.rect.share}% viewport` : '';
      lines.push(`  ${selector}${dim(kind)}${length}${dim(share)}`);
    }

    const hidden = result.offenders.length - shown.length;
    if (hidden > 0) lines.push(`  ${dim(`…and ${hidden} more`)}`);
  }

  if (result.warnings.length) {
    lines.push('');
    for (const warning of result.warnings) {
      lines.push(`  ${yellow('!')} ${dim(warning)}`);
    }
  }

  if (result.verdict === 'ignored' || result.verdict === 'partial') {
    lines.push('');
    lines.push(
      `  ${dim('Fix: wrap continuous animation in')} ${cyan(
        '@media (prefers-reduced-motion: no-preference)'
      )}`
    );
    lines.push(`  ${dim('or give the user a pause control (WCAG 2.2.2 / 2.3.3).')}`);
  }

  lines.push('');
  return lines.join('\n');
}

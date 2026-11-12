// Interpret terminal SGR colors as text styles, without inserting HTML from logs.
const palette = ['#aab4b2', '#f08080', '#72d99a', '#e8c875', '#80b8ff', '#dca0eb', '#72d9dd', '#e4ebe9',
  '#8b9694', '#ff9d9d', '#9aebb5', '#f6dc91', '#a5ccff', '#e9baf3', '#9aecef', '#ffffff'];

function indexedColor(value) {
  if (value < 0 || value > 255) return undefined;
  if (value < 16) return palette[value];
  if (value >= 232) { const shade = 8 + (value - 232) * 10; return `rgb(${shade}, ${shade}, ${shade})`; }
  const n = value - 16;
  const level = (v) => v === 0 ? 0 : 55 + v * 40;
  return `rgb(${level(Math.floor(n / 36))}, ${level(Math.floor(n / 6) % 6)}, ${level(n % 6)})`;
}

function applyCodes(style, sequence) {
  const parts = sequence === '' ? [0] : sequence.split(';').map(Number);
  for (let i = 0; i < parts.length; i++) {
    const n = parts[i];
    if (n === 0) style = {};
    else if (n === 1) style.fontWeight = 600;
    else if (n === 22) delete style.fontWeight;
    else if (n === 4) style.textDecoration = 'underline';
    else if (n === 24) delete style.textDecoration;
    else if (n === 39) delete style.color;
    else if (n >= 30 && n <= 37) style.color = palette[n - 30];
    else if (n >= 90 && n <= 97) style.color = palette[n - 90 + 8];
    else if (n === 38 && parts[i + 1] === 5 && Number.isInteger(parts[i + 2])) { style.color = indexedColor(parts[i + 2]); i += 2; }
    else if (n === 38 && parts[i + 1] === 2 && parts.slice(i + 2, i + 5).length === 3) {
      const rgb = parts.slice(i + 2, i + 5);
      if (rgb.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)) style.color = `rgb(${rgb.join(', ')})`;
      i += 4;
    }
  }
  return style;
}

export function formatLogText(raw = '', { interpretAnsi = true } = {}) {
  const segments = [];
  let style = {};
  let text = '';
  // Consume OSC and CSI controls as well as ordinary two-byte escape sequences.
  // eslint-disable-next-line no-control-regex
  const controls = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[([0-9;]*)m|\x1b\[[0-?]*[ -/]*[@-~]|\x1b[@-_]/g;
  let position = 0;
  for (const match of interpretAnsi ? raw.matchAll(controls) : []) {
    const value = raw.slice(position, match.index);
    if (value) { segments.push({ start: text.length, end: text.length + value.length, text: value, style: { ...style } }); text += value; }
    if (match[1] !== undefined) style = applyCodes(style, match[1]);
    position = match.index + match[0].length;
  }
  const rest = raw.slice(position);
  if (rest) { segments.push({ start: text.length, end: text.length + rest.length, text: rest, style: { ...style } }); text += rest; }

  const links = [];
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    let value = match[0].replace(/[.,;:!?]+$/, '');
    while (value.endsWith(')') && (value.match(/\)/g) || []).length > (value.match(/\(/g) || []).length) value = value.slice(0, -1);
    try {
      const parsed = new URL(value);
      if (['http:', 'https:'].includes(parsed.protocol)) links.push({ start: match.index, end: match.index + value.length, url: parsed.href });
    } catch { /* Ignore malformed addresses. */ }
  }
  return { text, segments, links };
}

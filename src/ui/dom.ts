/** Tiny DOM helpers shared by every screen. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export type ButtonVariant = 'primary' | 'secondary' | 'small' | 'ghost';

export function button(
  label: string,
  onClick: () => void,
  variant: ButtonVariant | boolean = 'primary',
): HTMLButtonElement {
  const v: ButtonVariant = variant === true ? 'secondary' : variant === false ? 'primary' : variant;
  const b = el('button', `btn${v === 'primary' ? '' : ` btn-${v}`}`, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/** Give an element a stable key so focus survives a re-render. */
export function keyed<T extends HTMLElement>(node: T, key: string): T {
  node.dataset.key = key;
  return node;
}

/** A 0..1 progress bar (screen readers get a real progressbar). */
export function meter(value: number, label: string, className = ''): HTMLElement {
  const track = el('div', `meter ${className}`.trim());
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', label);
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  track.setAttribute('aria-valuenow', String(pct));
  const fill = el('div', 'meter-fill');
  fill.style.width = `${pct}%`;
  track.append(fill);
  return track;
}

export const fmt = (n: number): string => Math.floor(n).toLocaleString('en-US');

const ICONS = {
  rand: '<circle cx="12" cy="12" r="10" fill="#ffc83d" stroke="#b37a00" stroke-width="2"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="900" fill="#7a4b00" font-family="Trebuchet MS,Segoe UI,sans-serif">R</text>',
  medal:
    '<path d="M7 2h4l1 6h-2zM17 2h-4l-1 6h2z" fill="#0b2a5b" stroke="#f6f3ea" stroke-width="1"/><circle cx="12" cy="15" r="6.5" fill="#ffc83d" stroke="#b37a00" stroke-width="2"/><path d="M12 11.5l1.1 2.3 2.5.3-1.8 1.7.5 2.5-2.3-1.2-2.3 1.2.5-2.5-1.8-1.7 2.5-.3z" fill="#b37a00"/>',
  box: '<path d="M3 8l9-5 9 5v9l-9 5-9-5z" fill="#ff7a1a" stroke="#f6f3ea" stroke-width="1.6" stroke-linejoin="round"/><path d="M3 8l9 5 9-5M12 13v9" fill="none" stroke="#0b2a5b" stroke-width="1.6"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10.5" rx="2.2" fill="#f6f3ea"/><path d="M8 10.5V8a4 4 0 018 0v2.5" fill="none" stroke="#f6f3ea" stroke-width="2.2"/>',
  check:
    '<circle cx="12" cy="12" r="10" fill="#4cd964"/><path d="M7 12.5l3.3 3.3L17 9" fill="none" stroke="#0b2a5b" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  star: '<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" fill="#ffc83d" stroke="#b37a00" stroke-width="1.4" stroke-linejoin="round"/>',
  trophy:
    '<path d="M7 3h10v6a5 5 0 01-10 0zM7 5H3v2a4 4 0 004 4M17 5h4v2a4 4 0 01-4 4M12 14v4M8 21h8" fill="#ffc83d" stroke="#b37a00" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>',
  shield:
    '<path d="M12 2l8 3v6c0 5-3.4 9-8 11-4.6-2-8-6-8-11V5z" fill="#4da3ff" stroke="#f6f3ea" stroke-width="1.8" stroke-linejoin="round"/>',
  bolt: '<path d="M13 2L4 14h6l-1 8 9-12h-6z" fill="#ffd23f" stroke="#b37a00" stroke-width="1.4" stroke-linejoin="round"/>',
  person:
    '<circle cx="12" cy="8" r="4" fill="#f6f3ea"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" fill="#f6f3ea"/>',
} as const;
export type IconName = keyof typeof ICONS;

export function icon(name: IconName, label?: string): SVGSVGElement {
  const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  wrap.setAttribute('viewBox', '0 0 24 24');
  wrap.setAttribute('class', `icon icon-${name}`);
  if (label) {
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', label);
  } else {
    wrap.setAttribute('aria-hidden', 'true');
  }
  wrap.innerHTML = ICONS[name];
  return wrap;
}

/** "1,200" with the Rand coin in front. */
export function randAmount(n: number, className = 'amount'): HTMLElement {
  const span = el('span', className);
  span.append(icon('rand'), document.createTextNode(fmt(n)));
  return span;
}

export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

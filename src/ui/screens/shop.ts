import { CHARACTERS } from '../../config/characters';
import {
  BOX,
  ITEMS,
  POWER_UPS,
  POWER_UP_IDS,
  POWER_UPS_LIVE,
  UPGRADE_MAX,
  powerUpSeconds,
  upgradeCost,
  type ItemId,
} from '../../config/progression';
import { characterRequirement, outfitRequirementText } from '../../progression/unlocks';
import { button, el, icon, keyed, meter, randAmount } from '../dom';
import type { Nav, Screens } from '../Screens';
import type { UiHost } from '../types';

export type ShopTab = 'characters' | 'outfits' | 'powerups' | 'items';

const TABS: Array<[ShopTab, string]> = [
  ['characters', 'Characters'],
  ['outfits', 'Outfits'],
  ['powerups', 'Power-up upgrades'],
  ['items', 'Items'],
];

/** The shop: spend Rand on characters, outfits, power-up upgrades and run items. */
export function renderShop(
  ui: Screens,
  host: UiHost,
  nav: Nav,
  tab: ShopTab,
  setTab: (t: ShopTab) => void,
): void {
  const { body } = ui.open({ title: 'Shop', back: () => nav.menu(), wide: true, wallet: true });

  const tabs = el('div', 'tabs');
  tabs.setAttribute('role', 'tablist');
  for (const [id, label] of TABS) {
    const t = keyed(el('button', 'tab', label), `tab-${id}`);
    t.type = 'button';
    t.setAttribute('role', 'tab');
    t.setAttribute('aria-selected', String(id === tab));
    t.addEventListener('click', () => {
      host.sound('select');
      setTab(id);
    });
    tabs.append(t);
  }
  body.append(tabs);

  const content = el('div', 'shop-content');
  content.setAttribute('role', 'tabpanel');
  body.append(content);
  if (tab === 'characters') charactersTab(ui, host, content);
  else if (tab === 'outfits') outfitsTab(ui, host, content);
  else if (tab === 'powerups') powerUpsTab(ui, host, content);
  else itemsTab(ui, host, nav, content);
}

/** A purchase attempt: sound, message on failure, then redraw. */
function attempt(
  ui: Screens,
  host: UiHost,
  result: { ok: true } | { ok: false; reason: string },
  bought?: string,
): void {
  if (result.ok) {
    host.sound('purchase');
    if (bought) host.toasts.show({ title: bought, icon: 'star', kind: 'info' });
  } else {
    host.sound('error');
    host.toasts.show({ title: result.reason, kind: 'info' });
  }
  ui.refresh();
}

function row(...parts: Element[]): HTMLElement {
  const li = el('li', 'shop-row');
  li.append(...parts);
  return li;
}

function buyButton(
  cost: number,
  affordable: boolean,
  key: string,
  onClick: () => void,
): HTMLButtonElement {
  const b = keyed(button('', onClick, 'small'), key);
  b.append(randAmount(cost, 'amount amount-btn'));
  if (!affordable) b.classList.add('btn-disabled');
  return b;
}

function charactersTab(ui: Screens, host: UiHost, root: HTMLElement): void {
  const progress = host.progress;
  const d = progress.data;
  const list = el('ul', 'shop-list');
  for (const c of CHARACTERS) {
    const owned = d.characters.owned.includes(c.id);
    const hidden = c.secret === true && !owned;
    const text = el('div', 'shop-text');
    text.append(el('strong', undefined, hidden ? '??? (secret)' : c.name));
    text.append(
      el(
        'span',
        undefined,
        hidden ? 'Keep collecting Golden Medals...' : `${c.title}. ${c.perkText}`,
      ),
    );
    let action: HTMLElement;
    if (owned) {
      action = el('span', 'owned-tag', 'Owned');
    } else {
      const req = characterRequirement(d, c.unlock);
      if (req.buyable) {
        action = buyButton(req.cost, progress.canAfford(req.cost), `buy-${c.id}`, () =>
          attempt(ui, host, progress.buyCharacter(c.id), `${c.name} unlocked!`),
        );
      } else {
        const box = el('div', 'req');
        box.append(
          el('span', undefined, req.text),
          meter(req.current / req.target, req.text, 'meter-thin'),
        );
        action = box;
      }
    }
    list.append(row(icon(owned ? 'check' : 'lock'), text, action));
  }
  root.append(list);
}

function outfitsTab(ui: Screens, host: UiHost, root: HTMLElement): void {
  const progress = host.progress;
  const d = progress.data;
  for (const c of CHARACTERS) {
    const owned = d.characters.owned.includes(c.id);
    const hidden = c.secret === true && !owned;
    root.append(el('h3', 'section', hidden ? '???' : c.name));
    const list = el('ul', 'shop-list');
    for (const o of c.outfits) {
      const have = o.unlock.kind === 'default' || d.outfits.owned.includes(o.id);
      const text = el('div', 'shop-text');
      text.append(el('strong', undefined, hidden ? '???' : o.name));
      const pieces = d.outfits.pieces[o.id] ?? 0;
      text.append(
        el(
          'span',
          undefined,
          hidden
            ? 'Locked'
            : have
              ? 'In your wardrobe'
              : `${outfitRequirementText(o)}${pieces ? `  ·  ${pieces} piece${pieces > 1 ? 's' : ''} found` : ''}`,
        ),
      );
      let action: HTMLElement;
      if (have) action = el('span', 'owned-tag', 'Owned');
      else if (o.unlock.kind === 'rand' && owned) {
        const cost = o.unlock.cost;
        action = buyButton(cost, progress.canAfford(cost), `buy-${o.id}`, () =>
          attempt(ui, host, progress.buyOutfit(o.id), `${o.name} unlocked!`),
        );
      } else {
        action = el(
          'span',
          'locked-tag',
          o.unlock.kind === 'rand' ? 'Unlock runner first' : 'Earn it',
        );
      }
      list.append(row(icon(have ? 'check' : 'lock'), text, action));
    }
    root.append(list);
  }
}

function powerUpsTab(ui: Screens, host: UiHost, root: HTMLElement): void {
  const progress = host.progress;
  const d = progress.data;
  const perks = progress.perks();
  if (!POWER_UPS_LIVE) {
    root.append(
      el(
        'p',
        'notice',
        'Upgrades are saved now. Power-up pickups join the trail in the next update.',
      ),
    );
  }
  const list = el('ul', 'shop-list');
  for (const id of POWER_UP_IDS) {
    const info = POWER_UPS[id];
    const level = d.upgrades[id];
    const now = powerUpSeconds(id, level, id === 'magnet' ? perks.magnetDurationMul : 1);
    const maxed = level >= UPGRADE_MAX;
    const text = el('div', 'shop-text');
    text.append(el('strong', undefined, info.name), el('span', undefined, info.description));
    const pips = el('div', 'pips');
    pips.setAttribute('aria-label', `Level ${level} of ${UPGRADE_MAX}`);
    for (let i = 0; i < UPGRADE_MAX; i++) pips.append(el('i', i < level ? 'pip pip-on' : 'pip'));
    text.append(pips);
    const next = maxed
      ? ''
      : `  ·  Next: ${powerUpSeconds(id, level + 1, id === 'magnet' ? perks.magnetDurationMul : 1).toFixed(0)} s`;
    text.append(el('span', 'muted', `Lasts ${now.toFixed(0)} s${next}`));
    let action: HTMLElement;
    if (maxed) action = el('span', 'owned-tag', 'Max level');
    else {
      const cost = upgradeCost(id, level);
      action = buyButton(cost, progress.canAfford(cost), `up-${id}`, () =>
        attempt(ui, host, progress.buyUpgrade(id), `${info.name} level ${level + 1}`),
      );
    }
    list.append(row(icon('bolt'), text, action));
  }
  root.append(list);
}

function itemsTab(ui: Screens, host: UiHost, nav: Nav, root: HTMLElement): void {
  const progress = host.progress;
  const d = progress.data;
  const list = el('ul', 'shop-list');

  for (const id of Object.keys(ITEMS) as ItemId[]) {
    const item = ITEMS[id];
    const have = d.items[id];
    const text = el('div', 'shop-text');
    text.append(el('strong', undefined, item.name), el('span', undefined, item.description));
    text.append(el('span', 'muted', `You have ${have} (max ${item.max})`));
    const full = have >= item.max;
    const action = full
      ? el('span', 'owned-tag', 'Full')
      : buyButton(item.price, progress.canAfford(item.price), `item-${id}`, () =>
          attempt(ui, host, progress.buyItem(id), `${item.name} added`),
        );
    list.append(row(icon(id === 'headStart' ? 'bolt' : 'shield'), text, action));
  }

  const box = el('div', 'shop-text');
  box.append(
    el('strong', undefined, 'Mystery Box'),
    el('span', undefined, 'Rand, upgrades, outfit pieces, Golden Medals and more.'),
    el('span', 'muted', `You have ${d.items.boxes}`),
  );
  const boxActions = el('div', 'req');
  boxActions.append(
    buyButton(BOX.price, progress.canAfford(BOX.price), 'buy-box', () =>
      attempt(ui, host, progress.buyBox(), 'Mystery box added'),
    ),
  );
  if (d.items.boxes > 0) {
    boxActions.append(
      keyed(
        button(`Open (${d.items.boxes})`, () => nav.box(() => nav.shop('items')), 'small'),
        'open-box',
      ),
    );
  }
  list.append(row(icon('box'), box, boxActions));
  root.append(list);
}

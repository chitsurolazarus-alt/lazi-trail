import { CREDIT } from '../config/gameConfig';
import { levelFromXp } from '../progression/xp';
import { getCharacter } from '../config/characters';
import { renderAchievements } from './screens/achievements';
import { renderCharacters } from './screens/characters';
import { renderDailyReward, renderMissions } from './screens/missions';
import { renderName } from './screens/name';
import { renderProfile } from './screens/profile';
import { renderBox, renderGameOver, renderPaused, renderSecondChance } from './screens/run';
import { renderSettings } from './screens/settings';
import { renderShop, type ShopTab } from './screens/shop';
import { button, el, fmt, hex, icon, meter } from './dom';
import type { RunSummary, UiHost } from './types';

/** Screen-to-screen navigation, handed to every screen renderer. */
export interface Nav {
  menu(): void;
  name(first: boolean): void;
  profile(): void;
  characters(): void;
  shop(tab?: ShopTab): void;
  missions(): void;
  achievements(): void;
  settings(back: () => void): void;
  box(back: () => void): void;
  dailyReward(after: () => void): void;
  paused(): void;
  gameOver(summary: RunSummary): void;
  secondChance(count: number, seconds: number): void;
}

export interface OpenOptions {
  title: string;
  subtitle?: string;
  /** Wider panel for list screens. */
  wide?: boolean;
  /** The 3D character room is visible behind (transparent overlay, panel to one side). */
  room?: boolean;
  back?: () => void;
  /** Show the Rand / medal / box balances in the header. */
  wallet?: boolean;
  /** Big centred title (main menu, run screens) instead of a compact header bar. */
  hero?: boolean;
}

export interface Frame {
  panel: HTMLElement;
  body: HTMLElement;
}

/**
 * The menu system: a full-screen HTML overlay with one screen at a time. Screens are plain
 * functions that fill a `Frame`; `refresh()` re-renders the current one while keeping focus and
 * scroll position, so buying something doesn't feel like a page reload.
 */
export class Screens implements Nav {
  readonly element = el('div', 'screens');
  private renderCurrent: (() => void) | null = null;
  private timers: number[] = [];
  private roomOpen = false;
  /** What the character room is previewing (kept across re-renders of that screen). */
  charPreview: { char: string; outfit: string } | null = null;

  constructor(readonly host: UiHost) {
    this.element.hidden = true;
  }

  /* ------------------------------------------------------------ lifecycle */

  hide(): void {
    this.clearTimers();
    this.renderCurrent = null;
    this.element.hidden = true;
    this.element.replaceChildren();
    this.setRoom(false);
  }

  /** Re-render the current screen in place. */
  refresh(): void {
    if (!this.renderCurrent) return;
    const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.key;
    const scroll = this.element.querySelector('.panel-body')?.scrollTop ?? 0;
    this.renderCurrent();
    const body = this.element.querySelector('.panel-body');
    if (body) body.scrollTop = scroll;
    if (focusKey) {
      this.element.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`)?.focus();
    }
  }

  later(fn: () => void, ms: number): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
  }

  /** Show `render` as the current screen. It is called again by `refresh()`. */
  show(render: () => void): void {
    this.clearTimers();
    this.renderCurrent = render;
    render();
  }

  private setRoom(on: boolean): void {
    if (on === this.roomOpen) return;
    this.roomOpen = on;
    if (on) this.host.room.open();
    else this.host.room.close();
  }

  /** Reset the overlay and return an empty panel to fill. */
  open(opts: OpenOptions): Frame {
    this.element.replaceChildren();
    this.element.hidden = false;
    this.element.classList.toggle('screens-room', opts.room === true);
    this.setRoom(opts.room === true);

    const panel = el(
      'div',
      `panel${opts.wide ? ' panel-wide' : ''}${opts.hero ? ' panel-hero' : ''}`,
    );
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', opts.title);

    if (opts.hero) {
      panel.append(el('h1', 'title', opts.title));
      if (opts.subtitle) panel.append(el('p', 'subtitle', opts.subtitle));
    } else {
      const bar = el('header', 'bar');
      if (opts.back) {
        const back = button('Back', opts.back, 'small');
        back.dataset.key = 'back';
        bar.append(back);
      }
      bar.append(el('h1', 'bar-title', opts.title));
      if (opts.wallet) bar.append(this.wallet());
      panel.append(bar);
      if (opts.subtitle) panel.append(el('p', 'bar-sub', opts.subtitle));
    }
    const body = el('div', 'panel-body');
    panel.append(body);
    this.element.append(panel);
    return { panel, body };
  }

  /** Rand, Golden Medals and unopened boxes. */
  wallet(): HTMLElement {
    const d = this.host.progress.data;
    const box = el('div', 'wallet');
    const item = (name: 'rand' | 'medal' | 'box', value: number, label: string): void => {
      const chip = el('span', 'wallet-item');
      chip.title = label;
      chip.setAttribute('aria-label', `${label}: ${value}`);
      chip.append(icon(name), document.createTextNode(fmt(value)));
      box.append(chip);
    };
    item('rand', d.rand, 'Rand');
    item('medal', d.goldenMedals, 'Golden Medals');
    if (d.items.boxes > 0) item('box', d.items.boxes, 'Mystery boxes');
    return box;
  }

  focusPrimary(): void {
    const target =
      this.element.querySelector<HTMLElement>('.btn:not(.btn-secondary):not(.btn-small)') ??
      this.element.querySelector<HTMLElement>('.btn');
    target?.focus({ preventScroll: true });
  }

  actions(...buttons: HTMLElement[]): HTMLElement {
    const row = el('div', 'actions');
    row.append(...buttons);
    return row;
  }

  creditLink(): HTMLAnchorElement {
    const a = el('a', 'credit', CREDIT.text);
    a.href = CREDIT.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  /* ---------------------------------------------------------------- screens */

  name(first: boolean): void {
    this.show(() => renderName(this, this.host, this, first));
  }

  menu(): void {
    this.show(() => this.renderMenu());
    this.host.music('menu');
  }

  profile(): void {
    this.show(() => renderProfile(this, this.host, this));
  }

  characters(): void {
    this.charPreview = null;
    this.show(() => renderCharacters(this, this.host, this));
    this.host.music('shop');
  }

  shop(tab: ShopTab = 'characters'): void {
    let current = tab;
    this.show(() =>
      renderShop(this, this.host, this, current, (t) => {
        current = t;
        this.refresh();
      }),
    );
    this.host.music('shop');
  }

  missions(): void {
    this.host.progress.ensureMissions();
    this.show(() => renderMissions(this, this.host, this));
  }

  achievements(): void {
    let filter: 'all' | 'earned' | 'locked' = 'all';
    this.show(() =>
      renderAchievements(this, this.host, this, filter, (f) => {
        filter = f;
        this.refresh();
      }),
    );
  }

  settings(back: () => void): void {
    this.show(() => renderSettings(this, this.host, back));
  }

  box(back: () => void): void {
    this.show(() => renderBox(this, this.host, back));
  }

  dailyReward(after: () => void): void {
    this.show(() => renderDailyReward(this, this.host, after));
  }

  paused(): void {
    this.show(() => renderPaused(this, this.host, this));
  }

  gameOver(summary: RunSummary): void {
    this.show(() => renderGameOver(this, this.host, this, summary));
  }

  secondChance(count: number, seconds: number): void {
    this.show(() => renderSecondChance(this, this.host, count, seconds));
  }

  /** Legacy entry used by the game after loading: the daily reward (if due), then the menu. */
  showStart(): void {
    const progress = this.host.progress;
    if (progress.name === null) {
      this.name(true);
      return;
    }
    this.startMenu();
  }

  /** Main menu, preceded by the daily login reward the first time it opens each day. */
  startMenu(): void {
    this.host.progress.ensureMissions();
    if (this.host.progress.loginStatus().canClaim) this.dailyReward(() => this.menu());
    else this.menu();
  }

  /* ------------------------------------------------------------- main menu */

  private renderMenu(): void {
    const { host } = this;
    const progress = host.progress;
    const d = progress.data;
    const { panel, body } = this.open({
      title: 'Lazi Trail',
      subtitle: 'Run the streets. Reach the stadium.',
      hero: true,
    });
    void body;

    const level = levelFromXp(d.player.xp);
    const def = getCharacter(d.characters.selected);
    const outfit = progress.selectedOutfitId(def.id);
    const chip = el('div', 'profile-chip');
    const swatch = el('span', 'swatch');
    const worn = def.outfits.find((o) => o.id === outfit) ?? def.outfits[0];
    swatch.style.background = hex(Object.values(worn?.colors ?? {})[0] ?? 0xff7a1a);
    const who = el('div', 'chip-who');
    who.append(
      el('strong', undefined, progress.name ?? 'Runner'),
      el('span', undefined, `${def.name} · Level ${level.level}`),
    );
    chip.append(swatch, who, meter(level.progress, 'Progress to next level', 'meter-thin'));
    chip.append(this.wallet());

    const headStartOwned = d.items.headStart;
    let useHeadStart = false;
    const play = button('Play', () => host.startRun({ headStart: useHeadStart }));
    play.dataset.key = 'play';

    const grid = el('div', 'menu-grid');
    const missionsDot =
      progress.loginStatus().canClaim || d.missions.list.some((m) => m.done) ? true : false;
    const entries: Array<[string, () => void, boolean]> = [
      ['Characters', () => this.characters(), false],
      ['Shop', () => this.shop(), d.items.boxes > 0],
      ['Missions', () => this.missions(), missionsDot],
      ['Achievements', () => this.achievements(), false],
      ['Profile', () => this.profile(), false],
      ['Settings', () => this.settings(() => this.menu()), false],
    ];
    for (const [label, go, dot] of entries) {
      const b = button(label, go, 'secondary');
      b.dataset.key = label;
      if (dot) b.append(el('span', 'dot'));
      grid.append(b);
    }

    panel.append(chip, play);
    if (headStartOwned > 0) {
      const row = el('label', 'switch');
      const check = el('input');
      check.type = 'checkbox';
      check.addEventListener('change', () => {
        useHeadStart = check.checked;
        host.sound('toggle');
      });
      row.append(check, el('span', undefined, `Use a Head Start (you have ${headStartOwned})`));
      panel.append(row);
    }
    panel.append(grid);
    if (d.settings.showControls) panel.append(this.controlsHint());
    panel.append(this.creditLink());
    (panel.querySelector('[data-key="play"]') as HTMLElement | null)?.focus();
  }

  private controlsHint(): HTMLElement {
    const hint = el('ul', 'controls');
    for (const line of [
      'Arrows / A D  -  change lane',
      'Up / W / Space  -  jump',
      'Down / S  -  slide (or fast-fall)',
      'On a phone: swipe',
    ]) {
      hint.append(el('li', undefined, line));
    }
    return hint;
  }
}

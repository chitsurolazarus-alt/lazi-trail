import {
  CHARACTERS,
  getCharacter,
  type CharacterDef,
  type OutfitDef,
} from '../../config/characters';
import { characterRequirement, outfitRequirementText } from '../../progression/unlocks';
import { button, el, fmt, hex, icon, keyed, meter } from '../dom';
import type { Nav, Screens } from '../Screens';
import type { UiHost } from '../types';

/** A representative colour for a character/outfit chip. */
function accent(def: CharacterDef, outfit?: OutfitDef): number {
  const colors = (outfit ?? def.outfits[0])?.colors ?? {};
  return Object.values(colors)[0] ?? 0xff7a1a;
}

/**
 * Character room: the roster on one side, the 3D showroom on the other. Tap a character to see
 * them turn on the podium; owned ones can be picked and dressed, locked ones show as silhouettes
 * with what it takes to unlock them.
 */
export function renderCharacters(ui: Screens, host: UiHost, nav: Nav): void {
  const progress = host.progress;
  const d = progress.data;
  const { body } = ui.open({
    title: 'Characters',
    back: () => nav.menu(),
    room: true,
    wallet: true,
  });

  const preview = ui.charPreview ?? {
    char: d.characters.selected,
    outfit: progress.selectedOutfitId(d.characters.selected),
  };
  ui.charPreview = preview;

  const showInRoom = (celebrate = false): void => {
    const def = getCharacter(preview.char);
    const owned = progress.data.characters.owned.includes(def.id);
    void host.room.show(def.id, preview.outfit, !owned).then(() => {
      if (celebrate) host.room.celebrate();
    });
  };
  characterView(host, body, preview, (c, o, celebrate) => {
    preview.char = c;
    preview.outfit = o;
    showInRoom(celebrate);
    ui.refresh();
  });
  showInRoom();

  // Drag anywhere in the stage area to spin the runner.
  const stage = el('div', 'room-stage');
  stage.setAttribute('aria-hidden', 'true');
  let last: number | null = null;
  stage.addEventListener('pointerdown', (e) => {
    last = e.clientX;
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (last === null) return;
    host.room.rotate(e.clientX - last);
    last = e.clientX;
  });
  const end = (): void => {
    last = null;
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  ui.element.append(stage);
}

function characterView(
  host: UiHost,
  body: HTMLElement,
  current: { char: string; outfit: string },
  preview: (char: string, outfit: string, celebrate: boolean) => void,
): void {
  const progress = host.progress;
  const d = progress.data;
  const { char, outfit } = current;
  const def = getCharacter(char);
  const owned = d.characters.owned.includes(def.id);
  const hidden = def.secret === true && !owned;

  /* ---- roster */
  const roster = el('div', 'roster');
  roster.setAttribute('role', 'group');
  roster.setAttribute('aria-label', 'Characters');
  for (const c of CHARACTERS) {
    const isOwned = d.characters.owned.includes(c.id);
    const secret = c.secret === true && !isOwned;
    const chip = keyed(el('button', 'roster-chip'), `char-${c.id}`);
    chip.type = 'button';
    chip.setAttribute('aria-pressed', String(c.id === char));
    const sw = el('span', 'swatch');
    sw.style.background = isOwned ? hex(accent(c)) : '#1b2f57';
    chip.append(sw);
    chip.append(el('span', 'roster-name', secret ? '???' : c.name));
    if (!isOwned) chip.append(icon('lock', 'Locked'));
    else if (d.characters.selected === c.id) chip.append(icon('check', 'Selected'));
    chip.addEventListener('click', () => {
      host.sound('select');
      preview(c.id, progress.selectedOutfitId(c.id), false);
    });
    roster.append(chip);
  }
  body.append(roster);

  /* ---- details */
  const info = el('section', 'char-info');
  info.append(el('h2', 'char-name', hidden ? '???' : def.name));
  info.append(el('p', 'char-title', hidden ? 'Secret runner' : def.title));
  if (!hidden) info.append(el('p', 'char-bio', def.bio));
  if (!hidden) {
    const perk = el('div', 'perk');
    perk.append(
      icon('bolt'),
      el('strong', undefined, def.perkLabel),
      el('span', undefined, def.perkText),
    );
    info.append(perk);
  }

  if (!owned) {
    const req = characterRequirement(d, def.unlock);
    const box = el('div', 'unlock-box');
    box.append(el('strong', undefined, `Unlock: ${req.text}`));
    if (!req.buyable) {
      box.append(meter(req.current / req.target, 'Unlock progress', 'meter-thin'));
      box.append(el('span', 'muted', `${fmt(req.current)} / ${fmt(req.target)}`));
    }
    info.append(box);
    if (req.buyable) {
      const buy = keyed(
        button(`Buy for R ${fmt(req.cost)}`, () => {
          const res = progress.buyCharacter(def.id);
          if (res.ok) {
            host.sound('purchase');
            host.sound('unlock');
            host.toasts.show({ title: `${def.name} unlocked!`, icon: 'star', kind: 'unlock' });
            preview(def.id, progress.selectedOutfitId(def.id), true);
          } else {
            host.sound('error');
            host.toasts.show({ title: res.reason, kind: 'info' });
          }
        }),
        'buy-char',
      );
      if (!req.met) buy.classList.add('btn-disabled');
      info.append(buy);
    }
  } else {
    /* ---- outfits */
    info.append(el('h3', 'section', 'Outfits'));
    const outfits = el('div', 'outfits');
    for (const o of def.outfits) {
      const have = o.unlock.kind === 'default' || d.outfits.owned.includes(o.id);
      const worn = progress.selectedOutfitId(def.id) === o.id;
      const chip = keyed(el('button', 'outfit-chip'), `outfit-${o.id}`);
      chip.type = 'button';
      chip.setAttribute('aria-pressed', String(o.id === outfit));
      const dots = el('span', 'dots');
      for (const c of Object.values(o.colors).slice(0, 3)) {
        const dot = el('i');
        dot.style.background = hex(c);
        dots.append(dot);
      }
      chip.append(dots, el('strong', undefined, o.name));
      chip.append(
        el('span', 'muted', worn ? 'Wearing' : have ? 'Owned' : outfitRequirementText(o)),
      );
      if (!have) chip.append(icon('lock', 'Locked'));
      chip.addEventListener('click', () => {
        host.sound('select');
        preview(def.id, o.id, false);
      });
      outfits.append(chip);
    }
    info.append(outfits);

    /* ---- actions for the previewed outfit */
    const chosen = def.outfits.find((o) => o.id === outfit) ?? def.outfits[0];
    const actions = el('div', 'actions');
    if (chosen) {
      const have = chosen.unlock.kind === 'default' || d.outfits.owned.includes(chosen.id);
      const worn = progress.selectedOutfitId(def.id) === chosen.id;
      if (!have && chosen.unlock.kind === 'rand') {
        const cost = chosen.unlock.cost;
        const buy = keyed(
          button(`Buy outfit R ${fmt(cost)}`, () => {
            const res = progress.buyOutfit(chosen.id);
            if (res.ok) {
              host.sound('purchase');
              progress.selectOutfit(def.id, chosen.id);
              host.loadoutChanged();
              preview(def.id, chosen.id, true);
            } else {
              host.sound('error');
              host.toasts.show({ title: res.reason, kind: 'info' });
            }
          }),
          'buy-outfit',
        );
        if (!progress.canAfford(cost)) buy.classList.add('btn-disabled');
        actions.append(buy);
      } else if (have && !worn) {
        actions.append(
          keyed(
            button('Wear outfit', () => {
              progress.selectOutfit(def.id, chosen.id);
              host.sound('confirm');
              host.loadoutChanged();
              preview(def.id, chosen.id, true);
            }),
            'wear',
          ),
        );
      }
    }
    if (d.characters.selected !== def.id) {
      actions.append(
        keyed(
          button('Select runner', () => {
            progress.selectCharacter(def.id);
            host.sound('confirm');
            host.loadoutChanged();
            preview(def.id, progress.selectedOutfitId(def.id), true);
          }),
          'select-char',
        ),
      );
    } else {
      actions.append(el('p', 'selected-note', 'Your runner'));
    }
    info.append(actions);
  }
  body.append(info);
}

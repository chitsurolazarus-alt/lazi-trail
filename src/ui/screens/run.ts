import { getCharacter } from '../../config/characters';
import { BADGES } from '../../config/progression';
import { missionText } from '../../progression/missions';
import { levelFromXp } from '../../progression/xp';
import { button, el, fmt, icon, keyed, meter } from '../dom';
import { boxRewardText, rewardText } from '../format';
import type { Nav, Screens } from '../Screens';
import type { RunSummary, UiHost } from '../types';

export function renderPaused(ui: Screens, host: UiHost, _nav: Nav): void {
  const { panel } = ui.open({ title: 'Paused', hero: true });
  panel.append(
    ui.actions(
      keyed(
        button('Resume', () => host.resume()),
        'resume',
      ),
      button('Restart', () => host.restart(), 'secondary'),
      button('Main menu', () => host.quitToMenu(), 'secondary'),
    ),
  );
  ui.focusPrimary();
}

/** Score, XP gained, mission progress, achievements, level-ups and unlocks. */
export function renderGameOver(ui: Screens, host: UiHost, _nav: Nav, s: RunSummary): void {
  const progress = host.progress;
  const d = progress.data;
  const { panel, body } = ui.open({
    title: s.caught ? 'Caught!' : 'Game Over',
    subtitle: `${progress.name ?? 'Runner'} · ${getCharacter(d.characters.selected).name}`,
    hero: true,
  });
  panel.classList.add('panel-scroll');
  void body;
  const r = s.report;

  if (s.newRecord) panel.append(el('p', 'record', 'New record!'));

  const stats = el('dl', 'summary');
  const rows: Array<[string, string]> = [
    ['Score', fmt(s.score)],
    ['Best', fmt(s.best)],
    ['Distance', `${fmt(s.distance)} m`],
    ['Rand', fmt(s.coins)],
    ['Zone', s.zone],
  ];
  for (const [label, value] of rows) {
    const row = el('div', 'summary-row');
    row.append(el('dt', undefined, label), el('dd', undefined, value));
    stats.append(row);
  }
  panel.append(stats);

  /* ---- XP and level */
  const level = levelFromXp(d.player.xp);
  const xp = el('div', 'go-block');
  xp.append(el('h2', 'section', `+${fmt(r.xp.total)} XP`));
  xp.append(
    el(
      'span',
      'muted',
      `Run ${fmt(r.xp.run)}  ·  Missions ${fmt(r.xp.missions)}  ·  Achievements ${fmt(r.xp.achievements)}`,
    ),
  );
  xp.append(meter(level.progress, 'XP to next level'));
  xp.append(
    el(
      'span',
      undefined,
      level.maxed
        ? `Level ${level.level} (max)`
        : `Level ${level.level}  ·  ${fmt(level.into)} / ${fmt(level.need)} XP`,
    ),
  );
  for (const lu of r.levelUps) {
    xp.append(el('p', 'go-line go-level', `Level ${lu.level}! ${rewardText(lu.reward)}`));
    if (lu.reward.badge)
      xp.append(el('p', 'go-line', `Badge: ${BADGES[lu.reward.badge]?.name ?? lu.reward.badge}`));
  }
  panel.append(xp);

  /* ---- missions */
  if (d.missions.list.length > 0) {
    const m = el('div', 'go-block');
    m.append(el('h2', 'section', 'Missions'));
    for (const mission of d.missions.list) {
      const line = el('div', `go-mission${mission.done ? ' go-mission-done' : ''}`);
      line.append(icon(mission.done ? 'check' : 'bolt'));
      const text = el('div', 'go-mission-text');
      text.append(el('span', undefined, missionText(mission)));
      text.append(meter(mission.progress / mission.target, missionText(mission), 'meter-thin'));
      line.append(text);
      m.append(line);
    }
    if (r.setCompleted)
      m.append(el('p', 'go-line go-level', 'Full set complete! Permanent score boost increased.'));
    panel.append(m);
  }

  /* ---- new things */
  const news: string[] = [];
  for (const a of r.achievements) news.push(`Achievement: ${a.name}`);
  for (const u of r.unlocks)
    news.push(`${u.kind === 'character' ? 'New runner' : 'New outfit'}: ${u.name}`);
  if (r.gained.boxes)
    news.push(`${r.gained.boxes} mystery box${r.gained.boxes > 1 ? 'es' : ''} earned`);
  if (news.length > 0) {
    const n = el('div', 'go-block');
    n.append(el('h2', 'section', 'New'));
    for (const t of news) n.append(el('p', 'go-line', t));
    panel.append(n);
  }

  panel.append(
    ui.actions(
      keyed(
        button('Play again', () => host.restart()),
        'again',
      ),
      button('Main menu', () => host.quitToMenu(), 'secondary'),
    ),
    ui.creditLink(),
  );
  ui.focusPrimary();
}

/** "So close!" prompt: a Second Chance item revives the runner once. Times out to game over. */
export function renderSecondChance(
  ui: Screens,
  host: UiHost,
  count: number,
  seconds: number,
): void {
  const { panel } = ui.open({
    title: 'So close!',
    subtitle: 'Get back up and keep running?',
    hero: true,
  });
  const bar = meter(1, 'Time to decide', 'meter-timer');
  const fill = bar.querySelector<HTMLElement>('.meter-fill');
  if (fill) {
    fill.style.transition = `width ${seconds}s linear`;
    requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = '0%')));
  }
  panel.append(
    bar,
    el('p', 'muted', `You have ${count} Second Chance${count === 1 ? '' : 's'}.`),
    ui.actions(
      keyed(
        button('Use Second Chance', () => host.secondChance(true)),
        'use',
      ),
      button('No thanks', () => host.secondChance(false), 'secondary'),
    ),
  );
  ui.later(() => host.secondChance(false), seconds * 1000);
  ui.focusPrimary();
}

/** Open mystery boxes one at a time. */
export function renderBox(ui: Screens, host: UiHost, back: () => void): void {
  const progress = host.progress;
  const { body } = ui.open({ title: 'Mystery Box', back, wallet: true });
  const stage = el('div', 'box-stage');
  const boxes = progress.data.items.boxes;

  const art = el('div', 'box-art');
  art.append(icon('box'));
  stage.append(art);
  const message = el('p', 'box-message', boxes > 0 ? 'Tap to open!' : 'No boxes left.');
  message.setAttribute('aria-live', 'polite');
  stage.append(message);

  let revealed = false;
  const open = keyed(
    button(boxes > 0 ? `Open box (${boxes})` : 'Back to shop', () => {
      if (boxes <= 0) {
        back();
        return;
      }
      if (revealed) {
        // Second tap after a reveal: another box, or done.
        if (progress.data.items.boxes > 0) ui.refresh();
        else back();
        return;
      }
      art.classList.add('box-shake');
      open.disabled = true;
      ui.later(() => {
        const res = progress.openBox();
        if (!res.ok) {
          host.sound('error');
          ui.refresh();
          return;
        }
        const reward = res.value;
        const d = progress.data;
        const upgradedTo = reward.kind === 'upgrade' ? d.upgrades[reward.powerUp] : undefined;
        const unlocked =
          reward.kind === 'piece' ? d.outfits.owned.includes(reward.outfit) : undefined;
        host.sound(reward.kind === 'medal' || unlocked ? 'unlock' : 'purchase');
        art.classList.remove('box-shake');
        art.classList.add('box-pop');
        message.textContent = boxRewardText(reward, upgradedTo, unlocked);
        message.classList.add('box-reveal');
        open.disabled = false;
        const left = d.items.boxes;
        open.textContent = left > 0 ? `Open another (${left})` : 'Done';
        revealed = true;
        open.focus();
      }, 700);
    }),
    'open-box',
  );
  stage.append(ui.actions(open));
  body.append(stage);
  open.focus();
}

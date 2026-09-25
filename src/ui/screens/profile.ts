import { CHARACTERS } from '../../config/characters';
import { BADGES } from '../../config/progression';
import { ACHIEVEMENTS } from '../../progression/achievements';
import { missionBonus } from '../../progression/missions';
import { levelFromXp } from '../../progression/xp';
import { button, el, fmt, icon, meter } from '../dom';
import { characterName, zoneName } from '../format';
import type { Nav, Screens } from '../Screens';
import type { UiHost } from '../types';

/** Name, level and XP, records, collection counts, badges, and the local top 10. */
export function renderProfile(ui: Screens, host: UiHost, nav: Nav): void {
  const d = host.progress.data;
  const { body } = ui.open({
    title: 'Profile',
    back: () => nav.menu(),
    wide: true,
    wallet: true,
  });

  const level = levelFromXp(d.player.xp);
  const head = el('div', 'profile-head');
  const avatar = el('div', 'avatar');
  avatar.append(icon('person'));
  const who = el('div', 'profile-who');
  who.append(
    el('h2', 'profile-name', host.progress.name ?? 'Runner'),
    el('span', undefined, level.maxed ? `Level ${level.level} (max)` : `Level ${level.level}`),
  );
  const xpText = level.maxed ? 'Max level reached' : `${fmt(level.into)} / ${fmt(level.need)} XP`;
  who.append(meter(level.progress, 'XP to next level'), el('span', 'muted', xpText));
  head.append(
    avatar,
    who,
    button('Rename', () => nav.settings(() => nav.profile()), 'small'),
  );
  body.append(head);

  const stats = el('dl', 'stat-grid');
  const rows: Array<[string, string]> = [
    ['Total runs', fmt(d.stats.runs)],
    ['Best score', fmt(d.highScore)],
    ['Best distance', `${fmt(d.bestDistance)} m`],
    ['Best zone', `${d.bestZone + 1} · ${zoneName(d.bestZone)}`],
    ['Characters owned', `${d.characters.owned.length} / ${CHARACTERS.length}`],
    ['Achievements', `${Object.keys(d.achievements).length} / ${ACHIEVEMENTS.length}`],
    ['Golden Medals', fmt(d.goldenMedals)],
    ['Score boost', `x${missionBonus(d.missions.setsCompleted).toFixed(2)}`],
  ];
  for (const [label, value] of rows) {
    const cell = el('div', 'stat-cell');
    cell.append(el('dt', undefined, label), el('dd', undefined, value));
    stats.append(cell);
  }
  body.append(stats);

  body.append(el('h2', 'section', 'Badges'));
  const badges = el('div', 'badges');
  if (d.player.badges.length === 0)
    badges.append(el('p', 'muted', 'Reach level 5 to earn your first badge.'));
  for (const id of d.player.badges) {
    const info = BADGES[id];
    if (!info) continue;
    const b = el('div', 'badge');
    b.title = info.description;
    b.append(icon('star'), el('span', undefined, info.name));
    badges.append(b);
  }
  body.append(badges);

  body.append(el('h2', 'section', 'Top 10 runs on this device'));
  if (d.leaderboard.length === 0) {
    body.append(el('p', 'muted', 'No runs yet. Go set a score!'));
  } else {
    const table = el('table', 'board');
    const caption = el('caption', 'sr-only', 'Local leaderboard');
    const head = el('thead');
    const hr = el('tr');
    for (const h of ['#', 'Name', 'Runner', 'Score', 'Distance', 'Zone'])
      hr.append(el('th', undefined, h));
    head.append(hr);
    const tbody = el('tbody');
    d.leaderboard.forEach((e, i) => {
      const tr = el('tr');
      tr.append(
        el('td', undefined, String(i + 1)),
        el('td', undefined, e.name),
        el('td', undefined, characterName(e.character)),
        el('td', undefined, fmt(e.score)),
        el('td', undefined, `${fmt(e.distance)} m`),
        el('td', undefined, String(e.zone + 1)),
      );
      tbody.append(tr);
    });
    table.append(caption, head, tbody);
    const wrap = el('div', 'table-wrap');
    wrap.append(table);
    body.append(wrap);
  }
}

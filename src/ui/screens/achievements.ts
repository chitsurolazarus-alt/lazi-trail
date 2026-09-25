import { ACHIEVEMENTS, achievementProgress } from '../../progression/achievements';
import { el, fmt, icon, keyed, meter } from '../dom';
import type { Nav, Screens } from '../Screens';
import type { UiHost } from '../types';

export type AchievementFilter = 'all' | 'earned' | 'locked';

/** Every achievement with progress; earned ones show the date. */
export function renderAchievements(
  ui: Screens,
  host: UiHost,
  nav: Nav,
  filter: AchievementFilter,
  setFilter: (f: AchievementFilter) => void,
): void {
  const d = host.progress.data;
  const earned = Object.keys(d.achievements).length;
  const { body } = ui.open({
    title: 'Achievements',
    subtitle: `${earned} of ${ACHIEVEMENTS.length} earned`,
    back: () => nav.menu(),
    wide: true,
    wallet: true,
  });

  const tabs = el('div', 'tabs');
  tabs.setAttribute('role', 'tablist');
  for (const f of ['all', 'earned', 'locked'] as const) {
    const t = keyed(el('button', 'tab', f[0]?.toUpperCase() + f.slice(1)), `tab-${f}`);
    t.type = 'button';
    t.setAttribute('role', 'tab');
    t.setAttribute('aria-selected', String(f === filter));
    t.addEventListener('click', () => {
      host.sound('select');
      setFilter(f);
    });
    tabs.append(t);
  }
  body.append(tabs);

  const list = el('ul', 'ach-list');
  for (const def of ACHIEVEMENTS) {
    const p = achievementProgress(d, def);
    if (filter === 'earned' && !p.done) continue;
    if (filter === 'locked' && p.done) continue;
    const li = el('li', `ach${p.done ? ' ach-done' : ''}${def.rare ? ' ach-rare' : ''}`);
    li.append(icon(p.done ? 'trophy' : 'lock'));
    const text = el('div', 'ach-text');
    const title = el('strong', undefined, def.name);
    if (def.rare) title.append(el('span', 'rare-tag', 'Rare'));
    text.append(title, el('span', undefined, def.description));
    if (p.done) {
      const when = d.achievements[def.id];
      text.append(el('span', 'muted', `Earned ${when ? new Date(when).toLocaleDateString() : ''}`));
    } else {
      text.append(meter(p.value / p.target, `${def.name} progress`, 'meter-thin'));
      text.append(el('span', 'muted', `${fmt(p.value)} / ${fmt(p.target)}`));
    }
    const reward = el('span', 'ach-reward', `R ${fmt(def.rand)}`);
    li.append(text, reward);
    list.append(li);
  }
  if (!list.children.length) list.append(el('li', 'muted', 'Nothing here yet.'));
  body.append(list);
}

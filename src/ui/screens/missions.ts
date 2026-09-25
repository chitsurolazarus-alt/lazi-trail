import { LOGIN_REWARDS, MISSIONS } from '../../config/progression';
import { currentStreak, missionBonus, missionText } from '../../progression/missions';
import { LOGIN_DAYS } from '../../progression/login';
import { button, el, fmt, icon, keyed, meter } from '../dom';
import { rewardText } from '../format';
import type { Nav, Screens } from '../Screens';
import type { UiHost } from '../types';

/** The 7-day login calendar with a claim button when a reward is due. */
function loginCalendar(host: UiHost, onClaimed: () => void): HTMLElement {
  const progress = host.progress;
  const status = progress.loginStatus();
  const wrap = el('div', 'calendar-wrap');
  const grid = el('ol', 'calendar');
  const claimed = status.canClaim ? status.day - 1 : status.day;
  for (let day = 1; day <= LOGIN_DAYS; day++) {
    const state =
      day <= claimed && !(status.canClaim && status.streakBroken)
        ? 'claimed'
        : day === status.day && status.canClaim
          ? 'today'
          : 'later';
    const li = el('li', `cal-day cal-${state}${day === LOGIN_DAYS ? ' cal-big' : ''}`);
    li.append(el('span', 'cal-num', `Day ${day}`));
    li.append(el('span', 'cal-reward', rewardText(LOGIN_REWARDS[day - 1] ?? {})));
    if (state === 'claimed') li.append(icon('check'));
    grid.append(li);
  }
  wrap.append(grid);
  if (status.canClaim) {
    if (status.streakBroken) {
      wrap.append(el('p', 'muted', 'You missed a day, so the calendar starts again at day 1.'));
    }
    const claim = keyed(
      button(`Claim day ${status.day}`, () => {
        const res = progress.claimLoginReward();
        if (res.ok) {
          host.sound('purchase');
          host.toasts.show({
            title: `Day ${res.value.day} reward`,
            text: rewardText(res.value.reward),
            icon: 'star',
            kind: 'info',
          });
          onClaimed();
        } else host.sound('error');
      }),
      'claim',
    );
    wrap.append(claim);
  } else {
    wrap.append(
      el(
        'p',
        'muted',
        'Come back tomorrow for the next reward. Miss a day and the calendar restarts.',
      ),
    );
  }
  return wrap;
}

/** Pop-up shown when the game opens and a daily reward is waiting. */
export function renderDailyReward(ui: Screens, host: UiHost, after: () => void): void {
  const { body } = ui.open({
    title: 'Daily reward',
    subtitle: 'Log in every day for bigger prizes.',
    wide: true,
  });
  body.append(
    loginCalendar(host, () => {
      after();
    }),
  );
  body.append(ui.actions(button('Later', after, 'secondary')));
  ui.focusPrimary();
}

/** Today's three missions, rerolls, set bonus, streak, and the login calendar. */
export function renderMissions(ui: Screens, host: UiHost, nav: Nav): void {
  const progress = host.progress;
  const d = progress.data;
  const { body } = ui.open({
    title: 'Missions',
    subtitle: 'Three new missions every day.',
    back: () => nav.menu(),
    wide: true,
    wallet: true,
  });

  const list = el('ul', 'mission-list');
  d.missions.list.forEach((m, i) => {
    const li = el('li', `mission${m.done ? ' mission-done' : ''}`);
    li.append(icon(m.done ? 'check' : 'bolt'));
    const text = el('div', 'mission-text');
    text.append(el('strong', undefined, missionText(m)));
    text.append(meter(m.progress / m.target, missionText(m), 'meter-thin'));
    text.append(
      el('span', 'muted', `${fmt(m.progress)} / ${fmt(m.target)}  ·  Reward R ${fmt(m.reward)}`),
    );
    li.append(text);
    if (!m.done) {
      const reroll = keyed(
        button(
          `Swap R ${MISSIONS.rerollCost}`,
          () => {
            const res = progress.rerollMission(i);
            host.sound(res.ok ? 'select' : 'error');
            if (!res.ok) host.toasts.show({ title: res.reason, kind: 'info' });
            ui.refresh();
          },
          'small',
        ),
        `reroll-${i}`,
      );
      reroll.title = 'Swap this mission for a different one';
      li.append(reroll);
    }
    list.append(li);
  });
  body.append(list);

  const bonus = missionBonus(d.missions.setsCompleted);
  const streak = currentStreak(d.missions, progress.today);
  const info = el('div', 'mission-info');
  info.append(
    el(
      'p',
      undefined,
      `Finish all three for R ${MISSIONS.setRewardRand} and a permanent score boost of +${Math.round(MISSIONS.bonusPerSet * 100)}%.`,
    ),
    el(
      'p',
      'muted',
      `Sets completed: ${d.missions.setsCompleted}  ·  Score boost: x${bonus.toFixed(2)}  ·  Daily streak: ${streak} (best ${d.missions.bestStreak})`,
    ),
  );
  body.append(info);

  body.append(el('h2', 'section', 'Daily login rewards'));
  body.append(loginCalendar(host, () => ui.refresh()));
}

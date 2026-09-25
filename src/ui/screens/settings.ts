import { NAME_RULES } from '../../config/progression';
import { QUALITY_LEVELS, QUALITY_PROFILES } from '../../config/quality';
import { validateName } from '../../progression/names';
import type { Channel } from '../../systems/audio/AudioManager';
import { button, el } from '../dom';
import type { Screens } from '../Screens';
import type { UiHost } from '../types';

/** Player name, sound, graphics quality, tutorial and progress reset. */
export function renderSettings(ui: Screens, host: UiHost, back: () => void): void {
  const { body } = ui.open({ title: 'Settings', back, wide: true });

  /* ---- player name */
  body.append(el('h2', 'section', 'Runner name'));
  const nameRow = el('div', 'field-row');
  const input = el('input', 'text-input');
  input.type = 'text';
  input.maxLength = NAME_RULES.max;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Runner name');
  input.value = host.progress.name ?? '';
  const error = el('p', 'field-error');
  error.setAttribute('role', 'alert');
  const save = (): void => {
    const check = validateName(input.value);
    if (!check.ok) {
      error.textContent = check.error;
      host.sound('error');
      return;
    }
    host.progress.setName(check.name);
    error.textContent = '';
    host.sound('confirm');
    host.toasts.show({ title: 'Name saved', text: check.name, kind: 'info' });
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    }
  });
  nameRow.append(input, button('Save', save, 'small'));
  body.append(nameRow, error);

  /* ---- sound */
  body.append(el('h2', 'section', 'Sound'), audioControls(host));

  /* ---- graphics */
  body.append(el('h2', 'section', 'Graphics quality'));
  const group = el('div', 'radio-group');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', 'Graphics quality');
  const current = host.getQuality();
  for (const level of QUALITY_LEVELS) {
    const profile = QUALITY_PROFILES[level];
    const option = el('button', 'radio');
    option.type = 'button';
    option.setAttribute('role', 'radio');
    option.setAttribute('aria-checked', String(level === current));
    option.append(
      el('strong', undefined, profile.label),
      el('span', undefined, profile.description),
    );
    option.addEventListener('click', () => {
      for (const b of group.querySelectorAll('.radio')) b.setAttribute('aria-checked', 'false');
      option.setAttribute('aria-checked', 'true');
      host.setQuality(level);
    });
    group.append(option);
  }
  body.append(group);

  /* ---- help and data */
  body.append(el('h2', 'section', 'Help and data'));
  const tools = el('div', 'actions');
  tools.append(
    button(
      'Replay tutorial',
      () => {
        host.replayTutorial();
        host.toasts.show({
          title: 'Tutorial reset',
          text: 'It will show on your next run.',
          kind: 'info',
        });
      },
      'small',
    ),
  );
  const reset = button('Reset all progress', () => confirmReset(), 'small');
  reset.classList.add('btn-danger');
  tools.append(reset);
  body.append(tools);

  function confirmReset(): void {
    reset.replaceWith(confirmBox());
  }
  function confirmBox(): HTMLElement {
    const box = el('div', 'confirm');
    box.append(
      el('span', undefined, 'Erase your characters, Rand, XP and records? This cannot be undone.'),
    );
    const yes = button(
      'Yes, erase',
      () => {
        host.resetProgress();
      },
      'small',
    );
    yes.classList.add('btn-danger');
    box.append(
      yes,
      button('Cancel', () => ui.refresh(), 'small'),
    );
    return box;
  }
}

/** Music / SFX / Ambience sliders and a mute switch. Sliders apply live and save on release. */
function audioControls(host: UiHost): HTMLElement {
  const box = el('div', 'audio-controls');
  const current = host.getAudio();

  const mute = el('label', 'switch');
  const check = el('input');
  check.type = 'checkbox';
  check.checked = current.muted;
  check.addEventListener('change', () => host.setMuted(check.checked));
  mute.append(check, el('span', undefined, 'Mute all sound'));
  box.append(mute);

  const rows: Array<[Channel, string, number]> = [
    ['music', 'Music', current.musicVolume],
    ['sfx', 'Sound effects', current.sfxVolume],
    ['ambience', 'Ambience', current.ambienceVolume],
  ];
  for (const [channel, label, value] of rows) {
    const row = el('label', 'slider');
    const input = el('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '5';
    input.value = String(Math.round(value * 100));
    input.setAttribute('aria-label', `${label} volume`);
    const out = el('output', undefined, `${input.value}%`);
    input.addEventListener('input', () => {
      out.textContent = `${input.value}%`;
      host.setVolume(channel, Number(input.value) / 100);
    });
    input.addEventListener('change', () => host.previewVolume(channel));
    row.append(el('span', undefined, label), input, out);
    box.append(row);
  }
  return box;
}

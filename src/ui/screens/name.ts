import { NAME_RULES } from '../../config/progression';
import { validateName } from '../../progression/names';
import { button, el } from '../dom';
import type { Nav, Screens } from '../Screens';
import type { UiHost } from '../types';

/** "Name your runner": shown on the very first launch (and for saves migrated from v1). */
export function renderName(ui: Screens, host: UiHost, _nav: Nav, first: boolean): void {
  const { panel, body } = ui.open({
    title: 'Name your runner',
    subtitle: `${NAME_RULES.min}-${NAME_RULES.max} letters or numbers. It shows on your scoreboard.`,
    hero: true,
  });
  void body;

  const input = el('input', 'text-input');
  input.type = 'text';
  input.maxLength = NAME_RULES.max;
  input.placeholder = 'Your name';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Runner name');
  input.value = host.progress.name ?? '';

  const error = el('p', 'field-error');
  error.setAttribute('role', 'alert');

  const submit = (): void => {
    const check = validateName(input.value);
    if (!check.ok) {
      error.textContent = check.error;
      host.sound('error');
      input.focus();
      return;
    }
    host.progress.setName(check.name);
    host.sound('confirm');
    if (first) ui.startMenu();
    else ui.menu();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });
  input.addEventListener('input', () => {
    error.textContent = '';
  });

  panel.append(input, error, ui.actions(button("Let's run", submit)), ui.creditLink());
  input.focus();
}

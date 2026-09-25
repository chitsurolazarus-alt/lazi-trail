import { NAME_RULES } from '../config/progression';

/**
 * A modest blocklist of English profanity and slurs, matched after normalising look-alike
 * characters. Short words that appear inside ordinary names ("Essex", "Hancock", "Draper") are
 * left out on purpose so real names are not refused.
 */
const BLOCKED = [
  'fuck',
  'shit',
  'bitch',
  'bastard',
  'cunt',
  'pussy',
  'whore',
  'slut',
  'asshole',
  'twat',
  'nigg',
  'fagg',
  'retard',
  'nazi',
  'hitler',
  'porn',
  'boob',
  'penis',
  'vagina',
  'kkk',
  'kaffir',
  'chink',
];

const LOOKALIKES: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'i',
  '!': 'i',
  '3': 'e',
  '4': 'a',
  '@': 'a',
  '5': 's',
  $: 's',
  '7': 't',
  '8': 'b',
};

/** Lower-case, undo leetspeak, drop everything that is not a letter. */
export function normaliseForFilter(text: string): string {
  let out = '';
  for (const ch of text.toLowerCase()) {
    const mapped = LOOKALIKES[ch] ?? ch;
    if (mapped >= 'a' && mapped <= 'z') out += mapped;
  }
  return out;
}

const squash = (s: string): string => s.replace(/(.)\1+/g, '$1');

export function containsBadWord(text: string): boolean {
  const flat = normaliseForFilter(text);
  const squashed = squash(flat);
  // Stretched-out spellings ("fuuuck") are caught by squashing repeats in the name, but only for
  // words without a double letter of their own (squashing "kkk" would match every "k").
  return BLOCKED.some((w) => flat.includes(w) || (squash(w) === w && squashed.includes(w)));
}

export type NameCheck = { ok: true; name: string } | { ok: false; error: string };

/** Trim, collapse spaces and check length, characters and the blocklist. */
export function validateName(input: string): NameCheck {
  const name = input.trim().replace(/\s+/g, ' ');
  if (name.length < NAME_RULES.min) {
    return { ok: false, error: `At least ${NAME_RULES.min} characters.` };
  }
  if (name.length > NAME_RULES.max) {
    return { ok: false, error: `At most ${NAME_RULES.max} characters.` };
  }
  if (!/^[\p{L}\p{N} _.'-]+$/u.test(name)) {
    return { ok: false, error: "Letters, numbers, spaces and . _ ' - only." };
  }
  if (!/[\p{L}\p{N}]{2}/u.test(name)) {
    return { ok: false, error: 'Use a few real letters or numbers.' };
  }
  if (containsBadWord(name)) return { ok: false, error: 'Please choose a friendlier name.' };
  return { ok: true, name };
}

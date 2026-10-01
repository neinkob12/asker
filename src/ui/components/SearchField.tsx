// Suchfeld wie bei iOS: graue Pille mit Lupe, Löschen-Knopf, sobald etwas drinsteht. Im Handy steht es unter dem
// großen Titel einer Seite (PhoneScreen mit `search`) und erscheint, wenn man die Seite oben herunterzieht.

import { Icon } from './Icon';

export interface SearchFieldProps {
  value: string;
  onInput: (value: string) => void;
  placeholder?: string;
  /** Beschriftung für Screenreader. Standard: placeholder. */
  label?: string;
  autoFocus?: boolean;
  class?: string;
  /** Esc im Feld (Standard: leeren, ein leeres Feld lässt Esc durch). */
  onEscape?: () => void;
}

export function SearchField(props: SearchFieldProps) {
  const placeholder = props.placeholder ?? 'Suchen';
  return (
    <label class={`ui-search ${props.class ?? ''}`}>
      <Icon name="search" class="ui-search__icon" />
      <input
        type="search"
        class="ui-search__input"
        value={props.value}
        placeholder={placeholder}
        aria-label={props.label ?? placeholder}
        // biome-ignore lint/a11y/noAutofocus: nur wenn der Spieler das Feld ausdrücklich geöffnet hat
        autoFocus={props.autoFocus}
        enterKeyHint="search"
        onInput={(e) => props.onInput(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape' || (!props.value && !props.onEscape)) return;
          // Esc gehört dem Feld (leeren bzw. schließen), nicht dem Handy (eine Seite zurück).
          e.stopPropagation();
          if (props.onEscape) props.onEscape();
          else props.onInput('');
        }}
      />
      {props.value && (
        <button type="button" class="ui-search__clear" aria-label="Suche leeren" onClick={() => props.onInput('')}>
          <Icon name="xCircle" />
        </button>
      )}
    </label>
  );
}

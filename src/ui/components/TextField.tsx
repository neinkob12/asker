// Einzeiliges Textfeld mit Beschriftung, z.B. für den Spielernamen. Enter löst onSubmit aus.

import { useEffect, useRef } from 'preact/hooks';

export interface TextFieldProps {
  label: string;
  value: string;
  onInput: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  maxLength?: number;
  autoFocus?: boolean;
  class?: string;
}

export function TextField(props: TextFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  // autofocus wirkt im Browser nur beim Laden der Seite oder beim Öffnen eines Dialogs: Ein Feld, das erst später
  // erscheint (Intro, Schritt „Wie heißt du?“), bekäme sonst keinen Fokus (Auftrag 43, N3).
  useEffect(() => {
    if (props.autoFocus) input.current?.focus();
  }, []);
  return (
    <label class={`ui-textfield ${props.class ?? ''}`}>
      <span class="ui-textfield__label">{props.label}</span>
      <input
        ref={input}
        type="text"
        class="ui-textfield__input"
        value={props.value}
        placeholder={props.placeholder}
        maxLength={props.maxLength}
        autoComplete="nickname"
        // biome-ignore lint/a11y/noAutofocus: nur im Dialog, der genau nach diesem Feld fragt
        autoFocus={props.autoFocus}
        enterKeyHint="done"
        onInput={(e) => props.onInput(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') props.onSubmit?.();
        }}
      />
    </label>
  );
}

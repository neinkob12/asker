// Einzeiliges Textfeld mit Beschriftung, z.B. für den Spielernamen. Enter löst onSubmit aus.

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
  return (
    <label class={`ui-textfield ${props.class ?? ''}`}>
      <span class="ui-textfield__label">{props.label}</span>
      <input
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

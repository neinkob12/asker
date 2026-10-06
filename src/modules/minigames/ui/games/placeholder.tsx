// Platzhalter für Minispiele, deren Teil noch nicht fertig ist. Erscheint nie im Spiel (die Art ist nicht scharf),
// nur in der Vorschau (?minispiel=<art>).

import type { MinigameViewProps } from '../registry';

export function Placeholder(props: MinigameViewProps) {
  return (
    <div class="mg-placeholder">
      <p class="mg-placeholder__text">Dieses Minispiel kommt noch.</p>
      <div class="mg-placeholder__buttons">
        <button type="button" class="mg-button is-gold" disabled={!props.running} onClick={() => props.onFinish(0.8)}>
          Geschafft (Test)
        </button>
        <button type="button" class="mg-button" disabled={!props.running} onClick={() => props.onFinish(0.2)}>
          Nicht geschafft (Test)
        </button>
      </div>
    </div>
  );
}

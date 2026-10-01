// Rückmeldung beim Drücken wie bei iOS: Kacheln und Zeilen reagieren, sobald der Finger (oder die Maus) aufsetzt, nicht
// erst beim Loslassen. Bewegt sich der Zeiger (Scrollen, Wischen), erlischt die Hervorhebung wieder. Ein Listener für
// das ganze Handy (Ereignis-Delegation); das Aussehen steht in phone.css (.is-pressed).

/** Was gedrückt aussehen kann: App-Kacheln, Zeilen, Knöpfe. */
const PRESSABLE = [
  '.phone__app',
  '.ui-list__button',
  '.ui-row',
  '.msg-row',
  '.set-link',
  '.phone-screen__back',
  '.ui-button',
  '.island-row',
  '[data-press]',
].join(',');

/** Ab dieser Bewegung (px) ist es kein Tippen mehr, sondern Scrollen oder Wischen. */
const SLOP = 10;

export function bindPressFeedback(root: HTMLElement): () => void {
  let pressed: HTMLElement | null = null;
  let start = { x: 0, y: 0, id: -1 };

  const release = () => {
    pressed?.classList.remove('is-pressed');
    pressed = null;
  };
  const down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const target = (e.target as Element | null)?.closest<HTMLElement>(PRESSABLE);
    if (!target || !root.contains(target) || (target as HTMLButtonElement).disabled) return;
    release();
    pressed = target;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    target.classList.add('is-pressed');
  };
  const move = (e: PointerEvent) => {
    if (!pressed || e.pointerId !== start.id) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP) release();
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId === start.id) release();
  };

  root.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  root.addEventListener('scroll', release, { capture: true, passive: true });
  return () => {
    root.removeEventListener('pointerdown', down);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    root.removeEventListener('scroll', release, { capture: true });
  };
}

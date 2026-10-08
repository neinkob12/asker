// Rückmeldung zu einem fehlgeschlagenen Befehl des Spielers (Auftrag 46d: das einzige Banner, das es noch gibt). Kurz
// oben im Handy, bzw. oben über der Karte, wenn das Handy weggelegt ist; ein Tipp blendet es aus.

import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../components';
import { useRuntime } from '../hooks';

/**
 * Dauerhaft eingehängte Live-Region (nur für Screenreader): Der Text wechselt, die Region bleibt. Kurz leeren und
 * dann füllen, damit auch derselbe Text zweimal angesagt wird.
 */
function Announcer(props: { id: number | undefined; text: string }) {
  const [said, setSaid] = useState('');
  useEffect(() => {
    setSaid('');
    if (!props.text) return;
    const timer = setTimeout(() => setSaid(props.text), 60);
    return () => clearTimeout(timer);
  }, [props.id]);
  return (
    <div class="visually-hidden" role="status" aria-live="assertive" aria-atomic="true" data-live-region="">
      {said}
    </div>
  );
}

function Notice(props: { class: string }) {
  const { ui, api } = useRuntime();
  const error = ui.error;
  if (!error) return null;
  return (
    <button type="button" class={`ui-error-notice ${props.class}`} key={error.id} onClick={api.dismissError}>
      <Icon name="alert" class="ui-error-notice__icon" />
      <span class="ui-error-notice__text">{error.text}</span>
    </button>
  );
}

/** Im offenen Handy, oben unter der Statusleiste. */
export function PhoneErrorNotice() {
  return <Notice class="is-inside" />;
}

/** Über der Karte, solange das Handy weggelegt ist (dazu die Ansage für Screenreader, immer da). */
export function FloatingErrorNotice() {
  const { ui } = useRuntime();
  return (
    <>
      <Announcer id={ui.error?.id} text={ui.error?.text ?? ''} />
      {!ui.phone.open && <Notice class="is-floating" />}
    </>
  );
}

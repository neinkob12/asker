// Gerüst für eine App-Seite im Spiel-Handy im iOS-Stil: Navigationsleiste mit "‹ Zurück" links und Aktionen rechts,
// darunter ein großer Titel, der mit dem Inhalt scrollt (Large Title). Scrollt der Titel aus dem Bild, wandert er als
// kleiner Titel in die Mitte der Leiste, und die Leiste bekommt Glas und eine Haarlinie (Inhalt läuft darunter durch).
// Mit leading (z.B. Avatar im Chat) oder inlineTitle steht der Titel von Anfang an klein und mittig, wie in der
// Nachrichten-App. Apps mit chrome: 'none' nutzen es selbst (z.B. für Unterseiten), sonst setzt das Handy es
// automatisch.
//
// Zurück geht eine Seite im Navigationsstapel zurück; der Knopf trägt den Titel der Vorseite (wie bei iOS, lange
// Titel heißen "Zurück"). Ein Titel als Text wird der Titel dieser Seite im Stapel (für den Zurück-Knopf der nächsten).

import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { BarActionsContext, Icon, SearchField } from '../components';
import { useRuntime } from '../hooks';
import { backLabel as backTitle } from './navModel';
import { usePage } from './page';

export interface PhoneScreenProps {
  title: ComponentChildren;
  /** Kleine Zeile unter dem Titel. */
  subtitle?: ComponentChildren;
  /** Zurück: Standard ist eine Seite zurück im Stapel des Handys (von der Wurzel einer App zum Startbildschirm). */
  onBack?: () => void;
  /** Beschriftung neben dem Zurück-Pfeil. Standard: Titel der Vorseite (kurz), sonst "Zurück". */
  backLabel?: string;
  /** Rechts in der Leiste. */
  actions?: ComponentChildren;
  /** Links neben dem Titel, z.B. ein Avatar (Titel dann klein in der Leiste). */
  leading?: ComponentChildren;
  /** Titel klein und mittig in der Leiste statt groß über dem Inhalt. */
  inlineTitle?: boolean;
  children?: ComponentChildren;
  /** Fußzeile aus Glas, bleibt unten stehen (z.B. Antwortknöpfe). */
  footer?: ComponentChildren;
  /**
   * Suchfeld unter dem großen Titel (wie bei iOS): erscheint, wenn man die Seite oben herunterzieht, oder über die
   * Lupe in der Leiste. Mit Text bleibt es stehen.
   */
  search?: { value: string; onInput: (value: string) => void; placeholder?: string };
  class?: string;
}

/** Ab dieser Scrollhöhe (px) ist der große Titel aus dem Bild und der kleine erscheint in der Leiste. */
const COLLAPSE_AT = 30;

/** Ab diesem Weg (px) nach unten am oberen Rand erscheint das Suchfeld. */
const SEARCH_PULL = 24;

export function PhoneScreen(props: PhoneScreenProps) {
  const runtime = useRuntime();
  const page = usePage();
  const [scrolled, setScrolled] = useState(false);
  const [searching, setSearching] = useState(!!props.search?.value);
  const [focusSearch, setFocusSearch] = useState(false);
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLDivElement>(null);
  const hasSearch = !!props.search;
  // Herunterziehen am oberen Rand: Mausrad, Trackpad oder Finger (Touch-Ereignisse laufen auch beim Überscrollen).
  useEffect(() => {
    const el = body.current;
    if (!el || !hasSearch) return;
    let startY: number | null = null;
    const atTop = () => el.scrollTop <= 0;
    const wheel = (e: WheelEvent) => {
      if (atTop() && e.deltaY < -2) setSearching(true);
    };
    const touchStart = (e: TouchEvent) => {
      startY = atTop() ? (e.touches[0]?.clientY ?? null) : null;
    };
    const touchMove = (e: TouchEvent) => {
      if (startY !== null && (e.touches[0]?.clientY ?? 0) - startY > SEARCH_PULL) setSearching(true);
    };
    el.addEventListener('wheel', wheel, { passive: true });
    el.addEventListener('touchstart', touchStart, { passive: true });
    el.addEventListener('touchmove', touchMove, { passive: true });
    return () => {
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('touchstart', touchStart);
      el.removeEventListener('touchmove', touchMove);
    };
  }, [hasSearch]);
  const back = props.onBack ?? runtime.api.back;
  const inline = props.inlineTitle || !!props.leading;
  const collapsed = inline || scrolled;
  const backLabel = props.backLabel ?? (page ? backTitle(page.below) : 'Zurück');
  // Titel der Seite im Stapel merken (z.B. Name im Chat), damit die nächste Seite ihn im Zurück-Knopf zeigt.
  const key = page?.entry.key;
  const title = typeof props.title === 'string' ? props.title : null;
  useEffect(() => {
    if (key && title) runtime.rememberTitle(key, title);
  }, [key, title]);
  const classes = ['phone-screen'];
  if (inline) classes.push('is-inline');
  if (props.leading) classes.push('has-leading');
  if (collapsed) classes.push('is-collapsed');
  if (props.footer) classes.push('has-footer');
  if (props.class) classes.push(props.class);
  const search = props.search;
  const showSearch = !!search && (searching || !!search.value);
  // Über die Lupe geöffnet: gleich hineinschreiben können.
  useEffect(() => {
    if (!showSearch || !focusSearch) return;
    searchBox.current?.querySelector('input')?.focus({ preventScroll: true });
    setFocusSearch(false);
  }, [showSearch, focusSearch]);
  return (
    <div class={classes.join(' ')}>
      <header class="phone-screen__bar">
        <button
          type="button"
          class="phone-screen__back"
          onClick={back}
          aria-label={backLabel === 'Zurück' ? 'Zurück' : `Zurück zu ${backLabel}`}
        >
          <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
          <span>{backLabel}</span>
        </button>
        <div class="phone-screen__center" aria-hidden={inline ? undefined : 'true'}>
          {props.leading}
          <div class="phone-screen__titles">
            {inline ? (
              <h2 class="phone-screen__title">{props.title}</h2>
            ) : (
              <p class="phone-screen__title">{props.title}</p>
            )}
            {inline && props.subtitle && <div class="phone-screen__subtitle">{props.subtitle}</div>}
          </div>
        </div>
        <div class="phone-screen__actions" ref={setBar}>
          {search && !showSearch && (
            <button
              type="button"
              class="phone-screen__search-button"
              aria-label="Suchen"
              title="Suchen"
              onClick={() => {
                setSearching(true);
                setFocusSearch(true);
              }}
            >
              <Icon name="search" />
            </button>
          )}
          {props.actions}
        </div>
      </header>
      <div
        class="phone-screen__body"
        ref={body}
        onScroll={(e) => {
          const next = e.currentTarget.scrollTop > COLLAPSE_AT;
          if (next !== scrolled) setScrolled(next);
        }}
      >
        {!inline && (
          <div class="phone-screen__head">
            <h2 class="phone-screen__large">{props.title}</h2>
            {props.subtitle && <div class="phone-screen__subtitle">{props.subtitle}</div>}
          </div>
        )}
        {search && (
          <div class={`phone-screen__search ${showSearch ? 'is-open' : ''}`} inert={!showSearch} ref={searchBox}>
            <div>
              <SearchField
                value={search.value}
                onInput={search.onInput}
                placeholder={search.placeholder}
                onEscape={() => {
                  search.onInput('');
                  setSearching(false);
                }}
              />
            </div>
          </div>
        )}
        <BarActionsContext.Provider value={bar}>{props.children}</BarActionsContext.Provider>
      </div>
      {props.footer && <footer class="phone-screen__footer">{props.footer}</footer>}
    </div>
  );
}

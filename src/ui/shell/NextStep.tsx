// "Nächster Schritt": die wichtigste Empfehlung der Module (registerAdvisor) als Widget auf dem Startbildschirm
// des Handys, in der Leiste unten am Handy-Bildschirm und als sanfter, pulsierender Hinweis (Onboarding) am Ziel.
// Nichts wird gesperrt: Die Karte schlägt nur vor.

import { useEffect, useRef, useState } from 'preact/hooks';
import { clock, formatEuro, type GameState, wallet } from '../../core';
import { Button, IconChip, Tag } from '../components';
import { useRuntime } from '../hooks';
import { type Advice, advisors } from '../registry';

/** Alle Empfehlungen, wichtigste zuerst. Fehler einzelner Module werden ignoriert. */
export function collectAdvice(state: GameState): Advice[] {
  const all: Advice[] = [];
  for (const advisor of advisors.list()) {
    try {
      const result = advisor.advise(state);
      if (Array.isArray(result)) all.push(...result);
      else if (result) all.push(result);
    } catch (error) {
      console.error(`Empfehlung "${advisor.id}"`, error);
    }
  }
  return all.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

/** Was fehlt für diese Empfehlung? */
export function missingFor(state: GameState, advice: Advice): string | null {
  if (advice.missing) return advice.missing;
  if (advice.cost !== undefined) {
    const lack = advice.cost - wallet.balance(state, 'dirty');
    if (lack > 0) return `Dir fehlen noch ${formatEuro(lack)}`;
  }
  return null;
}

/** Sanfte Hinweise nur am Anfang (die ersten beiden Spieltage). */
export function coachingActive(state: GameState): boolean {
  return clock.day(state.time) <= 2;
}

/** Widget auf dem Startbildschirm des Handys. */
export function NextStepWidget() {
  const runtime = useRuntime();
  const state = runtime.state;
  const [expanded, setExpanded] = useState(false);
  if (!state) return null;
  const list = collectAdvice(state);
  const top = list[0];
  if (!top) return null;
  const others = list.slice(1, 4);
  return (
    <section class={`next-step ${coachingActive(state) && top.priority >= 50 ? 'is-coaching' : ''}`}>
      <div class="next-step__kicker">Nächster Schritt</div>
      <AdviceBody advice={top} state={state} />
      {others.length > 0 && (
        <>
          <button type="button" class="next-step__more" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Weniger' : `${others.length} weitere ${others.length === 1 ? 'Idee' : 'Ideen'}`}
          </button>
          {expanded && (
            <ul class="next-step__others">
              {others.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => a.action?.(runtime.api)} disabled={!a.action}>
                    <IconChip icon={a.icon} size="xs" color="paper" />
                    <span>{a.title}</span>
                    {a.cost !== undefined && <Tag>{formatEuro(a.cost)}</Tag>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function AdviceBody(props: { advice: Advice; state: GameState }) {
  const { api } = useRuntime();
  const { advice, state } = props;
  const missing = missingFor(state, advice);
  return (
    <div class="next-step__body">
      <IconChip icon={advice.icon} color="yellow" size="md" shape="square" />
      <div class="next-step__text">
        <strong class="next-step__title">{advice.title}</strong>
        {advice.text && <span class="next-step__desc">{advice.text}</span>}
        <span class="next-step__meta">
          {advice.cost !== undefined && (
            <Tag tone={missing ? 'muted' : 'accent'} icon="moneyBag">
              {formatEuro(advice.cost)}
            </Tag>
          )}
          {missing && <span class="next-step__missing">{missing}</span>}
        </span>
      </div>
      {advice.action && (
        <Button variant="primary" small onClick={() => advice.action?.(api)}>
          {advice.actionLabel ?? 'Los'}
        </Button>
      )}
    </div>
  );
}

/** Setzt den pulsierenden Hinweis (Klasse is-coach) an das Ziel der wichtigsten Empfehlung. */
export function CoachHighlight() {
  const runtime = useRuntime();
  const state = runtime.state;
  const selector =
    state && coachingActive(state) && !runtime.ui.dialog ? (collectAdvice(state)[0]?.highlight ?? null) : null;
  const current = useRef<Element | null>(null);
  useEffect(() => {
    let element: Element | null = null;
    try {
      element = selector ? document.querySelector(selector) : null;
    } catch {
      element = null;
    }
    if (element === current.current) return;
    current.current?.classList.remove('is-coach');
    element?.classList.add('is-coach');
    current.current = element;
  });
  useEffect(() => () => current.current?.classList.remove('is-coach'), []);
  return null;
}

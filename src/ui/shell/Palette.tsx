// Suche (Strg/⌘+K): Spots, Veedel, Leute … (registerSearch der Module) plus Bereiche, Handy-Apps und Befehle.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon, IconChip } from '../components';
import { useRuntime } from '../hooks';
import { phoneApps, searchProviders, sidebarTabs } from '../registry';
import type { UiRuntime } from '../runtime';
import { tabIcon } from './layout';

interface Entry {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  icon: string;
  haystack: string;
  run: () => void;
}

const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function collect(runtime: UiRuntime): Entry[] {
  const { api } = runtime;
  const state = runtime.state;
  const entries: Entry[] = [];
  const add = (e: Omit<Entry, 'haystack'> & { keywords?: string }) =>
    entries.push({ ...e, haystack: normalize(`${e.title} ${e.subtitle ?? ''} ${e.keywords ?? ''} ${e.group}`) });
  if (state) {
    for (const provider of searchProviders.list()) {
      try {
        for (const item of provider.items(state)) {
          add({
            id: `${provider.id}:${item.id}`,
            group: provider.label,
            title: item.title,
            subtitle: item.subtitle,
            icon: item.icon ?? 'pin',
            keywords: item.keywords,
            run: () => item.run(api),
          });
        }
      } catch (error) {
        console.error(`Suche "${provider.id}"`, error);
      }
    }
  }
  for (const tab of sidebarTabs.list()) {
    add({
      id: `tab:${tab.id}`,
      group: 'Bereiche',
      title: tab.title,
      icon: tabIcon(tab),
      run: () => api.selectTab(tab.id),
    });
  }
  for (const app of phoneApps.list()) {
    add({
      id: `app:${app.id}`,
      group: 'Handy',
      title: app.name,
      subtitle: 'Handy-App',
      icon: app.icon,
      run: () => api.openPhone(app.id),
    });
  }
  const paused = runtime.session.loop.speed === 0;
  add({
    id: 'cmd:pause',
    group: 'Befehle',
    title: paused ? 'Weiterspielen' : 'Pause',
    icon: paused ? 'play' : 'pause',
    keywords: 'tempo stop',
    run: api.togglePause,
  });
  add({
    id: 'cmd:saves',
    group: 'Befehle',
    title: 'Spielstände',
    icon: 'save',
    keywords: 'speichern laden',
    run: () => api.openDialog('core.saves', {}),
  });
  add({
    id: 'cmd:settings',
    group: 'Befehle',
    title: 'Einstellungen',
    icon: 'sliders',
    keywords: 'ton musik',
    run: () => api.openDialog('core.settings', {}),
  });
  add({
    id: 'cmd:camera',
    group: 'Befehle',
    title: runtime.ui.camera === '3d' ? 'Kamera: 2D-Draufsicht' : 'Kamera: 3D schräg',
    icon: 'cube',
    run: api.toggleCamera,
  });
  add({ id: 'cmd:koeln', group: 'Befehle', title: 'Zurück nach Köln', icon: 'pin', run: api.flyToKoeln });
  return entries;
}

export function Palette() {
  const { ui } = useRuntime();
  if (!ui.palette) return null;
  return <PaletteBox />;
}

function PaletteBox() {
  const runtime = useRuntime();
  const { api } = runtime;
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const all = useMemo(() => collect(runtime), [runtime]);

  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const results = all
    .filter((e) => terms.every((t) => e.haystack.includes(t)))
    .sort(
      (a, b) =>
        Number(normalize(b.title).startsWith(terms[0] ?? '')) - Number(normalize(a.title).startsWith(terms[0] ?? '')),
    )
    .slice(0, 40);
  const current = Math.min(index, Math.max(0, results.length - 1));

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    list.current?.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' });
  }, [current, query]);

  const run = (entry: Entry | undefined) => {
    if (!entry) return;
    api.togglePalette(false);
    entry.run();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex(Math.min(results.length - 1, current + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex(Math.max(0, current - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(results[current]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      api.togglePalette(false);
    }
  };

  let lastGroup = '';
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Hintergrund, Tastatur über Escape
    // biome-ignore lint/a11y/useKeyWithClickEvents: Hintergrund, Tastatur über Escape
    <div class="palette-backdrop" onClick={(e) => e.target === e.currentTarget && api.togglePalette(false)}>
      <div class="palette" role="dialog" aria-label="Suche">
        <div class="palette__field">
          <Icon name="search" />
          <input
            ref={input}
            type="search"
            placeholder="Spot, Veedel, Person oder Befehl …"
            value={query}
            autocomplete="off"
            onInput={(e) => {
              setQuery(e.currentTarget.value);
              setIndex(0);
            }}
            onKeyDown={onKey}
          />
          <kbd>Esc</kbd>
        </div>
        <ul class="palette__list" ref={list}>
          {results.length === 0 && <li class="palette__empty">Nichts gefunden.</li>}
          {results.map((e, i) => {
            const header = e.group !== lastGroup;
            lastGroup = e.group;
            return (
              <li key={e.id}>
                {header && <div class="palette__group">{e.group}</div>}
                <button
                  type="button"
                  class={`palette__item ${i === current ? 'is-selected' : ''}`}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => run(e)}
                >
                  <IconChip icon={e.icon} size="sm" color="paper" />
                  <span class="palette__title">{e.title}</span>
                  {e.subtitle && <span class="palette__sub">{e.subtitle}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// Navigation zwischen den Bereichen (Tabs der Module). Desktop: schmales Icon-Dock links, der Inhalt steht in einem
// schwebenden Inspector daneben. Handy: Tab-Leiste unten und darüber ein Bottom-Sheet mit drei Rastpunkten
// (klein, mittel, voll), das sich am Griff ziehen lässt. Die Karte bleibt bei klein und mittel bedienbar.

import { useRef } from 'preact/hooks';
import { Badge, type ChipColor, Icon, IconButton, IconChip } from '../components';
import { useRuntime } from '../hooks';
import { type SidebarTab, sidebarTabs } from '../registry';
import type { SheetSnap } from '../runtime';
import { tabColor, tabIcon, tabShortcuts, useIsMobile } from './layout';
import { collectAdvice, NextStepPeek } from './NextStep';
import { TabContent } from './TabContent';

export function Navigation() {
  const mobile = useIsMobile();
  return mobile ? (
    <>
      <Sheet />
      <TabBar />
    </>
  ) : (
    <>
      <Dock />
      <Inspector />
    </>
  );
}

function activeTab(tabs: SidebarTab[], id: string | null): SidebarTab | undefined {
  return tabs.find((t) => t.id === id) ?? tabs[0];
}

/* ------------------------------------------------------------------ Desktop */

function Dock() {
  const runtime = useRuntime();
  const { ui, api } = runtime;
  const state = runtime.state;
  const tabs = sidebarTabs.list();
  const active = activeTab(tabs, ui.tab);
  const keys = tabShortcuts();
  return (
    <nav class="shell-dock" aria-label="Bereiche">
      {tabs.map((tab) => {
        const isActive = ui.sheetExpanded && tab.id === active?.id;
        const badge = state ? (tab.badge?.(state) ?? 0) : 0;
        return (
          <button
            key={tab.id}
            type="button"
            class={`dock-btn ${isActive ? 'is-active' : ''}`}
            aria-pressed={isActive}
            aria-label={tab.title}
            onClick={() => (isActive ? api.setSheetExpanded(false) : api.selectTab(tab.id))}
          >
            <IconChip icon={tabIcon(tab)} color={isActive ? tabColor(tab) : 'paper'} size="md" />
            <Badge count={badge} />
            <span class="dock-tip" aria-hidden="true">
              {tab.title}
              {keys.get(tab.id) && <kbd>{keys.get(tab.id)}</kbd>}
            </span>
          </button>
        );
      })}
      <span class="dock-sep" aria-hidden="true" />
      <button type="button" class="dock-btn" aria-label="Suchen" onClick={() => api.togglePalette(true)}>
        <IconChip icon="search" color="paper" size="md" />
        <span class="dock-tip" aria-hidden="true">
          Suchen <kbd>Strg K</kbd>
        </span>
      </button>
    </nav>
  );
}

function Inspector() {
  const { ui, api } = useRuntime();
  const tabs = sidebarTabs.list();
  const active = activeTab(tabs, ui.tab);
  if (!ui.sheetExpanded || !active) return null;
  return (
    <section class="shell-inspector" aria-label={active.title}>
      <header class="shell-inspector__head">
        <IconChip icon={tabIcon(active)} color={tabColor(active)} size="md" />
        <h2>{active.title}</h2>
        <IconButton icon="close" label="Schließen (Esc)" onClick={() => api.setSheetExpanded(false)} />
      </header>
      <div class="shell-inspector__body" key={active.id}>
        <TabContent tab={active} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Handy */

const SNAPS: SheetSnap[] = ['peek', 'half', 'full'];

/** Höhen der Rastpunkte in px (gleiche Werte wie im Stylesheet, nur zum Einrasten beim Ziehen). */
function sheetHeights(): Record<SheetSnap, number> {
  const vh = window.innerHeight;
  const hud = document.querySelector('.hud')?.getBoundingClientRect().bottom ?? 110;
  const bar = document.querySelector('.shell-tabbar')?.getBoundingClientRect().height ?? 64;
  return { peek: 96, half: Math.round(vh * 0.46), full: Math.max(200, Math.round(vh - hud - bar - 12)) };
}

/**
 * Ziehen am Griff: Die Höhe folgt dem Finger, beim Loslassen rastet das Sheet am nächsten Punkt ein.
 * Ein deutlicher Wisch schaltet einen Punkt weiter. Ohne onClose bleibt das Sheet mindestens klein.
 */
function useSheetDrag(
  ref: { current: HTMLElement | null },
  snaps: readonly SheetSnap[],
  onSnap: (snap: SheetSnap) => void,
  onClose?: () => void,
) {
  const dragged = useRef(false);
  const onPointerDown = (e: PointerEvent) => {
    const node = ref.current;
    if (!node || (e.target as HTMLElement).closest('button:not(.shell-sheet__handle)')) return;
    const startY = e.clientY;
    const startHeight = node.offsetHeight;
    const heights = sheetHeights();
    const lowest = snaps[0];
    const highest = snaps[snaps.length - 1];
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      if (Math.abs(dy) > 5) moved = true;
      if (!moved) return;
      node.classList.add('is-dragging');
      const floor = onClose ? 0 : heights[lowest];
      node.style.height = `${Math.min(heights[highest], Math.max(floor, startHeight - dy))}px`;
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      node.classList.remove('is-dragging');
      const current = node.offsetHeight;
      node.style.height = '';
      if (!moved) return;
      dragged.current = true;
      setTimeout(() => {
        dragged.current = false;
      }, 0);
      const dy = ev.clientY - startY;
      if (onClose && current < heights[lowest] * 0.7) return onClose();
      let best = snaps.reduce((a, b) => (Math.abs(heights[b] - current) < Math.abs(heights[a] - current) ? b : a));
      if (Math.abs(dy) > 70) {
        const from = snaps.reduce((a, b) =>
          Math.abs(heights[b] - startHeight) < Math.abs(heights[a] - startHeight) ? b : a,
        );
        const step = snaps.indexOf(from) + (dy < 0 ? 1 : -1);
        best = snaps[Math.min(snaps.length - 1, Math.max(0, step))];
      }
      onSnap(best);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  return { onPointerDown, dragged };
}

export { SNAPS, useSheetDrag };

function Sheet() {
  const runtime = useRuntime();
  const { ui, api } = runtime;
  const state = runtime.state;
  const ref = useRef<HTMLElement>(null);
  const tabs = sidebarTabs.list();
  const active = activeTab(tabs, ui.tab);
  const drag = useSheetDrag(ref, SNAPS, (snap) => api.setSheet(snap));
  if (!active || !state || ui.panel) return null;
  const peek = ui.sheet === 'peek';
  const hasAdvice = collectAdvice(state).length > 0;
  const toggle = () => {
    if (drag.dragged.current) return;
    api.setSheet(peek ? 'half' : 'peek');
  };
  return (
    <aside ref={ref} class={`shell-sheet is-${ui.sheet}`} aria-label="Bereiche">
      <div class="shell-sheet__grip" onPointerDown={drag.onPointerDown}>
        <button
          type="button"
          class="shell-sheet__handle"
          aria-label={peek ? 'Aufziehen' : 'Einklappen'}
          aria-expanded={!peek}
          onClick={toggle}
        />
      </div>
      {peek ? (
        hasAdvice ? (
          <NextStepPeek />
        ) : (
          <button type="button" class="sheet-peek" onClick={() => api.setSheet('half')}>
            <IconChip icon={tabIcon(active)} color={tabColor(active)} size="sm" />
            <span class="sheet-peek__title">{active.title}</span>
            <Icon name="chevronUp" />
          </button>
        )
      ) : (
        <>
          <header class="shell-sheet__head" onPointerDown={drag.onPointerDown}>
            <IconChip icon={tabIcon(active)} color={tabColor(active)} size="sm" />
            <h2>{active.title}</h2>
            <IconButton
              icon={ui.sheet === 'full' ? 'chevronDown' : 'chevronUp'}
              label={ui.sheet === 'full' ? 'Kleiner' : 'Größer'}
              onClick={() => api.setSheet(ui.sheet === 'full' ? 'half' : 'full')}
            />
          </header>
          <div class="shell-sheet__body" key={active.id}>
            <TabContent tab={active} />
          </div>
        </>
      )}
    </aside>
  );
}

function TabBar() {
  const runtime = useRuntime();
  const { ui, api } = runtime;
  const state = runtime.state;
  const tabs = sidebarTabs.list();
  const active = activeTab(tabs, ui.tab);
  return (
    <div class="shell-tabbar" role="tablist" aria-label="Bereiche">
      {tabs.map((tab) => {
        const isActive = ui.sheetExpanded && !ui.panel && tab.id === active?.id;
        const badge = state ? (tab.badge?.(state) ?? 0) : 0;
        const color: ChipColor = tabColor(tab);
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            class={`tabbar-btn tabbar-btn--${color} ${isActive ? 'is-active' : ''}`}
            onClick={() => {
              if (ui.panel) api.closePanel();
              if (isActive) api.setSheet('peek');
              else api.selectTab(tab.id);
            }}
          >
            <span class="tabbar-btn__icon">
              <Icon name={tabIcon(tab)} />
              <Badge count={badge} />
            </span>
            <span class="tabbar-btn__label">{tab.title}</span>
          </button>
        );
      })}
    </div>
  );
}

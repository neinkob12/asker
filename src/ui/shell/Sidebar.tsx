import { ErrorBoundary, Tabs } from '../components';
import { useRuntime } from '../hooks';
import { sidebarTabs } from '../registry';
import { Slot } from './Slot';

/** Seitenleiste mit Tabs. Am Desktop rechts, am Handy als Bottom-Sheet (Griff zum Auf- und Zuklappen). */
export function Sidebar() {
  const runtime = useRuntime();
  const { ui, api } = runtime;
  const state = runtime.state;
  const tabs = sidebarTabs.list();
  const active = tabs.find((t) => t.id === ui.tab) ?? tabs[0];
  if (!active || !state) return null;
  const Content = active.component;
  return (
    <aside class={`shell-sidebar ${ui.sheetExpanded ? 'is-expanded' : ''}`} aria-label="Seitenleiste">
      <div class="shell-sidebar__head">
        <button
          type="button"
          class="shell-sidebar__handle"
          aria-label={ui.sheetExpanded ? 'Einklappen' : 'Aufklappen'}
          aria-expanded={ui.sheetExpanded}
          onClick={() => api.setSheetExpanded(!ui.sheetExpanded)}
        />
        <Tabs
          tabs={tabs.map((t) => ({ id: t.id, label: t.title, badge: t.badge?.(state), icon: t.icon }))}
          active={active.id}
          onChange={(id) => (id === active.id && ui.sheetExpanded ? api.setSheetExpanded(false) : api.selectTab(id))}
        />
      </div>
      <div class="shell-sidebar__content">
        <ErrorBoundary key={active.id} name={active.title}>
          {Content ? <Content /> : <Slot name={`tab:${active.id}`} />}
        </ErrorBoundary>
      </div>
    </aside>
  );
}

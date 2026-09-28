import { Tabs } from '../components';
import { useRuntime } from '../hooks';
import { sidebarTabs } from '../registry';
import { Slot } from './Slot';

/** Seitenleiste mit Tabs. Am Desktop rechts, am Handy als Bottom-Sheet. */
export function Sidebar() {
  const runtime = useRuntime();
  const { ui, api } = runtime;
  const state = runtime.state;
  const tabs = sidebarTabs.list();
  const active = tabs.find((t) => t.id === ui.tab) ?? tabs[0];
  if (!active || !state) return null;
  const Content = active.component;
  return (
    <aside class={`shell-sidebar ${ui.sheetExpanded ? 'is-expanded' : ''}`}>
      <div class="shell-sidebar__head">
        <button
          type="button"
          class="shell-sidebar__handle"
          aria-label={ui.sheetExpanded ? 'Einklappen' : 'Aufklappen'}
          onClick={() => api.setSheetExpanded(!ui.sheetExpanded)}
        />
        <Tabs
          tabs={tabs.map((t) => ({ id: t.id, label: t.title, badge: t.badge?.(state) }))}
          active={active.id}
          onChange={(id) => (id === active.id && ui.sheetExpanded ? api.setSheetExpanded(false) : api.selectTab(id))}
        />
      </div>
      <div class="shell-sidebar__content">{Content ? <Content /> : <Slot name={`tab:${active.id}`} />}</div>
    </aside>
  );
}

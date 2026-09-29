// Inhalt eines Tabs als App-Seite im Handy.
// Listen-Tabs (layout: 'rows', z.B. "Geschäft") zeigen jeden Abschnitt als tippbare Zeile; ein Tipp öffnet den
// Abschnitt, der Zurück-Pfeil des Handys führt zur Übersicht.

import { ErrorBoundary, SectionContext } from '../components';
import { useRuntime } from '../hooks';
import { type SidebarTab, slotContributions } from '../registry';
import { Slot } from './Slot';

export function TabContent(props: { tab: SidebarTab }) {
  const { tab } = props;
  const Content = tab.component;
  return (
    <ErrorBoundary key={tab.id} name={tab.title}>
      {Content ? <Content /> : tab.layout === 'rows' ? <SectionList tab={tab} /> : <Slot name={`tab:${tab.id}`} />}
    </ErrorBoundary>
  );
}

function SectionList(props: { tab: SidebarTab }) {
  const { ui, api } = useRuntime();
  const items = slotContributions(`tab:${props.tab.id}`);
  const open = ui.section ? items.find((i) => i.id === ui.section) : undefined;
  if (open) {
    const Component = open.component as unknown as () => preact.JSX.Element | null;
    return (
      <div class="section-detail">
        <SectionContext.Provider value={{ mode: 'detail', open: () => {} }}>
          <ErrorBoundary key={open.id} name={open.id}>
            <Component />
          </ErrorBoundary>
        </SectionContext.Provider>
      </div>
    );
  }
  return (
    <div class="section-list">
      {items.map((item) => {
        const Component = item.component as unknown as () => preact.JSX.Element | null;
        return (
          <SectionContext.Provider key={item.id} value={{ mode: 'rows', open: () => api.openSection(item.id) }}>
            <ErrorBoundary name={item.id}>
              <Component />
            </ErrorBoundary>
          </SectionContext.Provider>
        );
      })}
    </div>
  );
}

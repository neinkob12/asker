// Inhalt eines Tabs als App-Seite im Handy.
// Listen-Tabs (layout: 'rows', z.B. "Geschäft") zeigen jeden Abschnitt als tippbare Zeile; ein Tipp legt den
// Abschnitt als eigene Seite auf den Navigationsstapel des Handys (SectionContent), zurück führt zur Übersicht.

import { ErrorBoundary, SectionContext } from '../components';
import { useRuntime } from '../hooks';
import { type SidebarTab, type SlotContribution, sidebarTabs, slotContributions } from '../registry';
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
  const { api } = useRuntime();
  const items = slotContributions(`tab:${props.tab.id}`);
  return (
    <div class="section-list">
      {items.map((item) => {
        const Component = item.component as unknown as () => preact.JSX.Element | null;
        return (
          <SectionContext.Provider
            key={item.id}
            value={{ mode: 'rows', id: item.id, open: () => api.openSection(item.id) }}
          >
            <ErrorBoundary name={item.id}>
              <Component />
            </ErrorBoundary>
          </SectionContext.Provider>
        );
      })}
    </div>
  );
}

/** Beitrag zu einem Listen-Tab suchen, zur Not in allen Tabs (openSection ohne bekannten Tab). */
export function findSection(sectionId: string, tabId?: string): SlotContribution | undefined {
  const tabs = tabId ? [tabId, ...sidebarTabs.list().map((t) => t.id)] : sidebarTabs.list().map((t) => t.id);
  for (const id of tabs) {
    const found = slotContributions(`tab:${id}`).find((i) => i.id === sectionId);
    if (found) return found;
  }
  return undefined;
}

/** Ein Abschnitt eines Listen-Tabs als eigene Seite (die Karte zeigt dort ihren ganzen Inhalt). */
export function SectionContent(props: { sectionId: string; tabId?: string }) {
  const item = findSection(props.sectionId, props.tabId);
  if (!item) return null;
  const Component = item.component as unknown as () => preact.JSX.Element | null;
  return (
    <div class="section-detail">
      <SectionContext.Provider value={{ mode: 'detail', id: item.id, open: () => {} }}>
        <ErrorBoundary key={item.id} name={item.id}>
          <Component />
        </ErrorBoundary>
      </SectionContext.Provider>
    </div>
  );
}

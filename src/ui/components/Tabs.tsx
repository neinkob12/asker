import { Badge } from './Layout';

export interface TabItem {
  id: string;
  label: string;
  badge?: number;
}

export interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
}

export function Tabs(props: TabsProps) {
  return (
    <div class="ui-tabs" role="tablist">
      {props.tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === props.active}
          class={`ui-tabs__tab ${t.id === props.active ? 'is-active' : ''}`}
          onClick={() => props.onChange(t.id)}
        >
          {t.label}
          {t.badge ? <Badge count={t.badge} /> : null}
        </button>
      ))}
    </div>
  );
}

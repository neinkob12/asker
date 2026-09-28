import { Icon } from './Icon';
import type { IconName } from './icons';
import { Badge } from './Layout';

export interface TabItem {
  id: string;
  label: string;
  badge?: number;
  /** Icon vor der Beschriftung. */
  icon?: IconName | (string & {});
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
          {t.icon && <Icon name={t.icon} class="ui-tabs__icon" />}
          <span class="ui-tabs__label">{t.label}</span>
          {t.badge ? <Badge count={t.badge} /> : null}
        </button>
      ))}
    </div>
  );
}

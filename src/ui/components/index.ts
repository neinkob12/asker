// Gemeinsame Bausteine. Module bauen ihre Oberflächen nur hieraus (und aus einfachem HTML mit Tokens).
// Auftrag 14 ändert den Look über Design-Tokens und das Innere der Bausteine; Props werden nur erweitert.

import './components.css';

export { Button, type ButtonProps, type ButtonVariant, SegmentedControl, type SegmentedControlProps } from './Button';
export { Dialog, type DialogProps } from './Dialog';
export {
  Badge,
  Card,
  type CardProps,
  Empty,
  Hint,
  KeyValue,
  List,
  ListItem,
  type ListItemProps,
  ProgressBar,
  type ProgressBarProps,
  Stat,
} from './Layout';
export { type TabItem, Tabs, type TabsProps } from './Tabs';

// Gemeinsame Bausteine. Module bauen ihre Oberflächen nur hieraus (und aus einfachem HTML mit Tokens).
// Der Look kommt aus den Design-Tokens (styles/tokens.css) und components.css; Props werden nur erweitert.

import './components.css';

export {
  Button,
  type ButtonProps,
  type ButtonVariant,
  IconButton,
  type IconButtonProps,
  SegmentedControl,
  type SegmentedControlProps,
} from './Button';
export { Dialog, type DialogProps } from './Dialog';
export { ErrorBoundary, type ErrorBoundaryProps } from './ErrorBoundary';
export { HudPill, type HudPillProps } from './HudPill';
export { type ChipColor, Icon, IconChip, type IconChipProps, type IconProps, StatusDot } from './Icon';
export { EMOJI_ICONS, ICONS, type IconName, isIconName, resolveIcon } from './icons';
export {
  Confetti,
  CountUp,
  type CountUpProps,
  DuelBar,
  type DuelBarProps,
  FloatingNumber,
  type FloatingNumberProps,
  prefersReducedMotion,
  SegmentMeter,
  type SegmentMeterProps,
  Stamp,
  type StampProps,
} from './Juice';
export {
  Avatar,
  type AvatarProps,
  Badge,
  Card,
  type CardProps,
  Empty,
  Hint,
  initials,
  KeyValue,
  List,
  ListItem,
  type ListItemProps,
  ProgressBar,
  type ProgressBarProps,
  type SectionStatus,
  Select,
  type SelectOption,
  type SelectProps,
  Slider,
  type SliderProps,
  Stat,
  Tag,
  Toggle,
  type ToggleProps,
  type Tone,
} from './Layout';
export { SectionContext, type SectionMode } from './section';
export { type TabItem, Tabs, type TabsProps } from './Tabs';

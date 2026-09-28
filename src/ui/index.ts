// Öffentliche Schnittstelle der Oberfläche für Module (aus deren ui/-Ordner):
// Registries, Hooks, Bausteine und Slot. Beispiel siehe src/modules/_template/ui/index.tsx.

export * from './components';
export { useGame, useSession, useUi } from './hooks';
export {
  type DialogDefinition,
  type DialogId,
  type DialogRegistry,
  type EventReaction,
  type HudItem,
  onGameEvent,
  type PanelDefinition,
  type PanelId,
  type PanelRegistry,
  type PhoneApp,
  registerDialog,
  registerHudItem,
  registerPanel,
  registerPhoneApp,
  registerSlot,
  registerTab,
  type SidebarTab,
  type SlotContribution,
  type SlotName,
  type SlotProps,
  type SlotRegistry,
} from './registry';
export type { MapController, Toast, ToastKind, UiApi, UiState } from './runtime';
export { Slot } from './shell/Slot';

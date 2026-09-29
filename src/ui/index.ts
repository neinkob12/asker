// Öffentliche Schnittstelle der Oberfläche für Module (aus deren ui/-Ordner):
// Registries, Hooks, Bausteine und Slot. Beispiel siehe src/modules/_template/ui/index.tsx.

export {
  type AmbienceId,
  type AudioSettings,
  audio,
  MUSIC_MOOD_NAMES,
  type MusicMood,
  SOUND_IDS,
  type SoundId,
} from '../audio';
export * from './components';
export { useGame, useSession, useUi } from './hooks';
export { islandCountdown } from './phone/islandModel';
export { PhoneScreen, type PhoneScreenProps } from './phone/PhoneScreen';
export {
  type Advice,
  type Advisor,
  type DialogDefinition,
  type DialogId,
  type DialogRegistry,
  type EventReaction,
  type GameStat,
  type HudItem,
  type LiveActivity,
  type LiveActivitySource,
  onGameEvent,
  type PanelDefinition,
  type PanelId,
  type PanelRegistry,
  type PhoneApp,
  registerAdvisor,
  registerDialog,
  registerGameStat,
  registerHudItem,
  registerLiveActivity,
  registerPanel,
  registerPhoneApp,
  registerSearch,
  registerSlot,
  registerTab,
  type SearchProvider,
  type SearchResult,
  type SidebarTab,
  type SlotContribution,
  type SlotName,
  type SlotProps,
  type SlotRegistry,
} from './registry';
export type {
  Alert,
  CameraMode,
  IslandPulse,
  MapController,
  PhoneNotification,
  Toast,
  ToastKind,
  ToastOptions,
  UiApi,
  UiState,
} from './runtime';
export { Slot } from './shell/Slot';
export { type SoundOnEventOptions, soundOnEvent } from './sound';

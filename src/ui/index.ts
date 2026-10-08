// Öffentliche Schnittstelle der Oberfläche für Module (aus deren ui/-Ordner):
// Registries, Hooks, Bausteine und Slot. Beispiel siehe src/modules/_template/ui/index.tsx.

export {
  type AmbienceId,
  type AudioSettings,
  audio,
  type LoopHandle,
  type LoopParams,
  type LoopVoice,
  MUSIC_MOOD_NAMES,
  type MusicMood,
  SOUND_IDS,
  type SoundId,
} from '../audio';
export * from './components';
export { HAPTIC_PATTERNS, type HapticKind, haptic } from './haptics';
export { shallowEqual, useGame, useGameSelector, useSession, useUi } from './hooks';
export { hourCountdown } from './phone/countdown';
export { PhoneScreen, type PhoneScreenProps } from './phone/PhoneScreen';
/** Handy-Aufbau (≤ 760 px): Module zeigen dann z.B. Blätter statt Dialogen über der Karte. */
export { cleanPlayerName, getPlayerName, PLAYER_NAME_MAX, setPlayerName } from './player';
export { popupMayOpen } from './popups';
export {
  type Advice,
  type Advisor,
  type CityCamera,
  type CityViews,
  type CoreHudPart,
  type DialogDefinition,
  type DialogId,
  type DialogRegistry,
  type EventReaction,
  type GameStat,
  getCityViews,
  type HudItem,
  isHudPartHidden,
  type MapLayerOption,
  onGameEvent,
  type PanelDefinition,
  type PanelId,
  type PanelRegistry,
  type PhoneApp,
  registerAdvisor,
  registerCityViews,
  registerDialog,
  registerGameStat,
  registerHudItem,
  registerHudPartHidden,
  registerMapLayerOption,
  registerPanel,
  registerPhoneApp,
  registerSearch,
  registerSlot,
  registerStatusCounter,
  registerTab,
  type SearchProvider,
  type SearchResult,
  type SidebarTab,
  type SlotContribution,
  type SlotName,
  type SlotProps,
  type SlotRegistry,
  type StatusCounter,
} from './registry';
export type {
  Alert,
  CameraMode,
  MapController,
  ToastKind,
  ToastOptions,
  TrafficLevel,
  UiApi,
  UiError,
  UiState,
} from './runtime';
export { isMobileLayout, useIsMobile } from './shell/layout';
export { Slot } from './shell/Slot';
export { type SoundOnEventOptions, soundOnEvent } from './sound';
export { memoState, memoStateKeyed } from './stateMemo';
/** Tour (Auftrag 46a): Spotlight-Erklärungen, ui.tour.start(def); Anker als data-tour="<id>" aus TOUR_ANCHORS. */
export {
  phoneAppAnchor,
  TOUR_ANCHORS,
  type TourAnchor,
  type TourApi,
  type TourDef,
  type TourOutcome,
  type TourPlacement,
  type TourStep,
  type TourWait,
} from './tour';

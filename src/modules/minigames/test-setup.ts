// Vitest-Setup: Im Spiel sind die Minispiele gerade aus (MINIGAMES_ENABLED, Feedback vom 12.10.2026). Die Tests prüfen
// sie mit eingeschaltetem Schalter, damit sie beim Wiedereinschalten noch stimmen.
import { vi } from 'vitest';

vi.mock('./config', async (importOriginal) => ({ ...(await importOriginal<object>()), MINIGAMES_ENABLED: true }));

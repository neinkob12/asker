// Vitest-Setup: Im Spiel sind die Wochenverträge gerade aus (CONTRACTS_ENABLED, Feedback vom 13.10.2026). Die Tests
// prüfen sie mit eingeschaltetem Schalter, damit sie beim Wiedereinschalten noch stimmen.
import { vi } from 'vitest';

vi.mock('./config', async (importOriginal) => ({ ...(await importOriginal<object>()), CONTRACTS_ENABLED: true }));

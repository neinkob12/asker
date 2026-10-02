import { describe, expect, it } from 'vitest';
import { newTrack, nextReportStep, RAID_REPORT_DIALOG } from './raidReportModel';

describe('Razzia-Bilanz: wann sie erscheint', () => {
  it('öffnet erst, wenn kein anderer Dialog offen ist', () => {
    const track = newTrack();
    expect(nextReportStep(track, 'encounters.encounter')).toBe('wait');
    expect(nextReportStep(track, null)).toBe('open');
  });

  it('bleibt weg, wenn der Spieler sie selbst geschlossen hat', () => {
    const track = newTrack();
    expect(nextReportStep(track, null)).toBe('open');
    expect(nextReportStep(track, RAID_REPORT_DIALOG)).toBe('wait');
    expect(nextReportStep(track, RAID_REPORT_DIALOG)).toBe('wait');
    expect(nextReportStep(track, null)).toBe('done');
  });

  it('kommt noch einmal, wenn eine Konfrontation sie verdrängt hat', () => {
    const track = newTrack();
    expect(nextReportStep(track, null)).toBe('open');
    expect(nextReportStep(track, RAID_REPORT_DIALOG)).toBe('wait');
    // Die Konfrontation ersetzt die Bilanz, solange läuft sie nicht.
    expect(nextReportStep(track, 'encounters.encounter')).toBe('wait');
    expect(nextReportStep(track, 'encounters.encounter')).toBe('wait');
    // Danach ist kein Dialog mehr offen: Die Bilanz wird erneut angeboten (und zählt nicht als geschlossen).
    expect(nextReportStep(track, null)).toBe('open');
    expect(nextReportStep(track, RAID_REPORT_DIALOG)).toBe('wait');
    expect(nextReportStep(track, null)).toBe('done');
  });
});

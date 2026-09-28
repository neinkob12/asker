import { describe, expect, it } from 'vitest';
import { createTestGame } from '../../core/testing';
import { getStaff } from '../staff';
import { getLieutenant, getLieutenants } from './index';

describe('hierarchy', () => {
  it('Leutnant ernennen, abfragen und abberufen', () => {
    const sim = createTestGame();
    sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'uni' } });
    const staffId = getStaff(sim.state)[0].id;
    expect(sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId, veedelId: 'lindenthal' } }).ok).toBe(true);
    expect(getLieutenant(sim.state, 'lindenthal')).toBe(staffId);
    expect(getLieutenants(sim.state)).toEqual([['lindenthal', staffId]]);
    expect(sim.dispatch({ type: 'hierarchy.dismiss', payload: { veedelId: 'lindenthal' } }).ok).toBe(true);
    expect(getLieutenant(sim.state, 'lindenthal')).toBeNull();
  });

  it('wer geht, ist kein Leutnant mehr', () => {
    const sim = createTestGame();
    sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'uni' } });
    const staffId = getStaff(sim.state)[0].id;
    sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId, veedelId: 'lindenthal' } });
    sim.dispatch({ type: 'staff.fire', payload: { staffId } });
    expect(getLieutenant(sim.state, 'lindenthal')).toBeNull();
    expect(sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId, veedelId: 'lindenthal' } }).ok).toBe(false);
  });
});

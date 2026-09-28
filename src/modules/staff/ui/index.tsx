// Oberfläche des Personals: Läufer-Übersicht im Tab "Geschäft" und Läufer-Abschnitt im Spot-Panel.

import { formatEuro } from '../../../core';
import { Button, Card, Empty, Hint, registerSlot, useGame, useUi } from '../../../ui';
import { getSpot } from '../../spots';
import { dailyWages, getStaff, RUNNER_DAILY_WAGE, RUNNER_HIRE_COST, runnerAt, type StaffStatus } from '../index';
import './staff.css';

const STATUS_TEXT: Record<StaffStatus, string> = {
  active: '',
  injured: ' (verletzt)',
  jailed: ' (in Haft)',
  quit: ' (gekündigt)',
  dead: ' (tot)',
};

function RunnersSection() {
  const { state } = useGame();
  const ui = useUi();
  const runners = getStaff(state, { role: 'runner' });
  return (
    <Card title="Läufer">
      {runners.length === 0 ? (
        <Empty>
          Noch keine Läufer. Klick auf einen Spot, um einen anzuheuern ({formatEuro(RUNNER_HIRE_COST)},{' '}
          {formatEuro(RUNNER_DAILY_WAGE)} pro Tag).
        </Empty>
      ) : (
        <>
          <ul class="runner-list">
            {runners.map((r) => {
              const spotId = r.assignment?.kind === 'spot' ? r.assignment.targetId : null;
              const spotName = spotId ? (getSpot(state, spotId)?.name ?? spotId) : 'ohne Einsatz';
              return (
                <li key={r.id}>
                  {r.name},{' '}
                  {spotId ? (
                    <Button variant="link" onClick={() => ui.openPanel('spots.spot', { spotId })}>
                      {spotName}
                    </Button>
                  ) : (
                    spotName
                  )}
                  {STATUS_TEXT[r.status]}
                </li>
              );
            })}
          </ul>
          <Hint>Löhne: {formatEuro(dailyWages(state))} pro Tag</Hint>
        </>
      )}
    </Card>
  );
}

function SpotRunner(props: { spotId: string }) {
  const { state, dispatch } = useGame();
  const runner = runnerAt(state, props.spotId);
  return (
    <div class="runner-box">
      {runner ? (
        <>
          <span>
            {runner.name} arbeitet hier{STATUS_TEXT[runner.status]} und bedient Kunden automatisch.
          </span>
          <Button variant="danger" onClick={() => dispatch({ type: 'staff.fire', payload: { staffId: runner.id } })}>
            Entlassen
          </Button>
        </>
      ) : (
        <>
          <span>Kein Läufer. Ein Läufer bedient hier automatisch.</span>
          <Button
            disabled={state.wallet.dirty < RUNNER_HIRE_COST}
            onClick={() => dispatch({ type: 'staff.hireRunner', payload: { spotId: props.spotId } })}
          >
            Anheuern ({formatEuro(RUNNER_HIRE_COST)})
          </Button>
        </>
      )}
    </div>
  );
}

registerSlot('tab:business', { id: 'staff.runners', order: 20, component: RunnersSection });
registerSlot('spots.spotPanel', { id: 'staff.runner', order: 50, component: SpotRunner });

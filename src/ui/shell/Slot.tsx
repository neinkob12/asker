import { ErrorBoundary } from '../components';
import { useGameSelector } from '../hooks';
import { type SlotName, type SlotProps, slotContributions } from '../registry';

/** Zeigt alle Beiträge, die Module in einen Slot gehängt haben, sortiert nach order. */
export function Slot<N extends SlotName>(props: { name: N; props?: SlotProps<N> }) {
  const all = slotContributions(props.name);
  // Zeitweise ausgeblendete Beiträge (hiddenWhen) als Liste von IDs, damit nur ein Wechsel neu zeichnet.
  const hidden = useGameSelector((state) =>
    all
      .filter((item) => item.hiddenWhen?.(state))
      .map((item) => item.id)
      .join(','),
  );
  const items = hidden === '' ? all : all.filter((item) => !hidden.split(',').includes(item.id));
  return (
    <>
      {items.map((item) => {
        const Component = item.component as unknown as (p: object) => preact.JSX.Element | null;
        return (
          <ErrorBoundary key={item.id} name={item.id}>
            <Component {...(props.props ?? {})} />
          </ErrorBoundary>
        );
      })}
    </>
  );
}

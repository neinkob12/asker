import { ErrorBoundary } from '../components';
import { type SlotName, type SlotProps, slotContributions } from '../registry';

/** Zeigt alle Beiträge, die Module in einen Slot gehängt haben, sortiert nach order. */
export function Slot<N extends SlotName>(props: { name: N; props?: SlotProps<N> }) {
  const items = slotContributions(props.name);
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

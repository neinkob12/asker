import { Component, type ComponentChildren } from 'preact';
import { Button } from './Button';
import { Card } from './Layout';

export interface ErrorBoundaryProps {
  /** Name des Bereichs für die Fehlermeldung, z.B. "Seitenleiste". */
  name: string;
  children?: ComponentChildren;
  /** Ohne Hinweis-Karte: Der Bereich verschwindet still (z.B. für kleine Teile im HUD). */
  silent?: boolean;
  /** Ausweg bei einem Absturz (z.B. ein Dialog, der sich nicht schließen lässt): zeigt einen Schließen-Knopf. */
  onClose?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Wartezeit vor dem ersten stillen Neuversuch; verdoppelt sich bei jedem erneuten Absturz bis zum Höchstwert. */
export const SILENT_RETRY_MS = 1000;
export const SILENT_RETRY_MAX_MS = 30000;

/**
 * Fängt Fehler beim Zeichnen ab. Stürzt ein Teil der Oberfläche ab, zeigt nur dieser Teil einen Hinweis;
 * ohne das würde Preact die ganze Seite abräumen (weißer Bildschirm).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Aufeinanderfolgende stille Abstürze ohne zwischenzeitlichen Erfolg (bestimmt die Wartezeit). */
  private failures = 0;

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown): void {
    console.error(`Absturz in "${this.props.name}"`, error);
    // Ohne Knopf (silent) käme der Bereich sonst nie wieder, ein kleiner Teil im HUD fehlte bis zum Neuladen, obwohl
    // der Fehler nur an einem Zustand hing, der sich längst geändert hat: von selbst neu versuchen, mit Pausen.
    if (this.props.silent) this.scheduleRetry();
  }

  componentDidUpdate(_props: ErrorBoundaryProps, prevState: ErrorBoundaryState): void {
    // Zweimal in Folge ohne Fehler gezeichnet: Das nächste Mal wieder schnell neu versuchen.
    if (!this.state.error && !prevState.error) this.failures = 0;
  }

  componentWillUnmount(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private scheduleRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const delay = Math.min(SILENT_RETRY_MAX_MS, SILENT_RETRY_MS * 2 ** this.failures);
    this.failures++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.setState({ error: null });
    }, delay);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.silent) return null;
    return (
      <Card title="Hier ist etwas schiefgelaufen" tone="bad" class="ui-error">
        <p class="ui-hint">
          {this.props.name}: {error.message}
        </p>
        <Button small onClick={() => this.setState({ error: null })}>
          Nochmal versuchen
        </Button>
        {this.props.onClose && (
          <Button small onClick={this.props.onClose}>
            Schließen
          </Button>
        )}
      </Card>
    );
  }
}

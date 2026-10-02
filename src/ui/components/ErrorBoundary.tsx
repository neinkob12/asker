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

/**
 * Fängt Fehler beim Zeichnen ab. Stürzt ein Teil der Oberfläche ab, zeigt nur dieser Teil einen Hinweis;
 * ohne das würde Preact die ganze Seite abräumen (weißer Bildschirm).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown): void {
    console.error(`Absturz in "${this.props.name}"`, error);
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

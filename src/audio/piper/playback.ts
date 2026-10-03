// Wiedergabe der gesprochenen Sätze über Web Audio: Jeder Satz kommt als Float32-Ton vom Worker und wird nahtlos
// hinter den vorigen gehängt. playbackRate verschiebt die Tonhöhe der Figur (siehe piperParams). onFinish kommt
// genau einmal, wenn der letzte Satz zu Ende ist und keiner mehr kommt (end), nicht nach stop.

import { resample } from './text';

export interface PlaybackContext {
  readonly currentTime: number;
  readonly sampleRate: number;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
  createBufferSource(): AudioBufferSourceNode;
}

/** Kurze Pause zwischen zwei Sätzen (Sekunden). */
export const SENTENCE_GAP = 0.12;
/** Darunter rechnet die Wiedergabe den Ton auf die Rate des Kontexts um (Safari mag keine kleinen Abtastraten). */
export const MIN_BUFFER_RATE = 22050;

export class SpeechPlayback {
  private nextTime = 0;
  private pending = 0;
  private ended = false;
  private finished = false;
  private stopped = false;
  private readonly sources: AudioBufferSourceNode[] = [];

  constructor(
    private readonly ctx: PlaybackContext,
    private readonly out: AudioNode,
    private readonly rate: number,
    private readonly onFinish: () => void,
  ) {}

  /** Einen fertigen Satz anhängen. */
  add(pcm: Float32Array, sampleRate: number): void {
    if (this.stopped || this.ended || pcm.length === 0) return;
    const bufferRate = sampleRate >= MIN_BUFFER_RATE ? sampleRate : this.ctx.sampleRate;
    const data = bufferRate === sampleRate ? pcm : resample(pcm, sampleRate, bufferRate);
    const buffer = this.ctx.createBuffer(1, data.length, bufferRate);
    if (typeof buffer.copyToChannel === 'function') buffer.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    else buffer.getChannelData(0).set(data);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.rate;
    source.connect(this.out);
    const start = Math.max(this.ctx.currentTime + 0.03, this.nextTime);
    this.nextTime = start + data.length / bufferRate / this.rate + SENTENCE_GAP;
    this.pending++;
    source.onended = () => {
      this.pending--;
      try {
        source.disconnect();
      } catch {
        // Schon weg.
      }
      this.check();
    };
    source.start(start);
    this.sources.push(source);
  }

  /** Es kommen keine Sätze mehr: Sobald der letzte zu Ende ist, kommt onFinish. */
  end(): void {
    this.ended = true;
    this.check();
  }

  /** Sofort verstummen (Auflegen, Überspringen). onFinish kommt dann nicht mehr. */
  stop(): void {
    this.stopped = true;
    for (const source of this.sources) {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch {
        // Noch nicht gestartet oder schon vorbei.
      }
    }
    this.sources.length = 0;
  }

  /** Wann der zuletzt geplante Satz endet (Sekunden der Kontextzeit). */
  get endsAt(): number {
    return this.nextTime;
  }

  private check(): void {
    if (this.ended && this.pending === 0 && !this.finished && !this.stopped) {
      this.finished = true;
      this.onFinish();
    }
  }
}

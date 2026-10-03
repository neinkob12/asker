// Oberfläche des Wetters: Abschnitt in den Einstellungen (jetzt, Vorhersage, Auswirkung aufs Geschäft), Stimmung
// und Niederschlag auf der Karte, Blitze bei Gewitter und Geräusche (Regen, Sturm, Wind).

import { clock, formatPercent } from '../../../core';
import { type MapMood, mapEffects, registerMapLayer, setMapMood, setPrecipitation } from '../../../map';
import { audio, Icon, KeyValue, registerSlot, useGame } from '../../../ui';
import {
  getForecast,
  getWeather,
  isPrecipitation,
  WEATHER_NAMES,
  type Weather,
  type WeatherKind,
  weatherDemandFactor,
} from '../index';
import './weather.css';
import { activeCity, cityName } from '../../city';

const ICONS: Record<WeatherKind, string> = {
  clear: 'sun',
  cloudy: 'cloud',
  rain: 'rain',
  storm: 'storm',
  snow: 'snow',
  heat: 'heat',
};

/** Nachts ist "klar" ein Mond. */
function iconFor(kind: WeatherKind, time: number): string {
  if (kind === 'clear' && clock.isNight(time)) return 'moon';
  return ICONS[kind];
}

const temp = (t: number) => `${Math.round(t)}°`;

function Forecast() {
  const { state } = useGame();
  return (
    <ol class="weather-forecast">
      {getForecast(state).map((f) => (
        <li key={f.at}>
          <span class="weather-forecast__time">{clock.formatTime(f.at)}</span>
          <Icon name={iconFor(f.kind, f.at)} size={22} />
          <span class="weather-forecast__temp">{temp(f.temperature)}</span>
        </li>
      ))}
    </ol>
  );
}

function WeatherWidget() {
  const { state } = useGame();
  const w = getWeather(state);
  return (
    <div class={`weather-widget weather-widget--${w.kind}`}>
      <div class="weather-widget__now">
        <Icon name={iconFor(w.kind, state.time)} size={34} />
        <div>
          <div class="weather-widget__temp">{temp(w.temperature)}</div>
          <div class="weather-widget__name">{WEATHER_NAMES[w.kind]}</div>
          <div class="weather-widget__name">{cityName(activeCity(state))}</div>
        </div>
      </div>
      <Forecast />
    </div>
  );
}

const pct = (f: number) =>
  Math.abs(f - 1) < 0.005 ? 'unverändert' : `${f >= 1 ? '+' : '−'}${formatPercent(Math.abs(f - 1))}`;

/** Abschnitt "Wetter" in den Einstellungen: jetzt und Vorhersage, Auswirkung aufs Geschäft. */
function WeatherSettings() {
  const { state } = useGame();
  const w = getWeather(state);
  return (
    <div class="weather-settings">
      <WeatherWidget />
      <KeyValue
        label="Straßenverkauf"
        value={pct(weatherDemandFactor(state, 'street'))}
        tone={tone(weatherDemandFactor(state, 'street'))}
      />
      <KeyValue
        label="Lieferdienst"
        value={pct(weatherDemandFactor(state, 'delivery'))}
        tone={tone(weatherDemandFactor(state, 'delivery'))}
      />
      <p class="ui-hint">
        {isPrecipitation(w.kind)
          ? 'Bei dem Wetter bleiben die Leute drinnen und bestellen lieber.'
          : w.kind === 'heat'
            ? 'Parks und Rheinufer sind voll, die Nachfrage draußen steigt.'
            : 'Normales Wetter, normales Geschäft.'}{' '}
        {WEATHER_NAMES[w.kind]} seit {clock.formatTime(w.since)} Uhr ({clock.formatDuration(state.time - w.since)}).
      </p>
    </div>
  );
}

function tone(factor: number): 'accent' | 'bad' | undefined {
  if (factor > 1.001) return 'accent';
  if (factor < 0.999) return 'bad';
  return undefined;
}

// Seit Auftrag 26 keine eigene App mehr: Das Wetter steht in den Einstellungen.
registerSlot('core.settings', {
  id: 'weather.forecast',
  title: 'Wetter',
  icon: 'cloudSun',
  color: 'sky',
  order: 10,
  component: WeatherSettings,
});

// ---------------------------------------------------------------------------------------------
// Karte und Ton

/** Farbstimmung je Wetter (siehe MapMood in src/map). Dezente, kühle Farbstiche passend zur gedämpften Karte. */
export function moodFor(w: Weather): MapMood {
  const i = w.intensity;
  switch (w.kind) {
    case 'cloudy':
      return { darken: 0.08 + i * 0.1, desaturate: 0.15, tint: '#9fb0c8', tintStrength: 0.18 };
    case 'rain':
      return {
        darken: 0.16 + i * 0.1,
        desaturate: 0.25,
        tint: '#7f9cc4',
        tintStrength: 0.32,
        haze: 0.5,
        wet: 0.6 + i * 0.4,
      };
    case 'storm':
      return { darken: 0.38, desaturate: 0.35, tint: '#5d6a94', tintStrength: 0.4, haze: 0.8, wet: 1 };
    case 'snow':
      return { brighten: 0.2 + i * 0.25, desaturate: 0.6, tint: '#eef4ff', tintStrength: 0.25, haze: 0.6 };
    case 'heat':
      return { brighten: 0.05, tint: '#ffb070', tintStrength: 0.12 + i * 0.1, haze: 0.4 };
    default:
      return {};
  }
}

registerMapLayer({
  id: 'weather.sky',
  order: 5,
  mount() {
    let nextFlash = 0;
    return {
      update(state) {
        const w = getWeather(state);
        setMapMood('weather', moodFor(w));
        setPrecipitation(
          w.kind === 'rain' || w.kind === 'storm'
            ? {
                kind: 'rain',
                intensity: w.kind === 'storm' ? 1 : 0.3 + w.intensity * 0.6,
                wind: w.kind === 'storm' ? 0.5 : 0.15,
              }
            : w.kind === 'snow'
              ? { kind: 'snow', intensity: 0.3 + w.intensity * 0.7, wind: 0.2 }
              : { kind: 'none', intensity: 0 },
        );
        audio.setAmbience('rain', w.kind === 'rain' ? 0.4 + w.intensity * 0.6 : w.kind === 'storm' ? 1 : 0);
        audio.setAmbience('storm', w.kind === 'storm' ? 1 : 0);
        audio.setAmbience('wind', w.kind === 'snow' ? 0.6 : w.kind === 'storm' ? 0.4 : 0);
        // Blitze bei Gewitter: reine Optik in echter Zeit, deshalb echter Zufall.
        if (w.kind === 'storm') {
          const now = performance.now();
          if (nextFlash === 0) nextFlash = now + 3000 + Math.random() * 6000;
          if (now >= nextFlash) {
            nextFlash = now + 5000 + Math.random() * 12000;
            mapEffects.flash({ strength: 0.35 + Math.random() * 0.35 });
            audio.play('thunder', { delay: 0.4 + Math.random() * 1.6, volume: 0.8 });
          }
        } else {
          nextFlash = 0;
        }
      },
      destroy() {
        setMapMood('weather', null);
        setPrecipitation({ kind: 'none', intensity: 0 });
      },
    };
  },
});

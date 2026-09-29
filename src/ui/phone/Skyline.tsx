// Signature des Handys: die Kölner Skyline am unteren Rand des Startbildschirms. Dom mit den zwei Türmen, Groß St.
// Martin, die Kranhäuser, KölnTriangle und Colonius (die Wahrzeichen kennt man von der Karte, siehe
// src/map/landmarks.ts) und die Hohenzollernbrücke als dünne Bögen. Der Himmel dahinter folgt der Spielzeit
// (Nacht, Dämmerung, Tag), nachts leuchten ein paar Fenster in Kölsch-Gold. Reine Grafik (aria-hidden).

/** Lichter der Fenster (x, y im 420 × 140 Raster), nur nachts sichtbar. */
const LIGHTS: readonly [number, number][] = [
  [46, 108],
  [58, 118],
  [74, 100],
  [88, 122],
  [102, 110],
  [128, 92],
  [130, 112],
  [146, 84],
  [148, 104],
  [164, 94],
  [166, 122],
  [219, 92],
  [229, 92],
  [224, 108],
  [292, 100],
  [296, 116],
  [360, 70],
  [364, 96],
  [366, 118],
  [388, 98],
  [398, 116],
];

/** Bögen der Hohenzollernbrücke über die ganze Breite. */
const BRIDGE = `M0 128${Array.from({ length: 7 }, (_, i) => `Q${30 + i * 60} ${104} ${60 + i * 60} 128`).join('')}`;

export function Skyline() {
  return (
    <svg
      class="skyline"
      viewBox="0 0 420 140"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      {/* Ferne Ebene: niedrige Blöcke, Colonius, KölnTriangle */}
      <g class="skyline__far">
        <path d="M40 140V98h16V84h14v18h12V90h16v50z" />
        <path d="M346 140V56l30-18v102z" />
        <path d="M378 140V92h14V76h14v64z" />
        <rect x="12.4" y="56" width="3.2" height="84" />
        <ellipse cx="14" cy="52" rx="8" ry="5" />
        <rect x="13.4" y="14" width="1.2" height="38" />
      </g>
      {/* Nahe Ebene: Kranhäuser, Dom, Groß St. Martin */}
      <g class="skyline__near">
        <path d="M120 140V74h10l10-12v78z" />
        <path d="M140 140V68h12l10-12v84z" />
        <path d="M162 140V78h10l8-10v72z" />
        <path d="M188 140V102l6-9h76l6 9v38z" />
        <path d="M197 102V70l7-62 7 62v32z" />
        <path d="M229 102V70l7-62 7 62v32z" />
        <path d="M212 102V86l12-13 12 13v16z" />
        <path d="M264 140V106l14-7v41z" />
        <path d="M284 140V86h20v54zM284 86l10-26 10 26z" />
      </g>
      <path class="skyline__bridge" d={BRIDGE} />
      <path class="skyline__ground" d="M0 140V129h420v11z" />
      <g class="skyline__lights">
        {LIGHTS.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="2.4" height="3" rx="0.6" />
        ))}
      </g>
    </svg>
  );
}

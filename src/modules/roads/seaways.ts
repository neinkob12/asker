// Automatisch erzeugt von tools/build-water.py --sea. Nicht von Hand ändern, sondern das Skript anpassen.
//
// Quelle: Overture Maps, Release 2026-09-23.1
//   Overture Maps Foundation, Thema "base", Typ "bathymetry" (https://docs.overturemaps.org), abgeleitet von ETOPO
//   (NOAA) und GLOBathy. Lizenz: CC0 bzw. gemeinfrei, © Overture Maps Foundation.
// Günstigster Weg über ein Raster von 0.05 Grad, Kosten pro Meter nach Tiefe (ab 100 m 1.0, ab 50 m 1.05, ab 10 m 1.4, ab 0 m 3.0), gerade gezogen,
// solange die Gerade im gleich tiefen Wasser bleibt; jeder Abschnitt liegt ganz auf See.
// Tanger – Gibraltar: 30 km, 4 Punkte.
// Algeciras – Gibraltar: 27 km, 6 Punkte.
// Mittelmeer: 2487 km, 14 Punkte.
// Atlantik und Ärmelkanal: 2287 km, 11 Punkte.
// Kanal – Maasmond: 209 km, 4 Punkte.
// Kanal – Schelde: 139 km, 4 Punkte.
// Nordsee: 641 km, 6 Punkte.
// Karibik und Atlantik: 8237 km, 8 Punkte.
//
// Format: SEA_NODES sind Knoten (Häfen der Produzenten, Engstellen, Beginn der Wege in die Häfen), SEA_LANES die Wege
// dazwischen im Polyline-Format (1e-5 Grad, erster Punkt absolut, dann Abstände, wie WATERWAYS). SEA_PORTS: an welchem
// Knoten der Weg in einen Hafen (WATERWAYS) beginnt.

export const SEA_NODES: Readonly<Record<string, { name: string; lng: number; lat: number }>> = {
  tanger: { name: 'Tanger', lng: -5.79, lat: 35.8 },
  algeciras: { name: 'Algeciras', lng: -5.42, lat: 36.125 },
  durres: { name: 'Durrës', lng: 19.42, lat: 41.31 },
  gibraltar: { name: 'Straße von Gibraltar', lng: -5.6, lat: 35.96 },
  kanal: { name: 'Straße von Dover', lng: 1.45, lat: 51.0 },
  maas: { name: 'Maasgeul', lng: 3.87435, lat: 52.02729 },
  wielingen: { name: 'Wielingen', lng: 3.20042, lat: 51.38668 },
  elbe: { name: 'Elbmündung', lng: 8.71847, lat: 53.87683 },
  cartagena: { name: 'Cartagena', lng: -75.6, lat: 10.42 },
};

export const SEA_LANES: readonly { from: string; to: string; name: string; km: number; path: string }[] = [
  {
    from: 'tanger',
    to: 'gibraltar',
    name: 'Tanger – Gibraltar',
    km: 30.4,
    path: 'nzib@_eoyEw|Ag{C_af@oh\\f{Cv|A',
  },
  {
    from: 'algeciras',
    to: 'gibraltar',
    name: 'Algeciras – Gibraltar',
    km: 26.5,
    path: '~qa`@gtn{Ef^??nwHnwHnwH~oRnwHf{Cv|A',
  },
  {
    from: 'durres',
    to: 'gibraltar',
    name: 'Mittelmeer',
    km: 2487.3,
    path: '_~ouBojc{Fg^vyE~hbEnezG~vsMnz{Jnyo@?~oRowHnwHowH?_ry@nwHowH~m``Bn{vAnjcAnjcAnezGn_eDny`T~ugCf{Cv|A',
  },
  {
    from: 'gibraltar',
    to: 'kanal',
    name: 'Atlantik und Ärmelkanal',
    km: 2286.6,
    path: '~vda@_mnzEg{Cw|A~dtB?~zaP_ibEnh\\oh\\n{vA_`kIoh\\ozl^_j_c@_j_c@opiX_xnD_g{C_af@g{Cg{C',
  },
  {
    from: 'kanal',
    to: 'maas',
    name: 'Kanal – Maasmond',
    km: 209.4,
    path: 'oezG_}gvHf{Cf{Coo}MoalE`CiM',
  },
  {
    from: 'kanal',
    to: 'wielingen',
    name: 'Kanal – Schelde',
    km: 138.6,
    path: 'oezG_}gvHf{Cf{C_q~I_cmArxC_hA',
  },
  {
    from: 'kanal',
    to: 'elbe',
    name: 'Nordsee',
    km: 640.9,
    path: 'oezG_}gvHf{Cf{CorpYod_Q_luP?owHnwHxg@mJ',
  },
  {
    from: 'cartagena',
    to: 'kanal',
    name: 'Karibik und Atlantik',
    km: 8237.3,
    path: '~rllM_dr~@owHozD_af@_vgC_nnqJ_arjF_d{r@?_coh@_ibE_g{C_af@?owH',
  },
];

export const SEA_PORTS: Readonly<Record<string, string>> = {
  hamburg: 'elbe',
  rotterdam: 'maas',
  antwerpen: 'wielingen',
};

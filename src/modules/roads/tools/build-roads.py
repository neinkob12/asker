# Erzeugt src/modules/roads/network.ts: das Kölner Straßennetz (Hauptstraßen) als kompakter Graph für Routen.
#
# Aufruf (aus dem Repo-Root, braucht Python 3.10+ mit pyarrow und shapely):
#   python3 -m venv .venv-roads && .venv-roads/bin/pip install pyarrow shapely
#   .venv-roads/bin/python src/modules/roads/tools/build-roads.py              lädt die Daten (ca. 1 Minute)
#   .venv-roads/bin/python src/modules/roads/tools/build-roads.py segs.parquet nimmt schon geladene Segmente
#
# Quelle: Overture Maps Foundation, Thema "transportation", Typ "segment" (https://docs.overturemaps.org),
# abgeleitet von OpenStreetMap. Lizenz: ODbL 1.0 (https://opendatacommons.org/licenses/odbl/),
# © OpenStreetMap-Mitwirkende, © Overture Maps Foundation. Geladen wird nur der Ausschnitt um Köln (BOX) per
# HTTP-Range-Anfragen direkt aus dem öffentlichen S3-Bucket, ohne Zugangsdaten.
#
# Was das Skript macht:
#   1. Nimmt nur Straßen, auf denen Autos fahren (CLASSES), keine Wohnstraßen, Wege oder Schienen.
#   2. Teilt jedes Segment an seinen Knotenpunkten (Overture "connectors") in Kanten.
#   3. Einbahnstraßen (access_restrictions: gesperrt in einer Richtung) bleiben Einbahnstraßen.
#   4. Behält nur den größten Teil des Netzes, in dem man von überall überall hinkommt (stark zusammenhängend).
#   5. Fasst Knoten ohne Abzweigung zusammen und vereinfacht die Linien (Douglas-Peucker, TOLERANCE_METERS).
#   6. Schreibt alles als eine Zahlenfolge im Polyline-Format (Google) in network.ts.

import io
import json
import math
import os
import re
import ssl
import sys
import urllib.request
import concurrent.futures as cf
from collections import defaultdict

import pyarrow as pa
import pyarrow.parquet as pq
import shapely

RELEASE = '2026-09-23.1'
BASE = 'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/'
PREFIX = f'release/{RELEASE}/theme=transportation/type=segment/'
# Köln mit Rand: alle Veedel, der Niehler Hafen und die Autobahnen drumherum. xmin, xmax, ymin, ymax
BOX = (6.83, 7.07, 50.87, 51.02)
COLUMNS = ['id', 'subtype', 'class', 'connectors', 'geometry', 'bbox', 'access_restrictions', 'road_flags']

# Straßenarten im Spiel (Reihenfolge = Code in network.ts) und ihr Tempo in km/h für die Routenwahl.
CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street']
TOLERANCE_METERS = 4
OUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'network.ts')

# Lokale Projektion in Meter (für Köln genau genug).
LAT0 = 50.94
M_LAT = 111_320.0
M_LNG = 111_320.0 * math.cos(math.radians(LAT0))


def to_m(lng, lat):
    return (lng * M_LNG, lat * M_LAT)


# --- Laden -----------------------------------------------------------------------------------------------------

_ctx = ssl.create_default_context(cafile=os.environ.get('SSL_CERT_FILE'))
_opener = urllib.request.build_opener(urllib.request.ProxyHandler(), urllib.request.HTTPSHandler(context=_ctx))


class RangeFile(io.RawIOBase):
    """Datei im Bucket, gelesen per HTTP-Range (Parquet braucht nur Fußzeile und passende Zeilengruppen)."""

    def __init__(self, url, size):
        self.url, self.size, self.pos = url, size, 0

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos

    def readinto(self, b):
        if self.pos >= self.size:
            return 0
        end = min(self.size, self.pos + len(b)) - 1
        for attempt in range(5):
            try:
                request = urllib.request.Request(self.url, headers={'Range': f'bytes={self.pos}-{end}'})
                data = _opener.open(request, timeout=60).read()
                break
            except Exception:
                if attempt == 4:
                    raise
        b[: len(data)] = data
        self.pos += len(data)
        return len(data)


def _overlaps(rg):
    stats = {}
    for i in range(rg.num_columns):
        c = rg.column(i)
        if c.path_in_schema.startswith('bbox.') and c.statistics is not None and c.statistics.has_min_max:
            stats[c.path_in_schema] = (c.statistics.min, c.statistics.max)
    if len(stats) < 4:
        return True
    return not (
        stats['bbox.xmin'][0] > BOX[1]
        or stats['bbox.xmax'][1] < BOX[0]
        or stats['bbox.ymin'][0] > BOX[3]
        or stats['bbox.ymax'][1] < BOX[2]
    )


def _scan(key_size):
    key, size = key_size
    pf = pq.ParquetFile(io.BufferedReader(RangeFile(BASE + key, size), buffer_size=1 << 20))
    tables = []
    for i in range(pf.metadata.num_row_groups):
        if not _overlaps(pf.metadata.row_group(i)):
            continue
        t = pf.read_row_group(i, columns=COLUMNS)
        b = t.column('bbox').combine_chunks()
        mask = (
            (b.field('xmax').to_numpy() >= BOX[0])
            & (b.field('xmin').to_numpy() <= BOX[1])
            & (b.field('ymax').to_numpy() >= BOX[2])
            & (b.field('ymin').to_numpy() <= BOX[3])
        )
        t = t.filter(pa.array(mask))
        if t.num_rows:
            tables.append(t)
    return tables


def download():
    xml = _opener.open(BASE + f'?list-type=2&prefix={PREFIX}').read().decode()
    keys = list(zip(re.findall(r'<Key>(.*?)</Key>', xml), map(int, re.findall(r'<Size>(.*?)</Size>', xml))))
    print(f'{len(keys)} Dateien im Release {RELEASE}, suche den Köln-Ausschnitt …', file=sys.stderr)
    tables = []
    with cf.ThreadPoolExecutor(16) as ex:
        for found in ex.map(_scan, keys):
            tables += found
    return pa.concat_tables(tables)


# --- Aufbereiten -----------------------------------------------------------------------------------------------


def oneway(restrictions):
    """1 = nur in Zeichenrichtung, -1 = nur dagegen, 0 = beide Richtungen."""
    for r in restrictions or []:
        when = r.get('when') or {}
        if r.get('access_type') != 'denied' or r.get('between') is not None:
            continue
        if when.get('during') or when.get('vehicle') or when.get('using') or when.get('recognized'):
            continue
        mode = when.get('mode')
        if mode and not any(m in ('motor_vehicle', 'vehicle', 'car') for m in mode):
            continue
        if when.get('heading') == 'backward':
            return 1
        if when.get('heading') == 'forward':
            return -1
    return 0


def split_at_connectors(coords, connectors):
    """Teilt die Linie an den Knotenpunkten. Gibt [(connector_a, connector_b, punkte)] zurück."""
    pts = [to_m(x, y) for x, y in coords]
    cum = [0.0]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        cum.append(cum[-1] + math.hypot(x1 - x0, y1 - y0))
    total = cum[-1] or 1.0
    # Jeder Knotenpunkt liegt auf einem Stützpunkt; nimm den nächsten zu seiner Position "at".
    cuts = []
    for c in connectors or []:
        target = c['at'] * total
        idx = min(range(len(cum)), key=lambda i: abs(cum[i] - target))
        cuts.append((idx, c['connector_id']))
    cuts.sort()
    pieces = []
    for (i0, c0), (i1, c1) in zip(cuts, cuts[1:]):
        if i1 <= i0 or c0 == c1:
            continue
        pieces.append((c0, c1, coords[i0 : i1 + 1]))
    return pieces


def strongly_connected(nodes, adj):
    """Tarjan (iterativ): Liste der stark zusammenhängenden Komponenten."""
    index, low, on_stack, stack, comps = {}, {}, set(), [], []
    counter = 0
    for root in nodes:
        if root in index:
            continue
        work = [(root, iter(adj[root]))]
        index[root] = low[root] = counter
        counter += 1
        stack.append(root)
        on_stack.add(root)
        while work:
            v, it = work[-1]
            advanced = False
            for w in it:
                if w not in index:
                    index[w] = low[w] = counter
                    counter += 1
                    stack.append(w)
                    on_stack.add(w)
                    work.append((w, iter(adj[w])))
                    advanced = True
                    break
                if w in on_stack:
                    low[v] = min(low[v], index[w])
            if advanced:
                continue
            work.pop()
            if work:
                low[work[-1][0]] = min(low[work[-1][0]], low[v])
            if low[v] == index[v]:
                comp = []
                while True:
                    w = stack.pop()
                    on_stack.discard(w)
                    comp.append(w)
                    if w == v:
                        break
                comps.append(comp)
    return comps


def simplify(coords):
    if len(coords) <= 2:
        return coords
    line = shapely.LineString([to_m(x, y) for x, y in coords])
    simple = line.simplify(TOLERANCE_METERS, preserve_topology=False)
    keep = [(x / M_LNG, y / M_LAT) for x, y in simple.coords]
    keep[0], keep[-1] = coords[0], coords[-1]
    return keep


def build(table):
    rows = table.select(['id', 'subtype', 'class', 'connectors', 'geometry', 'access_restrictions']).to_pylist()
    edges = []  # [a, b, klasse, richtung, punkte]
    for row in rows:
        if row['subtype'] != 'road' or row['class'] not in CLASSES:
            continue
        geom = shapely.from_wkb(row['geometry'])
        if geom.geom_type != 'LineString':
            continue
        direction = oneway(row['access_restrictions'])
        for a, b, pts in split_at_connectors(list(geom.coords), row['connectors']):
            edges.append([a, b, CLASSES.index(row['class']), direction, pts])
    print(f'{len(edges)} Kanten aus {len(rows)} Segmenten', file=sys.stderr)

    # Größte stark zusammenhängende Komponente.
    adj = defaultdict(list)
    for a, b, _, d, _ in edges:
        if d >= 0:
            adj[a].append(b)
        if d <= 0:
            adj[b].append(a)
        adj.setdefault(a, [])
        adj.setdefault(b, [])
    comps = strongly_connected(sorted(adj), adj)
    main = set(max(comps, key=len))
    edges = [e for e in edges if e[0] in main and e[1] in main]
    print(f'größte Komponente: {len(main)} Knoten, {len(edges)} Kanten', file=sys.stderr)

    # Knoten ohne Abzweigung zusammenfassen (genau zwei Kanten, gleiche Art, passende Richtung).
    changed = True
    while changed:
        changed = False
        incident = defaultdict(list)
        for i, e in enumerate(edges):
            incident[e[0]].append(i)
            incident[e[1]].append(i)
        dead = set()
        for node, ids in incident.items():
            if len(ids) != 2 or ids[0] in dead or ids[1] in dead or ids[0] == ids[1]:
                continue
            e1, e2 = edges[ids[0]], edges[ids[1]]
            if e1[2] != e2[2]:
                continue
            # e1 so drehen, dass es in node endet, e2 so, dass es in node beginnt.
            if e1[1] != node:
                e1 = [e1[1], e1[0], e1[2], -e1[3], list(reversed(e1[4]))]
            if e2[0] != node:
                e2 = [e2[1], e2[0], e2[2], -e2[3], list(reversed(e2[4]))]
            if e1[3] != e2[3] or e1[0] == e2[1]:
                continue
            merged = [e1[0], e2[1], e1[2], e1[3], e1[4] + e2[4][1:]]
            edges[ids[0]] = merged
            dead.add(ids[1])
            changed = True
        edges = [e for i, e in enumerate(edges) if i not in dead]
    print(f'nach dem Zusammenfassen: {len(edges)} Kanten', file=sys.stderr)

    # Knoten nummerieren (nach Lage, damit die Datei stabil bleibt) und Linien vereinfachen.
    coords = {}
    for a, b, _, _, pts in edges:
        coords[a] = pts[0]
        coords[b] = pts[-1]
    order = sorted(coords, key=lambda n: (round(coords[n][1], 5), round(coords[n][0], 5), n))
    number = {n: i for i, n in enumerate(order)}
    out_edges = []
    for a, b, cls, d, pts in edges:
        pts = simplify(pts)
        # Einbahnstraßen gegen die Zeichenrichtung umdrehen, damit 1 immer "nur von a nach b" heißt.
        if d == -1:
            a, b, pts, d = b, a, list(reversed(pts)), 1
        out_edges.append((number[a], number[b], cls, d, pts[1:-1]))
    out_edges.sort(key=lambda e: (e[0], e[1], e[2]))
    return [coords[n] for n in order], out_edges


# --- Schreiben -------------------------------------------------------------------------------------------------


def encode_ints(values):
    """Vorzeichenbehaftete Ganzzahlen im Polyline-Format (Google): Zeichen 63–126, 5 Bit pro Zeichen."""
    out = []
    for v in values:
        v = ~(v << 1) if v < 0 else v << 1
        while v >= 0x20:
            out.append(chr((0x20 | (v & 0x1F)) + 63))
            v >>= 5
        out.append(chr(v + 63))
    return ''.join(out)


def ts_string(text):
    """String-Literal in einfachen Anführungszeichen (wie Biome es will). Polyline-Zeichen enthalten kein '."""
    return "'" + text.replace('\\', '\\\\') + "'"


def q(x):
    return int(round(x * 1e5))


def write(nodes, edges, source):
    node_ints = []
    px = py = 0
    for x, y in nodes:
        node_ints += [q(x) - px, q(y) - py]
        px, py = q(x), q(y)
    edge_ints = []
    prev_a = 0
    for a, b, cls, d, pts in edges:
        edge_ints += [a - prev_a, b - a, cls * 2 + d, len(pts)]
        prev_a = a
        lx, ly = nodes[a]
        lx, ly = q(lx), q(ly)
        for x, y in pts:
            edge_ints += [q(x) - lx, q(y) - ly]
            lx, ly = q(x), q(y)
    length_km = 0.0
    for a, b, _, _, pts in edges:
        line = [nodes[a], *pts, nodes[b]]
        for (x0, y0), (x1, y1) in zip(line, line[1:]):
            length_km += math.hypot((x1 - x0) * M_LNG, (y1 - y0) * M_LAT) / 1000
    text = f"""// Automatisch erzeugt von tools/build-roads.py. Nicht von Hand ändern, sondern das Skript anpassen.
//
// Quelle: {source}
//   Overture Maps Foundation, Thema "transportation" (https://docs.overturemaps.org), abgeleitet von OpenStreetMap.
// Lizenz: ODbL 1.0 (https://opendatacommons.org/licenses/odbl/). © OpenStreetMap-Mitwirkende, © Overture Maps Foundation.
// Ausschnitt {BOX[0]}–{BOX[1]} °O, {BOX[2]}–{BOX[3]} °N.
// Straßenarten: {', '.join(CLASSES)}.
// {len(nodes)} Knoten, {len(edges)} Kanten, {length_km:.0f} km Straße, Linien vereinfacht auf {TOLERANCE_METERS} m.
//
// Format (Zahlen im Polyline-Format, 1e-5 Grad, siehe decodeInts in graph.ts):
//   ROAD_NODES: je Knoten lng, lat als Abstand zum vorigen Knoten.
//   ROAD_EDGES: je Kante Start (Abstand zum Start der vorigen Kante), Ziel (Abstand zum Start), Art × 2 + Einbahn
//     (1 = nur von Start nach Ziel), Zahl der Zwischenpunkte, dann die Zwischenpunkte als Abstand zum vorigen Punkt.

/** Straßenarten in der Reihenfolge ihrer Codes. */
export const ROAD_CLASSES = [
{''.join(f"  '{c}',{chr(10)}" for c in CLASSES)}] as const;

export const ROAD_NODES =
  {ts_string(encode_ints(node_ints))};

export const ROAD_EDGES =
  {ts_string(encode_ints(edge_ints))};
"""
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        f.write(text)
    print(f'{OUT_FILE}: {len(text) // 1024} KB, {len(nodes)} Knoten, {len(edges)} Kanten, {length_km:.0f} km', file=sys.stderr)


if __name__ == '__main__':
    if len(sys.argv) > 1:
        table = pq.read_table(sys.argv[1])
    else:
        table = download()
    nodes, edges = build(table)
    write(nodes, edges, f'Overture Maps, Release {RELEASE}')

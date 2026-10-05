# Erzeugt src/modules/roads/waterways.ts: die Wasserwege der Schiffe aus echten Daten statt von Hand gezeichnet.
#
#   Rotterdam -> Köln:    Nieuwe Maas, Noord, Beneden Merwede, Waal, Rhein (Hauptfahrwasser) bis zum Niehler Hafen
#   Nordsee   -> Hamburg: Elbe ab Cuxhaven bis zum Liegeplatz im Hamburger Hafen
#   Nordsee   -> Rotterdam, Antwerpen (Auftrag 41): Fahrwasser Maasgeul/Maasmond bzw. Wielingen/Westerschelde
#
# und mit --sea die Seewege (seaways.ts, Auftrag 41): Tanger, Algeciras und Durrës über Mittelmeer, Atlantik, Ärmelkanal
# und Nordsee bis vor die Häfen, aus den Tiefen von Overture (Abschnitt "Seewege" unten).
#
# Aufruf (aus dem Repo-Root, braucht Python 3.10+ mit pyarrow und shapely, wie build-roads.py):
#   .venv-roads/bin/python src/modules/roads/tools/build-water.py                 lädt die Daten (einige Minuten)
#   .venv-roads/bin/python src/modules/roads/tools/build-water.py rhein.parquet elbe.parquet   nimmt geladene Daten
#   .venv-roads/bin/python src/modules/roads/tools/build-water.py --sea [bathymetry.parquet]   Seewege (danach)
#
# Quelle: Overture Maps Foundation, Thema "base", Typ "water" (https://docs.overturemaps.org), abgeleitet von
# OpenStreetMap. Lizenz: ODbL 1.0 (https://opendatacommons.org/licenses/odbl/), © OpenStreetMap-Mitwirkende,
# © Overture Maps Foundation. Geladen wird nur der Ausschnitt um jeden Wasserweg per HTTP-Range-Anfragen direkt aus dem
# öffentlichen S3-Bucket (gleiche Technik wie build-roads.py).
#
# Was das Skript macht:
#   1. Nimmt die Linien mit subtype river oder canal und derselben Klasse (Mittellinien der Flüsse und Kanäle; Gräben
#      und Drainagen tragen in Overture auch subtype canal, aber class ditch bzw. drain, die fallen weg).
#   2. Baut einen Graphen aus allen Stützpunkten (gemeinsame Punkte verbinden die Linien, Enden im Abstand von
#      JOIN_METERS werden zusammengelegt) und sucht den kürzesten Weg über Wegpunkte (WAYPOINTS), damit das Schiff im
#      Hauptfahrwasser bleibt (z.B. die Waal statt des Lek).
#   3. Hängt die letzten Meter an, für die es keine Linien gibt (Hafenbecken sind nur Flächen): BRIDGES, von Hand, und
#      prüft, dass diese Punkte in einer Wasserfläche liegen. Steht im Kopf der erzeugten Datei.
#   4. Vereinfacht die Linie (Douglas-Peucker, SIMPLIFY_OUTSIDE außerhalb, SIMPLIFY_CITY innerhalb der Stadt-Box)
#      und prüft, dass jeder Punkt höchstens MAX_OFF_METERS von der Overture-Linie liegt.
#   5. Schreibt jeden Weg als Zahlenfolge im Polyline-Format (wie network.ts) nach waterways.ts.

import importlib.util
import heapq
import math
import os
import sys
from collections import defaultdict

import pyarrow.parquet as pq
import shapely

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_FILE = os.path.join(HERE, '..', 'waterways.ts')

# Lade-Technik aus build-roads.py (RangeFile, Zeilengruppen nach bbox).
_spec = importlib.util.spec_from_file_location('build_roads', os.path.join(HERE, 'build-roads.py'))
roads = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(roads)

RELEASE = roads.RELEASE
COLUMNS = ['id', 'subtype', 'class', 'names', 'geometry', 'bbox']
SUBTYPES = ('river', 'canal')
CLASSES = ('river', 'canal')
JOIN_METERS = 25
# Enden, die neben einer anderen Linie aufhören (Mündung ohne gemeinsamen Punkt), mit dem nächsten Punkt verbinden.
LINK_METERS = 80
SIMPLIFY_OUTSIDE = 30
SIMPLIFY_CITY = 8
MAX_OFF_METERS = 300

# Wasserwege: Ausschnitt (xmin, xmax, ymin, ymax), Stadt-Box (feiner vereinfacht), Wegpunkte [lng, lat] vom Meer bzw.
# Rotterdam bis zur Stadt, und die Brücke ins Hafenbecken (von Hand, Punkte im Wasser) bis zum Liegeplatz.
WATERWAYS = {
    'koeln': {
        'name': 'Rotterdam – Köln',
        'lat': 51.4,
        'box': (4.15, 7.10, 50.95, 52.02),
        'city': (6.83, 7.07, 50.87, 51.02),
        # (Name der Linie in Overture, lng, lat): Der Wegpunkt rastet auf den nächsten Punkt dieser Linie ein.
        'waypoints': [
            ('Nieuwe Maas', 4.42, 51.896),  # Rotterdam, am Waalhaven
            ('Noord', 4.64, 51.86),  # bei Alblasserdam
            ('Beneden Merwede', 4.77, 51.822),  # bei Sliedrecht
            ('Waal', 5.25, 51.815),  # bei Zaltbommel
            ('Waal', 5.86, 51.853),  # bei Nijmegen
            ('Rhein', 6.24, 51.83),  # bei Emmerich
            ('Rhein', 6.60, 51.65),  # bei Wesel
            ('Rhein', 6.745, 51.44),  # bei Duisburg-Ruhrort
            ('Rhein', 6.77, 51.23),  # bei Düsseldorf
            ('Rhein', 6.9675, 50.98979),  # vor der Hafeneinfahrt Niehl
        ],
        # Hafeneinfahrt Niehl bis zum Liegeplatz am Westkai (UNLOADING_PORT in suppliers/config.ts liegt an Land daneben).
        'bridge': [(6.9670, 50.98771), (6.9684, 50.98645), (6.96815, 50.98532)],
    },
    'hamburg': {
        'name': 'Nordsee – Hamburg',
        'lat': 53.6,
        # Beginn auf See (SEA_NODES): hier endet der Seeweg aus dem Kanal.
        'sea': 'elbe',
        'box': (8.55, 10.06, 53.44, 53.93),
        'city': (9.80, 10.08, 53.44, 53.63),
        'waypoints': [
            ('Elbe', 8.72, 53.885),  # vor Cuxhaven
            ('Elbe', 9.14, 53.885),  # Brunsbüttel
            ('Elbe', 9.41, 53.78),  # Glückstadt
            ('Elbe', 9.62, 53.63),  # Lühesand
            ('Elbe', 9.80, 53.556),  # Blankenese
            ('Norderelbe', 9.95, 53.5435),  # bei Övelgönne
            ('Norderelbe', 9.965, 53.544),  # vor den Landungsbrücken
            ('Norderelbe', 9.9905, 53.5377),  # vor der Einfahrt in den Hansahafen
        ],
        # In den Hansahafen bis an den Liegeplatz am O'Swaldkai (logistics/config.ts, PORTS.hamburg, liegt im Becken).
        # Die Mittellinie des Hansahafens hängt in den Daten nicht an der Norderelbe, darum dieses Stück von Hand.
        'bridge': [(9.9916, 53.5352), (9.99278, 53.53372), (9.99952, 53.53008), (9.99978, 53.52789)],
    },
    # Auftrag 41: Häfen der Hafen-Phase (logistics HARBOR_PORTS). Draußen gibt es keine Flüsse, dafür Fahrwasser
    # (subtype water, class fairway): Maasgeul und Maasmond vor Rotterdam, Wielingen und Westerschelde vor Antwerpen.
    'rotterdam': {
        'name': 'Nordsee – Rotterdam',
        'lat': 51.95,
        'sea': 'maas',
        'subtypes': ('river', 'canal', 'water'),
        'classes': ('river', 'canal', 'fairway'),
        'box': (3.55, 4.50, 51.85, 52.06),
        'city': (4.25, 4.50, 51.85, 51.95),
        'waypoints': [
            ('Maasgeul', 3.70, 52.01),  # Ansteuerung draußen
            ('Maasmond', 4.06, 51.985),  # Hafenmund
            ('Nieuwe Waterweg', 4.13, 51.965),  # Maassluis
            ('Scheur', 4.25, 51.92),  # Vlaardingen
            ('Nieuwe Maas', 4.42, 51.896),  # am Waalhaven (Jansens Liegeplatz)
        ],
    },
    'antwerpen': {
        'name': 'Nordsee – Antwerpen',
        'lat': 51.4,
        'sea': 'wielingen',
        'subtypes': ('river', 'canal', 'water'),
        'classes': ('river', 'canal', 'fairway'),
        'box': (3.10, 4.45, 51.20, 51.55),
        'city': (4.20, 4.45, 51.20, 51.40),
        'waypoints': [
            ('Wielingen', 3.22, 51.40),  # vor Zeebrugge
            ('Westerschelde', 3.65, 51.42),  # vor Vlissingen
            ('Westerschelde', 4.10, 51.39),  # Hansweert
            ('Schelde', 4.29, 51.29),  # am Deurganckdok
        ],
    },
}



def proj(lat0):
    m_lng = 111_320.0 * math.cos(math.radians(lat0))
    return (lambda x, y: (x * m_lng, y * 111_320.0)), m_lng


def download(key):
    spec = WATERWAYS[key]
    roads.BOX = spec['box']
    roads.BOXES = [spec['box']]
    roads.PREFIX = f'release/{RELEASE}/theme=base/type=water/'
    roads.COLUMNS = COLUMNS
    print(f'{spec["name"]}: lade Wasser im Ausschnitt {spec["box"]} …', file=sys.stderr)
    return roads.download()


def build(key, table):
    spec = WATERWAYS[key]
    to_m, _ = proj(spec['lat'])
    rows = table.select(['subtype', 'class', 'names', 'geometry']).to_pylist()
    lines = []
    polygons = []
    for row in rows:
        geom = shapely.from_wkb(row['geometry'])
        if geom.geom_type in ('Polygon', 'MultiPolygon'):
            polygons.append(geom)
            continue
        if row['subtype'] not in spec.get('subtypes', SUBTYPES) or row['class'] not in spec.get('classes', CLASSES):
            continue
        for part in getattr(geom, 'geoms', [geom]):
            if part.geom_type == 'LineString' and len(part.coords) >= 2:
                lines.append((row['class'], (row['names'] or {}).get('primary'), list(part.coords)))
    print(f'{len(lines)} Linien ({"/".join(CLASSES)}), {len(polygons)} Wasserflächen', file=sys.stderr)

    # Knoten: Stützpunkte, gerundet; Enden in JOIN_METERS zusammenlegen (Raster).
    node_of = {}
    pos = []
    grid = defaultdict(list)
    cell = JOIN_METERS

    def node(x, y, is_end):
        k = (round(x, 6), round(y, 6))
        if k in node_of:
            return node_of[k]
        mx, my = to_m(x, y)
        if is_end:
            gx, gy = int(mx // cell), int(my // cell)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for other in grid[(gx + dx, gy + dy)]:
                        ox, oy = to_m(*pos[other])
                        if math.hypot(ox - mx, oy - my) <= JOIN_METERS:
                            node_of[k] = other
                            return other
        i = len(pos)
        pos.append((x, y))
        node_of[k] = i
        if is_end:
            grid[(int(mx // cell), int(my // cell))].append(i)
        return i

    adj = defaultdict(list)
    river_nodes = set()
    named = defaultdict(set)
    ends = []
    for cls, name, coords in lines:
        ids = [node(x, y, i in (0, len(coords) - 1)) for i, (x, y) in enumerate(coords)]
        ends += [ids[0], ids[-1]]
        if cls in ('river', 'fairway'):
            river_nodes.update(ids)
        if name:
            named[name].update(ids)
        for a, b in zip(ids, ids[1:]):
            if a == b:
                continue
            (ax, ay), (bx, by) = to_m(*pos[a]), to_m(*pos[b])
            d = math.hypot(bx - ax, by - ay)
            adj[a].append((b, d))
            adj[b].append((a, d))
    # Mündungen ohne gemeinsamen Punkt: Enden mit dem nächsten Punkt einer anderen Linie verbinden.
    all_tree = shapely.STRtree([shapely.Point(*to_m(*p)) for p in pos])
    links = 0
    for e in set(ends):
        if len(adj[e]) > 1:
            continue
        p = shapely.Point(*to_m(*pos[e]))
        near = {m for m, _ in adj[e]}
        for k in all_tree.query(p.buffer(LINK_METERS)):
            k = int(k)
            if k == e or k in near:
                continue
            d = p.distance(all_tree.geometries[k])
            if d <= LINK_METERS:
                adj[e].append((k, d))
                adj[k].append((e, d))
                links += 1
    print(f'Graph: {len(pos)} Knoten, {links} Verbindungen an Mündungen', file=sys.stderr)

    # Wegpunkte rasten auf Knoten von Flüssen ein (nicht auf Kanäle oder Hafenbecken daneben).
    snap_ids = sorted(river_nodes)
    tree_pts = shapely.STRtree([shapely.Point(*to_m(*pos[i])) for i in snap_ids])

    def nearest_node(name, lng, lat):
        p = shapely.Point(*to_m(lng, lat))
        if name and named.get(name):
            ids = sorted(named[name])
            best = min(ids, key=lambda i: p.distance(shapely.Point(*to_m(*pos[i]))))
            return best, p.distance(shapely.Point(*to_m(*pos[best])))
        k = int(tree_pts.nearest(p))
        return snap_ids[k], p.distance(tree_pts.geometries[k])

    def dijkstra(src, dst):
        best = {src: 0.0}
        prev = {}
        heap = [(0.0, src)]
        tx, ty = to_m(*pos[dst])
        while heap:
            d, n = heapq.heappop(heap)
            if n == dst:
                break
            if d > best[n] + 1e-9:
                continue
            for m, w in adj[n]:
                nd = d + w
                if nd < best.get(m, math.inf):
                    best[m] = nd
                    prev[m] = n
                    mx, my = to_m(*pos[m])
                    heapq.heappush(heap, (nd, m))
        if dst not in best:
            return None
        path = [dst]
        while path[-1] != src:
            path.append(prev[path[-1]])
        return list(reversed(path))

    route = []
    notes = []
    for (a, b) in zip(spec['waypoints'], spec['waypoints'][1:]):
        na, da = nearest_node(*a)
        nb, db = nearest_node(*b)
        a, b = a[1:], b[1:]
        piece = dijkstra(na, nb)
        if piece is None:
            notes.append(f'Lücke zwischen {a} und {b} von Hand überbrückt')
            print(f'WARNUNG: kein Weg zwischen {a} und {b}, Lücke wird überbrückt', file=sys.stderr)
            piece = [na, nb]
        pts = [pos[i] for i in piece]
        if route and route[-1] == pts[0]:
            pts = pts[1:]
        route += pts
    # Die Brücke (vom letzten Punkt auf dem Fluss bis zum Liegeplatz) muss ganz im Wasser liegen.
    water = shapely.STRtree(polygons)
    bridge = [route[-1], *spec.get('bridge', [])]
    for a, b in zip(bridge, bridge[1:]):
        piece = shapely.LineString([a, b])
        near = [polygons[int(i)] for i in water.query(piece)]
        if not near or not shapely.union_all(near).buffer(1e-6).covers(piece):
            raise SystemExit(f'{spec["name"]}: Brücke {a} -> {b} liegt nicht ganz im Wasser')
    count = len(bridge) - 1
    if count:
        notes.append(
            ('der letzte Punkt' if count == 1 else f'die letzten {count} Punkte')
            + ' bis zum Liegeplatz von Hand (Hafenbecken haben keine Mittellinie), ganz im Wasser'
        )
    route += bridge[1:]

    # Vereinfachen: in der Stadt feiner.
    cx0, cx1, cy0, cy1 = spec['city']
    in_city = [cx0 <= x <= cx1 and cy0 <= y <= cy1 for x, y in route]
    out = []
    start = 0
    for i in range(1, len(route) + 1):
        if i == len(route) or in_city[i] != in_city[start]:
            seg = route[max(0, start - 1) : i]
            tol = SIMPLIFY_CITY if in_city[start] else SIMPLIFY_OUTSIDE
            line = shapely.LineString([to_m(x, y) for x, y in seg]) if len(seg) >= 2 else None
            if line is not None:
                simple = line.simplify(tol, preserve_topology=False)
                keep = [(x / proj(spec['lat'])[1], y / 111_320.0) for x, y in simple.coords]
                keep[0], keep[-1] = seg[0], seg[-1]
                out += keep[1:] if out else keep
            start = i
    # Prüfen: jeder Punkt höchstens MAX_OFF_METERS von der Overture-Linie (bzw. auf der Brücke).
    source = shapely.LineString([to_m(x, y) for x, y in route])
    worst = max(source.distance(shapely.Point(*to_m(x, y))) for x, y in out)
    if worst > MAX_OFF_METERS:
        raise SystemExit(f'{spec["name"]}: Punkt {worst:.0f} m neben der Linie (höchstens {MAX_OFF_METERS} m)')
    km = sum(
        math.hypot(*(a - b for a, b in zip(to_m(*p), to_m(*q)))) for p, q in zip(out, out[1:])
    ) / 1000
    print(f'{spec["name"]}: {km:.1f} km, {len(out)} Punkte (aus {len(route)}), höchstens {worst:.0f} m neben der Linie',
          file=sys.stderr)
    return out, km, notes


def write(results):
    parts = []
    for key, (pts, km, notes) in results.items():
        spec = WATERWAYS[key]
        note = ''.join(f'\n//   {n}.' for n in notes)
        parts.append((key, spec, pts, km, note))
    head = '\n'.join(
        f'// {spec["name"]}: {km:.0f} km, {len(pts)} Punkte.{note}' for key, spec, pts, km, note in parts
    )
    body = ''.join(
        f"  {key}: {{\n    name: '{spec['name']}',\n    km: {km:.1f},\n"
        f"    path: {roads.ts_string(roads.encode_line(pts))},\n  }},\n"
        for key, spec, pts, km, _ in parts
    )
    text = f"""// Automatisch erzeugt von tools/build-water.py. Nicht von Hand ändern, sondern das Skript anpassen.
//
// Quelle: Overture Maps, Release {RELEASE}
//   Overture Maps Foundation, Thema "base", Typ "water" (https://docs.overturemaps.org), abgeleitet von OpenStreetMap.
// Lizenz: ODbL 1.0 (https://opendatacommons.org/licenses/odbl/). © OpenStreetMap-Mitwirkende, © Overture Maps Foundation.
// Mittellinien mit subtype {' oder '.join(SUBTYPES)}, kürzester Weg über Wegpunkte im Hauptfahrwasser, vereinfacht auf
// {SIMPLIFY_OUTSIDE} m (in der Stadt {SIMPLIFY_CITY} m), jeder Punkt höchstens {MAX_OFF_METERS} m von der Linie.
{head}
//
// Format: Weg vom Meer bzw. von Rotterdam bis zum Liegeplatz, Polyline-Format (1e-5 Grad, erster Punkt absolut, dann
// Abstände, wie ROAD_APPROACHES in network.ts).

export const WATERWAYS: Readonly<Record<string, {{ name: string; km: number; path: string }}>> = {{
{body}}};
"""
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        f.write(text)
    print(f'{OUT_FILE}: {len(text) // 1024} KB', file=sys.stderr)


# --- Seewege (Auftrag 41) -----------------------------------------------------------------------------------------
#
# Draußen auf See gibt es keine Mittellinien. Dafür hat Overture die Tiefen (Thema "base", Typ "bathymetry", Flächen
# ab 0, 10, 50, 100, 500 … m Tiefe, abgeleitet von ETOPO/GLOBathy). Das Skript legt ein Raster (SEA_GRID Grad) über
# den Ausschnitt, jede Zelle kostet nach der Tiefe (SEA_DEPTH_COST: flaches Wasser an der Küste meiden die Schiffe),
# sucht den günstigsten Weg (A*, acht Nachbarn) zwischen den Knoten (SEA_NODES) und zieht ihn gerade, solange die
# Gerade im gleich tiefen Wasser bleibt. Jeder Abschnitt wird geprüft: ganz auf See (Fläche ab 0 m).
# Die letzten Kilometer in den Hafen sind Fahrwasser bzw. Flüsse (WATERWAYS oben, 'sea' nennt den Knoten, an dem sie
# beginnen).

SEA_BOX = (-11.5, 21.0, 34.5, 57.0)
SEA_GRID = 0.05
# (Tiefe ab, Kosten pro Meter): tiefes Wasser ist am günstigsten.
SEA_DEPTH_COST = [(100, 1.0), (50, 1.05), (10, 1.4), (0, 3.0)]
SEA_SAMPLE_METERS = 2000

SEA_NODES = {
    'tanger': ('Tanger', -5.79, 35.80),
    'algeciras': ('Algeciras', -5.42, 36.125),
    'durres': ('Durrës', 19.42, 41.31),
    'gibraltar': ('Straße von Gibraltar', -5.6, 35.96),
    'kanal': ('Straße von Dover', 1.45, 51.0),
    # Beginn der Wege in die Häfen: die Lage kommt aus waterways.ts (erster Punkt des Wegs, dessen 'sea' der Knoten ist).
    'maas': ('Maasgeul', None, None),
    'wielingen': ('Wielingen', None, None),
    'elbe': ('Elbmündung', None, None),
}


def decode_line(text):
    """Gegenstück zu roads.encode_line."""
    ints, i = [], 0
    while i < len(text):
        result = shift = 0
        while True:
            b = ord(text[i]) - 63
            i += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        ints.append(~(result >> 1) if result & 1 else result >> 1)
    pts, x, y = [], 0, 0
    for k in range(0, len(ints), 2):
        x, y = x + ints[k], y + ints[k + 1]
        pts.append((x / 1e5, y / 1e5))
    return pts


def place_port_nodes():
    """Knoten am Beginn der Hafen-Wege auf den ersten Punkt des Wegs aus waterways.ts legen (erst build-water.py)."""
    import re

    text = open(OUT_FILE, encoding='utf-8').read()
    for key, spec in WATERWAYS.items():
        node = spec.get('sea')
        if not node:
            continue
        m = re.search(rf"  {key}: {{\n    name: '[^']*',\n    km: [\d.]+,\n    path: '((?:[^'\\]|\\.)*)'", text)
        if not m:
            raise SystemExit(f'{key} fehlt in waterways.ts: erst build-water.py ohne --sea laufen lassen')
        lng, lat = decode_line(m.group(1).replace('\\\\', '\\'))[0]
        SEA_NODES[node] = (SEA_NODES[node][0], lng, lat)

SEA_LANES = [
    ('tanger', 'gibraltar', 'Tanger – Gibraltar'),
    ('algeciras', 'gibraltar', 'Algeciras – Gibraltar'),
    ('durres', 'gibraltar', 'Mittelmeer'),
    ('gibraltar', 'kanal', 'Atlantik und Ärmelkanal'),
    ('kanal', 'maas', 'Kanal – Maasmond'),
    ('kanal', 'wielingen', 'Kanal – Schelde'),
    ('kanal', 'elbe', 'Nordsee'),
]

# Auftrag 42: Über den Atlantik (Cartagena in Kolumbien bis in den Ärmelkanal). Eigener, gröberer Ausschnitt, damit die
# Wege oben Zelle für Zelle gleich bleiben (ein größerer SEA_BOX verschöbe sie). Gleiche Kosten, gleiche Prüfung.
OCEAN_BOX = (-80.0, 5.0, 5.0, 56.0)
OCEAN_GRID = 0.1
OCEAN_NODES = {
    'cartagena': ('Cartagena', -75.6, 10.42),
}
OCEAN_LANES = [
    ('cartagena', 'kanal', 'Karibik und Atlantik'),
]

R_EARTH = 6_371_000.0


def haversine(a, b):
    (x1, y1), (x2, y2) = a, b
    p1, p2 = math.radians(y1), math.radians(y2)
    dp, dl = p2 - p1, math.radians(x2 - x1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R_EARTH * math.asin(math.sqrt(h))


def download_sea(box=SEA_BOX):
    roads.BOX = box
    roads.BOXES = [box]
    roads.PREFIX = f'release/{RELEASE}/theme=base/type=bathymetry/'
    roads.COLUMNS = ['id', 'depth', 'geometry', 'bbox']
    print(f'Seewege: lade Tiefen im Ausschnitt {box} …', file=sys.stderr)
    return roads.download()


def build_sea(table, box=SEA_BOX, grid=SEA_GRID, lane_list=SEA_LANES):
    import numpy as np

    SEA_BOX, SEA_GRID = box, grid
    x0, x1, y0, y1 = SEA_BOX
    window = shapely.box(x0, y0, x1, y1)
    rows = table.select(['depth', 'geometry']).to_pylist()
    by_depth = defaultdict(list)
    for row in rows:
        geom = shapely.from_wkb(row['geometry'])
        if geom.intersects(window):
            by_depth[row['depth']].append(geom)
    nx, ny = int(round((x1 - x0) / SEA_GRID)), int(round((y1 - y0) / SEA_GRID))
    xs = x0 + (np.arange(nx) + 0.5) * SEA_GRID
    ys = y0 + (np.arange(ny) + 0.5) * SEA_GRID
    gx, gy = np.meshgrid(xs, ys)
    cost = np.full((ny, nx), np.inf)
    sea = None
    # Von flach nach tief: jede tiefere Fläche überschreibt die Kosten.
    for depth, c in sorted(SEA_DEPTH_COST):
        polys = [g for d, gs in by_depth.items() if d == depth for g in gs]
        if not polys:
            raise SystemExit(f'Keine Tiefenflächen ab {depth} m im Ausschnitt')
        area = shapely.union_all(polys)
        shapely.prepare(area)
        if depth == 0:
            sea = area
        inside = shapely.contains_xy(area, gx, gy)
        cost[inside] = c
    print(f'Raster {nx} × {ny}, {int(np.isfinite(cost).sum())} Zellen auf See', file=sys.stderr)

    def cell_of(lng, lat):
        return int((lat - y0) // SEA_GRID), int((lng - x0) // SEA_GRID)

    def center(cell):
        r, c = cell
        return (float(xs[c]), float(ys[r]))

    def nearest_sea_cell(lng, lat):
        r0, c0 = cell_of(lng, lat)
        best = None
        for rad in range(0, 40):
            for r in range(r0 - rad, r0 + rad + 1):
                for c in range(c0 - rad, c0 + rad + 1):
                    if 0 <= r < ny and 0 <= c < nx and np.isfinite(cost[r, c]):
                        d = haversine((lng, lat), center((r, c)))
                        if best is None or d < best[0]:
                            best = (d, (r, c))
            if best:
                return best[1]
        raise SystemExit(f'Kein Wasser bei {lng}, {lat}')

    step_m = {}

    def step(r, dr, dc):
        key = (r, dr, dc)
        if key not in step_m:
            lat = float(ys[r])
            step_m[key] = math.hypot(dc * SEA_GRID * 111_320 * math.cos(math.radians(lat)), dr * SEA_GRID * 111_320)
        return step_m[key]

    def astar(src, dst):
        tx, ty = center(dst)
        best = {src: 0.0}
        prev = {}
        heap = [(0.0, 0.0, src)]
        while heap:
            _, g, cell = heapq.heappop(heap)
            if cell == dst:
                break
            if g > best[cell] + 1e-6:
                continue
            r, c = cell
            for dr in (-1, 0, 1):
                for dc in (-1, 0, 1):
                    if not dr and not dc:
                        continue
                    nr, nc = r + dr, c + dc
                    if not (0 <= nr < ny and 0 <= nc < nx) or not np.isfinite(cost[nr, nc]):
                        continue
                    ng = g + step(r, dr, dc) * (cost[r, c] + cost[nr, nc]) / 2
                    if ng < best.get((nr, nc), math.inf):
                        best[(nr, nc)] = ng
                        prev[(nr, nc)] = cell
                        h = haversine(center((nr, nc)), (tx, ty))
                        heapq.heappush(heap, (ng + h, ng, (nr, nc)))
        if dst not in best:
            raise SystemExit(f'Kein Seeweg von {center(src)} nach {center(dst)}')
        path = [dst]
        while path[-1] != src:
            path.append(prev[path[-1]])
        return list(reversed(path))

    def sample_ok(a, b, limit):
        n = max(1, int(haversine(a, b) // SEA_SAMPLE_METERS))
        for k in range(n + 1):
            t = k / n
            lng, lat = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            r, c = cell_of(lng, lat)
            if not (0 <= r < ny and 0 <= c < nx) or cost[r, c] > limit:
                return False
        return True

    def straighten(cells):
        pts = [center(x) for x in cells]
        costs = [cost[x] for x in cells]
        out = [pts[0]]
        i = 0
        while i < len(pts) - 1:
            j = len(pts) - 1
            while j > i + 1:
                limit = max(costs[i : j + 1])
                if sample_ok(pts[i], pts[j], limit) and sea.covers(shapely.LineString([pts[i], pts[j]])):
                    break
                j -= 1
            out.append(pts[j])
            i = j
        return out

    lanes = []
    for a, b, name in lane_list:
        (_, ax, ay), (_, bx, by) = SEA_NODES[a], SEA_NODES[b]
        for key, x, y in ((a, ax, ay), (b, bx, by)):
            if not sea.contains(shapely.Point(x, y)):
                raise SystemExit(f'Knoten {key} ({x}, {y}) liegt nicht auf See')
        cells = astar(nearest_sea_cell(ax, ay), nearest_sea_cell(bx, by))
        pts = [(ax, ay), *straighten(cells), (bx, by)]
        # Doppelte Punkte am Anfang und Ende weg.
        pts = [p for i, p in enumerate(pts) if i == 0 or haversine(p, pts[i - 1]) > 50]
        for p, q in zip(pts, pts[1:]):
            if not sea.buffer(1e-6).covers(shapely.LineString([p, q])):
                raise SystemExit(f'{name}: Abschnitt {p} -> {q} verlässt das Meer')
        km = sum(haversine(p, q) for p, q in zip(pts, pts[1:])) / 1000
        print(f'{name}: {km:.0f} km, {len(pts)} Punkte (aus {len(cells)} Zellen)', file=sys.stderr)
        lanes.append((a, b, name, km, pts))
    return lanes


SEA_OUT = os.path.join(HERE, '..', 'seaways.ts')


def write_sea(lanes):
    nodes = ''.join(
        f"  {key}: {{ name: '{name}', lng: {lng}, lat: {lat} }},\n" for key, (name, lng, lat) in SEA_NODES.items()
    )
    body = ''.join(
        f"  {{\n    from: '{a}',\n    to: '{b}',\n    name: '{name}',\n    km: {km:.1f},\n"
        f"    path: {roads.ts_string(roads.encode_line(pts))},\n  }},\n"
        for a, b, name, km, pts in lanes
    )
    ports = ''.join(f"  {key}: '{spec['sea']}',\n" for key, spec in WATERWAYS.items() if spec.get('sea'))
    head = '\n'.join(f'// {name}: {km:.0f} km, {len(pts)} Punkte.' for _, _, name, km, pts in lanes)
    costs = ', '.join(f'ab {d} m {c}' for d, c in SEA_DEPTH_COST)
    text = f"""// Automatisch erzeugt von tools/build-water.py --sea. Nicht von Hand ändern, sondern das Skript anpassen.
//
// Quelle: Overture Maps, Release {RELEASE}
//   Overture Maps Foundation, Thema "base", Typ "bathymetry" (https://docs.overturemaps.org), abgeleitet von ETOPO
//   (NOAA) und GLOBathy. Lizenz: CC0 bzw. gemeinfrei, © Overture Maps Foundation.
// Günstigster Weg über ein Raster von {SEA_GRID} Grad, Kosten pro Meter nach Tiefe ({costs}), gerade gezogen,
// solange die Gerade im gleich tiefen Wasser bleibt; jeder Abschnitt liegt ganz auf See.
{head}
//
// Format: SEA_NODES sind Knoten (Häfen der Produzenten, Engstellen, Beginn der Wege in die Häfen), SEA_LANES die Wege
// dazwischen im Polyline-Format (1e-5 Grad, erster Punkt absolut, dann Abstände, wie WATERWAYS). SEA_PORTS: an welchem
// Knoten der Weg in einen Hafen (WATERWAYS) beginnt.

export const SEA_NODES: Readonly<Record<string, {{ name: string; lng: number; lat: number }}>> = {{
{nodes}}};

export const SEA_LANES: readonly {{ from: string; to: string; name: string; km: number; path: string }}[] = [
{body}];

export const SEA_PORTS: Readonly<Record<string, string>> = {{
{ports}}};
"""
    with open(SEA_OUT, 'w', encoding='utf-8') as f:
        f.write(text)
    print(f'{SEA_OUT}: {len(text) // 1024} KB', file=sys.stderr)


if __name__ == '__main__':
    args = sys.argv[1:]
    if args[:1] == ['--sea']:
        # --sea [bathymetry.parquet]: nur die Seewege (seaways.ts).
        # --sea [bathymetry.parquet [ocean.parquet]]: dazu die Wege über den Atlantik (OCEAN_BOX, Auftrag 42).
        place_port_nodes()
        SEA_NODES.update(OCEAN_NODES)
        table = pq.read_table(args[1]) if len(args) > 1 else download_sea()
        lanes = build_sea(table)
        ocean = pq.read_table(args[2]) if len(args) > 2 else download_sea(OCEAN_BOX)
        lanes += build_sea(ocean, OCEAN_BOX, OCEAN_GRID, OCEAN_LANES)
        write_sea(lanes)
        sys.exit(0)
    files = args
    results = {}
    for i, key in enumerate(WATERWAYS):
        table = pq.read_table(files[i]) if i < len(files) else download(key)
        results[key] = build(key, table)
    write(results)

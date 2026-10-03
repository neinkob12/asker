# Erzeugt src/modules/roads/waterways.ts: die Wasserwege der Schiffe aus echten Daten statt von Hand gezeichnet.
#
#   Rotterdam -> Köln:    Nieuwe Maas, Noord, Beneden Merwede, Waal, Rhein (Hauptfahrwasser) bis zum Niehler Hafen
#   Nordsee   -> Hamburg: Elbe ab Cuxhaven bis zum Liegeplatz im Hamburger Hafen
#
# Aufruf (aus dem Repo-Root, braucht Python 3.10+ mit pyarrow und shapely, wie build-roads.py):
#   .venv-roads/bin/python src/modules/roads/tools/build-water.py                 lädt die Daten (einige Minuten)
#   .venv-roads/bin/python src/modules/roads/tools/build-water.py rhein.parquet elbe.parquet   nimmt geladene Daten
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
        ],
        # Vorläufiger Liegeplatz in der Norderelbe an den Landungsbrücken. Wird an den Hafen aus CITIES (Auftrag 30,
        # portId) angepasst, sobald es ihn gibt.
        'bridge': [(9.969, 53.5446)],
    },
}

LAT_FOR_M = {'koeln': 51.4, 'hamburg': 53.6}


def proj(lat0):
    m_lng = 111_320.0 * math.cos(math.radians(lat0))
    return (lambda x, y: (x * m_lng, y * 111_320.0)), m_lng


def download(key):
    spec = WATERWAYS[key]
    roads.BOX = spec['box']
    roads.PREFIX = f'release/{RELEASE}/theme=base/type=water/'
    roads.COLUMNS = COLUMNS
    print(f'{spec["name"]}: lade Wasser im Ausschnitt {spec["box"]} …', file=sys.stderr)
    return roads.download()


def build(key, table):
    spec = WATERWAYS[key]
    to_m, _ = proj(LAT_FOR_M[key])
    rows = table.select(['subtype', 'class', 'names', 'geometry']).to_pylist()
    lines = []
    polygons = []
    for row in rows:
        geom = shapely.from_wkb(row['geometry'])
        if geom.geom_type in ('Polygon', 'MultiPolygon'):
            polygons.append(geom)
            continue
        if row['subtype'] not in SUBTYPES or row['class'] not in CLASSES:
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
        if cls == 'river':
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
    bridge = [route[-1], *spec['bridge']]
    for a, b in zip(bridge, bridge[1:]):
        piece = shapely.LineString([a, b])
        near = [polygons[int(i)] for i in water.query(piece)]
        if not near or not shapely.union_all(near).buffer(1e-6).covers(piece):
            raise SystemExit(f'{spec["name"]}: Brücke {a} -> {b} liegt nicht ganz im Wasser')
    count = len(spec['bridge'])
    notes.append(
        ('der letzte Punkt' if count == 1 else f'die letzten {count} Punkte')
        + ' bis zum Liegeplatz von Hand (Hafenbecken haben keine Mittellinie), ganz im Wasser'
    )
    route += list(spec['bridge'])

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
                keep = [(x / proj(LAT_FOR_M[key])[1], y / 111_320.0) for x, y in simple.coords]
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


if __name__ == '__main__':
    files = sys.argv[1:]
    results = {}
    for i, key in enumerate(WATERWAYS):
        table = pq.read_table(files[i]) if i < len(files) else download(key)
        results[key] = build(key, table)
    write(results)

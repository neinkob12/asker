# Lädt Stadtteilgrenzen aus Overture Maps (Thema "divisions", Typ "division_area") für eine Stadt und schreibt sie als
# GeoJSON, das tools/build-boundaries.mjs weiterverarbeitet (Auftrag 30, Hamburg).
#
# Aufruf (aus dem Repo-Root, braucht Python 3.10+ mit pyarrow und shapely, siehe roads/tools/build-roads.py):
#   .venv-roads/bin/python src/modules/veedel/tools/fetch-divisions.py hamburg /tmp/hamburg-stadtteile.geojson
#   node src/modules/veedel/tools/build-boundaries.mjs --city hamburg /tmp/hamburg-stadtteile.geojson
#
# Quelle: Overture Maps Foundation, Thema "divisions", Typ "division_area" (https://docs.overturemaps.org), abgeleitet
# von OpenStreetMap. Lizenz: ODbL 1.0 (https://opendatacommons.org/licenses/odbl/), © OpenStreetMap-Mitwirkende,
# © Overture Maps Foundation. Der Auftrag nannte zuerst die Verwaltungsgrenzen der Freien und Hansestadt Hamburg (WFS
# des LGV); der Dienst war aus der Entwicklungsumgebung nicht erreichbar, deshalb Overture (wie im Auftrag als Ausweg
# vorgesehen). Geladen wird nur der Ausschnitt um die Stadt per HTTP-Range-Anfragen aus dem öffentlichen S3-Bucket.
#
# Nimmt die Landflächen (is_land), damit Elbe und Hafenbecken nicht zum Stadtteil gehören, und gibt pro gesuchtem
# Namen die größte passende Fläche aus (Stadtteile haben in OSM admin_level 10).

import io
import json
import os
import re
import ssl
import sys
import urllib.request
import concurrent.futures as cf

import pyarrow as pa
import pyarrow.parquet as pq
import shapely

RELEASE = '2026-09-23.1'
BASE = 'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/'
PREFIX = f'release/{RELEASE}/theme=divisions/type=division_area/'
COLUMNS = ['id', 'names', 'subtype', 'class', 'geometry', 'bbox', 'is_land', 'country']

CITIES = {
    # xmin, xmax, ymin, ymax und die Namen der Stadtteile, wie sie in OSM heißen.
    'hamburg': {
        'box': (9.70, 10.15, 53.40, 53.65),
        'names': [
            'St. Pauli',
            'Sternschanze',
            'Altona-Altstadt',
            'Ottensen',
            'St. Georg',
            'HafenCity',
            'Eimsbüttel',
            'Eppendorf',
            'Barmbek-Süd',
            'Wilhelmsburg',
            'Harburg',
            'Blankenese',
        ],
    },
    # Frankfurt (Auftrag 39): von Höchst im Westen bis Bornheim, im Süden der Flughafen.
    'frankfurt': {
        'box': (8.45, 8.82, 49.99, 50.20),
        'names': [
            'Bahnhofsviertel',
            'Innenstadt',
            'Westend Süd',
            'Sachsenhausen Nord',
            'Nordend West',
            'Bornheim',
            'Ostend',
            'Gallus',
            'Bockenheim',
            'Höchst',
            'Niederrad',
            'Flughafen',
        ],
        # Die Altstadt (Römer, Paulskirche) ist in OSM ein eigener Stadtteil, im Spiel gehört sie zur Innenstadt.
        'merge': {'Innenstadt': ['Altstadt']},
    },
}

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


def list_keys():
    keys, token = [], None
    while True:
        url = BASE + f'?list-type=2&prefix={PREFIX}' + (f'&continuation-token={urllib.parse.quote(token)}' if token else '')
        xml = _opener.open(url).read().decode()
        keys += list(zip(re.findall(r'<Key>(.*?)</Key>', xml), map(int, re.findall(r'<Size>(.*?)</Size>', xml))))
        found = re.search(r'<NextContinuationToken>(.*?)</NextContinuationToken>', xml)
        if not found:
            return keys
        token = found.group(1)


def scan(args):
    (key, size), box = args
    pf = pq.ParquetFile(io.BufferedReader(RangeFile(BASE + key, size), buffer_size=1 << 20))
    tables = []
    for i in range(pf.metadata.num_row_groups):
        rg = pf.metadata.row_group(i)
        stats = {}
        for c in range(rg.num_columns):
            col = rg.column(c)
            if col.path_in_schema.startswith('bbox.') and col.statistics is not None and col.statistics.has_min_max:
                stats[col.path_in_schema] = (col.statistics.min, col.statistics.max)
        if len(stats) == 4 and (
            stats['bbox.xmin'][0] > box[1]
            or stats['bbox.xmax'][1] < box[0]
            or stats['bbox.ymin'][0] > box[3]
            or stats['bbox.ymax'][1] < box[2]
        ):
            continue
        t = pf.read_row_group(i, columns=COLUMNS)
        b = t.column('bbox').combine_chunks()
        mask = (
            (b.field('xmin').to_numpy() >= box[0])
            & (b.field('xmax').to_numpy() <= box[1])
            & (b.field('ymin').to_numpy() >= box[2])
            & (b.field('ymax').to_numpy() <= box[3])
        )
        t = t.filter(pa.array(mask))
        if t.num_rows:
            tables.append(t)
    return tables


def main():
    import urllib.parse  # noqa: F401 (für list_keys)

    city, out = sys.argv[1], sys.argv[2]
    conf = CITIES[city]
    keys = list_keys()
    print(f'{len(keys)} Dateien im Release {RELEASE}, suche {city} …', file=sys.stderr)
    tables = []
    with cf.ThreadPoolExecutor(16) as ex:
        for found in ex.map(scan, [(k, conf['box']) for k in keys]):
            tables += found
    rows = pa.concat_tables(tables).to_pylist() if tables else []
    print(f'{len(rows)} Flächen im Ausschnitt', file=sys.stderr)
    wanted = {n: None for n in conf['names']}
    # Stadtteile sind in Overture "macrohood" (OSM admin_level 10); gleichnamige Bezirke ("Harburg") sind "locality"
    # oder "county" und viel größer. Also: erst der passende Typ, dann die größte Fläche.
    rank = {'macrohood': 0, 'neighborhood': 1, 'microhood': 2}
    for row in rows:
        name = (row.get('names') or {}).get('primary')
        if name not in wanted or not row.get('is_land'):
            continue
        geom = shapely.from_wkb(row['geometry'])
        score = (rank.get(row.get('subtype'), 9), -geom.area)
        best = wanted[name]
        if best is None or score < best[2]:
            wanted[name] = (row, geom, score)
    # Kleine Stadtteile, die im Spiel zu einem Nachbarn gehören (merge): die Fläche mit diesem Namen, die den Nachbarn
    # berührt, wird angefügt.
    for base, extras in conf.get('merge', {}).items():
        if not wanted.get(base):
            continue
        row, geom, score = wanted[base]
        for extra in extras:
            for other in rows:
                if (other.get('names') or {}).get('primary') != extra or not other.get('is_land'):
                    continue
                g = shapely.from_wkb(other['geometry'])
                if g.distance(geom) < 1e-4:
                    geom = shapely.union(geom, g).buffer(0)
                    print(f'{extra} → {base}', file=sys.stderr)
                    break
        wanted[base] = (row, geom, score)
    missing = [n for n, v in wanted.items() if v is None]
    if missing:
        names = sorted({(r.get('names') or {}).get('primary') or '?' for r in rows if r.get('is_land')})
        print('Nicht gefunden: ' + ', '.join(missing), file=sys.stderr)
        print('Vorhanden: ' + ', '.join(names[:400]), file=sys.stderr)
    features = []
    for name, found in wanted.items():
        if not found:
            continue
        row, geom, _score = found
        features.append(
            {
                'type': 'Feature',
                'properties': {'name': name, 'subtype': row.get('subtype'), 'class': row.get('class'), 'id': row['id']},
                'geometry': json.loads(shapely.to_geojson(geom)),
            }
        )
        print(f'{name}: {row.get("subtype")} {geom.geom_type} {round(geom.area * 1e4, 2)}', file=sys.stderr)
    with open(out, 'w') as f:
        json.dump({'type': 'FeatureCollection', 'features': features}, f)
    print(f'{len(features)} Stadtteile → {out}', file=sys.stderr)


if __name__ == '__main__':
    import urllib.parse

    main()

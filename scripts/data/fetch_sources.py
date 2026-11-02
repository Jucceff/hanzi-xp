"""Descarga las fuentes de datos a data/raw/ (no versionado).

Uso:  python -I scripts/data/fetch_sources.py [--force]

- Temario oficial HSK 3.0 (edición 2025) desde la API de chinesetest.cn
- CC-CEDICT (CC BY-SA 4.0)
- Make Me a Hanzi dictionary.txt (Arphic Public License)
- Tatoeba: frases cmn, spa y enlaces cmn-spa (CC BY 2.0 FR)
- drkameleon/complete-hsk-vocabulary (MIT): solo se usa su campo de frecuencia
- LXGW WenKai (SIL OFL 1.1): tipografía para los hanzi

Escribe data/sources.lock.json (versionado) con URL, fecha y SHA-256 de cada archivo.
"""
import bz2
import datetime
import gzip
import hashlib
import json
import pathlib
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
LOCK = ROOT / "data" / "sources.lock.json"
UA = "hanzi-xp-data-builder/0.1 (+personal study app)"

API = "https://www.chinesetest.cn/api/hsk/outline/"
OFFICIAL_ENDPOINTS = ["glossaryPage", "hanziPage", "languagePage"]

FILES = {
    "cedict.txt": ("https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz", "gz"),
    "makemeahanzi.txt": ("https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt", None),
    "tatoeba_cmn.tsv": ("https://downloads.tatoeba.org/exports/per_language/cmn/cmn_sentences.tsv.bz2", "bz2"),
    "tatoeba_spa.tsv": ("https://downloads.tatoeba.org/exports/per_language/spa/spa_sentences.tsv.bz2", "bz2"),
    "tatoeba_cmn_spa_links.tsv": ("https://downloads.tatoeba.org/exports/per_language/cmn/cmn-spa_links.tsv.bz2", "bz2"),
    "drkameleon_complete.json": ("https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.min.json", None),
    # Tipografía china (SIL OFL 1.1); se subconjunta a los caracteres usados
    "LXGWWenKai-Regular.ttf": ("https://github.com/lxgw/LxgwWenKai/releases/download/v1.530/LXGWWenKai-Regular.ttf", None),
    "LXGWWenKai-OFL.txt": ("https://raw.githubusercontent.com/lxgw/LxgwWenKai/main/OFL.txt", None),
}


def http(url: str, method: str = "GET") -> bytes:
    req = urllib.request.Request(url, data=b"" if method == "POST" else None, method=method, headers={
        "User-Agent": UA, "Accept": "*/*", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read()
    except urllib.error.URLError as e:
        # Algunos CDN (p. ej. los assets de GitHub) fallan con el almacén de certificados
        # de Python en Windows; curl usa el del sistema. Nunca se desactiva la verificación.
        if method != "GET" or "CERTIFICATE" not in str(e):
            raise
        return subprocess.run(["curl", "-sSfL", "--max-time", "600", url], check=True, capture_output=True).stdout


def fetch_official(endpoint: str) -> list:
    records, page = [], 1
    while True:
        url = f"{API}{endpoint}?" + urllib.parse.urlencode({"current": page, "size": 1000})
        body = json.loads(http(url, "POST").decode("utf-8"))
        if body.get("code") != 0:
            raise SystemExit(f"{endpoint}: código de API {body.get('code')}")
        data = body["data"]
        records += data["records"]
        if page >= data["pages"]:
            break
        page += 1
    if len(records) != data["total"]:
        raise SystemExit(f"{endpoint}: {len(records)} registros, la API dice {data['total']}")
    return records


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def main() -> None:
    force = "--force" in sys.argv
    RAW.mkdir(parents=True, exist_ok=True)
    lock = {"fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "files": {}}

    for ep in OFFICIAL_ENDPOINTS:
        out = RAW / f"official_{ep}.json"
        if force or not out.exists():
            print(f"API oficial: {ep}...")
            out.write_text(json.dumps(fetch_official(ep), ensure_ascii=False), encoding="utf-8")
        b = out.read_bytes()
        lock["files"][out.name] = {"url": f"{API}{ep}", "sha256": sha(b), "records": len(json.loads(b))}

    for name, (url, comp) in FILES.items():
        out = RAW / name
        if force or not out.exists():
            print(f"Descargando {name}...")
            b = http(url)
            if comp == "gz":
                b = gzip.decompress(b)
            elif comp == "bz2":
                b = bz2.decompress(b)
            out.write_bytes(b)
        lock["files"][name] = {"url": url, "sha256": sha(out.read_bytes())}

    LOCK.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK -> {LOCK.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

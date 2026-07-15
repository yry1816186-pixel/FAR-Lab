#!/usr/bin/env python3
"""FAR-Chain online dataset fetcher (P1-6).

Protocol (stdin -> stdout, both JSON):
  Request:  {"resolver": "lightkurve"|"astroquery.mast", "host": "...",
             "version": "...", "ticId": "TIC...", "sector": 1}
  Response: {"ok": true, "resolver": "...", "host": "...", "version": "...",
             "contentHash": "<sha256>", "retrievedAt": "<ISO8601>",
             "ticId": "...", "sector": 1}
         or {"ok": false, "error": "..."}

Host whitelist enforced via check_host BEFORE any heavy import (so the host-gate works
without lightkurve/astroquery installed). On the whitelisted path, the resolver fetches real
data, serializes the resulting astropy Table to canonical ECSV bytes, and sha256-hashes them.

Honesty (02 F1 never-fabricate): missing lightkurve/astroquery or any network failure yields
{"ok": false}; the caller (dataset_resolver.fetchOnlineDataset) maps that to null and falls
back to cached_fixture. The script never fabricates a content hash.
"""

from __future__ import annotations

import hashlib
import io
import json
import sys
import traceback
from datetime import datetime, timezone

ALLOWED_HOSTS = {"mast.stsci.edu", "heasarc.gsfc.nasa.gov"}


def emit(result: dict[str, object]) -> None:
    text = json.dumps(result, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    sys.stdout.write(text)
    sys.stdout.write("\n")
    sys.stdout.flush()


def check_host(host: str) -> bool:
    return host in ALLOWED_HOSTS


def now_iso_ms() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def table_to_ecsv_bytes(table: object) -> bytes:
    buf = io.StringIO()
    table.write(buf, format="ascii.ecsv")  # type: ignore[attr-defined]
    return buf.getvalue().encode("utf-8")


def fetch_lightkurve(tic_id: str, sector: object) -> bytes:
    import lightkurve as lk  # lazy import: host-gate must work without the dep

    if not tic_id:
        raise ValueError("lightkurve resolver requires ticId")
    target = "TIC " + tic_id
    search = lk.search_lightcurve(target, sector=sector)
    if search is None or len(search) == 0:
        raise RuntimeError("no_lightcurves_found")
    lc = search[0].download()
    return table_to_ecsv_bytes(lc.to_table())


def fetch_astroquery(tic_id: str, sector: object) -> bytes:
    from astroquery.mast import Catalogs  # lazy import

    if not tic_id:
        raise ValueError("astroquery.mast resolver requires ticId")
    target = "TIC " + tic_id
    catalog_data = Catalogs.query_object(target, catalog="TIC")
    return table_to_ecsv_bytes(catalog_data)


def main() -> None:
    try:
        raw = sys.stdin.read()
        cfg = json.loads(raw) if raw else {}
        host = str(cfg.get("host", ""))
        if not check_host(host):
            emit({"ok": False, "error": "host_not_whitelisted", "host": host})
            return

        resolver = str(cfg.get("resolver", ""))
        version = str(cfg.get("version", ""))
        tic_id = str(cfg.get("ticId", "") or "")
        sector = cfg.get("sector", None)
        if not isinstance(sector, int):
            sector = None

        try:
            if resolver == "lightkurve":
                content = fetch_lightkurve(tic_id, sector)
            elif resolver == "astroquery.mast":
                content = fetch_astroquery(tic_id, sector)
            else:
                emit({"ok": False, "error": f"unknown_resolver: {resolver}"})
                return
        except Exception as exc:  # noqa: BLE001
            emit({"ok": False, "error": f"fetch_failed: {exc}"})
            return

        result: dict[str, object] = {
            "ok": True,
            "resolver": resolver,
            "host": host,
            "version": version,
            "contentHash": hashlib.sha256(content).hexdigest(),
            "retrievedAt": now_iso_ms(),
        }
        if tic_id:
            result["ticId"] = tic_id
        if sector is not None:
            result["sector"] = sector
        emit(result)
    except Exception:  # noqa: BLE001
        emit({"ok": False, "error": f"fatal: {traceback.format_exc()}"})


if __name__ == "__main__":
    main()

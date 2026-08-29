"""NetCDF dataset profiling + QC (AOSSA slice: scientific data plane, scenario B).

Read-only, bounded inspection of a local NetCDF file via xarray:
- structure: dims, coords (units/attrs), data variables (dtype/shape/units),
  global attributes, deterministic canonical-serialization hash;
- QC at record time: per-variable NaN/Inf counts and fractions, physical
  range probes, time-coordinate monotonicity, empty-variable detection.

The op REPORTS measurements only; admission/lineage decisions live in TS
(experiment.ts discipline: deterministic code owns identity and verdicts).
"""
from __future__ import annotations

import json
from typing import Any


_MAX_VARS = 64
_MAX_DIMS = 16
_MAX_ATTR_ITEMS = 32
def _assert_local_path(path: str) -> None:
    """Op-layer defense-in-depth (security audit W2): a netcdf op only ever
    opens a plain absolute local path. URIs (netcdf4's DAP support would fire
    an outbound request), relative paths, and paths outside FARLAB_DATA_ROOT
    (when set) are rejected before xr.open_dataset sees them. The TS boundary
    enforces the same rule; this is the second, independent gate."""
    import os
    if "://" in path:
        raise ValueError(f"netcdf op requires a local path, not a URI: {path}")
    if not os.path.isabs(path):
        raise ValueError(f"netcdf op requires an absolute path (got relative: {path})")
    root = os.environ.get("FARLAB_DATA_ROOT", "").strip()
    if root:
        root_r = os.path.realpath(root)
        resolved = os.path.realpath(path)
        if resolved != root_r and not resolved.startswith(root_r + os.sep):
            raise ValueError(f"netcdf op path escapes FARLAB_DATA_ROOT ({root}): {path}")
    size = os.path.getsize(path)
    if size > 200 * 1024 * 1024:
        raise ValueError(f"netcdf file exceeds 200MB: {path} ({size} bytes)")


def _attrs_bounded(attrs: dict) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in list(attrs.items())[:_MAX_ATTR_ITEMS]:
        if isinstance(v, (int, float, str, bool)):
            out[str(k)] = v
        else:
            out[str(k)] = str(v)[:200]
    return out


def op_netcdf_profile(payload: dict[str, Any]) -> dict[str, Any]:
    import numpy as np
    import xarray as xr
    _assert_local_path(payload["path"])


    path = payload["path"]
    open_kwargs: dict[str, Any] = {"decode_times": True}
    ds = xr.open_dataset(path, **open_kwargs)
    try:
        dims = {str(k): int(v) for k, v in list(ds.sizes.items())[:_MAX_DIMS]}
        coords: list[dict[str, Any]] = []
        for name, c in list(ds.coords.items())[:_MAX_DIMS]:
            entry: dict[str, Any] = {
                "name": str(name),
                "dtype": str(c.dtype),
                "size": int(c.size),
                "attrs": _attrs_bounded(c.attrs),
            }
            unit = c.attrs.get("units")
            if isinstance(unit, str):
                entry["units"] = unit
            vals = np.asarray(c.values)
            if vals.size > 0 and np.issubdtype(vals.dtype, np.number):
                finite = vals[np.isfinite(vals)]
                entry["min"] = float(finite.min()) if finite.size else None
                entry["max"] = float(finite.max()) if finite.size else None
                entry["monotonic"] = bool(np.all(np.diff(vals) > 0) or np.all(np.diff(vals) < 0)) if vals.size > 1 else None
            coords.append(entry)

        variables: list[dict[str, Any]] = []
        qc_findings: list[dict[str, Any]] = []
        for name, v in list(ds.data_vars.items())[:_MAX_VARS]:
            arr = np.asarray(v.values)
            entry = {
                "name": str(name),
                "dtype": str(v.dtype),
                "shape": list(arr.shape),
                "dims": [str(d) for d in v.dims],
                "attrs": _attrs_bounded(v.attrs),
            }
            unit = v.attrs.get("units")
            if isinstance(unit, str):
                entry["units"] = unit
            if arr.size > 0 and np.issubdtype(arr.dtype, np.number):
                nan_count = int(np.isnan(arr).sum()) if np.issubdtype(arr.dtype, np.floating) else 0
                inf_count = int(np.isinf(arr).sum())
                finite = arr[np.isfinite(arr)]
                entry["nanCount"] = nan_count
                entry["infCount"] = inf_count
                entry["missingFraction"] = float((nan_count + inf_count) / arr.size)
                entry["min"] = float(finite.min()) if finite.size else None
                entry["max"] = float(finite.max()) if finite.size else None
                # QC findings (reported; the TS admission layer decides)
                if nan_count + inf_count == arr.size:
                    qc_findings.append({"variable": str(name), "kind": "all_nonfinite", "detail": "every value is NaN/Inf"})
                elif entry["missingFraction"] > 0.5:
                    qc_findings.append({"variable": str(name), "kind": "majority_missing", "fraction": entry["missingFraction"]})
                if inf_count > 0:
                    qc_findings.append({"variable": str(name), "kind": "inf_values", "count": inf_count})
            variables.append(entry)

        # Time-coordinate monotonicity finding (drift/ordering issues).
        for c in coords:
            if c.get("monotonic") is False and str(c.get("name")) in {str(x) for x in ds.coords} and "time" in str(c.get("name", "")).lower():
                qc_findings.append({"variable": str(c["name"]), "kind": "time_not_monotonic", "detail": "time coordinate is not strictly monotonic"})

        # Deterministic structure hash: canonical JSON over dims/coords/vars
        # names+dtypes+attrs (NOT the data payload — identity of the CONTENT
        # is the file sha256 recorded by the TS acquisition layer).
        structure = {
            "dims": dims,
            "coords": [(c["name"], c.get("dtype"), c.get("units")) for c in coords],
            "vars": [(v["name"], v["dtype"], tuple(v["shape"]), v.get("units")) for v in variables],
            "globalAttrs": _attrs_bounded(ds.attrs),
        }
        import hashlib

        structure_hash = hashlib.sha256(json.dumps(structure, sort_keys=True, default=str).encode("utf-8")).hexdigest()

        return {
            "path": path,
            "dims": dims,
            "coords": coords,
            "variables": variables,
            "globalAttrs": _attrs_bounded(ds.attrs),
            "structureHash": structure_hash,
            "qcFindings": qc_findings,
            "nDataVars": len(ds.data_vars),
            "engine": "xarray/netcdf4",
        }
    finally:
        ds.close()


def op_netcdf_extract_features(payload: dict[str, Any]) -> dict[str, Any]:
    """Derive a tabular feature CSV from a NetCDF variable (bounded, deterministic).

    feature modes (closed enum):
      - global_mean_timeseries: one row per time step = variable mean over space
        (columns: time, value) — honest aggregate, no spatial structure claimed;
      - monthly_mean_per_gridpoint: one row per (time-month, lat, lon) cell —
        spatial features for ML (capped rows);
      - flatten_all: raw (time, lat, lon, value) rows (capped).

    The returned CSV text is DATA: the TS side content-addresses it as a derived
    DatasetRecord with lineage pointing at the raw NetCDF ref (no second truth).
    """
    import numpy as np
    import xarray as xr

    path = payload["path"]
    _assert_local_path(path)
    variable = str(payload["variable"])
    feature = payload["feature"]
    max_rows = int(payload.get("maxRows", 50000))
    if feature not in ("global_mean_timeseries", "monthly_mean_per_gridpoint", "flatten_all"):
        raise ValueError(f"unknown netcdf feature mode {feature!r}")

    ds = xr.open_dataset(path, decode_times=True)
    try:
        if variable not in ds.data_vars:
            raise ValueError(f"variable {variable!r} not in file (vars: {list(ds.data_vars)})")
        v = ds[variable]

        if feature == "global_mean_timeseries":
            series = v.mean(dim=[d for d in v.dims if d != "time"], skipna=True)
            rows = ["time,value"]
            tvals = ds["time"].values if "time" in ds.coords else np.arange(series.size)
            for i, val in enumerate(series.values):
                if i >= max_rows:
                    break
                t = tvals[i]
                ts = str(np.datetime64(t, "D")) if np.issubdtype(np.asarray(t).dtype, np.datetime64) else str(t)
                rows.append(f"{ts},{float(val):.6g}")
            return {"csv": "\n".join(rows) + "\n", "nRows": len(rows) - 1, "feature": feature, "variable": variable}

        if feature == "monthly_mean_per_gridpoint":
            if "time" not in ds.coords:
                raise ValueError("monthly_mean_per_gridpoint requires a time coordinate")
            monthly = v.resample(time="1MS").mean(skipna=True)
            spatial_dims = [d for d in monthly.dims if d != "time"]
            stacked = monthly.stack(cell=tuple(spatial_dims)) if spatial_dims else monthly.expand_dims(cell=[0])
            # stack(cell=(lat, lon)) flattens row-major over the SPATIAL dims in
            # the variable's dim order -> ci = lat_idx * lon_size + lon_idx.
            lat = ds["lat"].values if "lat" in ds.coords else None
            lon = ds["lon"].values if "lon" in ds.coords else None
            lon_size = int(lon.size) if lon is not None else (stacked.shape[1] if lat is not None else 1)
            rows = ["time,lat,lon,value"]
            count = 0
            tvals = monthly["time"].values
            for ti in range(stacked.shape[0]):
                ts = str(np.datetime64(tvals[ti], "D"))
                for ci in range(stacked.shape[1]):
                    val = float(stacked.values[ti, ci])
                    if not np.isfinite(val):
                        continue
                    if count >= max_rows:
                        break
                    la = float(lat[ci // lon_size]) if lat is not None else float(ci)
                    lo = float(lon[ci % lon_size]) if lon is not None else 0.0
                    rows.append(f"{ts},{la:.5g},{lo:.5g},{val:.6g}")
                    count += 1
                if count >= max_rows:
                    break
            return {"csv": "\n".join(rows) + "\n", "nRows": count, "feature": feature, "variable": variable}

        # flatten_all
        flat = v.values.reshape(-1)
        rows = ["value"]
        count = 0
        for val in flat:
            if not np.isfinite(val):
                continue
            if count >= max_rows:
                break
            rows.append(f"{float(val):.6g}")
            count += 1
        return {"csv": "\n".join(rows) + "\n", "nRows": count, "feature": feature, "variable": variable}
    finally:
        ds.close()

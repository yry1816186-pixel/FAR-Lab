# Scientific Tool Plane

FAR-Lab executes scientific tools through the pinned Python sidecar. Every
operation is schema-validated before execution and returns `provenance:
COMPUTED`; the response also includes the Python package versions and the
`uv.lock` hash used for that call.

## Current operations

| Operation | Capability | Runtime |
| --- | --- | --- |
| `data_profile` | Mixed tabular profiling: type, missingness, cardinality, distribution quantiles and IQR outliers | NumPy + deterministic runtime | 
| `dataframe_groupby` | Deterministic group-by count and mean over tabular JSON rows | pandas |
| `ols_regression` | Ordinary least squares coefficients, uncertainty, p-values and R-squared | statsmodels |
| `parquet_roundtrip` | Arrow/Parquet serialization and read-back validation with compressed bytes | pyarrow |
| `hdf5_roundtrip` | HDF5 dataset serialization and read-back shape validation | h5py |
| `plot` | Line, scatter, histogram and bar plots as SVG or PNG bytes | Matplotlib Agg |
| `torch_train_cpu` | Deterministic CPU MLP regression with checkpoint hash and reload-loss verification | PyTorch CPU |
| `torch_predict_cpu` | Verified checkpoint loading and CPU inference with optional evaluation metrics | PyTorch CPU |
| `torch_resume_cpu` | CPU training continuation with model and optimizer state restored from checkpoint | PyTorch CPU |
| `plot_svg` | Small dependency-free SVG plot for low-latency previews | FAR-Lab SVG renderer |
| `train_eval` | Leak-safe tabular classification/regression and preregistered metrics | scikit-learn |
| `dataset_audit` | Duplicate, train/test leakage and label-issue checks | cleanlab + scikit-learn |
| `paired_stats`, `abs_stats` | Paired tests and bootstrap confidence intervals | SciPy |
| `simulate` | Seeded Monte Carlo templates with common random numbers | NumPy |
| `fem_poisson_2d`, `ode_integrate` | Numerical PDE and ODE execution with convergence/trajectory artifacts | NumPy + SciPy |
| `netcdf_profile`, `netcdf_extract_features` | Gridded scientific data inspection and feature extraction | xarray + netCDF4 |

The executable public registry is available at `GET /api/v1/science/operations`.
Compute requests use `POST /api/v1/science/compute`.

Example plot request:

```json
{
  "operation": "plot",
  "input": {
    "kind": "scatter",
    "format": "png",
    "x": [0, 1, 2],
    "y": [1.2, 1.8, 2.4],
    "title": "Calibration"
  }
}
```

The result contains `mimeType`, `contentBase64`, `bytes`, `sha256`, and runtime
identity. Callers that need an auditable run artifact should put the returned
bytes into the run's `ArtifactStore` and record the operation parameters and
hash in the run event log.

## Explicit boundaries

This plane is real but intentionally bounded. It does not claim arbitrary code
execution or universal domain coverage. GPU/distributed training, optimizer-state
resume, model registries, Bayesian MCMC, time-series packages, Zarr, and
publisher-specific figure policies remain separate integration batches. Each
batch must add a real sidecar operation, deterministic schema,
artifact/provenance contract, failure-path tests, and a real workflow before
being listed here.

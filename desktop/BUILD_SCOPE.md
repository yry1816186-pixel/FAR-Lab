# Desktop build artifact scope

The CI artifacts named `desktop-compile-only-*` prove that the Tauri shell's
native tests and platform bundlers completed on the named hosted runner. They
are **not public release artifacts** and are not evidence that FAR-Lab can run
standalone after installation.

Current hard boundary:

- the Rust shell derives the repository root from compile-time
  `CARGO_MANIFEST_DIR`;
- it launches `node scripts/serve.mjs` from that source tree;
- Tauri embeds the built frontend, but the current window does not use those
  embedded assets: it opens the loopback server, which still reads `web/dist`
  from the compile-time source checkout;
- the Node backend, experiment runtime, and a Node runtime are not packaged as
  application resources or sidecars;
- Windows bundles are unsigned, Linux bundles are unsigned, and the macOS CI
  bundle uses Tauri's ad-hoc signing identity (`-`), not Developer ID signing
  or Apple notarization;
- install, launch outside the checkout, upgrade, uninstall cleanup, and the
  complete desktop user journey remain `UNVERIFIED` for these artifacts.

A public desktop release requires a packaged and supervised backend/experiment
sidecar, an off-source-tree end-to-end test on each platform, updater and
uninstall behavior, and the platform signing/notarization disclosures and
evidence appropriate to the published build.

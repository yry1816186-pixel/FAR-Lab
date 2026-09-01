// FAR-Lab desktop shell (Tauri v2). One job only (PRODUCT_HCI §1.2: a desktop
// wrapper is a RUN SURFACE, not a second brain):
//   1. locate the repo root (compile-time CARGO_MANIFEST_DIR ancestor)
//   2. if the local API server is not already healthy, spawn `node scripts/serve.mjs`
//   3. wait for GET /api/v1/health -> 200 (real readiness, no fake progress)
//   4. open a webview window on the served workbench (same web/dist the browser uses)
//   5. on app exit, terminate the spawned server (fail-safe Drop guard)
// B10 product integration: system tray (open/quit), single instance (re-launch
// focuses the running app), window state persistence, global quick-capture
// hotkey (Alt+Shift+F -> welcome + focused question box), far:// deep links
// (far://run/<id> opens that run), and a native error dialog when the server
// cannot start (no silent white-screen exits on double-click launches).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::TcpStream;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

struct ServerGuard(Option<Child>);
impl ServerGuard {
    fn terminate(&mut self) {
        if let Some(mut child) = self.0.take() {
            // Explicit controlled exit. Child::kill is forceful; the future
            // packaged-sidecar supervisor must add bounded graceful shutdown
            // before falling back to this guarantee.
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
impl Drop for ServerGuard {
    fn drop(&mut self) {
        self.terminate();
    }
}

/// Windows: put the spawned server in a Job Object with KILL_ON_JOB_CLOSE so a
/// force-killed shell (TerminateProcess — no Drop, no exit event) still takes the
/// node server down. The handle leaks intentionally: the OS closes it when this
/// process dies, which terminates every process in the job.
/// Linux: PDEATHSIG must be set in the child before exec — the only portable
/// hook is pre_exec (unsafe, single-threaded at this point: we are).
#[cfg(target_os = "linux")]
fn before_spawn(cmd: &mut Command) {
    use std::os::unix::process::CommandExt;
    unsafe {
        cmd.pre_exec(|| {
            libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGKILL);
            Ok(())
        });
    }
}
#[cfg(not(target_os = "linux"))]
fn before_spawn(_cmd: &mut Command) {}

#[cfg(windows)]
fn assign_kill_on_close(child: &Child) {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, SetInformationJobObject,
        JobObjectExtendedLimitInformation, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return;
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let ok = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const core::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        if ok != 0 {
            AssignProcessToJobObject(job, child.as_raw_handle() as _);
        }
        // Intentionally never CloseHandle(job).
    }
}
#[cfg(not(windows))]
fn assign_kill_on_close(_child: &Child) {}

struct ServerState(Mutex<ServerGuard>);

use std::path::Path;

/// Desktop-shell language: the few OS-level strings this binary shows itself
/// (fatal dialogs, native notifications) mirror the web/TUI default (zh);
/// FARLANG=en switches them, matching `resolveLang()` in the TUI.
fn lang_is_en(raw: Option<&str>) -> bool {
    raw.map(|v| v.to_ascii_lowercase().starts_with("en"))
        .unwrap_or(false)
}

fn shell_en() -> bool {
    lang_is_en(std::env::var("FARLANG").ok().as_deref())
}

fn repo_root() -> &'static str {
    // CARGO_MANIFEST_DIR (set by cargo at compile time in both `tauri dev` and
    // `tauri build`) points at desktop/src-tauri — the repo root is 2 levels up.
    // Leaked once: this runs before the event loop, exactly once.
    let manifest = option_env!("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR must be set by cargo");
    Box::leak(
        Path::new(manifest)
            .ancestors()
            .nth(2)
            .unwrap_or_else(|| Path::new(manifest))
            .to_path_buf()
            .into_boxed_path(),
    )
    .to_str()
    .expect("repo root must be valid UTF-8")
}

fn desktop_port() -> u16 {
    std::env::var("FARLAB_DESKTOP_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(4520)
}

/// Real readiness probe: TCP connect + one HTTP/1.0 GET /api/v1/health expecting 200.
fn http_health_ok(port: u16) -> bool {
    let addr = format!("127.0.0.1:{port}");
    let Ok(mut stream) = TcpStream::connect_timeout(
        &addr.parse().expect("valid addr"),
        Duration::from_secs(2),
    ) else {
        return false;
    };
    let req = format!("GET /api/v1/health HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\n\r\n");
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut buf = [0u8; 128];
    let n = stream.read(&mut buf).unwrap_or(0);
    let head = String::from_utf8_lossy(&buf[..n]);
    head.starts_with("HTTP/1.") && head.contains(" 200")
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

// ---- B13 run-completion awareness (background runtime) ----------------------
// The shell polls the SAME public API the health probe uses (read-only
// GET /api/v1/runs) and fires a native notification when a run it saw active
// reaches a final state — the researcher can minimize the workbench and still
// learn a long pipeline finished or failed. No engine logic lives here.

/// Full-body HTTP/1.0 GET against the local server; None on any transport error.
fn http_get_body(port: u16, path: &str) -> Option<String> {
    let addr = format!("127.0.0.1:{port}");
    let mut stream = TcpStream::connect_timeout(
        &addr.parse().ok()?,
        Duration::from_secs(3),
    )
    .ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(5))).ok()?;
    let req = format!("GET {path} HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    stream.write_all(req.as_bytes()).ok()?;
    let mut body = String::new();
    let mut buf = [0u8; 8192];
    loop {
        match stream.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => body.push_str(&String::from_utf8_lossy(&buf[..n])),
            Err(_) => break,
        }
    }
    // strip headers: body starts after the first CRLFCRLF
    let split = body.find("\r\n\r\n")?;
    Some(body[split + 4..].to_string())
}

/// id -> status from the /runs listing (best effort; missing fields skipped).
fn parse_runs_snapshot(body: &str) -> std::collections::HashMap<String, String> {
    let mut out = std::collections::HashMap::new();
    let Ok(v) = serde_json::from_str::<serde_json::Value>(body) else {
        return out;
    };
    let arr = match &v {
        serde_json::Value::Array(a) => a.clone(),
        serde_json::Value::Object(o) => match o.get("runs") {
            Some(serde_json::Value::Array(a)) => a.clone(),
            _ => vec![],
        },
        _ => vec![],
    };
    for item in arr {
        let id = item.get("id").and_then(|x| x.as_str());
        let status = item.get("status").and_then(|x| x.as_str());
        if let (Some(id), Some(status)) = (id, status) {
            out.insert(id.to_string(), status.to_string());
        }
    }
    out
}

/// Pure transition diff: runs that were ACTIVE before and FINAL after.
/// (id, final_status) pairs — the notification payload.
fn final_transitions(
    prev: &std::collections::HashMap<String, String>,
    next: &std::collections::HashMap<String, String>,
) -> Vec<(String, String)> {
    const ACTIVE: [&str; 4] = ["created", "queued", "running", "paused"];
    const FINAL: [&str; 4] = ["completed", "failed", "partial", "cancelled"];
    let mut out = vec![];
    for (id, status) in next {
        if !FINAL.contains(&status.as_str()) {
            continue;
        }
        match prev.get(id) {
            Some(p) if ACTIVE.contains(&p.as_str()) => out.push((id.clone(), status.clone())),
            _ => {}
        }
    }
    out.sort(); // deterministic for tests
    out
}

#[cfg(test)]
mod tests {
    use super::{deep_link_hash, final_transitions, hash_assign_script, lang_is_en};
    use std::collections::HashMap;

    #[test]
    fn shell_language_matches_tui_resolvelang_semantics() {
        assert!(lang_is_en(Some("en")));
        assert!(lang_is_en(Some("en-US")));
        assert!(!lang_is_en(Some("zh")));
        assert!(!lang_is_en(Some("fr"))); // unmapped locale keeps the zh default
        assert!(!lang_is_en(None)); // unset FARLANG: historical default
    }

    #[test]
    fn deep_link_hash_maps_the_documented_shapes() {
        assert_eq!(deep_link_hash("far://run/run_abc123"), Some("#study/run_abc123".to_string()));
        assert_eq!(deep_link_hash("far://"), Some("#lab/new".to_string()));
        assert_eq!(deep_link_hash("far://lab/new"), Some("#lab/new".to_string()));
        assert_eq!(deep_link_hash("far://conv/c_1"), Some("#conv/c_1".to_string()));
        // payload prefix (e.g. the protocol handler's quoting) is tolerated
        assert_eq!(deep_link_hash("\"far://run/x\""), Some("#study/x".to_string()));
        // cut-set: quote/space/backslash end the path
        assert_eq!(deep_link_hash("far://run/x y"), Some("#study/x".to_string()));
        assert_eq!(deep_link_hash("far://run/x\"y"), Some("#study/x".to_string()));
        assert_eq!(deep_link_hash("far://run/x\\y"), Some("#study/x".to_string()));
        // no far:// scheme -> no navigation
        assert_eq!(deep_link_hash("https://example.com"), None);
        assert_eq!(deep_link_hash(""), None);
    }

    #[test]
    fn hash_assign_script_never_leaks_raw_input_into_the_literal() {
        // The red-team attack payload: single-quote breakout.
        let s = hash_assign_script("#lab/x';eval('arbitrary');//");
        assert!(s.starts_with("location.hash = \""));
        assert!(s.ends_with("\";"));
        assert!(serde_json::from_str::<String>(&s["location.hash = ".len()..s.len() - 1]).is_ok());
        // Property: the encoded argument is a complete JSON string literal — the
        // script is exactly `location.hash = <literal>;` with no unescaped quote
        // before the terminating semicolon.
        for probe in ["#a\"b", "#a\\b", "#a\nb", "#a\rb", "#a\tb", "#a\u{2028}b", "#日本語", "#a\u{1F600}"] {
            let script = hash_assign_script(probe);
            let body = script.strip_prefix("location.hash = ").and_then(|s| s.strip_suffix(';')).unwrap();
            assert_eq!(serde_json::from_str::<String>(body).unwrap(), probe, "probe {probe:?}");
        }
    }

    fn m(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(a, b)| (a.to_string(), b.to_string())).collect()
    }

    #[test]
    fn active_to_final_fires() {
        let prev = m(&[("run_a", "running"), ("run_b", "completed"), ("run_c", "queued")]);
        let next = m(&[("run_a", "completed"), ("run_b", "completed"), ("run_c", "failed")]);
        let t = final_transitions(&prev, &next);
        assert_eq!(t, vec![("run_a".to_string(), "completed".to_string()), ("run_c".to_string(), "failed".to_string())]);
    }

    #[test]
    fn already_final_and_new_final_do_not_fire() {
        let prev = m(&[("run_b", "completed")]);
        let next = m(&[("run_b", "completed"), ("run_new", "completed")]);
        assert!(final_transitions(&prev, &next).is_empty());
    }

    #[test]
    fn disappeared_runs_do_not_fire() {
        let prev = m(&[("run_gone", "running")]);
        let next = m(&[]);
        assert!(final_transitions(&prev, &next).is_empty());
    }

    #[test]
    fn snapshot_parses_array_and_envelope_forms() {
        use super::parse_runs_snapshot;
        let a = parse_runs_snapshot(r#"[{"id":"run_1","status":"running"}]"#);
        assert_eq!(a.get("run_1").map(String::as_str), Some("running"));
        let b = parse_runs_snapshot(r#"{"runs":[{"id":"run_2","status":"completed"}]}"#);
        assert_eq!(b.get("run_2").map(String::as_str), Some("completed"));
        assert!(parse_runs_snapshot("not json").is_empty());
    }
}


/// Navigate the workbench to a hash route (quick capture / deep links).
///
/// The hash is deep-link input (attacker-controllable up to the protocol-launch
/// consent): it is JSON-encoded so no quote/newline in it can break out of the
/// JS string literal executed by `eval` (which bypasses page CSP).
fn navigate_hash(app: &tauri::AppHandle, hash: &str) {
    if let Some(w) = app.get_webview_window("main") {
        let script = hash_assign_script(hash);
        let _ = w.eval(&script);
    }
}

/// Pure: the exact script `navigate_hash` executes. Exported-in-module for the
/// table/property tests below (red-team P2: the injection-critical encoding
/// must be locked by tests, not by review).
fn hash_assign_script(hash: &str) -> String {
    // to_string of a &str cannot fail; the fallback is unreachable belt-and-braces.
    let encoded = serde_json::to_string(hash).unwrap_or_else(|_| "\"#lab/new\"".to_string());
    format!("location.hash = {encoded};")
}

/// Pure: map a raw deep-link payload to the workbench hash it navigates to
/// (None when the payload carries no far:// URL). Extracted from
/// handle_deep_link for table-driven tests.
fn deep_link_hash(payload: &str) -> Option<String> {
    let start = payload.find("far://")?;
    let rest = &payload[start + "far://".len()..];
    // Cut at characters that cannot be part of a hash route we ever mint
    // (defense in depth on top of hash_assign_script's JSON encoding).
    let end = rest.find(['"', '\'', ' ', '\\']).unwrap_or(rest.len());
    let path = &rest[..end];
    Some(match path.strip_prefix("run/") {
        // far://run/<id> opens the study MAP (the primary view); other
        // paths pass through as hashes (#study/.., #conv/.., #lab/new).
        Some(run_id) => format!("#study/{run_id}"),
        None if path.is_empty() => "#lab/new".to_string(),
        None => format!("#{path}"),
    })
}

/// Handle a far:// URL: far://run/<id> -> workbench #run/<id>. Unknown paths
/// fall back to the home view; malformed input never crashes the shell.
fn handle_deep_link(app: &tauri::AppHandle, payload: &str) {
    if let Some(hash) = deep_link_hash(payload) {
        navigate_hash(app, &hash);
    }
}

/// Native fatal dialog — a double-click launch has no console; a silent exit
/// would look like "the app does nothing". Zero extra dependencies (windows_sys
/// is already in the tree).
#[cfg(windows)]
fn fatal_dialog(message: &str) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
    let text: Vec<u16> = message.encode_utf16().chain(std::iter::once(0)).collect();
    let caption: Vec<u16> = "FAR-Lab".encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            caption.as_ptr(),
            MB_OK | MB_ICONERROR,
        );
    }
}
#[cfg(not(windows))]
fn fatal_dialog(message: &str) {
    eprintln!("far-lab-desktop: {message}");
}

/// Register the far:// URL protocol for THIS executable (Windows, HKCU — no
/// admin rights needed). The plugin's runtime registration proved to be a
/// silent no-op in debug runs, so this writes the registry keys directly and
/// verifiably; cold start and running-instance paths are both handled via
/// argv (main parses on cold start; the single-instance callback forwards).
#[cfg(windows)]
fn register_far_scheme() {
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegSetValueW, HKEY, HKEY_CURRENT_USER,
        KEY_WRITE, REG_OPTION_NON_VOLATILE, REG_SZ,
    };
    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(_) => return,
    };
    let command = format!("\"{}\" \"%1\"", exe.display());
    let to_wide = |s: &str| -> Vec<u16> { s.encode_utf16().chain(std::iter::once(0)).collect() };
    unsafe fn set_sz(key: HKEY, name: Option<&[u16]>, data: &[u16]) -> bool {
        let name_ptr: windows_sys::core::PCWSTR = match name {
            Some(n) => n.as_ptr(),
            None => std::ptr::null(),
        };
        RegSetValueW(
            key,
            name_ptr,
            REG_SZ,
            data.as_ptr(),
            (data.len() * 2) as u32,
        ) == 0
    }
    unsafe {
        let classes: Vec<u16> = to_wide("Software\\Classes\\far");
        let mut far_key: HKEY = std::ptr::null_mut();
        if RegCreateKeyExW(
            HKEY_CURRENT_USER,
            classes.as_ptr(),
            0,
            std::ptr::null_mut(),
            REG_OPTION_NON_VOLATILE,
            KEY_WRITE,
            std::ptr::null(),
            &mut far_key,
            std::ptr::null_mut(),
        ) != 0
        {
            eprintln!("far-lab-desktop: far:// scheme registration failed (Classes\\far)");
            return;
        }
        let desc = to_wide("URL:FAR-Lab research workbench");
        set_sz(far_key, None, &desc);
        let protocol_name = to_wide("URL Protocol");
        set_sz(far_key, Some(&protocol_name), &[0]);
        let mut cmd_key: HKEY = std::ptr::null_mut();
        let shell_cmd: Vec<u16> = to_wide("Software\\Classes\\far\\shell\\open\\command");
        let created = RegCreateKeyExW(
            HKEY_CURRENT_USER,
            shell_cmd.as_ptr(),
            0,
            std::ptr::null_mut(),
            REG_OPTION_NON_VOLATILE,
            KEY_WRITE,
            std::ptr::null(),
            &mut cmd_key,
            std::ptr::null_mut(),
        );
        let cmd_wide = to_wide(&command);
        let ok = created == 0 && set_sz(cmd_key, None, &cmd_wide);
        RegCloseKey(cmd_key);
        RegCloseKey(far_key);
        if !ok {
            eprintln!("far-lab-desktop: far:// scheme registration failed (shell\\open\\command)");
        }
    }
}
#[cfg(not(windows))]
fn register_far_scheme() {}

fn main() {
    register_far_scheme();
    let port = desktop_port();
    // Cold-start deep link: the shell hands us far://run/<id> as argv — keep
    // it for navigation once the window exists.
    let deep_link_at_start = std::env::args().find(|a| a.contains("far://"));
    let spawned = if http_health_ok(port) {
        eprintln!("far-lab-desktop: server already healthy on {port}, reusing");
        None
    } else {
        let root = repo_root();
        let mut cmd = Command::new("node");
        cmd.arg("scripts/serve.mjs")
            .current_dir(root)
            .env("PORT", port.to_string());
        before_spawn(&mut cmd);
        match cmd.spawn() {
            Ok(child) => {
                assign_kill_on_close(&child);
                Some(child)
            }
            Err(e) => {
                let msg = if shell_en() {
                    format!("FAR-Lab failed to start: cannot spawn the local server ({e}).\nCheck that Node.js is installed and npm install && npm run build has run in the repo directory.")
                } else {
                    format!("FAR-Lab 启动失败：无法启动本地服务（{e}）。\n请确认已安装 Node.js 并在仓库目录运行过 npm install && npm run build。")
                };
                fatal_dialog(&msg);
                eprintln!("far-lab-desktop: failed to spawn node server: {e}");
                std::process::exit(1);
            }
        }
    };

    // Honest wait: bounded (~20s), then fail visibly instead of a blank window.
    if !http_health_ok_wait(port, Duration::from_secs(20)) {
        let msg = if shell_en() {
            format!("FAR-Lab failed to start: the local server did not become healthy within 20 s (port {port}).\nRun node scripts/serve.mjs manually to see the error output.")
        } else {
            format!("FAR-Lab 启动失败：本地服务在 20 秒内未就绪（端口 {port}）。\n请手动运行 node scripts/serve.mjs 查看错误输出。")
        };
        fatal_dialog(&msg);
        eprintln!("far-lab-desktop: server did not become healthy on {port} within 20s — aborting");
        std::process::exit(2);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // Re-launch focuses the running instance — never a second window.
            // A far:// URL handed to the second instance is forwarded here
            // (that process exits immediately).
            show_main(app);
            if let Some(arg) = argv.iter().find(|a| a.contains("far://")) {
                handle_deep_link(app, arg);
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        // Global quick capture: surface the app and land on the
                        // focused question box (the web autoFocus does the rest).
                        show_main(app);
                        navigate_hash(app, "#lab/new");
                    }
                })
                .build(),
        )
        .setup(move |app| {
            app.manage(ServerState(Mutex::new(ServerGuard(spawned))));

            // B13 run-completion awareness: background poll (read-only, same
            // public API the health probe uses) -> native notification when a
            // run seen active reaches a final state. Best-effort by design: a
            // transient fetch failure just skips a cycle; the notification
            // itself is UNVERIFIED-live (needs a real GUI session to observe).
            {
                use tauri_plugin_notification::NotificationExt;
                let handle = app.handle().clone();
                let poll_ms: u64 = std::env::var("FARLAB_DESKTOP_POLL_MS")
                    .ok()
                    .and_then(|v| v.parse().ok())
                    .filter(|v| *v >= 5_000)
                    .unwrap_or(30_000);
                std::thread::spawn(move || {
                    use std::collections::HashMap;
                    let mut prev: HashMap<String, String> = HashMap::new();
                    loop {
                        std::thread::sleep(Duration::from_millis(poll_ms));
                        let Some(body) = http_get_body(port, "/api/v1/runs") else {
                            continue;
                        };
                        let next = parse_runs_snapshot(&body);
                        for (run_id, status) in final_transitions(&prev, &next) {
                            let (title, body): (&str, String) = if shell_en() {
                                (
                                    match status.as_str() {
                                        "completed" => "Study completed",
                                        "failed" => "Study failed",
                                        "partial" => "Study partially completed",
                                        _ => "Study cancelled",
                                    },
                                    format!("{run_id} — click the tray to open the workbench"),
                                )
                            } else {
                                (
                                    match status.as_str() {
                                        "completed" => "研究已完成",
                                        "failed" => "研究失败",
                                        "partial" => "研究部分完成",
                                        _ => "研究已取消",
                                    },
                                    format!("{run_id} — 点击托盘打开工作台"),
                                )
                            };
                            let ok = handle
                                .notification()
                                .builder()
                                .title(title)
                                .body(body)
                                .show();
                            if let Err(e) = ok {
                                eprintln!("far-lab-desktop: notification for {run_id} failed: {e}");
                            }
                        }
                        prev = next;
                    }
                });
            }

            // Global hotkey: registration is best-effort (a conflicting
            // system-wide hotkey must not kill the workbench).
            use tauri_plugin_global_shortcut::GlobalShortcutExt;
            if let Err(e) = app.global_shortcut().register("Alt+Shift+F") {
                eprintln!("far-lab-desktop: global shortcut Alt+Shift+F registration failed: {e}");
            }

            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(format!("http://127.0.0.1:{port}/").parse().expect("valid url")),
            )
            .title("FAR-Lab 研究工作台")
            .inner_size(1280.0, 860.0)
            .min_inner_size(960.0, 600.0)
            .build()?;

            // Cold-start deep link navigation (window now exists).
            if let Some(url) = &deep_link_at_start {
                let handle = app.handle().clone();
                handle_deep_link(&handle, url);
            }

            // System tray: open/capture/quit only — every entry maps a real
            // action. Requires a window icon (bundle icon); skipped honestly
            // if absent.
            if let Some(icon) = app.default_window_icon().cloned() {
                use tauri::menu::{MenuBuilder, MenuItem};
                use tauri::tray::TrayIconBuilder;
                let open_item = MenuItem::with_id(app, "open", "打开工作台", true, None::<&str>)?;
                let capture_item = MenuItem::with_id(app, "capture", "快速记录想法（Alt+Shift+F）", true, None::<&str>)?;
                let quit_item = MenuItem::with_id(app, "quit", "退出 FAR-Lab", true, None::<&str>)?;
                let menu = MenuBuilder::new(app).items(&[&open_item, &capture_item, &quit_item]).build()?;
                let tray_handle = app.handle().clone();
                TrayIconBuilder::with_id("far-tray")
                    .icon(icon)
                    .tooltip("FAR-Lab 研究工作台")
                    .menu(&menu)
                    .on_menu_event(move |app, event| match event.id().as_ref() {
                        "open" => show_main(app),
                        "capture" => {
                            show_main(app);
                            navigate_hash(app, "#lab/new");
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .build(&tray_handle)?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<ServerState>() {
                    // Exit callbacks run before managed state is dropped. Kill
                    // and reap explicitly: dropping std::process::Child alone
                    // does not terminate it (and macOS has no PDEATHSIG/Job
                    // Object fallback).
                    let _ = state.0.lock().map(|mut guard| guard.terminate());
                }
            }
        });
}

fn http_health_ok_wait(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    loop {
        if http_health_ok(port) {
            return true;
        }
        if start.elapsed() >= timeout {
            return false;
        }
        std::thread::sleep(Duration::from_millis(400));
    }
}

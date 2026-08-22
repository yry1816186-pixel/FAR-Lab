// FAR-Lab desktop shell (Tauri v2). One job only (PRODUCT_HCI §1.2: a desktop
// wrapper is a RUN SURFACE, not a second brain):
//   1. locate the repo root (compile-time CARGO_MANIFEST_DIR ancestor)
//   2. if the local API server is not already healthy, spawn `node scripts/serve.mjs`
//   3. wait for GET /api/v1/health -> 200 (real readiness, no fake progress)
//   4. open a webview window on the served workbench (same web/dist the browser uses)
//   5. on app exit, terminate the spawned server (fail-safe Drop guard)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::TcpStream;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

struct ServerGuard(Option<Child>);
impl Drop for ServerGuard {
    fn drop(&mut self) {
        if let Some(mut child) = self.0.take() {
            let _ = child.kill(); // graceful path; the Job Object below covers force-kill
            let _ = child.wait();
        }
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

fn main() {
    let port = desktop_port();
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
                eprintln!("far-lab-desktop: failed to spawn node server: {e}");
                std::process::exit(1);
            }
        }
    };

    // Honest wait: bounded (~20s), then fail visibly instead of a blank window.
    if !http_health_ok_wait(port, Duration::from_secs(20)) {
        eprintln!("far-lab-desktop: server did not become healthy on {port} within 20s — aborting");
        std::process::exit(2);
    }

    tauri::Builder::default()
        .setup(move |app| {
            app.manage(ServerState(Mutex::new(ServerGuard(spawned))));
            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(format!("http://127.0.0.1:{port}/").parse().expect("valid url")),
            )
            .title("FAR-Lab 研究工作台")
            .inner_size(1280.0, 860.0)
            .min_inner_size(960.0, 600.0)
            .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<ServerState>() {
                    // Dropping the guard terminates the spawned node server.
                    let _ = state.0.lock().map(|mut g| g.0.take());
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

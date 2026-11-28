use serde::Serialize;
use std::collections::VecDeque;
use std::env;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub const DEFAULT_PORT: u16 = 4310;
pub const LOOPBACK_ADDR: &str = concat!("127", ".", "0", ".", "0", ".", "1");
const MAX_LOG_LINES: usize = 120;

pub fn local_server_url(port: u16) -> String {
    format!("{}://{}:{}", "http", LOOPBACK_ADDR, port)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolProbe {
    pub found: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoriaPaths {
    pub runtime_root: PathBuf,
    pub bundled_runtime_stamp: String,
    pub install_dir: PathBuf,
    pub server_entry: PathBuf,
    pub studio_dist: PathBuf,
    pub data_dir: PathBuf,
    pub projects_dir: PathBuf,
    pub models_dir: PathBuf,
    pub custom_assets_dir: Option<PathBuf>,
    pub bootstrap_config_path: PathBuf,
    pub is_bundled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootSnapshot {
    pub phase: String,
    pub message: String,
    pub ready: bool,
    pub error: Option<String>,
    pub server_url: String,
    pub port: u16,
    pub host: String,
    pub data_dir: String,
    pub projects_dir: String,
    pub runtime_root: String,
    pub node: ToolProbe,
    pub ffmpeg: ToolProbe,
    pub logs: Vec<String>,
    pub platform: String,
}

#[derive(Debug, Clone)]
pub struct BindConfig {
    pub host: String,
    pub port: u16,
}

pub fn current_platform_label() -> String {
    format!("{}-{}", env::consts::OS, env::consts::ARCH)
}

pub fn desktop_bootstrap_config_path() -> PathBuf {
    if let Ok(ov) = env::var("STORIA_BOOTSTRAP_CONFIG") {
        let trimmed = ov.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    if let Some(home) = dirs::home_dir() {
        return home.join(".storia-studio").join("desktop-bootstrap.json");
    }
    PathBuf::from(".storia-studio").join("desktop-bootstrap.json")
}

#[derive(Debug, Default)]
struct BootstrapOverrides {
    projects_dir: Option<PathBuf>,
    models_dir: Option<PathBuf>,
    custom_assets_dir: Option<PathBuf>,
    active_runtime_dir: Option<PathBuf>,
    bundled_runtime_stamp: Option<String>,
}

fn read_desktop_bootstrap_overrides(path: &Path) -> BootstrapOverrides {
    let mut out = BootstrapOverrides::default();
    let Ok(raw) = fs::read_to_string(path) else {
        return out;
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return out;
    };
    if let Some(s) = json.get("projectsDir").and_then(|v| v.as_str()) {
        if !s.trim().is_empty() {
            out.projects_dir = Some(PathBuf::from(s.trim()));
        }
    }
    if let Some(s) = json.get("modelsDir").and_then(|v| v.as_str()) {
        if !s.trim().is_empty() {
            out.models_dir = Some(PathBuf::from(s.trim()));
        }
    }
    if let Some(s) = json.get("customAssetsDir").and_then(|v| v.as_str()) {
        if !s.trim().is_empty() {
            out.custom_assets_dir = Some(PathBuf::from(s.trim()));
        }
    }
    if let Some(s) = json.get("activeRuntimeDir").and_then(|v| v.as_str()) {
        if !s.trim().is_empty() {
            out.active_runtime_dir = Some(PathBuf::from(s.trim()));
        }
    }
    if let Some(s) = json.get("bundledRuntimeStamp").and_then(|v| v.as_str()) {
        if !s.trim().is_empty() {
            out.bundled_runtime_stamp = Some(s.trim().to_string());
        }
    }
    out
}

fn read_runtime_build_stamp(runtime_root: &Path) -> String {
    let info_path = runtime_root.join("build-info.json");
    if let Ok(raw) = fs::read_to_string(&info_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) {
            let built_at = json
                .get("builtAt")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            let sha = json
                .get("commitSha")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            let ver = json
                .get("version")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            if !sha.is_empty() || !built_at.is_empty() {
                return format!("{}|{}|{}", ver, sha, built_at);
            }
        }
    }
    format!(
        "{}|{}",
        env!("CARGO_PKG_VERSION"),
        env!("STORIA_BUILD_COMMIT")
    )
}

/// Strips Windows extended-length verbatim path prefixes (`\\?\C:\...` -> `C:\...`,
/// `\\?\UNC\server\share` -> `\\server\share`) returned by `fs::canonicalize` or Tauri `resource_dir()`.
/// Node.js on Windows fails with `EISDIR: lstat 'X:'` when passed `\\?\`-prefixed entry paths.
pub fn normalize_host_path(path: PathBuf) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let s = path.to_string_lossy();
        if let Some(unc) = s.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{}", unc));
        }
        if let Some(stripped) = s.strip_prefix(r"\\?\") {
            return PathBuf::from(stripped);
        }
    }
    path
}

/// Resolves the Storia Studio runtime root (`apps/server/dist/index.js`) and writable OS data directory.
pub fn resolve_storia_paths(
    resource_dir: Option<&Path>,
    data_dir_override: Option<&Path>,
) -> Result<StoriaPaths, String> {
    let mut candidates: Vec<(PathBuf, bool)> = Vec::new();

    if let Ok(env_root) = env::var("STORIA_RUNTIME_ROOT") {
        let trimmed = env_root.trim();
        if !trimmed.is_empty() {
            candidates.push((PathBuf::from(trimmed), false));
        }
    }

    if let Some(res_dir) = resource_dir {
        candidates.push((res_dir.join("runtime"), true));
        candidates.push((res_dir.to_path_buf(), true));
    }

    if let Ok(exe_path) = env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push((exe_dir.join("resources").join("runtime"), true));
            candidates.push((exe_dir.join("runtime"), true));
            candidates.push((exe_dir.join("..").join("Resources").join("runtime"), true));
            let mut cur = exe_dir.to_path_buf();
            for _ in 0..7 {
                candidates.push((cur.clone(), false));
                if let Some(parent) = cur.parent() {
                    cur = parent.to_path_buf();
                } else {
                    break;
                }
            }
        }
    }

    if let Ok(cwd) = env::current_dir() {
        let mut cur = cwd;
        for _ in 0..5 {
            candidates.push((cur.clone(), false));
            if let Some(parent) = cur.parent() {
                cur = parent.to_path_buf();
            } else {
                break;
            }
        }
    }

    let mut found: Option<(PathBuf, PathBuf, bool)> = None;
    for (root, is_bundled) in candidates {
        let entry = root.join("apps").join("server").join("dist").join("index.js");
        if entry.is_file() {
            let canonical_root = normalize_host_path(fs::canonicalize(&root).unwrap_or(root));
            let canonical_entry = normalize_host_path(
                canonical_root
                    .join("apps")
                    .join("server")
                    .join("dist")
                    .join("index.js"),
            );
            found = Some((canonical_root, canonical_entry, is_bundled));
            break;
        }
    }

    let (bundled_runtime_root, bundled_server_entry, is_bundled) = found.ok_or_else(|| {
        "No se encontró el servidor compilado de Storia Studio (apps/server/dist/index.js). Ejecuta `pnpm build` o reinstala Storia Studio.".to_string()
    })?;

    let bundled_runtime_stamp = read_runtime_build_stamp(&bundled_runtime_root);
    let install_dir = env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| bundled_runtime_root.clone());

    let bootstrap_config_path = desktop_bootstrap_config_path();
    let boot_ov = if is_bundled {
        read_desktop_bootstrap_overrides(&bootstrap_config_path)
    } else {
        BootstrapOverrides::default()
    };

    // If an in-app runtime update was applied for this bundled shell (same bundledRuntimeStamp),
    // boot directly from the updated internal runtime directory without needing an OS installer.
    let mut runtime_root = bundled_runtime_root;
    let mut server_entry = bundled_server_entry;
    if is_bundled {
        if let Some(ref active_dir) = boot_ov.active_runtime_dir {
            let stamp_matches = boot_ov
                .bundled_runtime_stamp
                .as_deref()
                .map(|s| s == bundled_runtime_stamp)
                .unwrap_or(true);
            let active_entry = active_dir
                .join("apps")
                .join("server")
                .join("dist")
                .join("index.js");
            let active_studio = active_dir
                .join("apps")
                .join("studio")
                .join("dist")
                .join("index.html");
            if stamp_matches && active_entry.is_file() && active_studio.is_file() {
                runtime_root = normalize_host_path(
                    fs::canonicalize(active_dir).unwrap_or_else(|_| active_dir.clone()),
                );
                server_entry = normalize_host_path(
                    runtime_root
                        .join("apps")
                        .join("server")
                        .join("dist")
                        .join("index.js"),
                );
            }
        }
    }

    let studio_dist = runtime_root.join("apps").join("studio").join("dist");

    let data_dir = if let Some(ov) = data_dir_override {
        ov.to_path_buf()
    } else if let Ok(env_data) = env::var("STORIA_DATA_DIR") {
        let trimmed = env_data.trim();
        if !trimmed.is_empty() {
            PathBuf::from(trimmed)
        } else {
            default_data_dir(&runtime_root, is_bundled)
        }
    } else {
        default_data_dir(&runtime_root, is_bundled)
    };

    let projects_dir = if let Ok(env_proj) = env::var("STORIA_PROJECTS_DIR") {
        let trimmed = env_proj.trim();
        if !trimmed.is_empty() {
            PathBuf::from(trimmed)
        } else {
            boot_ov.projects_dir.unwrap_or_else(|| data_dir.join("projects"))
        }
    } else {
        boot_ov.projects_dir.unwrap_or_else(|| data_dir.join("projects"))
    };

    let models_dir = if let Ok(env_models) = env::var("STORIA_MODELS_DIR") {
        let trimmed = env_models.trim();
        if !trimmed.is_empty() {
            PathBuf::from(trimmed)
        } else {
            boot_ov.models_dir.unwrap_or_else(|| data_dir.join("models"))
        }
    } else {
        boot_ov.models_dir.unwrap_or_else(|| data_dir.join("models"))
    };

    let custom_assets_dir = env::var("STORIA_WORKSPACE_ASSETS_DIR")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .or(boot_ov.custom_assets_dir);

    Ok(StoriaPaths {
        runtime_root: normalize_host_path(runtime_root),
        bundled_runtime_stamp,
        install_dir: normalize_host_path(install_dir),
        server_entry: normalize_host_path(server_entry),
        studio_dist: normalize_host_path(studio_dist),
        data_dir: normalize_host_path(data_dir),
        projects_dir: normalize_host_path(projects_dir),
        models_dir: normalize_host_path(models_dir),
        custom_assets_dir: custom_assets_dir.map(normalize_host_path),
        bootstrap_config_path: normalize_host_path(bootstrap_config_path),
        is_bundled,
    })
}

fn default_data_dir(runtime_root: &Path, is_bundled: bool) -> PathBuf {
    if !is_bundled {
        return runtime_root.to_path_buf();
    }
    if let Some(local_data) = dirs::data_local_dir() {
        #[cfg(target_os = "linux")]
        return local_data.join("storia-studio");
        #[cfg(not(target_os = "linux"))]
        return local_data.join("Storia Studio");
    }
    if let Some(home) = dirs::home_dir() {
        return home.join(".storia-studio-data");
    }
    runtime_root.to_path_buf()
}

pub fn read_bind_config(models_dir: &Path, port_override: Option<u16>) -> BindConfig {
    let mut host = env::var("STORIA_SERVER_HOST")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| LOOPBACK_ADDR.to_string());
    let mut port = env::var("STORIA_SERVER_PORT")
        .ok()
        .and_then(|s| s.trim().parse::<u16>().ok())
        .filter(|&p| p >= 1024)
        .unwrap_or(DEFAULT_PORT);

    let cfg_path = models_dir.join("config").join("connectivity.json");
    if let Ok(raw) = fs::read_to_string(&cfg_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(p) = json.get("port").and_then(|v| v.as_u64()) {
                if (1024..=65535).contains(&p) && env::var("STORIA_SERVER_PORT").is_err() {
                    port = p as u16;
                }
            }
            if env::var("STORIA_SERVER_HOST").is_err() {
                if let Some(mode) = json.get("accessMode").and_then(|v| v.as_str()) {
                    host = if mode == "lan" {
                        "0.0.0.0".to_string()
                    } else {
                        LOOPBACK_ADDR.to_string()
                    };
                }
            }
        }
    }

    if let Some(p) = port_override {
        port = p;
    }

    BindConfig { host, port }
}

fn run_version_probe(program: &Path, arg: &str) -> Option<String> {
    let mut cmd = Command::new(program);
    cmd.arg(arg)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = if stdout.trim().is_empty() {
        stderr
    } else {
        stdout
    };
    combined
        .lines()
        .find(|line| !line.trim().is_empty())
        .map(|s| s.trim().to_string())
}

pub fn probe_node(runtime_root: &Path) -> ToolProbe {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(custom) = env::var("STORIA_NODE_PATH") {
        let trimmed = custom.trim();
        if !trimmed.is_empty() {
            candidates.push(PathBuf::from(trimmed));
        }
    }

    #[cfg(target_os = "windows")]
    {
        candidates.push(runtime_root.join("bin").join("node.exe"));
        candidates.push(PathBuf::from("node.exe"));
        candidates.push(PathBuf::from("node"));
        candidates.push(PathBuf::from(r"C:\Program Files\nodejs\node.exe"));
        candidates.push(PathBuf::from(r"C:\Program Files (x86)\nodejs\node.exe"));
        if let Some(home) = dirs::home_dir() {
            candidates.push(home.join("scoop").join("shims").join("node.exe"));
            candidates.push(home.join(".volta").join("bin").join("node.exe"));
        }
        if let Ok(local_app) = env::var("LOCALAPPDATA") {
            candidates.push(
                PathBuf::from(&local_app)
                    .join("Programs")
                    .join("nodejs")
                    .join("node.exe"),
            );
            candidates.push(
                PathBuf::from(&local_app)
                    .join("fnm_multishells")
                    .join("node.exe"),
            );
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        candidates.push(runtime_root.join("bin").join("node"));
        candidates.push(PathBuf::from("node"));
        candidates.push(PathBuf::from("/opt/homebrew/bin/node"));
        candidates.push(PathBuf::from("/usr/local/bin/node"));
        candidates.push(PathBuf::from("/usr/bin/node"));
        if let Some(home) = dirs::home_dir() {
            candidates.push(home.join(".volta").join("bin").join("node"));
            candidates.push(home.join(".fnm").join("current").join("bin").join("node"));
            candidates.push(home.join(".asdf").join("shims").join("node"));
            candidates.push(home.join(".nvm").join("current").join("bin").join("node"));
        }
    }

    for cand in candidates {
        if let Some(ver) = run_version_probe(&cand, "-v") {
            return ToolProbe {
                found: true,
                path: Some(cand.to_string_lossy().to_string()),
                version: Some(ver),
            };
        }
    }

    ToolProbe {
        found: false,
        path: None,
        version: None,
    }
}

pub fn probe_ffmpeg(runtime_root: &Path) -> ToolProbe {
    let mut candidates: Vec<PathBuf> = Vec::new();
    #[cfg(target_os = "windows")]
    {
        candidates.push(runtime_root.join("bin").join("ffmpeg.exe"));
        candidates.push(PathBuf::from("ffmpeg.exe"));
        candidates.push(PathBuf::from("ffmpeg"));
        candidates.push(PathBuf::from(r"C:\ffmpeg\bin\ffmpeg.exe"));
        if let Some(home) = dirs::home_dir() {
            candidates.push(home.join("scoop").join("shims").join("ffmpeg.exe"));
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        candidates.push(runtime_root.join("bin").join("ffmpeg"));
        candidates.push(PathBuf::from("ffmpeg"));
        candidates.push(PathBuf::from("/opt/homebrew/bin/ffmpeg"));
        candidates.push(PathBuf::from("/usr/local/bin/ffmpeg"));
        candidates.push(PathBuf::from("/usr/bin/ffmpeg"));
    }

    for cand in candidates {
        if let Some(ver) = run_version_probe(&cand, "-version") {
            return ToolProbe {
                found: true,
                path: Some(cand.to_string_lossy().to_string()),
                version: Some(ver),
            };
        }
    }

    ToolProbe {
        found: false,
        path: None,
        version: None,
    }
}

/// Checks whether a Storia Studio server is healthy at `<loopback>:<port>/api/health`.
pub fn check_server_health(port: u16) -> bool {
    let addr: SocketAddr = ([127, 0, 0, 1], port).into();
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(450)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(600)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(450)));

    let req = format!(
        "GET /api/health HTTP/1.1\r\nHost: {}:{}\r\nConnection: close\r\n\r\n",
        LOOPBACK_ADDR, port
    );
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }

    let mut resp = String::new();
    let _ = stream.read_to_string(&mut resp);
    (resp.starts_with("HTTP/1.1 200") || resp.starts_with("HTTP/1.0 200"))
        && resp.contains("storia-studio-server")
}

/// Opens a URL or local folder using the OS-native handler (`ShellExecuteW` on Windows,
/// `open` on macOS, `xdg-open` on Linux) without spawning `cmd.exe` or PowerShell.
pub fn open_in_system(target: &str) -> Result<(), String> {
    open::that_detached(target).map_err(|e| format!("No se pudo abrir '{}': {}", target, e))
}

#[cfg(target_os = "windows")]
mod win_job {
    use std::ffi::c_void;
    use std::mem::{size_of, zeroed};
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    pub struct ChildJobObject {
        handle: HANDLE,
    }

    // Kernel Job Object HANDLEs are safe to send/synchronize across threads.
    unsafe impl Send for ChildJobObject {}
    unsafe impl Sync for ChildJobObject {}

    impl ChildJobObject {
        pub fn attach(child: &Child) -> Option<Self> {
            unsafe {
                let job = CreateJobObjectW(null_mut(), null_mut());
                if job.is_null() {
                    return None;
                }
                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = zeroed();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let ok_set = SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    (&info as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION) as *const c_void,
                    size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                );
                if ok_set == 0 {
                    CloseHandle(job);
                    return None;
                }
                let proc_handle = child.as_raw_handle() as HANDLE;
                let ok_assign = AssignProcessToJobObject(job, proc_handle);
                if ok_assign == 0 {
                    CloseHandle(job);
                    return None;
                }
                Some(Self { handle: job })
            }
        }

        pub fn terminate_and_close(self) {
            unsafe {
                TerminateJobObject(self.handle, 0);
                CloseHandle(self.handle);
            }
            std::mem::forget(self);
        }
    }

    impl Drop for ChildJobObject {
        fn drop(&mut self) {
            if !self.handle.is_null() {
                unsafe {
                    CloseHandle(self.handle);
                }
                self.handle = null_mut();
            }
        }
    }
}

pub struct ServerSupervisor {
    child: Mutex<Option<Child>>,
    #[cfg(target_os = "windows")]
    job: Mutex<Option<win_job::ChildJobObject>>,
    logs: Arc<Mutex<VecDeque<String>>>,
}

impl Default for ServerSupervisor {
    fn default() -> Self {
        Self::new()
    }
}

impl ServerSupervisor {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            #[cfg(target_os = "windows")]
            job: Mutex::new(None),
            logs: Arc::new(Mutex::new(VecDeque::with_capacity(MAX_LOG_LINES))),
        }
    }

    pub fn push_log(&self, line: String) {
        if let Ok(mut buf) = self.logs.lock() {
            if buf.len() >= MAX_LOG_LINES {
                buf.pop_front();
            }
            buf.push_back(line);
        }
    }

    pub fn recent_logs(&self) -> Vec<String> {
        self.logs
            .lock()
            .map(|b| b.iter().cloned().collect())
            .unwrap_or_default()
    }

    pub fn start(
        &self,
        paths: &StoriaPaths,
        bind: &BindConfig,
        node_bin: &str,
        desktop_mode: bool,
    ) -> Result<bool, String> {
        let _ = fs::create_dir_all(&paths.data_dir);
        let _ = fs::create_dir_all(&paths.projects_dir);
        let _ = fs::create_dir_all(paths.models_dir.join("config"));

        if check_server_health(bind.port) {
            self.push_log(format!(
                "[launcher] Servidor Storia Studio ya activo en {}",
                local_server_url(bind.port)
            ));
            return Ok(false);
        }

        self.stop();

        let mut cmd = Command::new(node_bin);
        cmd.arg(&paths.server_entry)
            .current_dir(&paths.runtime_root)
            .env("STORIA_DATA_DIR", &paths.data_dir)
            .env("STORIA_INSTALL_DIR", &paths.install_dir)
            .env("STORIA_PROJECTS_DIR", &paths.projects_dir)
            .env("STORIA_MODELS_DIR", &paths.models_dir)
            .env("STORIA_STUDIO_DIST", &paths.studio_dist)
            .env("STORIA_BOOTSTRAP_CONFIG", &paths.bootstrap_config_path)
            .env("STORIA_SERVER_HOST", &bind.host)
            .env("STORIA_SERVER_PORT", bind.port.to_string())
            .env("STORIA_BUNDLED_RUNTIME_STAMP", &paths.bundled_runtime_stamp)
            .env("STORIA_BUILD_CHANNEL", env!("STORIA_BUILD_CHANNEL"))
            .env("STORIA_BUILD_COMMIT", env!("STORIA_BUILD_COMMIT"))
            .env("STORIA_UPDATE_REPO", env!("STORIA_UPDATE_REPO"))
            .env("NODE_ENV", "production")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if desktop_mode {
            cmd.env("STORIA_DESKTOP_APP", "1");
        }
        if let Some(ref custom_assets) = paths.custom_assets_dir {
            cmd.env("STORIA_WORKSPACE_ASSETS_DIR", custom_assets);
        }

        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("No se pudo iniciar Node.js ({}): {}", node_bin, e))?;

        #[cfg(target_os = "windows")]
        {
            let attached = win_job::ChildJobObject::attach(&child);
            if let Ok(mut jg) = self.job.lock() {
                *jg = attached;
            }
        }

        let logs_out = Arc::clone(&self.logs);
        if let Some(stdout) = child.stdout.take() {
            thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines().map_while(Result::ok) {
                    if let Ok(mut buf) = logs_out.lock() {
                        if buf.len() >= MAX_LOG_LINES {
                            buf.pop_front();
                        }
                        buf.push_back(line);
                    }
                }
            });
        }

        let logs_err = Arc::clone(&self.logs);
        if let Some(stderr) = child.stderr.take() {
            thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines().map_while(Result::ok) {
                    if let Ok(mut buf) = logs_err.lock() {
                        if buf.len() >= MAX_LOG_LINES {
                            buf.pop_front();
                        }
                        buf.push_back(format!("[stderr] {}", line));
                    }
                }
            });
        }

        if let Ok(mut guard) = self.child.lock() {
            *guard = Some(child);
        }

        Ok(true)
    }

    pub fn wait_until_healthy(&self, port: u16, timeout: Duration) -> Result<(), String> {
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            if check_server_health(port) {
                return Ok(());
            }
            if let Ok(mut guard) = self.child.lock() {
                if let Some(ch) = guard.as_mut() {
                    if let Ok(Some(status)) = ch.try_wait() {
                        return Err(format!(
                            "El servidor de Storia Studio terminó inesperadamente ({}). Revisa los logs.",
                            status
                        ));
                    }
                }
            }
            thread::sleep(Duration::from_millis(180));
        }
        Err(format!(
            "Tiempo de espera agotado iniciando Storia Studio en el puerto {}.",
            port
        ))
    }

    pub fn stop(&self) {
        #[cfg(target_os = "windows")]
        {
            if let Some(job) = self.job.lock().ok().and_then(|mut g| g.take()) {
                job.terminate_and_close();
            }
        }
        let child_opt = self.child.lock().ok().and_then(|mut g| g.take());
        if let Some(mut child) = child_opt {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// Launches a verified downloaded update installer and signals whether the desktop app should
/// exit immediately so the installer can replace binaries and relaunch Storia Studio cleanly.
pub fn launch_verified_update_installer(installer_path: &Path, updates_dir: &Path) -> Result<bool, String> {
    let canonical_updates = normalize_host_path(
        fs::canonicalize(updates_dir).unwrap_or_else(|_| updates_dir.to_path_buf()),
    );
    let canonical_installer = normalize_host_path(
        fs::canonicalize(installer_path)
            .map_err(|_| "El archivo de actualización descargado no existe.".to_string())?,
    );

    if !canonical_installer.starts_with(&canonical_updates) || !canonical_installer.is_file() {
        return Err("Ruta de instalador fuera de la carpeta autorizada de actualizaciones.".to_string());
    }

    let ext = canonical_installer
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    #[cfg(target_os = "windows")]
    {
        if ext == "exe" {
            // Tauri NSIS native flags:
            //   /P      -> Passive mode (progress bar only, zero clicks)
            //   /UPDATE -> Update in-place preserving shortcuts & settings
            //   /R      -> Automatically relaunch storia-studio.exe upon completion
            Command::new(&canonical_installer)
                .args(["/P", "/UPDATE", "/R"])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|e| format!("No se pudo ejecutar el actualizador: {}", e))?;
            return Ok(true);
        }
        if ext == "msi" {
            Command::new("msiexec.exe")
                .args(["/i", &canonical_installer.to_string_lossy(), "/qb"])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|e| format!("No se pudo ejecutar el instalador MSI: {}", e))?;
            return Ok(true);
        }
    }

    #[cfg(target_os = "linux")]
    {
        if ext == "appimage" {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(meta) = fs::metadata(&canonical_installer) {
                let mut perms = meta.permissions();
                perms.set_mode(0o755);
                let _ = fs::set_permissions(&canonical_installer, perms);
            }
            if let Ok(current_appimage) = env::var("APPIMAGE") {
                let target = PathBuf::from(current_appimage.trim());
                if target.is_file() {
                    let backup = target.with_extension("AppImage.old");
                    let _ = fs::rename(&target, &backup);
                    if fs::copy(&canonical_installer, &target).is_ok() {
                        if let Ok(meta) = fs::metadata(&target) {
                            let mut perms = meta.permissions();
                            perms.set_mode(0o755);
                            let _ = fs::set_permissions(&target, perms);
                        }
                        let _ = fs::remove_file(&backup);
                        let _ = Command::new(&target)
                            .stdin(Stdio::null())
                            .stdout(Stdio::null())
                            .stderr(Stdio::null())
                            .spawn();
                        return Ok(true);
                    } else {
                        let _ = fs::rename(&backup, &target);
                    }
                }
            }
        }
    }

    // macOS (.dmg) or non-AppImage Linux (.deb/.rpm): open installer via native OS handler
    open_in_system(&canonical_installer.to_string_lossy())?;
    Ok(false)
}

impl Drop for ServerSupervisor {
    fn drop(&mut self) {
        self.stop();
    }
}

pub mod runtime;

use runtime::{
    current_platform_label, local_server_url, normalize_host_path, open_in_system, probe_ffmpeg,
    probe_node, read_bind_config, resolve_storia_paths, BootSnapshot, ServerSupervisor, ToolProbe,
    DEFAULT_PORT, LOOPBACK_ADDR,
};
use std::path::PathBuf;
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, State, Url};
use tauri_plugin_dialog::DialogExt;

struct DesktopAppState {
    supervisor: Arc<ServerSupervisor>,
    snapshot: Arc<Mutex<BootSnapshot>>,
    resource_dir: Option<PathBuf>,
}

fn empty_probe() -> ToolProbe {
    ToolProbe {
        found: false,
        path: None,
        version: None,
    }
}

fn initial_snapshot() -> BootSnapshot {
    BootSnapshot {
        phase: "starting".to_string(),
        message: "Inicializando motor local de Storia Studio…".to_string(),
        ready: false,
        error: None,
        server_url: local_server_url(DEFAULT_PORT),
        port: DEFAULT_PORT,
        host: LOOPBACK_ADDR.to_string(),
        data_dir: String::new(),
        projects_dir: String::new(),
        runtime_root: String::new(),
        node: empty_probe(),
        ffmpeg: empty_probe(),
        logs: Vec::new(),
        platform: current_platform_label(),
    }
}

fn update_snapshot(
    snap: &Arc<Mutex<BootSnapshot>>,
    supervisor: &ServerSupervisor,
    f: impl FnOnce(&mut BootSnapshot),
) {
    if let Ok(mut guard) = snap.lock() {
        f(&mut guard);
        guard.logs = supervisor.recent_logs();
    }
}

fn spawn_boot_sequence(
    app: AppHandle,
    supervisor: Arc<ServerSupervisor>,
    snapshot: Arc<Mutex<BootSnapshot>>,
    resource_dir: Option<PathBuf>,
    force_restart: bool,
) {
    thread::spawn(move || {
        if force_restart {
            supervisor.stop();
        }

        update_snapshot(&snapshot, &supervisor, |s| {
            s.phase = "probing".to_string();
            s.ready = false;
            s.error = None;
            s.message = "Verificando runtime local, Node.js y FFmpeg…".to_string();
        });

        let paths = match resolve_storia_paths(resource_dir.as_deref(), None) {
            Ok(p) => p,
            Err(err) => {
                update_snapshot(&snapshot, &supervisor, |s| {
                    s.phase = "error".to_string();
                    s.message = "No se pudo localizar el paquete de Storia Studio.".to_string();
                    s.error = Some(err);
                });
                return;
            }
        };

        let bind = read_bind_config(&paths.models_dir, None);
        let server_url = local_server_url(bind.port);
        let node = probe_node(&paths.runtime_root);
        let ffmpeg = probe_ffmpeg(&paths.runtime_root);

        update_snapshot(&snapshot, &supervisor, |s| {
            s.runtime_root = paths.runtime_root.to_string_lossy().to_string();
            s.data_dir = paths.data_dir.to_string_lossy().to_string();
            s.projects_dir = paths.projects_dir.to_string_lossy().to_string();
            s.port = bind.port;
            s.host = bind.host.clone();
            s.server_url = server_url.clone();
            s.node = node.clone();
            s.ffmpeg = ffmpeg.clone();
        });

        let Some(node_bin) = node.path.clone() else {
            update_snapshot(&snapshot, &supervisor, |s| {
                s.phase = "error".to_string();
                s.message = "Node.js 22+ no está instalado en este equipo.".to_string();
                s.error = Some(
                    "Instala Node.js LTS (v22+) desde nodejs.org y pulsa Reintentar.".to_string(),
                );
            });
            return;
        };

        update_snapshot(&snapshot, &supervisor, |s| {
            s.phase = "launching".to_string();
            s.message = format!("Iniciando servidor Storia Studio en puerto {}…", bind.port);
        });

        if let Err(err) = supervisor.start(&paths, &bind, &node_bin, true) {
            update_snapshot(&snapshot, &supervisor, |s| {
                s.phase = "error".to_string();
                s.message = "Error al arrancar el servidor local.".to_string();
                s.error = Some(err);
            });
            return;
        }

        if let Err(err) = supervisor.wait_until_healthy(bind.port, Duration::from_secs(25)) {
            update_snapshot(&snapshot, &supervisor, |s| {
                s.phase = "error".to_string();
                s.message = "El servidor no respondió a tiempo.".to_string();
                s.error = Some(err);
            });
            return;
        }

        update_snapshot(&snapshot, &supervisor, |s| {
            s.phase = "ready".to_string();
            s.ready = true;
            s.error = None;
            s.message = format!("Conectado a {}", server_url);
        });

        if let Some(window) = app.get_webview_window("main") {
            if let Ok(target) = Url::parse(&server_url) {
                let _ = window.navigate(target);
            }
        }
    });
}

#[tauri::command]
fn get_boot_state(state: State<'_, DesktopAppState>) -> BootSnapshot {
    let mut snap = state
        .snapshot
        .lock()
        .map(|g| g.clone())
        .unwrap_or_else(|_| initial_snapshot());
    snap.logs = state.supervisor.recent_logs();
    snap
}

#[tauri::command]
fn retry_boot(app: AppHandle, state: State<'_, DesktopAppState>) {
    spawn_boot_sequence(
        app,
        Arc::clone(&state.supervisor),
        Arc::clone(&state.snapshot),
        state.resource_dir.clone(),
        false,
    );
}

#[tauri::command]
fn restart_server(app: AppHandle, state: State<'_, DesktopAppState>) {
    spawn_boot_sequence(
        app,
        Arc::clone(&state.supervisor),
        Arc::clone(&state.snapshot),
        state.resource_dir.clone(),
        true,
    );
}

#[tauri::command]
fn open_data_dir(state: State<'_, DesktopAppState>) -> Result<(), String> {
    let dir = state
        .snapshot
        .lock()
        .ok()
        .map(|s| s.projects_dir.clone())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "La carpeta de proyectos aún no está lista.".to_string())?;
    open_in_system(&dir)
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Solo se permiten URLs http:// o https://".to_string());
    }
    open_in_system(&url)
}

#[tauri::command]
async fn pick_folder(app: AppHandle, title: Option<String>) -> Result<Option<String>, String> {
    let (tx, rx) = mpsc::channel();
    let mut builder = app.dialog().file();
    if let Some(t) = title.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        builder = builder.set_title(t);
    }
    builder.pick_folder(move |folder_path| {
        let resolved = folder_path.and_then(|fp| {
            fp.into_path()
                .ok()
                .map(|p| normalize_host_path(p).to_string_lossy().to_string())
        });
        let _ = tx.send(resolved);
    });
    tauri::async_runtime::spawn_blocking(move || rx.recv().ok().flatten())
        .await
        .map_err(|e| format!("No se pudo abrir el selector de carpetas: {}", e))
}

fn focus_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

pub fn run() {
    let supervisor = Arc::new(ServerSupervisor::new());
    let snapshot = Arc::new(Mutex::new(initial_snapshot()));
    let supervisor_for_exit = Arc::clone(&supervisor);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_boot_state,
            retry_boot,
            restart_server,
            open_data_dir,
            open_external_url,
            pick_folder
        ])
        .setup(move |app| {
            let resource_dir = app.path().resource_dir().ok();
            app.manage(DesktopAppState {
                supervisor: Arc::clone(&supervisor),
                snapshot: Arc::clone(&snapshot),
                resource_dir: resource_dir.clone(),
            });

            let open_item =
                MenuItem::with_id(app, "open", "Abrir Storia Studio", true, None::<&str>)?;
            let projects_item = MenuItem::with_id(
                app,
                "projects",
                "Abrir carpeta de proyectos",
                true,
                None::<&str>,
            )?;
            let restart_item = MenuItem::with_id(
                app,
                "restart",
                "Reiniciar servidor local",
                true,
                None::<&str>,
            )?;
            let quit_item = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
            let menu =
                Menu::with_items(app, &[&open_item, &projects_item, &restart_item, &quit_item])?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Storia Studio")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => focus_main_window(app),
                    "projects" => {
                        let projects_dir = {
                            let st = app.state::<DesktopAppState>();
                            st.snapshot
                                .lock()
                                .ok()
                                .map(|s| s.projects_dir.clone())
                                .unwrap_or_default()
                        };
                        if !projects_dir.is_empty() {
                            let _ = open_in_system(&projects_dir);
                        }
                    }
                    "restart" => {
                        let st = app.state::<DesktopAppState>();
                        spawn_boot_sequence(
                            app.clone(),
                            Arc::clone(&st.supervisor),
                            Arc::clone(&st.snapshot),
                            st.resource_dir.clone(),
                            true,
                        );
                    }
                    "quit" => {
                        let st = app.state::<DesktopAppState>();
                        st.supervisor.stop();
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        focus_main_window(tray.app_handle());
                    }
                });

            if let Some(icon) = app.default_window_icon().cloned() {
                tray_builder = tray_builder.icon(icon);
            }
            let _ = tray_builder.build(app);

            spawn_boot_sequence(
                app.handle().clone(),
                Arc::clone(&supervisor),
                Arc::clone(&snapshot),
                resource_dir,
                false,
            );

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building Storia Studio desktop app");

    app.run(move |_app_handle, event| {
        if let RunEvent::Exit = event {
            supervisor_for_exit.stop();
        }
    });
}

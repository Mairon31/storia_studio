use std::env;
use std::path::PathBuf;
use std::process;
use std::thread;
use std::time::Duration;
use storia_studio_desktop_lib::runtime::{
    current_platform_label, local_server_url, open_in_system, probe_ffmpeg, probe_node,
    read_bind_config, resolve_storia_paths, ServerSupervisor,
};

fn print_help() {
    println!(
        "Storia Studio Native Rust Launcher (Windows / macOS / Linux)\n\
         \n\
         USO:\n\
           storia-launcher [OPCIONES]\n\
         \n\
         OPCIONES:\n\
           --check              Verifica Node.js, FFmpeg y rutas sin arrancar el servidor\n\
           --port <PUERTO>      Sobrescribe el puerto local (por defecto 4310)\n\
           --data-dir <RUTA>    Directorio de datos/proyectos personalizado\n\
           --headless           No abre el navegador automáticamente\n\
           -h, --help           Muestra esta ayuda"
    );
}

fn install_hint_for_os(tool: &str) -> &'static str {
    match (env::consts::OS, tool) {
        ("windows", "node") => "winget install OpenJS.NodeJS.LTS",
        ("windows", "ffmpeg") => "winget install Gyan.FFmpeg",
        ("macos", "node") => "brew install node@22",
        ("macos", "ffmpeg") => "brew install ffmpeg",
        (_, "node") => "Instala Node.js 22 LTS desde nodejs.org o mediante nvm/apt/dnf",
        (_, "ffmpeg") => "sudo apt install -y ffmpeg   (o dnf/pacman según tu distro)",
        _ => "",
    }
}

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let mut check_only = false;
    let mut headless = false;
    let mut port_override: Option<u16> = None;
    let mut data_dir_override: Option<PathBuf> = None;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "-h" | "--help" => {
                print_help();
                return;
            }
            "--check" => check_only = true,
            "--headless" | "--no-browser" => headless = true,
            "--port" => {
                if let Some(val) = args.get(i + 1) {
                    port_override = val.parse::<u16>().ok();
                    i += 1;
                }
            }
            "--data-dir" => {
                if let Some(val) = args.get(i + 1) {
                    data_dir_override = Some(PathBuf::from(val));
                    i += 1;
                }
            }
            other => {
                eprintln!("Opción desconocida: {}", other);
                print_help();
                process::exit(2);
            }
        }
        i += 1;
    }

    println!("Storia Studio Launcher · {}", current_platform_label());

    let paths = match resolve_storia_paths(None, data_dir_override.as_deref()) {
        Ok(p) => p,
        Err(err) => {
            eprintln!("[ERROR] {}", err);
            process::exit(1);
        }
    };

    let bind = read_bind_config(&paths.models_dir, port_override);
    let node = probe_node(&paths.runtime_root);
    let ffmpeg = probe_ffmpeg(&paths.runtime_root);

    println!("  Runtime  : {}", paths.runtime_root.display());
    println!("  Datos    : {}", paths.data_dir.display());
    println!("  Proyectos: {}", paths.projects_dir.display());
    println!(
        "  Node.js  : {}",
        if node.found {
            format!(
                "OK ({} · {})",
                node.version.as_deref().unwrap_or("?"),
                node.path.as_deref().unwrap_or("node")
            )
        } else {
            format!("NO ENCONTRADO — Instala con: {}", install_hint_for_os("node"))
        }
    );
    println!(
        "  FFmpeg   : {}",
        if ffmpeg.found {
            format!("OK ({})", ffmpeg.version.as_deref().unwrap_or("ffmpeg"))
        } else {
            format!(
                "NO ENCONTRADO (necesario para exportar MP4) — Instala con: {}",
                install_hint_for_os("ffmpeg")
            )
        }
    );

    if check_only {
        if !node.found {
            process::exit(1);
        }
        return;
    }

    let Some(node_bin) = node.path else {
        eprintln!("[ERROR] Node.js 22+ es obligatorio para ejecutar Storia Studio.");
        process::exit(1);
    };

    let supervisor = ServerSupervisor::new();
    let spawned = match supervisor.start(&paths, &bind, &node_bin, true) {
        Ok(s) => s,
        Err(err) => {
            eprintln!("[ERROR] {}", err);
            process::exit(1);
        }
    };

    if let Err(err) = supervisor.wait_until_healthy(bind.port, Duration::from_secs(25)) {
        eprintln!("[ERROR] {}", err);
        for line in supervisor.recent_logs() {
            eprintln!("  {}", line);
        }
        supervisor.stop();
        process::exit(1);
    }

    let url = local_server_url(bind.port);
    println!("Storia Studio listo en {}", url);

    if !headless {
        if let Err(err) = open_in_system(&url) {
            eprintln!("[AVISO] {}", err);
        }
    }

    if !spawned {
        println!("Conectado a la instancia de Storia Studio que ya estaba en ejecución.");
        return;
    }

    println!("Presiona Ctrl+C para detener el servidor de Storia Studio.");
    loop {
        thread::sleep(Duration::from_secs(1));
    }
}

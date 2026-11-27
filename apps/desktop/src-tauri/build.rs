use std::env;
use std::process::Command;

fn git_stdout(args: &[&str]) -> String {
    Command::new("git")
        .args(args)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

fn main() {
    let channel = env::var("STORIA_BUILD_CHANNEL")
        .ok()
        .map(|v| v.trim().to_lowercase())
        .filter(|v| v == "nightly" || v == "stable")
        .unwrap_or_else(|| "stable".to_string());

    let commit = env::var("GITHUB_SHA")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| git_stdout(&["rev-parse", "HEAD"]));

    let short_commit: String = commit.chars().take(7).collect();
    let repo = env::var("GITHUB_REPOSITORY")
        .ok()
        .or_else(|| env::var("STORIA_UPDATE_REPO").ok())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "Mairon31/storia_studio".to_string());

    println!("cargo:rustc-env=STORIA_BUILD_CHANNEL={}", channel);
    println!("cargo:rustc-env=STORIA_BUILD_COMMIT={}", commit);
    println!("cargo:rustc-env=STORIA_BUILD_SHORT={}", short_commit);
    println!("cargo:rustc-env=STORIA_UPDATE_REPO={}", repo);
    println!("cargo:rerun-if-env-changed=STORIA_BUILD_CHANNEL");
    println!("cargo:rerun-if-env-changed=GITHUB_SHA");
    println!("cargo:rerun-if-env-changed=GITHUB_REPOSITORY");
    println!("cargo:rerun-if-env-changed=STORIA_UPDATE_REPO");

    tauri_build::build();
}

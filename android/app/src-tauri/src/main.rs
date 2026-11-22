// Desktop entry point, for quick checks with `tauri dev`; Android starts from lib.rs.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    zplayer_android_lib::run();
}

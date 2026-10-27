use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionStatus {
    pub platform: &'static str,
    pub microphone: &'static str,
    pub accessibility: &'static str,
}

#[cfg(target_os = "macos")]
extern "C" {
    fn bruma_microphone_status() -> i32;
    fn bruma_request_microphone_permission() -> i32;
    fn bruma_accessibility_status(prompt: i32) -> i32;
}

#[cfg(any(target_os = "macos", test))]
fn microphone_label(status: i32) -> &'static str {
    match status { 0 => "notDetermined", 1 => "restricted", 2 => "denied", 3 => "authorized", _ => "unknown" }
}

pub fn status() -> PermissionStatus {
    #[cfg(target_os = "macos")]
    { PermissionStatus { platform: "macos", microphone: microphone_label(unsafe { bruma_microphone_status() }),
        accessibility: match unsafe { bruma_accessibility_status(0) } { 1 => "authorized", 0 => "denied", _ => "unknown" } } }
    #[cfg(target_os = "windows")]
    { PermissionStatus { platform: "windows", microphone: "unknown", accessibility: "notRequired" } }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    { PermissionStatus { platform: "other", microphone: "unknown", accessibility: "unknown" } }
}

pub async fn request_microphone() -> Result<PermissionStatus, String> {
    #[cfg(target_os = "macos")]
    {
        use std::sync::atomic::{AtomicBool, Ordering};
        static REQUESTING: AtomicBool = AtomicBool::new(false);
        if REQUESTING.swap(true, Ordering::AcqRel) { return Err("Ya hay una solicitud de micrófono pendiente. Responde al diálogo del sistema.".into()); }
        struct ResetRequest;
        impl Drop for ResetRequest { fn drop(&mut self) { REQUESTING.store(false, Ordering::Release); } }
        let result = tokio::task::spawn_blocking(|| {
            let _reset = ResetRequest;
            unsafe { bruma_request_microphone_permission() }
        }).await;
        result.map_err(|_| "No se pudo solicitar el permiso de micrófono.".to_string())?;
        Ok(status())
    }
    #[cfg(target_os = "windows")]
    { open_settings("microphone").await?; Ok(status()) }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    { Ok(status()) }
}

pub async fn request_accessibility(app: &tauri::AppHandle) -> Result<PermissionStatus, String> {
    #[cfg(target_os = "macos")]
    {
        let (sender, receiver) = tokio::sync::oneshot::channel();
        app.run_on_main_thread(move || {
            unsafe { bruma_accessibility_status(1); }
            let _ = sender.send(status());
        }).map_err(|_| "No se pudo solicitar el permiso de Accesibilidad.".to_string())?;
        receiver.await.map_err(|_| "No se pudo consultar Accesibilidad.".into())
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = app; Ok(status()) }
}

fn settings_url(permission: &str) -> Result<&'static str, String> {
    if !["microphone", "accessibility", "keyboard"].contains(&permission) { return Err("Permiso no válido.".into()); }
    #[cfg(target_os = "macos")]
    { Ok(match permission {
        "microphone" => "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
        // Where "Press 🌐 key to…" lives; it should say "Do Nothing" so fn is free for Bruma.
        "keyboard" => "x-apple.systempreferences:com.apple.Keyboard-Settings.extension",
        _ => "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    }) }
    #[cfg(target_os = "windows")]
    { if permission == "microphone" { Ok("ms-settings:privacy-microphone") } else { Err("Este ajuste es solo de macOS.".into()) } }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    { Err("Abre los permisos desde los ajustes de tu sistema.".into()) }
}

pub async fn open_settings(permission: &str) -> Result<(), String> {
    let url = settings_url(permission)?;
    tokio::task::spawn_blocking(move || open::that(url)).await
        .map_err(|_| "No se pudieron abrir los ajustes del sistema.".to_string())?
        .map_err(|_| "No se pudieron abrir los ajustes del sistema.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn unknown_permission_is_never_reported_as_granted() {
        assert_eq!(microphone_label(-1), "unknown");
        assert_eq!(microphone_label(0), "notDetermined");
        assert_eq!(microphone_label(1), "restricted");
        assert_eq!(microphone_label(2), "denied");
        assert_eq!(microphone_label(3), "authorized");
        assert_eq!(microphone_label(99), "unknown");
    }
    #[test] fn privacy_links_reject_arbitrary_urls_and_screen_capture() {
        assert!(settings_url("https://example.com").is_err());
        assert!(settings_url("screenRecording").is_err());
    }
}

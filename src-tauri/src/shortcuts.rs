use crate::{dictation, state::AppState};
use serde::Serialize;
use std::{str::FromStr, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

const TEST_DURATION: Duration = Duration::from_secs(30);

#[derive(Clone)]
pub struct TestSession {
    id: String,
    shortcut: Shortcut,
    label: String,
    temporary_registration: bool,
    expires_at: Instant,
}
impl TestSession {
    fn matches(&self, shortcut: &Shortcut, focused: bool, now: Instant) -> bool {
        focused && now < self.expires_at && shortcut.id() == self.shortcut.id()
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutStatus {
    shortcut: String,
    registered: bool,
    test_active: bool,
    test_id: Option<String>,
    test_expires_in_ms: u64,
    error: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TestPressed { shortcut: String, pressed_at_ms: u64, test_id: String }

pub fn status(app: &AppHandle) -> ShortcutStatus {
    let shared = dictation::shared(app);
    let test = shared.shortcut_test.lock().clone().filter(|test| Instant::now() < test.expires_at);
    let shortcut = test.as_ref().map(|test| test.label.clone()).unwrap_or_else(|| shared.settings.lock().shortcut.clone());
    let registered = Shortcut::from_str(&shortcut).ok().is_some_and(|key| app.global_shortcut().is_registered(key));
    ShortcutStatus { shortcut, registered, test_active: test.is_some(),
        test_id: test.as_ref().map(|test| test.id.clone()),
        test_expires_in_ms: test.map(|test| test.expires_at.saturating_duration_since(Instant::now()).as_millis() as u64).unwrap_or(0),
        error: if registered { None } else { Some("No se pudo registrar este atajo. Puede estar ocupado; elige otra combinación o vuelve a guardarlo.".into()) } }
}

// Caller holds save_lock so test registration never races with saving the real shortcut.
pub fn end_locked(app: &AppHandle, shared: &AppState) -> Result<(), String> {
    let test = shared.shortcut_test.lock().take();
    if let Some(test) = test {
        if test.temporary_registration {
            app.global_shortcut().unregister(test.shortcut)
                .map_err(|_| "No se pudo liberar el atajo temporal. Reinicia Bruma antes de continuar.".to_string())?;
        }
    }
    Ok(())
}

pub fn end(app: &AppHandle) -> Result<(), String> {
    let shared = dictation::shared(app);
    let _save = shared.save_lock.lock();
    end_locked(app, &shared)
}

fn end_if_current(app: &AppHandle, id: &str) {
    let _ = end_owned(app, id);
}

// A delayed frontend cleanup can only release the session that it created.
pub fn end_owned(app: &AppHandle, id: &str) -> Result<(), String> {
    let shared = dictation::shared(app);
    let _save = shared.save_lock.lock();
    let matches = shared.shortcut_test.lock().as_ref().is_some_and(|test| test.id == id);
    if matches { end_locked(app, &shared)?; }
    Ok(())
}

pub fn begin(app: &AppHandle, candidate: Option<String>) -> Result<ShortcutStatus, String> {
    let shared = dictation::shared(app);
    let _save = shared.save_lock.lock();
    // A failed new test must never leave its previous test active.
    end_locked(app, &shared)?;
    let label = candidate.unwrap_or_else(|| shared.settings.lock().shortcut.clone());
    if label.is_empty() || label.len() > 80 { return Err("Atajo no válido.".into()); }
    let shortcut = Shortcut::from_str(&label).map_err(|_| "El atajo no es válido. Usa una combinación de modificadores y una tecla.".to_string())?;
    let main = app.get_webview_window("main").ok_or("Abre Bruma para probar el atajo.")?;
    if !main.is_visible().unwrap_or(false) || !main.is_focused().unwrap_or(false) {
        return Err("Mantén Bruma visible y activa para probar el atajo sin iniciar un dictado.".into());
    }
    let control = shared.control.lock();
    if control.is_some() { return Err("Termina o cancela el dictado antes de probar el atajo.".into()); }
    let temporary_registration = !app.global_shortcut().is_registered(shortcut);
    if temporary_registration {
        app.global_shortcut().register(shortcut).map_err(|_| "Ese atajo está ocupado o el sistema no lo permite. Prueba otra combinación.".to_string())?;
    }
    let id = uuid::Uuid::new_v4().to_string();
    *shared.shortcut_test.lock() = Some(TestSession { id: id.clone(), shortcut, label, temporary_registration, expires_at: Instant::now() + TEST_DURATION });
    drop(control);
    let timer_app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(TEST_DURATION).await;
        let target_app = timer_app.clone();
        let _ = timer_app.run_on_main_thread(move || end_if_current(&target_app, &id));
    });
    Ok(status(app))
}

// False always means suppress dictation, including unknown/stale temporary hotkeys.
pub fn should_dictate(app: &AppHandle, shortcut: &Shortcut) -> bool {
    let shared = dictation::shared(app);
    let test = shared.shortcut_test.lock().clone();
    if let Some(test) = test {
        let focused = app.get_webview_window("main").is_some_and(|window|
            window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false));
        if test.matches(shortcut, focused, Instant::now()) {
            let pressed_at_ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64;
            let _ = app.emit("shortcut:test", TestPressed { shortcut: test.label, pressed_at_ms, test_id: test.id });
        } else if !focused || Instant::now() >= test.expires_at {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let target_app = app.clone();
                let _ = app.run_on_main_thread(move || end_if_current(&target_app, &test.id));
            });
        }
        return false;
    }
    let configured = shared.settings.lock().shortcut.clone();
    Shortcut::from_str(&configured).ok().is_some_and(|configured| configured.id() == shortcut.id())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn a_test_only_accepts_its_actual_key_while_focused_and_before_expiry() {
        let now = Instant::now();
        let key = Shortcut::from_str("Control+Shift+Space").unwrap();
        let other = Shortcut::from_str("Control+Shift+K").unwrap();
        let test = TestSession { id: "test".into(), shortcut: key, label: "test".into(), temporary_registration: true, expires_at: now + TEST_DURATION };
        assert!(test.matches(&key, true, now));
        assert!(!test.matches(&other, true, now));
        assert!(!test.matches(&key, false, now));
        assert!(!test.matches(&key, true, now + TEST_DURATION));
    }
}

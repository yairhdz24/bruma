use crate::model::{validate_text, AppContext};
use std::sync::Mutex;
#[cfg(target_os = "windows")]
use std::time::Duration;
use tokio_util::sync::CancellationToken;

static CLIPBOARD_LOCK: Mutex<()> = Mutex::new(());
/// Set while the welcome tour shows a practice text box in Bruma's own window,
/// so dictation pastes there instead of only copying.
pub static PRACTICE_FIELD: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[derive(Clone, Default)]
pub struct Target {
    pub context: AppContext,
    /// A few characters already written right before the cursor (never from password fields).
    pub before_cursor: Option<String>,
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    pub pid: u32,
    #[cfg(target_os = "windows")]
    pub hwnd: isize,
}

/// How the text reached the user.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Delivery { Pasted, Copied }

/// Groups apps so the editor can adapt its style (chat vs. email vs. code).
pub fn category(name: &str, bundle: &str) -> String {
    let value = format!("{} {}", name.to_lowercase(), bundle.to_lowercase());
    let has = |words: &[&str]| words.iter().any(|w| value.contains(w));
    if has(&["claude", "chatgpt", "openai", "gemini", "perplexity", "copilot", "grok", "deepseek"]) { "ai" }
    else if has(&["mail", "outlook", "thunderbird", "spark", "superhuman", "airmail"]) { "mail" }
    else if has(&["whatsapp", "messages", "mensajes", "telegram", "slack", "discord", "teams", "signal", "messenger", "imessage", "mobilesms", "instagram"]) { "messaging" }
    else if has(&["code", "cursor", "xcode", "terminal", "iterm", "warp", "zed", "windsurf", "antigravity", "intellij", "webstorm", "android studio", "ghostty", "kiro", "sublime"]) { "code" }
    else if has(&["notes", "notas", "notion", "pages", "word", "docs", "obsidian", "bear", "craft", "evernote", "textedit"]) { "docs" }
    else { "general" }.into()
}

#[cfg(target_os = "macos")]
extern "C" {
    fn bruma_frontmost_app() -> *mut std::ffi::c_char;
    fn bruma_free_symbol_data(data: *mut std::ffi::c_char);
    fn bruma_paste_text(utf8: *const std::ffi::c_char, paste: i32, restore_after_ms: i32) -> i32;
    fn bruma_track_frontmost_start();
    fn bruma_last_external_app() -> *mut std::ffi::c_char;
    fn bruma_activate_app(pid: i32) -> i32;
}

#[cfg(target_os = "macos")]
fn parse_app(raw: *mut std::ffi::c_char) -> Option<(String, String, u32)> {
    if raw.is_null() { return None; }
    let text = unsafe { std::ffi::CStr::from_ptr(raw) }.to_string_lossy().into_owned();
    unsafe { bruma_free_symbol_data(raw); }
    let mut lines = text.lines();
    let name = lines.next().unwrap_or("").to_string();
    let bundle = lines.next().unwrap_or("").to_string();
    let pid = lines.next().and_then(|p| p.parse::<u32>().ok()).unwrap_or(0);
    Some((name, bundle, pid))
}

/// Starts remembering the last app the user worked in (call once at launch).
pub fn start_tracking(app: &tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    { let _ = app.run_on_main_thread(|| unsafe { bruma_track_frontmost_start() }); }
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

/// True when Bruma's own main window is the one the user is looking at.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn main_window_focused(app: &tauri::AppHandle) -> bool {
    use tauri::Manager;
    app.get_webview_window("main").is_some_and(|w| w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false))
}

#[cfg(target_os = "macos")]
async fn frontmost(app: &tauri::AppHandle) -> Option<(String, String, u32)> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let _ = sender.send(parse_app(unsafe { bruma_frontmost_app() }));
    }).ok()?;
    receiver.await.ok().flatten()
}

#[cfg(target_os = "macos")]
pub async fn active_target(app: &tauri::AppHandle) -> Result<Target, String> {
    let (mut name, mut bundle, mut pid) = frontmost(app).await.ok_or("No se pudo detectar la aplicación activa.")?;
    // Started from the floating pill: Bruma became active, but the text belongs to the app the user was in.
    if pid == std::process::id() && !main_window_focused(app) {
        if let Some(previous) = parse_app(unsafe { bruma_last_external_app() }) { (name, bundle, pid) = previous; }
    }
    let name = if name.is_empty() { "Aplicación activa".to_string() } else { name };
    let practice = pid == std::process::id() && PRACTICE_FIELD.load(std::sync::atomic::Ordering::Acquire);
    let can_insert = practice || (pid != 0 && pid != std::process::id() && bundle != "com.bruma.voice.personal");
    Ok(Target { context: AppContext { category: category(&name, &bundle), name, bundle_id: (!bundle.is_empty()).then_some(bundle), can_insert, icon_data_url: None }, pid, before_cursor: None })
}

#[cfg(target_os = "windows")]
pub async fn active_target(_app: &tauri::AppHandle) -> Result<Target, String> {
    tokio::task::spawn_blocking(|| {
        use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId};
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.is_null() { return Target::default(); }
            let mut pid = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            let mut buffer = [0u16; 512];
            let len = GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32);
            // A window title is used only as a local label and style hint. It is never sent to a model.
            let name = String::from_utf16_lossy(&buffer[..len.max(0) as usize]);
            let label = name.rsplit(" - ").next().unwrap_or(&name).trim().to_string();
            Target { context: AppContext { category: category(&name, ""), name: if label.is_empty() { "Aplicación activa".into() } else { label }, bundle_id: None, can_insert: pid != 0 && pid != std::process::id(), icon_data_url: None }, hwnd: hwnd as isize, pid, before_cursor: None }
        }
    }).await.map_err(|_| "No se pudo detectar la aplicación.".to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub async fn active_target(_app: &tauri::AppHandle) -> Result<Target, String> { Ok(Target::default()) }

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
#[derive(Default, serde::Deserialize)]
struct Focus { #[serde(default)] secure: bool, #[serde(default)] editable: bool, #[serde(default)] before: String }

/// What is written right before the cursor in the focused field, read through Accessibility.
/// Only the last 120 characters, never from password fields.
pub async fn read_before_cursor(category: &str) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        extern "C" { fn bruma_focused_context(max_before: i32, wake_electron: i32) -> *mut std::ffi::c_char; }
        let wake = (category != "code") as i32;
        let raw = tokio::time::timeout(std::time::Duration::from_millis(400), tokio::task::spawn_blocking(move || {
            let raw = unsafe { bruma_focused_context(120, wake) };
            if raw.is_null() { return None; }
            let text = unsafe { std::ffi::CStr::from_ptr(raw) }.to_string_lossy().into_owned();
            unsafe { bruma_free_symbol_data(raw); }
            Some(text)
        })).await.ok()?.ok()??;
        let focus: Focus = serde_json::from_str(&raw).ok()?;
        if focus.secure || !focus.editable { return None; }
        Some(focus.before)
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = category; None }
}

/// Makes the dictated text join what is already written: a space after a word, none after
/// an opening bracket or at the start of a line.
pub fn fit_to_context(text: &str, before: Option<&str>) -> String {
    let text = text.trim_end_matches([' ', '\t']);
    let Some(before) = before else { return text.trim_start().to_string() };
    let trimmed = text.trim_start();
    let Some(last) = before.chars().last() else { return trimmed.to_string() };
    let Some(first) = trimmed.chars().next() else { return String::new() };
    let joins_word = !last.is_whitespace() && !"([{¿¡\"'“‘/@#-_".contains(last);
    let starts_word = first.is_alphanumeric() || "¿¡\"“(".contains(first);
    if joins_word && starts_word { format!(" {trimmed}") } else { trimmed.to_string() }
}

pub async fn attach_icon(app: &tauri::AppHandle, target: &mut Target) {
    #[cfg(target_os = "macos")]
    { target.context.icon_data_url = crate::native_context::app_icon(app, target.pid, target.context.bundle_id.clone()).await; }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, target);
}

pub fn copy(text: &str) -> Result<(), String> {
    validate_text(text)?;
    let _guard = CLIPBOARD_LOCK.lock().map_err(|_| "Portapapeles ocupado.")?;
    arboard::Clipboard::new().and_then(|mut clipboard| clipboard.set_text(text.to_string())).map_err(|_| "No se pudo copiar el texto al portapapeles.".into())
}

/// Pastes into whichever app has focus right now, like a keyboard would. If Bruma itself is in front,
/// or the system does not allow simulated typing, the text is left on the clipboard instead.
#[cfg(target_os = "macos")]
pub async fn insert(app: &tauri::AppHandle, text: &str, cancel: &CancellationToken, target: Option<&Target>) -> Result<Delivery, String> {
    validate_text(text)?;
    if cancel.is_cancelled() { return Err("Inserción cancelada.".into()); }
    let own = std::process::id();
    let front_pid = frontmost(app).await.map(|(_, _, pid)| pid).unwrap_or(0);
    // Bruma in front: its own window gets a copy; a click on the pill hands focus back to the target app.
    let return_to = if front_pid == own && !main_window_focused(app) { target.map(|t| t.pid).filter(|pid| *pid != 0 && *pid != own) } else { None };
    let practice = front_pid == own && main_window_focused(app) && PRACTICE_FIELD.load(std::sync::atomic::Ordering::Acquire);
    let paste = front_pid != 0 && (front_pid != own || return_to.is_some() || practice);
    let text = std::ffi::CString::new(text).map_err(|_| "El texto contiene caracteres no válidos.")?;
    let result = tokio::task::spawn_blocking(move || {
        let _guard = CLIPBOARD_LOCK.lock().map_err(|_| "Portapapeles ocupado.".to_string())?;
        let paste = match return_to { Some(pid) => (unsafe { bruma_activate_app(pid as i32) }) == 1, None => paste };
        Ok::<i32, String>(unsafe { bruma_paste_text(text.as_ptr(), paste as i32, 450) })
    }).await.map_err(|_| "No se pudo insertar el texto.".to_string())??;
    match result {
        0 => Ok(Delivery::Pasted),
        1 => Err("Activa Bruma en Ajustes del Sistema → Privacidad y seguridad → Accesibilidad para pegar automáticamente. Tu texto quedó en el portapapeles (⌘V).".into()),
        2 => Ok(Delivery::Copied),
        _ => Err("No se pudo preparar el texto para insertar.".into()),
    }
}

#[cfg(target_os = "windows")]
fn clipboard_is_empty_or_plain() -> Result<bool, String> {
    use windows_sys::Win32::{Foundation::{GetLastError, SetLastError}, System::DataExchange::{CloseClipboard, EnumClipboardFormats, OpenClipboard}};
    unsafe {
        if OpenClipboard(std::ptr::null_mut()) == 0 { return Err("El portapapeles está ocupado. Intenta de nuevo.".into()); }
        let mut format = 0;
        let mut empty = true;
        let mut compatible = true;
        loop {
            SetLastError(0);
            format = EnumClipboardFormats(format);
            if format == 0 {
                let failed = GetLastError() != 0;
                CloseClipboard();
                if failed { return Err("No se pudo comprobar el portapapeles.".into()); }
                break;
            }
            empty = false;
            // CF_TEXT, CF_OEMTEXT, CF_UNICODETEXT and CF_LOCALE only.
            if ![1, 7, 13, 16].contains(&format) { compatible = false; }
        }
        if !compatible { return Err("Tu portapapeles contiene imágenes o archivos; Bruma no lo reemplazó. Copia el texto desde el historial.".into()); }
        Ok(empty)
    }
}

#[cfg(target_os = "windows")]
pub async fn insert(_app: &tauri::AppHandle, text: &str, cancel: &CancellationToken, _target: Option<&Target>) -> Result<Delivery, String> {
    validate_text(text)?;
    let text = text.to_string();
    let cancel = cancel.clone();
    tokio::task::spawn_blocking(move || {
        use windows_sys::Win32::{System::DataExchange::GetClipboardSequenceNumber, UI::{WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId}, Input::KeyboardAndMouse::{SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_CONTROL}}};
        if cancel.is_cancelled() { return Err("Inserción cancelada.".into()); }
        let _guard = CLIPBOARD_LOCK.lock().map_err(|_| "Portapapeles ocupado.".to_string())?;
        let mut pid = 0;
        unsafe { GetWindowThreadProcessId(GetForegroundWindow(), &mut pid); }
        let mut clipboard = arboard::Clipboard::new().map_err(|_| "No se pudo abrir el portapapeles.".to_string())?;
        if pid == 0 || pid == std::process::id() {
            clipboard.set_text(text).map_err(|_| "No se pudo copiar el texto.".to_string())?;
            return Ok(Delivery::Copied);
        }
        let was_empty = clipboard_is_empty_or_plain()?;
        let previous = if was_empty { None } else { clipboard.get_text().ok() };
        clipboard.set_text(text.clone()).map_err(|_| "No se pudo preparar el texto para insertar.".to_string())?;
        let sequence = unsafe { GetClipboardSequenceNumber() };
        let key = |vk, flags| INPUT { r#type: INPUT_KEYBOARD, Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: vk, wScan: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } } };
        let inputs = [key(VK_CONTROL, 0), key(0x56, 0), key(0x56, KEYEVENTF_KEYUP), key(VK_CONTROL, KEYEVENTF_KEYUP)];
        let sent = unsafe { SendInput(inputs.len() as u32, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32) } == inputs.len() as u32;
        std::thread::sleep(Duration::from_millis(450));
        if unsafe { GetClipboardSequenceNumber() } == sequence {
            if let Some(previous) = previous { let _ = clipboard.set_text(previous); } else if was_empty { let _ = clipboard.clear(); }
        }
        if sent { Ok(Delivery::Pasted) } else { Err("Windows no pudo pegar el texto. Las ventanas de administrador pueden bloquearlo.".into()) }
    }).await.map_err(|_| "No se pudo insertar el texto.".to_string())?
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub async fn insert(_app: &tauri::AppHandle, text: &str, _cancel: &CancellationToken, _target: Option<&Target>) -> Result<Delivery, String> { copy(text)?; Ok(Delivery::Copied) }

#[cfg(test)]
mod tests {
    use super::{category, fit_to_context};
    #[test] fn dictation_joins_the_text_before_the_cursor() {
        assert_eq!(fit_to_context("y luego el deploy.", Some("Revisamos el diseño")), " y luego el deploy.");
        assert_eq!(fit_to_context("Hola.", Some("Dijo: ")), "Hola.");
        assert_eq!(fit_to_context("Hola.", Some("")), "Hola.");
        assert_eq!(fit_to_context("nota", Some("(")), "nota");
        assert_eq!(fit_to_context(" ¿Vienes?", Some("Listo.")), " ¿Vienes?");
        assert_eq!(fit_to_context("Hola ", None), "Hola");
        assert_eq!(fit_to_context(", gracias", Some("Perfecto")), ", gracias");
    }
    #[test] fn categories_follow_the_destination_app() {
        assert_eq!(category("WhatsApp", "net.whatsapp.WhatsApp"), "messaging");
        assert_eq!(category("Cursor", "com.todesktop.230313mzl4w4u92"), "code");
        assert_eq!(category("Claude", "com.anthropic.claudefordesktop"), "ai");
        assert_eq!(category("Mail", "com.apple.mail"), "mail");
        assert_eq!(category("Notas", "com.apple.Notes"), "docs");
        assert_eq!(category("Finder", "com.apple.finder"), "general");
    }
}

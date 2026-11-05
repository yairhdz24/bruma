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
    #[cfg(target_os = "windows")]
    { let _ = app; win::track_foreground(); }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let _ = app;
}

/// True when Bruma's own main window is the one the user is looking at.
#[cfg_attr(not(any(target_os = "macos", target_os = "windows")), allow(dead_code))]
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
pub async fn active_target(app: &tauri::AppHandle) -> Result<Target, String> {
    let main_focused = main_window_focused(app);
    tokio::task::spawn_blocking(move || {
        let own = std::process::id();
        let (mut hwnd, mut pid) = win::foreground();
        // Started from the floating pill: Bruma came to the front, but the text belongs to the app the user was in.
        if pid == own && !main_focused { if let Some(previous) = win::last_external() { (hwnd, pid) = previous; } }
        if hwnd == 0 { return Target::default(); }
        // The window title and program name are only a local label and style hint. They are never sent to a model.
        let title = win::window_title(hwnd);
        let exe = win::process_name(pid).unwrap_or_default();
        let label = win::friendly_name(&exe).map(str::to_string)
            .or_else(|| title.rsplit(" - ").next().map(|t| t.trim().to_string()).filter(|t| !t.is_empty()))
            .unwrap_or_else(|| "Aplicación activa".into());
        let practice = pid == own && PRACTICE_FIELD.load(std::sync::atomic::Ordering::Acquire);
        let can_insert = practice || (pid != 0 && pid != own);
        Target { context: AppContext { category: category(&format!("{title} {label}"), &exe), name: label, bundle_id: None, can_insert, icon_data_url: None }, hwnd, pid, before_cursor: None }
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

/// Pastes like a keyboard would: puts the text on the clipboard, presses Ctrl+V and then puts back
/// whatever you had copied before (text, images, files: every format Windows lets us read).
#[cfg(target_os = "windows")]
pub async fn insert(app: &tauri::AppHandle, text: &str, cancel: &CancellationToken, target: Option<&Target>) -> Result<Delivery, String> {
    validate_text(text)?;
    let text = text.to_string();
    let cancel = cancel.clone();
    let own = std::process::id();
    let main_focused = main_window_focused(app);
    let practice = main_focused && PRACTICE_FIELD.load(std::sync::atomic::Ordering::Acquire);
    let return_to = target.filter(|t| t.hwnd != 0 && t.pid != own).map(|t| t.hwnd)
        .or_else(|| win::last_external().map(|(hwnd, _)| hwnd));
    tokio::task::spawn_blocking(move || {
        if cancel.is_cancelled() { return Err("Inserción cancelada.".into()); }
        let _guard = CLIPBOARD_LOCK.lock().map_err(|_| "Portapapeles ocupado.".to_string())?;
        let (_, mut pid) = win::foreground();
        // A click on the pill brought Bruma to the front: hand focus back to the app you were writing in.
        if pid == own && !main_focused {
            if let Some(hwnd) = return_to { if win::focus(hwnd) { pid = win::foreground().1; } }
        }
        if pid == 0 || (pid == own && !practice) {
            arboard::Clipboard::new().and_then(|mut c| c.set_text(text)).map_err(|_| "No se pudo copiar el texto.".to_string())?;
            return Ok(Delivery::Copied);
        }
        let saved = win::clipboard_snapshot();
        arboard::Clipboard::new().and_then(|mut c| c.set_text(text.clone())).map_err(|_| "No se pudo preparar el texto para insertar.".to_string())?;
        let sequence = win::clipboard_sequence();
        // The keys of your shortcut may still be down (Shift or Alt + Ctrl+V would do something else).
        win::wait_for_modifiers_release(Duration::from_millis(700));
        if cancel.is_cancelled() { return Err("Inserción cancelada.".into()); }
        let sent = win::press_paste();
        std::thread::sleep(Duration::from_millis(450));
        // Only put your previous clipboard back if nothing else was copied meanwhile.
        if win::clipboard_sequence() == sequence { win::clipboard_restore(saved); }
        if sent { Ok(Delivery::Pasted) } else { Err("Windows no dejó pegar el texto (las ventanas de administrador lo bloquean). Tu texto está en el historial.".into()) }
    }).await.map_err(|_| "No se pudo insertar el texto.".to_string())?
}

#[cfg(target_os = "windows")]
mod win {
    use std::sync::atomic::{AtomicIsize, AtomicU32, Ordering};
    use std::time::{Duration, Instant};
    use windows_sys::Win32::{
        Foundation::{CloseHandle, GlobalFree, HWND},
        System::{DataExchange::*, Memory::*, Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION}},
        UI::{Input::KeyboardAndMouse::*, WindowsAndMessaging::*},
    };

    static LAST_HWND: AtomicIsize = AtomicIsize::new(0);
    static LAST_PID: AtomicU32 = AtomicU32::new(0);

    pub fn foreground() -> (isize, u32) {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.is_null() { return (0, 0); }
            let mut pid = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            (hwnd as isize, pid)
        }
    }

    /// Remembers the last window that was not Bruma, so a click on the pill still knows where to paste.
    pub fn track_foreground() {
        let _ = std::thread::Builder::new().name("bruma-foreground".into()).spawn(|| {
            let own = std::process::id();
            loop {
                let (hwnd, pid) = foreground();
                if hwnd != 0 && pid != 0 && pid != own {
                    LAST_HWND.store(hwnd, Ordering::Release);
                    LAST_PID.store(pid, Ordering::Release);
                }
                std::thread::sleep(Duration::from_millis(250));
            }
        });
    }

    pub fn last_external() -> Option<(isize, u32)> {
        let hwnd = LAST_HWND.load(Ordering::Acquire);
        let alive = hwnd != 0 && unsafe { IsWindow(hwnd as HWND) } != 0;
        alive.then(|| (hwnd, LAST_PID.load(Ordering::Acquire)))
    }

    pub fn focus(hwnd: isize) -> bool {
        unsafe {
            let hwnd = hwnd as HWND;
            if IsWindow(hwnd) == 0 { return false; }
            if IsIconic(hwnd) != 0 { ShowWindow(hwnd, SW_RESTORE); }
            let ok = SetForegroundWindow(hwnd) != 0;
            std::thread::sleep(Duration::from_millis(120));
            ok && GetForegroundWindow() == hwnd
        }
    }

    pub fn window_title(hwnd: isize) -> String {
        let mut buffer = [0u16; 512];
        let len = unsafe { GetWindowTextW(hwnd as HWND, buffer.as_mut_ptr(), buffer.len() as i32) };
        String::from_utf16_lossy(&buffer[..len.max(0) as usize])
    }

    /// The program's file name without ".exe", in lowercase (for example "whatsapp" or "code").
    pub fn process_name(pid: u32) -> Option<String> {
        if pid == 0 { return None; }
        unsafe {
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if process.is_null() { return None; }
            let mut buffer = [0u16; 1024];
            let mut len = buffer.len() as u32;
            let ok = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, buffer.as_mut_ptr(), &mut len) != 0;
            CloseHandle(process);
            if !ok { return None; }
            let path = String::from_utf16_lossy(&buffer[..len as usize]);
            let file = path.rsplit(['\\', '/']).next().unwrap_or(&path).to_lowercase();
            Some(file.strip_suffix(".exe").unwrap_or(&file).to_string())
        }
    }

    /// Names people know, for the programs they dictate into most.
    pub fn friendly_name(exe: &str) -> Option<&'static str> {
        Some(match exe {
            "winword" => "Word", "excel" => "Excel", "powerpnt" => "PowerPoint", "outlook" | "olk" => "Outlook", "onenote" => "OneNote",
            "ms-teams" | "teams" => "Teams", "code" => "VS Code", "cursor" => "Cursor", "windsurf" => "Windsurf", "notepad" => "Bloc de notas",
            "chrome" => "Chrome", "msedge" => "Edge", "firefox" => "Firefox", "brave" => "Brave", "opera" => "Opera", "arc" => "Arc",
            "whatsapp" | "whatsapp.root" => "WhatsApp", "telegram" => "Telegram", "slack" => "Slack", "discord" => "Discord", "signal" => "Signal",
            "notion" => "Notion", "obsidian" => "Obsidian", "claude" => "Claude", "chatgpt" => "ChatGPT",
            "windowsterminal" => "Terminal", "powershell" | "pwsh" => "PowerShell", "cmd" => "Símbolo del sistema", "explorer" => "Explorador",
            _ => return None,
        })
    }

    pub fn clipboard_sequence() -> u32 { unsafe { GetClipboardSequenceNumber() } }

    fn key_down(vk: u16) -> bool { (unsafe { GetAsyncKeyState(vk as i32) } as u16 & 0x8000) != 0 }

    const MODIFIERS: [u16; 5] = [VK_SHIFT, VK_CONTROL, VK_MENU, VK_LWIN, VK_RWIN];

    /// Waits a moment for you to let go of your shortcut, then lifts any key still held.
    pub fn wait_for_modifiers_release(limit: Duration) {
        let start = Instant::now();
        while MODIFIERS.iter().any(|vk| key_down(*vk)) && start.elapsed() < limit { std::thread::sleep(Duration::from_millis(15)); }
        let held: Vec<INPUT> = MODIFIERS.iter().filter(|vk| key_down(**vk)).map(|vk| key(*vk, KEYEVENTF_KEYUP)).collect();
        if !held.is_empty() { unsafe { SendInput(held.len() as u32, held.as_ptr(), std::mem::size_of::<INPUT>() as i32); } }
    }

    fn key(vk: u16, flags: KEYBD_EVENT_FLAGS) -> INPUT {
        INPUT { r#type: INPUT_KEYBOARD, Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: vk, wScan: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } } }
    }

    pub fn press_paste() -> bool {
        let inputs = [key(VK_CONTROL, 0), key(0x56, 0), key(0x56, KEYEVENTF_KEYUP), key(VK_CONTROL, KEYEVENTF_KEYUP)];
        unsafe { SendInput(inputs.len() as u32, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32) == inputs.len() as u32 }
    }

    fn open_clipboard() -> bool {
        // Another app may hold the clipboard for a moment.
        for _ in 0..10 { if unsafe { OpenClipboard(std::ptr::null_mut()) } != 0 { return true; } std::thread::sleep(Duration::from_millis(20)); }
        false
    }

    /// Formats whose data is not plain memory (bitmaps, metafiles, palettes, owner-drawn, private GDI).
    /// Windows recreates bitmaps from the DIB copy, so nothing visible is lost.
    fn copyable(format: u32) -> bool {
        !matches!(format, 2 | 3 | 9 | 14 | 0x80 | 0x82 | 0x83 | 0x8E) && !(0x300..=0x3FF).contains(&format)
    }

    pub struct Snapshot(Vec<(u32, Vec<u8>)>);

    /// A copy of everything on the clipboard right now (up to 64 MB).
    pub fn clipboard_snapshot() -> Snapshot {
        let mut items = Vec::new();
        if !open_clipboard() { return Snapshot(items); }
        let mut total = 0usize;
        let mut format = 0;
        unsafe {
            loop {
                format = EnumClipboardFormats(format);
                if format == 0 { break; }
                if !copyable(format) { continue; }
                let handle = GetClipboardData(format);
                if handle.is_null() { continue; }
                let size = GlobalSize(handle);
                if size == 0 || total + size > 64 * 1024 * 1024 { continue; }
                let data = GlobalLock(handle) as *const u8;
                if data.is_null() { continue; }
                items.push((format, std::slice::from_raw_parts(data, size).to_vec()));
                total += size;
                GlobalUnlock(handle);
            }
            CloseClipboard();
        }
        Snapshot(items)
    }

    pub fn clipboard_restore(snapshot: Snapshot) {
        if !open_clipboard() { return; }
        unsafe {
            EmptyClipboard();
            for (format, bytes) in snapshot.0 {
                let memory = GlobalAlloc(GMEM_MOVEABLE, bytes.len());
                if memory.is_null() { continue; }
                let target = GlobalLock(memory) as *mut u8;
                if target.is_null() { GlobalFree(memory); continue; }
                std::ptr::copy_nonoverlapping(bytes.as_ptr(), target, bytes.len());
                GlobalUnlock(memory);
                // Windows owns the memory once it accepts it.
                if SetClipboardData(format, memory).is_null() { GlobalFree(memory); }
            }
            CloseClipboard();
        }
    }
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

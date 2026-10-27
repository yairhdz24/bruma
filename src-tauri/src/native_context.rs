#[cfg(target_os = "macos")]
pub async fn app_icon(app: &tauri::AppHandle, pid: u32, bundle: Option<String>) -> Option<String> {
    use std::ffi::{c_char, CStr, CString};
    extern "C" {
        fn bruma_app_icon_png(pid: i32, expected_bundle: *const c_char) -> *mut c_char;
        fn bruma_free_symbol_data(data: *mut c_char);
    }
    if pid == 0 || pid > i32::MAX as u32 { return None; }
    let bundle = CString::new(bundle?).ok()?;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let raw = unsafe { bruma_app_icon_png(pid as i32, bundle.as_ptr()) };
        let value = if raw.is_null() { None } else {
            let value = unsafe { CStr::from_ptr(raw) }.to_str().ok()
                .filter(|value| value.len() <= 90_000)
                .map(|value| format!("data:image/png;base64,{value}"));
            unsafe { bruma_free_symbol_data(raw); }
            value
        };
        let _ = sender.send(value);
    }).ok()?;
    receiver.await.ok().flatten()
}

/// Icon of an installed app by bundle identifier, cached for the session (history rows).
#[cfg(target_os = "macos")]
pub async fn bundle_icon(app: &tauri::AppHandle, bundle: String) -> Option<String> {
    use parking_lot::Mutex;
    use std::{collections::HashMap, ffi::{c_char, CStr, CString}, sync::OnceLock};
    extern "C" {
        fn bruma_bundle_icon_png(bundle: *const c_char) -> *mut c_char;
        fn bruma_free_symbol_data(data: *mut c_char);
    }
    static CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if bundle.is_empty() || bundle.len() > 200 || !bundle.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_')) { return None; }
    if let Some(hit) = cache.lock().get(&bundle) { return hit.clone(); }
    let name = CString::new(bundle.clone()).ok()?;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let raw = unsafe { bruma_bundle_icon_png(name.as_ptr()) };
        let value = if raw.is_null() { None } else {
            let value = unsafe { CStr::from_ptr(raw) }.to_str().ok().filter(|v| v.len() <= 90_000).map(|v| format!("data:image/png;base64,{v}"));
            unsafe { bruma_free_symbol_data(raw); }
            value
        };
        let _ = sender.send(value);
    }).ok()?;
    let value = receiver.await.ok().flatten();
    if cache.lock().len() < 200 { cache.lock().insert(bundle, value.clone()); }
    value
}

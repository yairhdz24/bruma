use tauri::AppHandle;

// Keep the IPC surface finite; arbitrary paths or symbol/font enumeration are not accepted.
const ALLOWED_SYMBOLS: &[&str] = &[
    "waveform", "mic.fill", "gearshape", "book.closed.fill", "person.crop.circle",
    "paintpalette.fill", "network", "moon.fill", "sun.max.fill", "globe", "keyboard",
    "chevron.down", "arrow.up.right.square", "arrow.right", "checkmark", "xmark",
    "stop.fill", "pause.fill", "doc.text", "lock.shield", "key.fill", "sparkles",
    "textformat", "plus", "arrow.down.left", "rectangle.on.rectangle",
    "chevron.right", "arrow.clockwise", "trash", "link",
    "accessibility", "desktopcomputer", "magnifyingglass", "arrow.uturn.backward",
];

pub async fn get(app: &AppHandle, name: String) -> Option<String> {
    if !ALLOWED_SYMBOLS.contains(&name.as_str()) { return None; }
    #[cfg(target_os = "macos")]
    {
        if let Some(cached) = macos::cached(&name) { return cached; }
        let (sender, receiver) = tokio::sync::oneshot::channel();
        app.run_on_main_thread(move || {
            let _ = sender.send(macos::render_cached(&name));
        }).ok()?;
        receiver.await.ok().flatten()
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = app; None }
}

#[cfg(target_os = "macos")]
mod macos {
    use parking_lot::Mutex;
    use std::{collections::HashMap, ffi::{c_char, CStr, CString}, sync::OnceLock};

    extern "C" {
        fn bruma_system_symbol_png(name: *const c_char) -> *mut c_char;
        fn bruma_free_symbol_data(data: *mut c_char);
    }

    // At most the 34 allowed names; cache missing assets as well for older macOS versions.
    static CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
    fn cache() -> &'static Mutex<HashMap<String, Option<String>>> { CACHE.get_or_init(|| Mutex::new(HashMap::new())) }
    pub fn cached(name: &str) -> Option<Option<String>> { cache().lock().get(name).cloned() }

    pub fn render_cached(name: &str) -> Option<String> {
        if let Some(cached) = cached(name) { return cached; }
        let rendered = render(name);
        cache().lock().insert(name.to_string(), rendered.clone());
        rendered
    }

    fn render(name: &str) -> Option<String> {
        let name = CString::new(name).ok()?;
        // AppKit is called only through AppHandle::run_on_main_thread above.
        let raw = unsafe { bruma_system_symbol_png(name.as_ptr()) };
        if raw.is_null() { return None; }
        let data = unsafe { CStr::from_ptr(raw) }.to_str().ok()
            .filter(|value| value.len() <= 90_000)
            .map(|value| format!("data:image/png;base64,{value}"));
        unsafe { bruma_free_symbol_data(raw); }
        data
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn symbol_names_are_a_finite_non_file_allowlist() {
        assert_eq!(ALLOWED_SYMBOLS.len(), 34);
        assert!(ALLOWED_SYMBOLS.iter().all(|name| name.bytes().all(|byte| byte.is_ascii_lowercase() || byte == b'.')));
        assert!(!ALLOWED_SYMBOLS.contains(&"../../secret"));
        assert!(!ALLOWED_SYMBOLS.contains(&"file:///Users/example"));
    }
}

//! The fn (🌐) key as a dictation key, alone or as fn + Space: tap to start, tap again to
//! finish and paste; or hold, speak, and let go. Combinations such as fn + ← are left alone.

#[cfg(target_os = "macos")]
mod mac {
    use crate::dictation;
    use parking_lot::Mutex;
    use serde::Serialize;
    use std::{sync::OnceLock, time::{Duration, Instant}};
    use tauri::{AppHandle, Emitter};

    /// Holding the key longer than this is push-to-talk; a shorter press is a tap.
    const HOLD_AFTER: Duration = Duration::from_millis(320);

    extern "C" {
        fn bruma_keys_start(callback: extern "C" fn(i32, i32)) -> i32;
        fn bruma_keys_ready() -> i32;
        fn bruma_keys_space_mode(enabled: i32);
    }

    struct Press { id: u64, down_at: Option<Instant>, combo: bool, hold_started: bool }
    static APP: OnceLock<AppHandle> = OnceLock::new();
    static PRESS: Mutex<Press> = Mutex::new(Press { id: 0, down_at: None, combo: false, hold_started: false });

    #[derive(Clone, Serialize)]
    struct FnEvent { down: bool, space: bool }

    pub fn start(app: &AppHandle) {
        if APP.set(app.clone()).is_err() { return; }
        apply(app);
        unsafe { bruma_keys_start(on_key); }
    }

    /// Call after settings change: tells the native watcher whether Space belongs to Bruma.
    pub fn apply(app: &AppHandle) {
        let settings = dictation::shared(app).settings.lock().clone();
        let space = settings.fn_key && settings.fn_combo == "fn+space";
        unsafe { bruma_keys_space_mode(space as i32); }
    }

    pub fn ready() -> bool { unsafe { bruma_keys_ready() == 1 } }

    /// Which physical press dictates right now: "fn", "fn+space" or none.
    fn mode(app: &AppHandle) -> Option<String> {
        let shared = dictation::shared(app);
        if shared.shortcut_test.lock().is_some() { return None; }
        let settings = shared.settings.lock();
        settings.fn_key.then(|| settings.fn_combo.clone())
    }

    fn active(app: &AppHandle) -> bool { dictation::shared(app).voice.lock().active() }

    fn press_down(app: AppHandle) {
        let id = {
            let mut press = PRESS.lock();
            press.id = press.id.wrapping_add(1);
            press.down_at = Some(Instant::now()); press.combo = false; press.hold_started = false;
            press.id
        };
        if active(&app) { return; }
        // Still down after a moment and not part of a combination: push-to-talk.
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(HOLD_AFTER).await;
            let begin = {
                let mut press = PRESS.lock();
                let still = press.id == id && press.down_at.is_some() && !press.combo;
                if still { press.hold_started = true; }
                still
            };
            if begin && !active(&app) { dictation::begin_from_key(app, true).await; }
        });
    }

    fn press_up(app: AppHandle) {
        let (tap, hold, combo) = {
            let mut press = PRESS.lock();
            let held = press.down_at.take().map(|t| t.elapsed()).unwrap_or_default();
            (held < HOLD_AFTER && !press.combo, press.hold_started, press.combo)
        };
        if hold {
            // The session may still be opening the microphone; wait for it, then finish.
            tauri::async_runtime::spawn(async move {
                for _ in 0..20 {
                    if dictation::stop(&app).is_ok() { return; }
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
            });
        } else if active(&app) && !combo && !tap {
            let _ = dictation::stop(&app);
        } else if tap {
            crate::toggle_dictation(app);
        }
    }

    fn press_combo(app: &AppHandle) {
        let mut press = PRESS.lock();
        press.combo = true;
        // fn + another key right after a hold started: the user wanted the combination.
        if press.hold_started && press.down_at.is_some_and(|t| t.elapsed() < HOLD_AFTER + Duration::from_millis(250)) {
            press.hold_started = false;
            drop(press);
            dictation::cancel(app);
        }
    }

    extern "C" fn on_key(kind: i32, _shift: i32) {
        let Some(app) = APP.get().cloned() else { return };
        let mode = mode(&app);
        let fn_alone = mode.as_deref() == Some("fn");
        let fn_space = mode.as_deref() == Some("fn+space");
        match kind {
            1 => { let _ = app.emit("fn:key", FnEvent { down: true, space: false }); if fn_alone { press_down(app); } }
            2 => { let _ = app.emit("fn:key", FnEvent { down: false, space: false }); if fn_alone { press_up(app); } }
            3 => { if fn_alone { press_combo(&app); } }
            4 => { let _ = app.emit("fn:key", FnEvent { down: true, space: true }); if fn_space { press_down(app); } }
            5 => { let _ = app.emit("fn:key", FnEvent { down: false, space: true }); if fn_space { press_up(app); } }
            _ => {}
        }
    }
}

#[cfg(target_os = "macos")]
pub use mac::{apply, ready, start};

#[cfg(not(target_os = "macos"))]
pub fn start(_app: &tauri::AppHandle) {}
#[cfg(not(target_os = "macos"))]
pub fn apply(_app: &tauri::AppHandle) {}
#[cfg(not(target_os = "macos"))]
pub fn ready() -> bool { false }

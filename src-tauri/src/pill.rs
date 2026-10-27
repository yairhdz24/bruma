//! The floating pill: a small always-on-top window that sits just above the Dock.
//! It is transparent and lets clicks through, except over the pill itself, which the
//! web view reports as a hitbox. A light poller (20 Hz) toggles click-through and hover.
use crate::{dictation, model::VoiceState};
use std::{sync::Mutex, time::{Duration, Instant}};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewWindow};

/// Logical size of the overlay window. The pill grows inside it, so resizing never janks.
pub const WIDTH: f64 = 420.0;
pub const HEIGHT: f64 = 168.0;
/// Space between the pill window and the Dock (or the bottom of the screen).
const GAP: f64 = 2.0;

struct State { hitbox: Option<(f64, f64, f64, f64)> }
static STATE: Mutex<State> = Mutex::new(State { hitbox: None });

pub fn always_on(app: &AppHandle) -> bool { dictation::shared(app).settings.lock().show_pill }

fn window(app: &AppHandle) -> Option<WebviewWindow> { app.get_webview_window("overlay") }

/// The display under the mouse pointer, where the user is working.
fn monitor_under_cursor(window: &WebviewWindow) -> Option<tauri::Monitor> {
    let point = window.cursor_position().ok()?;
    window.available_monitors().ok()?.into_iter().find(|m| {
        let (p, s) = (m.position(), m.size());
        point.x >= p.x as f64 && point.x < p.x as f64 + s.width as f64 && point.y >= p.y as f64 && point.y < p.y as f64 + s.height as f64
    }).or_else(|| window.current_monitor().ok().flatten())
}

/// Bottom-center of the usable area (above the Dock), on the display with the pointer.
pub fn place(app: &AppHandle) {
    let Some(window) = window(app) else { return };
    let Some(monitor) = monitor_under_cursor(&window) else { return };
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let x = area.position.x as f64 + (area.size.width as f64 - WIDTH * scale) / 2.0;
    let y = area.position.y as f64 + area.size.height as f64 - (HEIGHT + GAP) * scale;
    let _ = window.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
}

/// Shows the pill without stealing focus from the app the user is typing in.
pub fn show(app: &AppHandle) -> Result<(), String> {
    let window = window(app).ok_or("No se encontró el indicador de dictado. Reinicia Bruma.")?;
    if !window.is_visible().unwrap_or(false) {
        place(app);
        let _ = window.set_ignore_cursor_events(true);
    }
    window.show().map_err(|_| "No se pudo mostrar el indicador de dictado. Vuelve a abrir Bruma.".to_string())?;
    let _ = window.emit("overlay:shown", ());
    Ok(())
}

/// Back to rest after a dictation: the idle pill when it is always visible, otherwise hidden.
pub fn park(app: &AppHandle) {
    if always_on(app) {
        let shared = dictation::shared(app);
        let idle = { let mut voice = shared.voice.lock(); *voice = VoiceState::default(); voice.clone() };
        let _ = app.emit("voice:state", idle);
    } else if let Some(window) = window(app) {
        let _ = window.emit("overlay:hide", ());
        let _ = window.hide();
    }
}

/// Applies the "always show the pill" setting right away.
pub fn apply_setting(app: &AppHandle) {
    let active = dictation::shared(app).voice.lock().active();
    if always_on(app) { let _ = show(app); }
    else if !active { if let Some(window) = window(app) { let _ = window.hide(); } }
}

/// Rectangle (CSS pixels, relative to the overlay window) that should receive clicks.
pub fn set_hitbox(rect: Option<(f64, f64, f64, f64)>) {
    if let Ok(mut state) = STATE.lock() { state.hitbox = rect.filter(|r| r.2 > 0.0 && r.3 > 0.0); }
}

pub fn spawn_poller(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_millis(50));
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        let mut inside_before: Option<bool> = None;
        let mut checked_screen = Instant::now();
        let mut screen: Option<(i32, i32)> = None;
        loop {
            tick.tick().await;
            let Some(window) = window(&app) else { continue };
            if !window.is_visible().unwrap_or(false) { inside_before = None; continue; }
            let Ok(cursor) = window.cursor_position() else { continue };
            // Follow the pointer to another display while nothing is happening.
            if checked_screen.elapsed() >= Duration::from_millis(500) {
                checked_screen = Instant::now();
                let idle = !dictation::shared(&app).voice.lock().active() && dictation::shared(&app).control.lock().is_none();
                let current = monitor_under_cursor(&window).map(|m| (m.position().x, m.position().y));
                if idle && current.is_some() && current != screen { screen = current; place(&app); }
            }
            let Ok(origin) = window.outer_position() else { continue };
            let scale = window.scale_factor().unwrap_or(1.0);
            let hitbox = STATE.lock().ok().and_then(|s| s.hitbox);
            let inside = hitbox.is_some_and(|(x, y, w, h)| {
                let (left, top) = (origin.x as f64 + x * scale, origin.y as f64 + y * scale);
                cursor.x >= left && cursor.x <= left + w * scale && cursor.y >= top && cursor.y <= top + h * scale
            });
            if inside_before != Some(inside) {
                inside_before = Some(inside);
                let _ = window.set_ignore_cursor_events(!inside);
                let _ = window.emit("overlay:hover", inside);
            }
        }
    });
}

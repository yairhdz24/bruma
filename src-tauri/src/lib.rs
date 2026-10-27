mod audio;
mod dictation;
mod history;
mod model;
mod platform;
mod providers;
mod state;
mod system_symbols;
mod native_context;
mod permissions;
mod pill;
mod shortcuts;
mod fn_key;
mod learn;
mod models;

use model::{AppContext, ProviderStatus, Settings, VoiceState};
use state::AppState;
use std::str::FromStr;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tokio_util::sync::CancellationToken;

#[tauri::command]
fn get_settings(app: AppHandle) -> Settings { dictation::shared(&app).settings.lock().clone() }

#[tauri::command]
async fn get_system_symbol(app: AppHandle, name: String) -> Option<String> { system_symbols::get(&app, name).await }

#[tauri::command]
fn get_permission_status() -> permissions::PermissionStatus { permissions::status() }
#[tauri::command]
async fn request_microphone_permission() -> Result<permissions::PermissionStatus, String> { permissions::request_microphone().await }
#[tauri::command]
async fn request_accessibility_permission(app: AppHandle) -> Result<permissions::PermissionStatus, String> { permissions::request_accessibility(&app).await }
#[tauri::command]
async fn open_privacy_settings(permission: String) -> Result<(), String> { permissions::open_settings(&permission).await }
/// True once macOS lets Bruma watch the fn key (needs Accessibility).
#[tauri::command]
fn get_fn_key_ready() -> bool { fn_key::ready() }
#[tauri::command]
fn get_shortcut_status(app: AppHandle) -> shortcuts::ShortcutStatus { shortcuts::status(&app) }
#[tauri::command]
fn begin_shortcut_test(app: AppHandle, shortcut: Option<String>) -> Result<shortcuts::ShortcutStatus, String> { shortcuts::begin(&app, shortcut) }
#[tauri::command]
fn end_shortcut_test(app: AppHandle, test_id: String) -> Result<(), String> { shortcuts::end_owned(&app, &test_id) }

#[tauri::command]
async fn open_project_updates() -> Result<(), String> {
    // Manual updates use the user's normal browser session; no repository token enters Bruma.
    tokio::task::spawn_blocking(|| open::that("https://github.com/yairhdz24/bruma/releases"))
        .await.map_err(|_| "No se pudo abrir el navegador.".to_string())?
        .map_err(|_| "No se pudo abrir la página de actualizaciones en el navegador.".into())
}

/// Opens a provider's console in the user's browser. Only these pages; never a URL from content.
#[tauri::command]
async fn open_url(url: String) -> Result<(), String> {
    const ALLOWED: [&str; 9] = ["https://console.groq.com/keys", "https://platform.openai.com/api-keys", "https://console.anthropic.com/settings/keys", "https://console.deepgram.com/", "https://github.com/speaches-ai/speaches",
        "https://github.com/yairhdz24/bruma", "https://github.com/yairhdz24/bruma/releases", "https://github.com/yairhdz24/bruma/issues/new/choose", "https://github.com/yairhdz24"];
    if !ALLOWED.contains(&url.as_str()) { return Err("Dirección no permitida.".into()); }
    tokio::task::spawn_blocking(move || open::that(url)).await.map_err(|_| "No se pudo abrir el navegador.".to_string())?
        .map_err(|_| "No se pudo abrir el navegador.".into())
}

fn update_window_appearance(app: &AppHandle, settings: &Settings) {
    let theme = match settings.theme.as_str() {
        "light" => Some(tauri::Theme::Light),
        "dark" => Some(tauri::Theme::Dark),
        _ => None, // None restores the system appearance, including future OS changes.
    };
    for label in ["main", "overlay"] {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.set_theme(theme.clone());
        }
    }
    #[cfg(target_os = "macos")]
    if let Some(window) = app.get_webview_window("main") {
        use tauri::window::{Effect, EffectState, EffectsBuilder};
        // Explicitly clear first: older Tauri versions can otherwise stack material views.
        let _ = window.set_effects(None::<tauri::utils::config::WindowEffectsConfig>);
        if !settings.reduce_transparency && !settings.high_contrast {
            let _ = window.set_effects(EffectsBuilder::new()
                .effect(Effect::Sidebar)
                .state(EffectState::Active)
                .build());
        }
    }
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: Settings) -> Result<Settings, String> {
    settings.validate()?;
    let new_shortcut = Shortcut::from_str(&settings.shortcut).map_err(|_| "El atajo no es válido. Usa una combinación como CommandOrControl+Shift+Space.")?;
    let shared = dictation::shared(&app);
    let _save = shared.save_lock.lock();
    shortcuts::end_locked(&app, &shared)?;
    let previous = shared.settings.lock().clone();
    let old_shortcut = Shortcut::from_str(&previous.shortcut).ok();
    let shortcut_changed = old_shortcut.is_none_or(|old| old.id() != new_shortcut.id());
    let registration_needed = !app.global_shortcut().is_registered(new_shortcut);
    if registration_needed { app.global_shortcut().register(new_shortcut).map_err(|_| "Ese atajo está ocupado o el sistema no lo permite. Prueba otra combinación.")?; }
    if let Err(error) = shared.persist(&settings) {
        if registration_needed { let _ = app.global_shortcut().unregister(new_shortcut); }
        return Err(error);
    }
    if shortcut_changed {
        if let Some(old) = old_shortcut { let _ = app.global_shortcut().unregister(old); }
    }
    *shared.settings.lock() = settings.clone();
    if previous.theme != settings.theme || previous.reduce_transparency != settings.reduce_transparency || previous.high_contrast != settings.high_contrast {
        update_window_appearance(&app, &settings);
    }
    if previous.show_pill != settings.show_pill { pill::apply_setting(&app); }
    if previous.fn_key != settings.fn_key || previous.fn_combo != settings.fn_combo { fn_key::apply(&app); }
    let _ = app.emit("settings:changed", settings.clone());
    Ok(settings)
}

#[tauri::command]
async fn get_provider_status() -> Result<ProviderStatus, String> {
    tokio::task::spawn_blocking(|| ProviderStatus {
        deepgram: providers::configured("deepgram"), claude: providers::configured("claude"), groq: providers::configured("groq"),
        openai: providers::configured("openai"), custom: providers::configured("custom"),
    }).await.map_err(|_| "No se pudo consultar el almacén seguro.".into())
}

#[tauri::command]
async fn save_api_key(provider: String, key: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || providers::save_key(&provider, &key)).await.map_err(|_| "No se pudo guardar la clave.".to_string())?
}

#[tauri::command]
async fn delete_api_key(provider: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || providers::delete_key(&provider)).await.map_err(|_| "No se pudo eliminar la clave.".to_string())?
}

#[tauri::command]
fn get_voice_state(app: AppHandle) -> VoiceState { dictation::shared(&app).voice.lock().clone() }

#[tauri::command]
async fn start_dictation(app: AppHandle) -> Result<(), String> { dictation::start(app).await }

#[tauri::command]
fn stop_dictation(app: AppHandle) -> Result<(), String> { dictation::stop(&app) }

#[tauri::command]
fn cancel_dictation(app: AppHandle, defer_overlay_hide: Option<bool>) { dictation::cancel_with_overlay_delay(&app, defer_overlay_hide.unwrap_or(false)); }

/// Re-polishes a text on demand (from the history), without touching any running dictation.
#[tauri::command]
async fn polish_text(app: AppHandle, text: String) -> Result<String, String> {
    model::validate_text(&text)?;
    let settings = dictation::shared(&app).settings.lock().clone();
    let mut settings_for_polish = settings.clone();
    settings_for_polish.use_claude = true;
    if providers::polish_provider(&settings_for_polish).is_none() { return Err("Conecta Claude o Groq en Conexiones para pulir textos.".into()); }
    providers::polish(&text, &settings_for_polish, "general", &CancellationToken::new()).await
}

/// Inserts a reviewed text. Pastes into the app in front, or copies when Bruma itself is in front.
#[tauri::command]
async fn insert_text(app: AppHandle, text: String, defer_overlay_hide: Option<bool>) -> Result<String, String> {
    model::validate_text(&text)?;
    let shared = dictation::shared(&app);
    if shared.control.lock().is_some() { return Err("Espera a que termine el dictado.".into()); }
    let target = shared.target.lock().clone();
    let delivery = platform::insert(&app, &text, &CancellationToken::new(), target.as_ref()).await?;
    let id = shared.voice.lock().session_id.clone();
    let copied = delivery == platform::Delivery::Copied;
    shared.update(&app, &id, |v| { v.phase = "inserted".into(); v.result = text.clone(); v.error = None; v.copied = copied; });
    if defer_overlay_hide.unwrap_or(false) { dictation::hide_overlay_after(&app, id, "inserted", if copied { 1600 } else { 600 }); }
    Ok(if copied { "copied" } else { "pasted" }.into())
}

#[tauri::command]
async fn copy_text(text: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || platform::copy(&text)).await.map_err(|_| "No se pudo copiar el texto.".to_string())?
}

#[tauri::command]
fn get_history(app: AppHandle) -> history::History { dictation::shared(&app).history.snapshot() }

#[tauri::command]
fn delete_history_item(app: AppHandle, id: String) -> Result<history::History, String> {
    let data = dictation::shared(&app).history.remove(&id)?;
    let _ = app.emit("history:changed", data.clone());
    Ok(data)
}

#[tauri::command]
fn clear_history(app: AppHandle) -> Result<history::History, String> {
    let data = dictation::shared(&app).history.clear()?;
    let _ = app.emit("history:changed", data.clone());
    Ok(data)
}

#[tauri::command]
async fn get_active_context(app: AppHandle) -> Result<AppContext, String> {
    let mut target = platform::active_target(&app).await?;
    platform::attach_icon(&app, &mut target).await;
    Ok(target.context)
}

/// Models a service offers (speech "stt" or editor "polish"), for the pickers in Conexiones.
#[tauri::command]
async fn list_models(app: AppHandle, provider: String, purpose: String) -> Vec<models::ModelOption> {
    if !["groq", "openai", "deepgram", "custom", "claude"].contains(&provider.as_str()) || !["stt", "polish"].contains(&purpose.as_str()) { return vec![]; }
    let settings = dictation::shared(&app).settings.lock().clone();
    models::list(&provider, &purpose, &settings).await
}

/// Adds a word you corrected to the dictionary ("heard" becomes its alias).
#[tauri::command]
fn add_dictionary_term(app: AppHandle, term: String, heard: Option<String>) -> Result<Settings, String> {
    let term = term.trim().to_string();
    if term.is_empty() || term.chars().count() > 80 || term.chars().any(char::is_control) { return Err("Palabra no válida.".into()); }
    let shared = dictation::shared(&app);
    let _save = shared.save_lock.lock();
    let mut settings = shared.settings.lock().clone();
    if !settings.dictionary.iter().any(|entry| entry.term.eq_ignore_ascii_case(&term)) {
        let aliases = heard.map(|h| h.trim().chars().filter(|c| !c.is_control()).take(160).collect::<String>()).unwrap_or_default();
        settings.dictionary.push(model::DictionaryEntry { term, aliases });
        settings.validate().map_err(|_| "Tu diccionario está lleno. Quita algunas palabras en Diccionario.".to_string())?;
        shared.persist(&settings)?;
        *shared.settings.lock() = settings.clone();
        let _ = app.emit("settings:changed", settings.clone());
    }
    Ok(settings)
}

/// "No, gracias" to a suggested word: not offered again this session.
#[tauri::command]
fn dismiss_suggestion(term: String) {
    #[cfg(target_os = "macos")]
    { learn::dismissed().lock().insert(term.to_lowercase()); }
    #[cfg(not(target_os = "macos"))]
    let _ = term;
}

/// The welcome tour's practice box is focused: paste into Bruma itself.
#[tauri::command]
fn set_practice_field(active: bool) { platform::PRACTICE_FIELD.store(active, std::sync::atomic::Ordering::Release); }

/// The real icon of an app the user dictated into (history), by bundle identifier.
#[tauri::command]
async fn get_app_icon(app: AppHandle, bundle_id: String) -> Option<String> {
    #[cfg(target_os = "macos")]
    { native_context::bundle_icon(&app, bundle_id).await }
    #[cfg(not(target_os = "macos"))]
    { let _ = (app, bundle_id); None }
}

#[tauri::command]
fn show_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|_| "No se pudo abrir Bruma.")?;
        let _ = window.unminimize();
        window.set_focus().map_err(|_| "No se pudo activar Bruma.")?;
    }
    Ok(())
}

#[tauri::command]
fn hide_overlay(app: AppHandle) -> Result<(), String> {
    // Never leave a hidden recorder running after dismissing the indicator.
    if dictation::shared(&app).voice.lock().active() { dictation::cancel(&app); }
    if pill::always_on(&app) { return Ok(()); }
    if let Some(window) = app.get_webview_window("overlay") { window.hide().map_err(|_| "No se pudo cerrar el indicador.")?; }
    Ok(())
}

/// The part of the overlay window that should receive clicks (CSS pixels). Everything else passes through.
#[tauri::command]
fn set_pill_hitbox(x: f64, y: f64, width: f64, height: f64) {
    let valid = [x, y, width, height].iter().all(|v| v.is_finite() && v.abs() < 10_000.0);
    pill::set_hitbox(valid.then_some((x, y, width, height)));
}

/// Same action as the global shortcut, for the tray menu and the app's own button.
pub(crate) fn toggle_dictation(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let shared = dictation::shared(&app);
        let state = shared.voice.lock().clone();
        if ["listening", "paused", "connecting"].contains(&state.phase.as_str()) {
            // A second press right after starting is almost always a key bounce, not "stop".
            let just_started = shared.last_start.lock().is_some_and(|t| t.elapsed() < std::time::Duration::from_millis(280));
            if !just_started { let _ = dictation::stop(&app); }
        } else if state.phase != "processing" {
            if let Err(error) = dictation::start(app.clone()).await {
                let id = shared.voice.lock().session_id.clone();
                shared.update(&app, &id, |v| { v.phase = "error".into(); v.error = Some(error); });
                let _ = show_main_window(app);
            }
        }
    });
}

fn install_tray(app: &tauri::App) -> tauri::Result<()> {
    use tauri::{menu::{Menu, MenuItem}, tray::TrayIconBuilder};
    let dictate = MenuItem::with_id(app, "dictate", "Empezar o terminar dictado", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "Abrir Bruma", true, None::<&str>)?;
    let cancel = MenuItem::with_id(app, "cancel", "Cancelar dictado", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Salir de Bruma", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&dictate, &show, &cancel, &quit])?;
    let mut rgba = vec![0u8; 32 * 32 * 4];
    for y in 0..32 { for x in 0..32 { let d = ((x as f32 - 15.5).powi(2) + (y as f32 - 15.5).powi(2)).sqrt(); if (8.0..13.0).contains(&d) { let i = (y * 32 + x) * 4; rgba[i] = 45; rgba[i + 1] = 45; rgba[i + 2] = 45; rgba[i + 3] = 255; } } }
    TrayIconBuilder::with_id("bruma-tray").icon(tauri::image::Image::new_owned(rgba, 32, 32)).icon_as_template(true).tooltip("Bruma · Dictado por voz").menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "dictate" => toggle_dictation(app.clone()),
            "show" => { let _ = show_main_window(app.clone()); }
            "cancel" => dictation::cancel(app),
            "quit" => { dictation::cancel(app); app.exit(0); }
            _ => {}
        }).build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, shortcut, event| {
            if event.state() != ShortcutState::Pressed { return; }
            if shortcut.id() == dictation::escape_shortcut().id() {
                if *dictation::shared(app).escape_registered.lock() {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move { dictation::cancel_with_overlay_delay(&app, true); });
                }
                return;
            }
            if !shortcuts::should_dictate(app, shortcut) { return; }
            toggle_dictation(app.clone());
        }).build())
        .setup(|app| {
            providers::init_store(&app.path().app_config_dir()?);
            let state = AppState::new(&app.path().app_config_dir()?, || providers::configured("deepgram"));
            let shortcut = Shortcut::from_str(&state.settings.lock().shortcut);
            app.manage(state.clone());
            {
                let settings = state.settings.lock();
                update_window_appearance(app.handle(), &settings);
            }
            let registration = shortcut.map_err(|e| e.to_string()).and_then(|shortcut| app.global_shortcut().register(shortcut).map_err(|e| e.to_string()));
            if registration.is_err() {
                state.voice.lock().error = Some("No se pudo registrar el atajo. Configura otra combinación en Preferencias.".into());
            }
            install_tray(app)?;
            platform::start_tracking(app.handle());
            fn_key::start(app.handle());
            pill::spawn_poller(app.handle().clone());
            if state.settings.lock().show_pill { let _ = pill::show(app.handle()); }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::Focused(false) = event { let _ = shortcuts::end(window.app_handle()); }
                if let tauri::WindowEvent::CloseRequested { api, .. } = event { let _ = shortcuts::end(window.app_handle()); api.prevent_close(); let _ = window.hide(); }
            }
        })
        .invoke_handler(tauri::generate_handler![get_settings, get_system_symbol, get_permission_status, request_microphone_permission, request_accessibility_permission, open_privacy_settings, get_fn_key_ready, get_shortcut_status, begin_shortcut_test, end_shortcut_test, open_project_updates, open_url, save_settings, get_provider_status, save_api_key, delete_api_key, get_voice_state, start_dictation, stop_dictation, cancel_dictation, polish_text, insert_text, copy_text, get_history, delete_history_item, clear_history, get_active_context, show_main_window, hide_overlay, set_pill_hitbox, get_app_icon, set_practice_field, add_dictionary_term, dismiss_suggestion, list_models])
        .run(tauri::generate_context!())
        .expect("Bruma no pudo iniciar la aplicación");
}

use crate::{audio, history, model::{self, VoiceLevel, VoiceState}, platform, providers::{self, Engine}, state::{AppState, Control}};
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use std::{collections::BTreeMap, sync::{atomic::Ordering, Arc}, time::{Duration, Instant}};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut};
use tokio::sync::watch;
use tokio_tungstenite::{connect_async_with_config, tungstenite::{client::IntoClientRequest, protocol::WebSocketConfig, Message}};
use tokio_util::sync::CancellationToken;

const MAX_SESSION: Duration = Duration::from_secs(300);
/// Keep listening this long after you finish: the last word is often still on its way
/// from the microphone when you press the key (or let go of fn).
const TAIL: Duration = Duration::from_millis(380);
/// RMS above this counts as voice. Room hiss on laptop microphones stays below it.
const VOICE_RMS: f32 = 0.014;

pub fn shared(app: &AppHandle) -> Arc<AppState> { app.state::<Arc<AppState>>().inner().clone() }

pub fn escape_shortcut() -> Shortcut { Shortcut::new(None, Code::Escape) }

/// Escape cancels from any app, but only while Bruma is listening or working.
pub fn set_escape(app: &AppHandle, enabled: bool) {
    let shared = shared(app);
    let mut registered = shared.escape_registered.lock();
    if enabled && !*registered {
        if app.global_shortcut().register(escape_shortcut()).is_ok() { *registered = true; }
    } else if !enabled && *registered {
        let _ = app.global_shortcut().unregister(escape_shortcut());
        *registered = false;
    }
}

struct Outcome { transcript: String, warning: Option<String>, speaking_ms: u64 }

/// Starts from the fn key and reports problems on the pill instead of a dialog.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub async fn begin_from_key(app: AppHandle, hold: bool) {
    if let Err(error) = start_with(app.clone(), hold).await {
        let shared = shared(&app);
        let id = shared.voice.lock().session_id.clone();
        shared.update(&app, &id, |v| { v.phase = "error".into(); v.error = Some(error); });
        let _ = crate::pill::show(&app);
        hide_overlay_after(&app, id, "error", 4200);
    }
}

pub async fn start(app: AppHandle) -> Result<(), String> { start_with(app, false).await }

pub async fn start_with(app: AppHandle, hold: bool) -> Result<(), String> {
    let shared = shared(&app);
    if shared.shortcut_test.lock().is_some() { return Err("Termina la prueba del atajo antes de iniciar el dictado.".into()); }
    let settings = shared.settings.lock().clone();
    let engine_settings = settings.clone();
    let engine = tokio::task::spawn_blocking(move || providers::engine(&engine_settings)).await.map_err(|_| "No se pudo leer el almacén seguro.".to_string())??;
    let id = uuid::Uuid::new_v4().to_string();
    let cancel = CancellationToken::new();
    let (stop_tx, stop_rx) = watch::channel(false);
    {
        let mut control = shared.control.lock();
        if control.is_some() { return Err("Ya hay un dictado en curso.".into()); }
        if shared.shortcut_test.lock().is_some() { return Err("Termina la prueba del atajo antes de iniciar el dictado.".into()); }
        *control = Some(Control { id: id.clone(), cancel: cancel.clone(), stop: stop_tx });
        *shared.voice.lock() = VoiceState { session_id: id.clone(), phase: "connecting".into(), live: engine.live(), hold, ..VoiceState::default() };
        *shared.last_start.lock() = Some(Instant::now());
    }
    let _ = app.emit("voice:state", shared.voice.lock().clone());
    set_escape(&app, true);
    // The microphone opens immediately and buffers while we look up the app and connect,
    // so the first words are never lost.
    let capture_task = tauri::async_runtime::spawn(audio::prepare(app.clone()));
    let mut target = tokio::select! {
        _ = cancel.cancelled() => { capture_task.abort(); return Ok(()); }
        result = platform::active_target(&app) => result.unwrap_or_default(),
    };
    let read_context = settings.use_cursor_context && target.context.can_insert;
    let category = target.context.category.clone();
    tokio::select! {
        _ = cancel.cancelled() => { capture_task.abort(); return Ok(()); }
        (_, before) = async { tokio::join!(platform::attach_icon(&app, &mut target), async { if read_context { platform::read_before_cursor(&category).await } else { None } }) } => {
            target.before_cursor = before;
        }
    }
    match commit_target_and_show(&app, &id, target).await {
        Ok(true) => {}
        Ok(false) => { capture_task.abort(); return Ok(()); }
        Err(error) => {
            capture_task.abort();
            shared.update(&app, &id, |v| { v.phase = "error".into(); v.error = Some(error.clone()); });
            shared.finish(&id);
            set_escape(&app, false);
            return Err(error);
        }
    }
    let worker_app = app.clone();
    tauri::async_runtime::spawn(async move {
        let outcome = record(worker_app.clone(), shared.clone(), &id, &engine, &settings, cancel.clone(), stop_rx, capture_task).await;
        if !cancel.is_cancelled() { deliver(&worker_app, &shared, &id, &settings, &cancel, outcome).await; }
        shared.finish(&id);
        set_escape(&worker_app, false);
        let _ = worker_app.emit("voice:level", VoiceLevel { rms: 0.0, dbfs: -100.0, voiced: false });
    });
    Ok(())
}

async fn record(app: AppHandle, shared: Arc<AppState>, id: &str, engine: &Engine, settings: &model::Settings, cancel: CancellationToken, stop: watch::Receiver<bool>, capture_task: tauri::async_runtime::JoinHandle<Result<audio::Capture, String>>) -> Result<Outcome, String> {
    let capture = tokio::select! {
        _ = cancel.cancelled() => return Err("Cancelado.".into()),
        result = capture_task => result.map_err(|_| "No se pudo preparar el micrófono.".to_string())??,
    };
    capture.start();
    shared.update(&app, id, |v| v.phase = "listening".into());
    match engine {
        Engine::Deepgram { key, .. } => run_stream(app, shared, id, key, settings, cancel, stop, capture).await,
        Engine::Batch { .. } => run_batch(app, shared, id, engine, settings, cancel, stop, capture).await,
    }
}

async fn deliver(app: &AppHandle, shared: &Arc<AppState>, id: &str, settings: &model::Settings, cancel: &CancellationToken, outcome: Result<Outcome, String>) {
    let outcome = match outcome {
        Ok(outcome) if !outcome.transcript.trim().is_empty() => outcome,
        Ok(outcome) => {
            let message = outcome.warning.unwrap_or_else(|| "No te escuché. Revisa el micrófono e inténtalo otra vez.".into());
            shared.update(app, id, |v| { v.phase = "error".into(); v.error = Some(message); v.interim.clear(); });
            hide_overlay_after(app, id.to_string(), "error", 2600);
            return;
        }
        Err(error) => {
            shared.update(app, id, |v| { v.phase = "error".into(); v.error = Some(error); v.interim.clear(); });
            hide_overlay_after(app, id.to_string(), "error", 5200);
            return;
        }
    };
    let transcript = outcome.transcript.trim().to_string();
    shared.update(app, id, |v| { v.phase = "processing".into(); v.transcript = transcript.clone(); v.interim.clear(); });
    let category = shared.voice.lock().context.category.clone();
    let before = shared.target.lock().as_ref().and_then(|t| t.before_cursor.clone());
    // Two or three words ("ok, ahí voy") rarely need an editor; skipping it keeps replies instant.
    let quick = model::word_count(&transcript) <= 3 && settings.target_language == "original";
    let (polished, polish_error) = if quick { (transcript.clone(), None) } else {
        match providers::polish_in_context(&transcript, settings, &category, before.as_deref(), cancel).await { Ok(text) => (text, None), Err(error) => (transcript.clone(), Some(error)) }
    };
    if cancel.is_cancelled() { return; }
    let text = model::expand_snippets(&model::normalize_typography(&polished), &settings.snippets);
    let text = platform::fit_to_context(&text, before.as_deref());
    let notice = outcome.warning.or(polish_error);
    let mut inserted = false;
    if settings.confirm_before_insert {
        shared.update(app, id, |v| { v.phase = "ready".into(); v.result = text.clone(); v.error = notice.clone(); });
    } else {
        let target = shared.target.lock().clone();
        match platform::insert(app, &text, cancel, target.as_ref()).await {
            _ if cancel.is_cancelled() => return,
            Ok(delivery) => {
                inserted = delivery == platform::Delivery::Pasted;
                #[cfg(target_os = "macos")]
                { if inserted { if let Some(target) = target.as_ref() { crate::learn::start(app.clone(), id.to_string(), text.clone(), target.pid); } } }
                let copied = delivery == platform::Delivery::Copied;
                shared.update(app, id, |v| { v.phase = "inserted".into(); v.result = text.clone(); v.copied = copied; v.error = notice.clone(); });
                hide_overlay_after(app, id.to_string(), "inserted", if copied || notice.is_some() { 2200 } else { 900 });
            }
            Err(error) => {
                shared.update(app, id, |v| { v.phase = "ready".into(); v.result = text.clone(); v.copied = true; v.error = Some(error); });
            }
        }
    }
    let context = shared.voice.lock().context.clone();
    let entry = history::Entry {
        id: id.to_string(), created_at: history::now_ms(), words: model::word_count(&text), text: text.clone(),
        raw: if transcript != text { transcript } else { String::new() }, app: context.name, bundle_id: context.bundle_id,
        duration_ms: outcome.speaking_ms, inserted,
    };
    if let Ok(snapshot) = shared.history.record(entry, settings.save_history) { let _ = app.emit("history:changed", snapshot); }
}

async fn commit_target_and_show(app: &AppHandle, id: &str, target: platform::Target) -> Result<bool, String> {
    let id = id.to_string();
    let target_app = app.clone();
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let state = shared(&target_app);
        let control = state.control.lock();
        if !control.as_ref().is_some_and(|control| control.id == id && !control.cancel.is_cancelled()) {
            let _ = sender.send(Ok(false));
            return;
        }
        // Commit and show together so a cancelled lookup cannot replace a new target
        // or reopen an old indicator after cancellation.
        *state.target.lock() = Some(target.clone());
        state.update(&target_app, &id, |voice| voice.context = target.context);
        let _ = sender.send(show_overlay(&target_app).map(|_| true));
    }).map_err(|_| "No se pudo preparar el indicador de grabación.".to_string())?;
    receiver.await.map_err(|_| "No se pudo mostrar el indicador de grabación.".to_string())?
}

fn show_overlay(app: &AppHandle) -> Result<(), String> { crate::pill::show(app) }

fn chunk_rms(bytes: &[u8]) -> f32 {
    let mut sum = 0.0f64; let mut count = 0usize;
    for pair in bytes.chunks_exact(2) { let s = i16::from_le_bytes([pair[0], pair[1]]) as f64 / 32768.0; sum += s * s; count += 1; }
    if count == 0 { 0.0 } else { (sum / count as f64).sqrt() as f32 }
}

/// Keeps audio in memory until you finish, then sends it once (Groq, OpenAI or your server).
async fn run_batch(app: AppHandle, shared: Arc<AppState>, id: &str, engine: &Engine, settings: &model::Settings, cancel: CancellationToken, mut stop: watch::Receiver<bool>, mut capture: audio::Capture) -> Result<Outcome, String> {
    let start = Instant::now();
    let mut pcm: Vec<u8> = Vec::with_capacity(capture.rate as usize * 2 * 30);
    let mut tick = tokio::time::interval(Duration::from_millis(200));
    let mut warning = None;
    let mut voiced_ms = 0f64;
    let mut last_voice: Option<Instant> = None;
    let mut paused = false;
    let mut add = |bytes: Vec<u8>, pcm: &mut Vec<u8>, rate: u32| -> bool {
        let voiced = chunk_rms(&bytes) > VOICE_RMS;
        if voiced { voiced_ms += bytes.len() as f64 / 2.0 / rate.max(1) as f64 * 1000.0; }
        pcm.extend_from_slice(&bytes);
        voiced
    };
    let finish_on_pause = settings.auto_finish;
    let pause = Duration::from_millis(settings.pause_ms as u64);
    let mut tail: Option<tokio::time::Instant> = None;
    loop {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => { capture.stop(); return Err("Cancelado.".into()); }
            _ = tokio::time::sleep_until(tail.unwrap_or_else(tokio::time::Instant::now)), if tail.is_some() => break,
            changed = stop.changed(), if tail.is_none() => {
                if changed.is_err() || *stop.borrow() {
                    tail = Some(tokio::time::Instant::now() + TAIL);
                    shared.update(&app, id, |v| v.phase = "processing".into());
                }
            }
            _ = tick.tick() => {
                if capture.failed.load(Ordering::Acquire) { warning = Some("El micrófono se desconectó. Conservamos lo grabado.".into()); break; }
                if start.elapsed() >= MAX_SESSION { warning = Some("Se alcanzó el máximo de 5 minutos por dictado.".into()); break; }
                let quiet = last_voice.is_some_and(|t| t.elapsed() >= Duration::from_millis(1200));
                if tail.is_none() && quiet != paused { paused = quiet; shared.update(&app, id, |v| v.phase = if quiet { "paused" } else { "listening" }.into()); }
                if tail.is_none() && finish_on_pause && last_voice.is_some_and(|t| t.elapsed() >= pause) { break; }
                shared.update(&app, id, |v| v.elapsed_ms = start.elapsed().as_millis() as u64);
            }
            chunk = capture.receiver.recv() => match chunk {
                Some(bytes) => { if add(bytes, &mut pcm, capture.rate) { last_voice = Some(Instant::now()); } }
                None => break,
            }
        }
    }
    capture.stop();
    while let Ok(bytes) = capture.receiver.try_recv() { add(bytes, &mut pcm, capture.rate); }
    let speaking_ms = start.elapsed().as_millis() as u64;
    // Nothing above the noise floor: skip the request entirely (and Whisper's "thanks for watching" in silence).
    if voiced_ms < 200.0 { return Ok(Outcome { transcript: String::new(), warning: None, speaking_ms }); }
    shared.update(&app, id, |v| { v.phase = "processing".into(); v.elapsed_ms = speaking_ms; });
    let transcript = providers::transcribe(engine, &pcm, capture.rate, settings, &cancel).await?;
    Ok(Outcome { transcript, warning, speaking_ms })
}

/// Streams audio to Deepgram and shows words while you speak.
async fn run_stream(app: AppHandle, shared: Arc<AppState>, id: &str, api_key: &str, settings: &model::Settings, cancel: CancellationToken, mut stop: watch::Receiver<bool>, mut capture: audio::Capture) -> Result<Outcome, String> {
    let start = Instant::now();
    let url = providers::deepgram_url(capture.rate, settings)?;
    let mut request = url.as_str().into_client_request().map_err(|_| "No se pudo preparar la conexión de voz.")?;
    request.headers_mut().insert("Authorization", format!("Token {api_key}").parse().map_err(|_| "Clave de Deepgram no válida.")?);
    let mut config = WebSocketConfig::default();
    config.max_message_size = Some(256_000);
    config.max_frame_size = Some(256_000);
    let connection = tokio::select! {
        _ = cancel.cancelled() => return Err("Cancelado.".into()),
        result = tokio::time::timeout(Duration::from_secs(15), connect_async_with_config(request, Some(config), false)) => result,
    };
    let (socket, _) = connection.map_err(|_| "Deepgram tardó demasiado en conectar. Revisa tu conexión.")?.map_err(|error| {
        if let tokio_tungstenite::tungstenite::Error::Http(response) = error {
            match response.status().as_u16() { 401 | 403 => "Deepgram rechazó la clave. Revisa Conexiones.", 402 | 429 => "Deepgram no tiene saldo o alcanzó su límite de uso.", _ => "Deepgram no pudo iniciar el dictado. Revisa el idioma y la conexión." }
        } else { "No se pudo establecer una conexión segura con Deepgram." }.to_string()
    })?;
    let (mut writer, mut reader) = socket.split();
    let mut tick = tokio::time::interval(Duration::from_millis(200));
    let mut heartbeat = tokio::time::interval(Duration::from_secs(3));
    let mut finishing: Option<Instant> = None;
    let mut finish_requested = *stop.borrow();
    let mut tail: Option<tokio::time::Instant> = None;
    let mut segments: BTreeMap<u64, String> = BTreeMap::new();
    let mut interim = String::new();
    let mut warning = None;
    let mut saw_final = false;
    loop {
        if finish_requested && finishing.is_none() {
            capture.stop();
            // Send buffered final PCM before requesting the last transcript.
            while let Ok(bytes) = capture.receiver.try_recv() {
                tokio::select! {
                    _ = cancel.cancelled() => return Err("Cancelado.".into()),
                    result = tokio::time::timeout(Duration::from_secs(3), writer.send(Message::Binary(bytes.into()))) => {
                        if !matches!(result, Ok(Ok(()))) { warning = Some("Se interrumpió la conexión al terminar. Revisa la última frase.".into()); break; }
                    }
                }
            }
            let send = tokio::select! { _ = cancel.cancelled() => return Err("Cancelado.".into()), result = tokio::time::timeout(Duration::from_secs(3), writer.send(Message::Text("{\"type\":\"CloseStream\"}".into()))) => result };
            if !matches!(send, Ok(Ok(()))) { warning = Some("No se pudo confirmar el final del audio. Revisa la última frase.".into()); break; }
            finishing = Some(Instant::now());
            shared.update(&app, id, |v| { v.phase = "processing".into(); v.elapsed_ms = start.elapsed().as_millis() as u64; });
        }
        tokio::select! {
            biased;
            _ = cancel.cancelled() => { capture.stop(); return Err("Cancelado.".into()); }
            _ = tokio::time::sleep_until(tail.unwrap_or_else(tokio::time::Instant::now)), if tail.is_some() && !finish_requested => { finish_requested = true; }
            changed = stop.changed(), if finishing.is_none() && tail.is_none() => { if changed.is_err() || *stop.borrow() { tail = Some(tokio::time::Instant::now() + TAIL); } }
            _ = tick.tick() => {
                if finishing.is_some_and(|time| time.elapsed() >= Duration::from_secs(3)) {
                    if !saw_final { warning = Some("La conexión no confirmó la última frase. Revisa el texto.".into()); }
                    break;
                }
                if capture.failed.load(Ordering::Acquire) && finishing.is_none() {
                    warning = Some("El micrófono se desconectó o la conexión no siguió el ritmo del audio. Conservamos lo recibido.".into());
                    finish_requested = true;
                }
                if start.elapsed() >= MAX_SESSION && finishing.is_none() { finish_requested = true; warning = Some("Se alcanzó el máximo de 5 minutos por dictado.".into()); }
                if finishing.is_none() { shared.update(&app, id, |v| v.elapsed_ms = start.elapsed().as_millis() as u64); }
            }
            _ = heartbeat.tick(), if finishing.is_none() => {
                let result = tokio::select! { _ = cancel.cancelled() => return Err("Cancelado.".into()), result = tokio::time::timeout(Duration::from_secs(3), writer.send(Message::Text("{\"type\":\"KeepAlive\"}".into()))) => result };
                if !matches!(result, Ok(Ok(()))) { warning = Some("Se perdió la conexión de voz. Conservamos lo recibido.".into()); break; }
            }
            chunk = capture.receiver.recv(), if finishing.is_none() => {
                match chunk {
                    Some(bytes) => {
                        let result = tokio::select! { _ = cancel.cancelled() => return Err("Cancelado.".into()), result = tokio::time::timeout(Duration::from_secs(3), writer.send(Message::Binary(bytes.into()))) => result };
                        if !matches!(result, Ok(Ok(()))) { warning = Some("Se perdió la conexión de voz. Conservamos lo recibido.".into()); break; }
                    }
                    None => finish_requested = true,
                }
            }
            message = reader.next() => {
                match message {
                    Some(Ok(Message::Text(text))) => {
                        let data: Value = match serde_json::from_str(&text) {
                            Ok(data) => data,
                            Err(_) => { warning = Some("El servicio de voz devolvió una respuesta no válida. Conservamos las frases recibidas.".into()); break; }
                        };
                        match data["type"].as_str() {
                            Some("Results") => {
                                let text = data["channel"]["alternatives"][0]["transcript"].as_str().unwrap_or("").trim();
                                if !text.is_empty() {
                                    if data["is_final"].as_bool() == Some(true) {
                                        let start = (data["start"].as_f64().unwrap_or(0.0).max(0.0) * 1000.0).round() as u64;
                                        segments.insert(start, text.to_string()); interim.clear();
                                    } else { interim = text.to_string(); }
                                }
                                if data["from_finalize"].as_bool() == Some(true) { saw_final = true; }
                                let transcript = segments.values().cloned().collect::<Vec<_>>().join(" ");
                                if transcript.chars().count() + interim.chars().count() > 12_000 { warning = Some("Se alcanzó el límite de texto. Conservamos las frases completas recibidas.".into()); finish_requested = true; }
                                shared.update(&app, id, |v| { v.transcript = transcript; v.interim = interim.clone(); if finishing.is_none() { v.phase = if data["speech_final"].as_bool() == Some(true) { "paused" } else { "listening" }.into(); } });
                            }
                            Some("SpeechStarted") => { if finishing.is_none() { shared.update(&app, id, |v| v.phase = "listening".into()); } }
                            Some("UtteranceEnd") => { if finishing.is_none() { shared.update(&app, id, |v| v.phase = "paused".into()); if settings.auto_finish && !segments.is_empty() { finish_requested = true; } } }
                            Some("Metadata") => { if finishing.is_some() { saw_final = true; break; } }
                            Some("Error") => { warning = Some("Deepgram interrumpió el dictado. Revisa tu conexión y saldo; conservamos el texto recibido.".into()); break; }
                            _ => {}
                        }
                    }
                    Some(Ok(Message::Ping(bytes))) => {
                        tokio::select! {
                            _ = cancel.cancelled() => return Err("Cancelado.".into()),
                            _ = tokio::time::timeout(Duration::from_secs(3), writer.send(Message::Pong(bytes))) => {}
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => { if finishing.is_none() { warning = Some("La conexión terminó antes del dictado. Revisa la última frase.".into()); } break; }
                    Some(Err(_)) => { warning = Some("La conexión de voz se interrumpió. Revisa la última frase.".into()); break; }
                    _ => {}
                }
            }
        }
    }
    capture.stop();
    let _ = tokio::time::timeout(Duration::from_secs(1), writer.close()).await;
    let mut transcript = segments.values().cloned().collect::<Vec<_>>().join(" ");
    if !interim.is_empty() && !saw_final {
        if !transcript.is_empty() { transcript.push(' '); }
        transcript.push_str(&interim);
    }
    if transcript.chars().count() > 12_000 { return Err("El dictado superó 12 000 caracteres. Divídelo en partes.".into()); }
    Ok(Outcome { transcript, warning, speaking_ms: start.elapsed().as_millis() as u64 })
}

pub fn stop(app: &AppHandle) -> Result<(), String> {
    let shared = shared(app);
    let guard = shared.control.lock();
    let control = guard.as_ref().ok_or("No hay un dictado activo.")?;
    control.stop.send(true).map_err(|_| "El dictado ya terminó.".into())
}

pub fn hide_overlay_after(app: &AppHandle, session_id: String, phase: &'static str, delay_ms: u64) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(delay_ms)).await;
        let target_app = app.clone();
        let _ = app.run_on_main_thread(move || {
            let state = shared(&target_app);
            let free = state.control.lock().as_ref().is_none_or(|c| c.id == session_id);
            let should_hide = {
                let voice = state.voice.lock();
                voice.session_id == session_id && voice.phase == phase
            };
            if free && should_hide { crate::pill::park(&target_app); }
        });
    });
}

pub fn cancel(app: &AppHandle) { cancel_with_overlay_delay(app, false); }

pub fn cancel_with_overlay_delay(app: &AppHandle, defer_overlay_hide: bool) {
    let shared = shared(app);
    {
        // Serialize cancellation with the reservation of the next session.
        let mut active = shared.control.lock();
        if let Some(control) = active.take() { control.cancel.cancel(); let _ = control.stop.send(true); }
        *shared.voice.lock() = VoiceState::default();
        *shared.target.lock() = None;
        let _ = app.emit("voice:state", VoiceState::default());
    }
    set_escape(app, false);
    let _ = app.emit("voice:level", VoiceLevel { rms: 0.0, dbfs: -100.0, voiced: false });
    if crate::pill::always_on(app) { return; }
    if defer_overlay_hide { hide_overlay_after(app, String::new(), "idle", 250); }
    else if let Some(window) = app.get_webview_window("overlay") { let _ = window.hide(); }
}

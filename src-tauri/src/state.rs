use crate::{history, model::{Settings, VoiceState}, platform::Target};
use parking_lot::Mutex;
use std::{path::{Path, PathBuf}, sync::Arc, time::Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::watch;
use tokio_util::sync::CancellationToken;

pub struct Control { pub id: String, pub cancel: CancellationToken, pub stop: watch::Sender<bool> }
pub struct AppState {
    pub settings: Mutex<Settings>,
    pub voice: Mutex<VoiceState>,
    pub target: Mutex<Option<Target>>,
    pub control: Mutex<Option<Control>>,
    pub save_lock: Mutex<()>,
    pub shortcut_test: Mutex<Option<crate::shortcuts::TestSession>>,
    pub settings_path: PathBuf,
    pub history: history::Store,
    /// Last time the dictation shortcut started a session; ignores accidental double presses.
    pub last_start: Mutex<Option<Instant>>,
    pub escape_registered: Mutex<bool>,
}
impl AppState {
    pub fn new(config_dir: &Path, deepgram_configured: impl FnOnce() -> bool) -> Arc<Self> {
        let settings_path = config_dir.join("settings.json");
        let loaded = std::fs::read(&settings_path).ok().filter(|b| b.len() <= 128_000)
            .and_then(|bytes| serde_json::from_slice::<Settings>(&bytes).ok());
        let fresh = loaded.is_none();
        let (settings, migrated) = match loaded {
            Some(settings) => settings.migrate(deepgram_configured()),
            None => (Settings::default(), false),
        };
        let settings = if settings.validate().is_ok() { settings } else { Settings::default() };
        let state = Arc::new(Self {
            settings: Mutex::new(settings), voice: Mutex::new(VoiceState::default()), target: Mutex::new(None), control: Mutex::new(None),
            save_lock: Mutex::new(()), shortcut_test: Mutex::new(None), settings_path, history: history::Store::new(config_dir.join("history.json")),
            last_start: Mutex::new(None), escape_registered: Mutex::new(false),
        });
        if migrated && !fresh { let current = state.settings.lock().clone(); let _ = state.persist(&current); }
        state
    }
    pub fn update(&self, app: &AppHandle, id: &str, update: impl FnOnce(&mut VoiceState)) -> bool {
        let value = {
            let mut state = self.voice.lock();
            if state.session_id != id { return false; }
            update(&mut state);
            state.clone()
        };
        let _ = app.emit("voice:state", value);
        true
    }
    pub fn finish(&self, id: &str) {
        let mut control = self.control.lock();
        if control.as_ref().is_some_and(|c| c.id == id) { *control = None; }
    }
    pub fn persist(&self, settings: &Settings) -> Result<(), String> {
        if let Some(parent) = self.settings_path.parent() { std::fs::create_dir_all(parent).map_err(|_| "No se pudieron guardar las preferencias.")?; }
        let bytes = serde_json::to_vec_pretty(settings).map_err(|_| "Preferencias no válidas.")?;
        let temporary = self.settings_path.with_extension("tmp");
        std::fs::write(&temporary, bytes).map_err(|_| "No se pudieron guardar las preferencias.")?;
        #[cfg(unix)] {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&temporary, std::fs::Permissions::from_mode(0o600)).map_err(|_| "No se pudieron proteger las preferencias.")?;
        }
        std::fs::rename(&temporary, &self.settings_path).map_err(|_| "No se pudieron actualizar las preferencias.")?;
        Ok(())
    }
}

//! Local dictation history and totals. Stored next to settings.json with owner-only permissions.
//! Totals are kept even when history is off; they contain counts, never text.
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const MAX_ITEMS: usize = 500;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub created_at: u64,
    pub text: String,
    #[serde(default)]
    pub raw: String,
    pub app: String,
    #[serde(default)]
    pub bundle_id: Option<String>,
    pub words: u32,
    pub duration_ms: u64,
    #[serde(default)]
    pub inserted: bool,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Totals {
    pub dictations: u64,
    pub words: u64,
    pub speaking_ms: u64,
    /// Days (UTC, days since epoch) with at least one dictation, newest last. Used for the streak.
    #[serde(default)]
    pub active_days: Vec<u64>,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct History { pub totals: Totals, pub items: Vec<Entry> }

pub struct Store { path: PathBuf, data: Mutex<History> }

impl Store {
    pub fn new(path: PathBuf) -> Self {
        let data = std::fs::read(&path).ok().filter(|b| b.len() <= 8_000_000)
            .and_then(|bytes| serde_json::from_slice::<History>(&bytes).ok()).unwrap_or_default();
        Self { path, data: Mutex::new(data) }
    }
    pub fn snapshot(&self) -> History { self.data.lock().clone() }
    pub fn record(&self, entry: Entry, keep_text: bool) -> Result<History, String> {
        let mut data = self.data.lock();
        data.totals.dictations += 1;
        data.totals.words += entry.words as u64;
        data.totals.speaking_ms += entry.duration_ms;
        let day = entry.created_at / 86_400_000;
        if data.totals.active_days.last() != Some(&day) { data.totals.active_days.push(day); }
        let len = data.totals.active_days.len();
        if len > 400 { data.totals.active_days.drain(0..len - 400); }
        if keep_text {
            data.items.insert(0, entry);
            data.items.truncate(MAX_ITEMS);
        }
        self.write(&data)?;
        Ok(data.clone())
    }
    pub fn remove(&self, id: &str) -> Result<History, String> {
        let mut data = self.data.lock();
        data.items.retain(|item| item.id != id);
        self.write(&data)?;
        Ok(data.clone())
    }
    pub fn clear(&self) -> Result<History, String> {
        let mut data = self.data.lock();
        data.items.clear();
        self.write(&data)?;
        Ok(data.clone())
    }
    fn write(&self, data: &History) -> Result<(), String> {
        if let Some(parent) = self.path.parent() { std::fs::create_dir_all(parent).map_err(|_| "No se pudo guardar el historial.")?; }
        let bytes = serde_json::to_vec(data).map_err(|_| "Historial no válido.")?;
        let temporary = self.path.with_extension("tmp");
        std::fs::write(&temporary, bytes).map_err(|_| "No se pudo guardar el historial.")?;
        #[cfg(unix)] {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&temporary, std::fs::Permissions::from_mode(0o600));
        }
        std::fs::rename(&temporary, &self.path).map_err(|_| "No se pudo actualizar el historial.".into())
    }
}

pub fn now_ms() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64 }

#[cfg(test)]
mod tests {
    use super::*;
    fn entry(id: &str, words: u32) -> Entry { Entry { id: id.into(), created_at: now_ms(), text: "hola".into(), raw: String::new(), app: "Notas".into(), bundle_id: None, words, duration_ms: 1000, inserted: true } }
    #[test] fn totals_survive_when_text_is_not_kept() {
        let dir = std::env::temp_dir().join(format!("bruma-history-{}", uuid::Uuid::new_v4()));
        let store = Store::new(dir.join("history.json"));
        store.record(entry("a", 5), true).unwrap();
        let data = store.record(entry("b", 7), false).unwrap();
        assert_eq!(data.totals.words, 12);
        assert_eq!(data.totals.dictations, 2);
        assert_eq!(data.items.len(), 1);
        assert_eq!(data.totals.active_days.len(), 1);
        let reloaded = Store::new(dir.join("history.json")).snapshot();
        assert_eq!(reloaded.totals.words, 12);
        assert_eq!(store.clear().unwrap().items.len(), 0);
        let _ = std::fs::remove_dir_all(dir);
    }
}

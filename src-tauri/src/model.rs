use serde::{Deserialize, Serialize};

/// Bumped whenever a release changes defaults that existing users should receive.
pub const SETTINGS_VERSION: u32 = 6;
pub const STT_PROVIDERS: [&str; 4] = ["groq", "openai", "custom", "deepgram"];
pub const POLISH_PROVIDERS: [&str; 4] = ["auto", "claude", "groq", "none"];
pub const KEY_PROVIDERS: [&str; 5] = ["groq", "openai", "custom", "deepgram", "claude"];

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DictionaryEntry { pub term: String, pub aliases: String }

/// A spoken trigger replaced by a fixed text, e.g. "mi correo" → an email address.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snippet { pub trigger: String, pub text: String }

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub brand: String,
    pub language: String,
    pub target_language: String,
    pub tone: String,
    pub pause_ms: u32,
    pub auto_finish: bool,
    pub shortcut: String,
    pub dictionary: Vec<DictionaryEntry>,
    pub claude_model: String,
    pub use_claude: bool,
    pub confirm_before_insert: bool,
    pub reduced_motion: bool,
    #[serde(default)]
    pub reduce_transparency: bool,
    #[serde(default)]
    pub high_contrast: bool,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_ui_language")]
    pub ui_language: String,
    #[serde(default)]
    pub profile_name: String,
    #[serde(default)]
    pub onboarding_version: u32,
    #[serde(default)]
    pub settings_version: u32,
    #[serde(default = "default_stt_provider")]
    pub stt_provider: String,
    /// Only used by the "custom" engine: an OpenAI-compatible base URL such as https://mi-vps.com/v1
    #[serde(default)]
    pub stt_base_url: String,
    /// Empty means the engine's recommended model.
    #[serde(default)]
    pub stt_model: String,
    #[serde(default = "default_polish_provider")]
    pub polish_provider: String,
    #[serde(default = "default_groq_polish_model")]
    pub groq_polish_model: String,
    #[serde(default = "default_true")]
    pub save_history: bool,
    #[serde(default = "default_true")]
    pub play_sounds: bool,
    #[serde(default)]
    pub snippets: Vec<Snippet>,
    /// Keep the small pill visible above the Dock, like Wispr Flow.
    #[serde(default = "default_true")]
    pub show_pill: bool,
    /// Tap fn (🌐) to start and stop, hold it to talk while it is down.
    #[serde(default = "default_true")]
    pub fn_key: bool,
    /// "fn" (the key alone) or "fn+space".
    #[serde(default = "default_fn_combo")]
    pub fn_combo: String,
    /// Read the few characters before the cursor to get spaces and capitals right.
    #[serde(default = "default_true")]
    pub use_cursor_context: bool,
    /// The user's own standing instructions for the editor ("tutea siempre", "Supabase se escribe así").
    #[serde(default)]
    pub personal_rules: String,
}
fn default_theme() -> String { "system".into() }
fn default_ui_language() -> String { "es".into() }
fn default_stt_provider() -> String { "groq".into() }
fn default_polish_provider() -> String { "auto".into() }
fn default_groq_polish_model() -> String { "openai/gpt-oss-120b".into() }
fn default_true() -> bool { true }
fn default_fn_combo() -> String { "fn".into() }

pub const DEFAULT_SHORTCUT: &str = "Control+Space";
const LEGACY_SHORTCUT: &str = "CommandOrControl+Shift+Space";

impl Default for Settings {
    fn default() -> Self {
        Self { brand: "Bruma".into(), language: "es".into(), target_language: "original".into(), tone: "natural".into(), pause_ms: 1400,
            auto_finish: false, shortcut: DEFAULT_SHORTCUT.into(), dictionary: vec![], claude_model: "claude-haiku-5-5".into(),
            use_claude: true, confirm_before_insert: false, reduced_motion: false, reduce_transparency: false, high_contrast: false,
            theme: default_theme(), ui_language: default_ui_language(), profile_name: String::new(), onboarding_version: 0,
            settings_version: SETTINGS_VERSION, stt_provider: default_stt_provider(), stt_base_url: String::new(), stt_model: String::new(),
            polish_provider: default_polish_provider(), groq_polish_model: default_groq_polish_model(), save_history: true, play_sounds: true,
            snippets: vec![], show_pill: true, fn_key: true, fn_combo: default_fn_combo(), use_cursor_context: true, personal_rules: String::new() }
    }
}
impl Settings {
    /// Brings settings written by older versions to the 0.5 defaults without touching choices the user made.
    pub fn migrate(mut self, deepgram_configured: bool) -> (Self, bool) {
        if self.settings_version >= SETTINGS_VERSION { return (self, false); }
        if self.settings_version < 5 {
            if self.shortcut == LEGACY_SHORTCUT { self.shortcut = DEFAULT_SHORTCUT.into(); }
            if self.claude_model == "claude-sonnet-5-5" { self.claude_model = "claude-haiku-5-5".into(); }
            // 0.5 pastes automatically, like Wispr Flow. Review stays available in Preferencias.
            self.confirm_before_insert = false;
            // Users who already set up Deepgram keep it until they choose another engine.
            if deepgram_configured { self.stt_provider = "deepgram".into(); }
        }
        // 0.6 rebuilt the welcome tour (fn key, practice); show it once more.
        if self.settings_version < 6 {
            self.onboarding_version = self.onboarding_version.min(2);
            // The larger open model punctuates Spanish much better and is still sub-second on Groq.
            if self.groq_polish_model == "openai/gpt-oss-20b" { self.groq_polish_model = default_groq_polish_model(); }
        }
        self.settings_version = SETTINGS_VERSION;
        (self, true)
    }
    pub fn validate(&self) -> Result<(), String> {
        if self.brand.trim().is_empty() || self.brand.chars().count() > 40 { return Err("La marca debe tener entre 1 y 40 caracteres.".into()); }
        if !["es", "en", "multi", "pt", "fr", "de", "it"].contains(&self.language.as_str()) || !["original", "es", "en", "pt", "fr", "de", "it"].contains(&self.target_language.as_str()) || !["natural", "formal", "literal"].contains(&self.tone.as_str()) {
            return Err("Idioma o estilo no válido.".into());
        }
        if !["system", "light", "dark"].contains(&self.theme.as_str()) || !["es", "en"].contains(&self.ui_language.as_str()) {
            return Err("Tema o idioma de la interfaz no válido.".into());
        }
        if self.profile_name.chars().count() > 80 || self.profile_name.chars().any(char::is_control) {
            return Err("El nombre del perfil admite hasta 80 caracteres y no puede contener saltos de línea.".into());
        }
        if !(1000..=5000).contains(&self.pause_ms) { return Err("El tiempo de pausa debe estar entre 1000 y 5000 ms.".into()); }
        if self.shortcut.len() > 80 || self.shortcut.is_empty() { return Err("Atajo no válido.".into()); }
        if self.shortcut.eq_ignore_ascii_case("escape") { return Err("Escape está reservado para cancelar el dictado.".into()); }
        if !self.claude_model.starts_with("claude-") || self.claude_model.len() > 100 || !self.claude_model.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            return Err("Identificador de modelo Claude no válido.".into());
        }
        if !STT_PROVIDERS.contains(&self.stt_provider.as_str()) { return Err("Motor de voz no válido.".into()); }
        if !POLISH_PROVIDERS.contains(&self.polish_provider.as_str()) { return Err("Opción de pulido no válida.".into()); }
        let model_ok = |value: &str| value.len() <= 100 && value.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '/' | ':'));
        if !model_ok(&self.stt_model) { return Err("Nombre de modelo de voz no válido.".into()); }
        if self.groq_polish_model.trim().is_empty() || !model_ok(&self.groq_polish_model) { return Err("Nombre de modelo de Groq no válido.".into()); }
        if !self.stt_base_url.is_empty() { validate_base_url(&self.stt_base_url)?; }
        if !["fn", "fn+space"].contains(&self.fn_combo.as_str()) { return Err("Opción de tecla fn no válida.".into()); }
        if self.personal_rules.chars().count() > 2000 || self.personal_rules.contains('\0') { return Err("Tus reglas admiten hasta 2000 caracteres.".into()); }
        if self.stt_provider == "custom" && self.stt_base_url.is_empty() { return Err("Escribe la dirección de tu servidor de voz (por ejemplo https://mi-vps.com/v1).".into()); }
        if self.dictionary.len() > 50 || self.dictionary.iter().any(|e| e.term.trim().is_empty() || e.term.chars().count() > 80 || e.aliases.chars().count() > 160 || e.term.chars().any(char::is_control) || e.aliases.chars().any(char::is_control)) {
            return Err("El diccionario admite hasta 50 términos de 80 caracteres y variantes de 160 caracteres.".into());
        }
        if self.dictionary.iter().map(|e| e.term.len()).sum::<usize>() > 500 { return Err("Reduce los términos del diccionario: esta versión admite hasta 500 bytes de vocabulario para respetar el límite del proveedor.".into()); }
        if self.snippets.len() > 100 || self.snippets.iter().any(|s| s.trigger.trim().chars().count() < 2 || s.trigger.chars().count() > 60 || s.text.trim().is_empty() || s.text.chars().count() > 4000 || s.trigger.chars().any(char::is_control) || s.text.contains('\0')) {
            return Err("Cada atajo de voz necesita una frase de 2 a 60 caracteres y un texto de hasta 4000. Máximo 100.".into());
        }
        Ok(())
    }
}

pub fn validate_base_url(value: &str) -> Result<url::Url, String> {
    let url = url::Url::parse(value.trim()).map_err(|_| "La dirección del servidor no es válida. Usa algo como https://mi-vps.com/v1".to_string())?;
    if !matches!(url.scheme(), "https" | "http") || url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() || value.len() > 200 {
        return Err("La dirección del servidor debe empezar con https:// (o http:// en tu red) y no llevar usuario, contraseña ni parámetros.".into());
    }
    Ok(url)
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppContext {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bundle_id: Option<String>,
    pub category: String,
    pub can_insert: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon_data_url: Option<String>,
}
impl Default for AppContext {
    fn default() -> Self { Self { name: "General".into(), bundle_id: None, category: "general".into(), can_insert: false, icon_data_url: None } }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceState {
    pub session_id: String,
    pub phase: String,
    pub transcript: String,
    pub interim: String,
    pub result: String,
    pub context: AppContext,
    pub error: Option<String>,
    pub elapsed_ms: u64,
    /// True when the engine streams words while you speak (Deepgram).
    pub live: bool,
    /// Set when the text could not be pasted and was left on the clipboard instead.
    pub copied: bool,
    /// True while fn is held down (push-to-talk): releasing it finishes.
    pub hold: bool,
}
impl Default for VoiceState {
    fn default() -> Self { Self { session_id: String::new(), phase: "idle".into(), transcript: String::new(), interim: String::new(), result: String::new(), context: AppContext::default(), error: None, elapsed_ms: 0, live: false, copied: false, hold: false } }
}
impl VoiceState {
    pub fn active(&self) -> bool { ["connecting", "listening", "paused", "processing"].contains(&self.phase.as_str()) }
}
#[derive(Clone, Serialize)]
pub struct VoiceLevel { pub rms: f32, pub dbfs: f32, pub voiced: bool }
#[derive(Serialize)]
pub struct ProviderStatus { pub deepgram: bool, pub claude: bool, pub groq: bool, pub openai: bool, pub custom: bool }

pub fn validate_text(text: &str) -> Result<(), String> {
    if text.trim().is_empty() { return Err("No hay texto para procesar.".into()); }
    if text.chars().count() > 12_000 || text.contains('\0') { return Err("El texto admite hasta 12 000 caracteres y no puede contener caracteres nulos.".into()); }
    Ok(())
}

pub fn word_count(text: &str) -> u32 { text.split_whitespace().filter(|w| w.chars().any(char::is_alphanumeric)).count() as u32 }

/// Consistent typography for every dictation, polished or not: straight quotes, no doubled spaces,
/// no space before punctuation.
pub fn normalize_typography(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '\u{201C}' | '\u{201D}' | '\u{AB}' | '\u{BB}' | '\u{201E}' => out.push('"'),
            '\u{2018}' | '\u{2019}' => out.push('\''),
            '\u{00A0}' => out.push(' '),
            ',' | '.' | ':' | ';' | '?' | '!' if out.ends_with(' ') && !out.ends_with("\n ") => { out.pop(); out.push(c); }
            ' ' if out.ends_with(' ') || out.ends_with('\n') || out.is_empty() => {}
            _ => out.push(c),
        }
    }
    out.trim().to_string()
}

/// Replaces spoken snippet triggers (case- and accent-insensitive, whole words) with their text.
pub fn expand_snippets(text: &str, snippets: &[Snippet]) -> String {
    if snippets.is_empty() { return text.to_string(); }
    let mut output = text.to_string();
    let mut ordered: Vec<&Snippet> = snippets.iter().collect();
    // Longer triggers first so "mi correo de trabajo" wins over "mi correo".
    ordered.sort_by_key(|s| std::cmp::Reverse(s.trigger.chars().count()));
    for snippet in ordered {
        let trigger = snippet.trigger.trim();
        if trigger.is_empty() { continue; }
        output = replace_phrase(&output, trigger, snippet.text.trim());
    }
    output
}

fn fold(c: char) -> char {
    match c.to_lowercase().next().unwrap_or(c) {
        'á' | 'à' | 'ä' | 'â' => 'a', 'é' | 'è' | 'ë' | 'ê' => 'e', 'í' | 'ì' | 'ï' | 'î' => 'i',
        'ó' | 'ò' | 'ö' | 'ô' => 'o', 'ú' | 'ù' | 'ü' | 'û' => 'u', other => other,
    }
}

fn replace_phrase(text: &str, phrase: &str, replacement: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let needle: Vec<char> = phrase.chars().map(fold).collect();
    if needle.is_empty() || chars.len() < needle.len() { return text.to_string(); }
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    while i < chars.len() {
        let end = i + needle.len();
        let boundary_before = i == 0 || !chars[i - 1].is_alphanumeric();
        if end <= chars.len() && boundary_before && chars[i..end].iter().map(|c| fold(*c)).eq(needle.iter().copied()) {
            let boundary_after = end == chars.len() || !chars[end].is_alphanumeric();
            if boundary_after {
                out.push_str(replacement);
                // Drop a trailing period the engine added after the spoken trigger: "mi correo." → "yo@mail.com"
                let mut next = end;
                let looks_like_address = replacement.contains('@') || replacement.contains("://") || replacement.starts_with("www.");
                if looks_like_address && next < chars.len() && chars[next] == '.' && (next + 1 == chars.len() || chars[next + 1].is_whitespace()) { next += 1; }
                i = next;
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn existing_settings_keep_preferences_when_new_fields_are_absent() {
        let mut existing = serde_json::to_value(Settings::default()).unwrap();
        existing["brand"] = serde_json::json!("Mi voz");
        existing["shortcut"] = serde_json::json!("Alt+Shift+Space");
        for field in ["reduceTransparency", "highContrast", "theme", "uiLanguage", "profileName", "onboardingVersion", "settingsVersion", "sttProvider", "sttBaseUrl", "sttModel", "polishProvider", "groqPolishModel", "saveHistory", "playSounds", "snippets", "showPill"] {
            existing.as_object_mut().unwrap().remove(field);
        }
        let restored: Settings = serde_json::from_value(existing).unwrap();
        assert_eq!(restored.brand, "Mi voz");
        assert_eq!(restored.shortcut, "Alt+Shift+Space");
        assert!(!restored.reduce_transparency && !restored.high_contrast);
        assert_eq!(restored.theme, "system");
        assert_eq!(restored.ui_language, "es");
        assert!(restored.profile_name.is_empty());
        assert_eq!(restored.onboarding_version, 0);
        assert_eq!(restored.settings_version, 0);
        assert_eq!(restored.stt_provider, "groq");
        assert!(restored.save_history);
        assert!(restored.validate().is_ok());
    }
    #[test] fn migration_moves_old_defaults_but_keeps_custom_choices() {
        let mut old = Settings::default();
        old.settings_version = 0; old.shortcut = LEGACY_SHORTCUT.into(); old.confirm_before_insert = true; old.claude_model = "claude-sonnet-5-5".into();
        let (migrated, changed) = old.migrate(true);
        assert!(changed);
        assert_eq!(migrated.shortcut, DEFAULT_SHORTCUT);
        assert!(!migrated.confirm_before_insert);
        assert_eq!(migrated.claude_model, "claude-haiku-5-5");
        assert_eq!(migrated.stt_provider, "deepgram");
        let mut custom = Settings::default();
        custom.settings_version = 0; custom.shortcut = "Alt+Shift+K".into();
        let (migrated, _) = custom.migrate(false);
        assert_eq!(migrated.shortcut, "Alt+Shift+K");
        assert_eq!(migrated.stt_provider, "groq");
        let (_, again) = migrated.migrate(false);
        assert!(!again);
    }
    #[test] fn supported_languages_and_profile_bounds() {
        let mut settings = Settings::default();
        for language in ["es", "en", "pt", "fr", "de", "it"] {
            settings.language = language.into();
            settings.target_language = language.into();
            assert!(settings.validate().is_ok());
        }
        settings.language = "multi".into();
        settings.target_language = "original".into();
        settings.profile_name = "María José".into();
        assert!(settings.validate().is_ok());
        settings.target_language = "multi".into();
        assert!(settings.validate().is_err());
        settings.target_language = "original".into();
        settings.profile_name = "x".repeat(81);
        assert!(settings.validate().is_err());
        settings.profile_name = "Nombre\nextra".into();
        assert!(settings.validate().is_err());
    }
    #[test] fn configuration_bounds() {
        let mut settings = Settings::default();
        assert!(settings.validate().is_ok());
        settings.pause_ms = 0;
        assert!(settings.validate().is_err());
        settings.pause_ms = 1400;
        settings.claude_model = "https://evil.test".into();
        assert!(settings.validate().is_err());
        settings.claude_model = "claude-haiku-5-5".into();
        settings.stt_provider = "custom".into();
        assert!(settings.validate().is_err());
        settings.stt_base_url = format!("https://{}:{}@vps.test/v1", "user", "pw");
        assert!(settings.validate().is_err());
        settings.stt_base_url = "http://203.0.113.5:8000/v1".into();
        assert!(settings.validate().is_ok());
        settings.shortcut = "Escape".into();
        assert!(settings.validate().is_err());
    }
    #[test] fn text_bounds() {
        assert!(validate_text("   ").is_err());
        assert!(validate_text(&"x".repeat(12001)).is_err());
        assert!(validate_text("términos de la academia").is_ok());
        assert_eq!(word_count("Hola, ¿cómo estás? — bien"), 4);
    }
    #[test] fn typography_is_consistent() {
        assert_eq!(normalize_typography("Dijo «hola»  ,  y “adiós” ."), "Dijo \"hola\", y \"adiós\".");
        assert_eq!(normalize_typography("¿Qué onda ?\n  Bien"), "¿Qué onda?\nBien");
        assert_eq!(normalize_typography("Son las 10:30 y vale $500."), "Son las 10:30 y vale $500.");
    }
    #[test] fn snippets_expand_whole_phrases_only() {
        let snippets = vec![Snippet { trigger: "mi correo".into(), text: "ana@example.com".into() }, Snippet { trigger: "mi correo de trabajo".into(), text: "ana@work.test".into() }];
        assert_eq!(expand_snippets("Escríbeme a Mi Correo.", &snippets), "Escríbeme a ana@example.com");
        assert_eq!(expand_snippets("mi correo de trabajo, por favor", &snippets), "ana@work.test, por favor");
        assert_eq!(expand_snippets("mi correos", &snippets), "mi correos");
        let accents = vec![Snippet { trigger: "dirección".into(), text: "Av. Siempre Viva 123".into() }];
        assert_eq!(expand_snippets("La direccion es esta", &accents), "La Av. Siempre Viva 123 es esta");
    }
}

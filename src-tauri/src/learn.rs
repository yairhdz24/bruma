#![cfg_attr(not(target_os = "macos"), allow(dead_code))]
//! Learns from your corrections, like a good keyboard: after Bruma pastes, it watches that
//! field for a little while. If you replace a word it wrote ("Deep Grip" → "Deepgram"), the pill
//! offers to add the fixed word to your dictionary so the next dictation gets it right.

use serde::Serialize;

#[derive(Clone, Serialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Suggestion { pub heard: String, pub term: String }

fn norm(token: &str) -> String {
    token.trim_matches(|c: char| !c.is_alphanumeric()).to_lowercase()
}

#[derive(Clone, Copy, PartialEq)]
enum Op { Same, Change }

/// One edit, and only one, between what Bruma pasted and what the field says now.
pub fn learned_correction(pasted: &str, field: &str) -> Option<Suggestion> {
    let pasted = pasted.trim();
    let p: Vec<&str> = pasted.split_whitespace().collect();
    let f: Vec<&str> = field.split_whitespace().collect();
    if p.len() < 2 || f.is_empty() || field.contains(pasted) || p.len() > 400 || f.len() > 1200 { return None; }
    let pn: Vec<String> = p.iter().map(|t| norm(t)).collect();
    let fn_: Vec<String> = f.iter().map(|t| norm(t)).collect();
    // Semi-global alignment: the pasted text may sit anywhere inside the field.
    let (n, m) = (p.len(), f.len());
    let mut score = vec![vec![0i32; m + 1]; n + 1];
    for i in 1..=n { score[i][0] = -(i as i32); }
    for i in 1..=n {
        for j in 1..=m {
            let diagonal = score[i - 1][j - 1] + if pn[i - 1] == fn_[j - 1] { 2 } else { -1 };
            score[i][j] = diagonal.max(score[i - 1][j] - 1).max(score[i][j - 1] - 1);
        }
    }
    let end = (0..=m).max_by_key(|&j| (score[n][j], std::cmp::Reverse(j)))?;
    // Walk back, collecting the alignment as (pasted index?, field index?, op).
    let (mut i, mut j) = (n, end);
    let mut steps: Vec<(Option<usize>, Option<usize>, Op)> = Vec::new();
    while i > 0 {
        if j > 0 && score[i][j] == score[i - 1][j - 1] + if pn[i - 1] == fn_[j - 1] { 2 } else { -1 } {
            steps.push((Some(i - 1), Some(j - 1), if pn[i - 1] == fn_[j - 1] { Op::Same } else { Op::Change }));
            i -= 1; j -= 1;
        } else if score[i][j] == score[i - 1][j] - 1 {
            steps.push((Some(i - 1), None, Op::Change)); i -= 1;
        } else if j > 0 {
            steps.push((None, Some(j - 1), Op::Change)); j -= 1;
        } else { return None; }
    }
    steps.reverse();
    let same = steps.iter().filter(|s| s.2 == Op::Same).count();
    if same * 10 < n * 6 || same + 3 < n { return None; }
    // Exactly one contiguous changed block.
    let changed: Vec<usize> = steps.iter().enumerate().filter(|(_, s)| s.2 == Op::Change).map(|(k, _)| k).collect();
    let (first, last) = (*changed.first()?, *changed.last()?);
    if last - first + 1 != changed.len() { return None; }
    let block = &steps[first..=last];
    let heard: Vec<&str> = block.iter().filter_map(|s| s.0).map(|k| p[k]).collect();
    let fixed: Vec<&str> = block.iter().filter_map(|s| s.1).map(|k| f[k]).collect();
    if heard.is_empty() || fixed.is_empty() || heard.len() > 3 || fixed.len() > 3 { return None; }
    let clean = |words: &[&str]| words.join(" ").trim_matches(|c: char| !c.is_alphanumeric()).to_string();
    let (heard, term) = (clean(&heard), clean(&fixed));
    if term.is_empty() || term.chars().count() > 40 || !term.chars().any(char::is_alphabetic) { return None; }
    if norm(&heard) == norm(&term) || heard.to_lowercase() == term.to_lowercase() { return None; }
    Some(Suggestion { heard, term })
}

#[cfg(target_os = "macos")]
mod watch {
    use super::{learned_correction, Suggestion};
    use crate::dictation;
    use parking_lot::Mutex;
    use std::{collections::HashSet, sync::OnceLock, time::Duration};
    use tauri::{AppHandle, Emitter};

    extern "C" {
        fn bruma_focused_text(before: i32, after: i32) -> *mut std::ffi::c_char;
        fn bruma_free_symbol_data(data: *mut std::ffi::c_char);
    }

    #[derive(serde::Deserialize)]
    struct Field { pid: u32, text: String }

    /// Words the user said "no" to this session.
    pub fn dismissed() -> &'static Mutex<HashSet<String>> {
        static SET: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
        SET.get_or_init(|| Mutex::new(HashSet::new()))
    }

    async fn read_field() -> Option<Field> {
        let raw = tokio::time::timeout(Duration::from_millis(500), tokio::task::spawn_blocking(|| {
            let raw = unsafe { bruma_focused_text(1500, 600) };
            if raw.is_null() { return None; }
            let text = unsafe { std::ffi::CStr::from_ptr(raw) }.to_string_lossy().into_owned();
            unsafe { bruma_free_symbol_data(raw); }
            Some(text)
        })).await.ok()?.ok()??;
        serde_json::from_str(&raw).ok()
    }

    /// Watches the field for ~45 s after a paste. Stops as soon as another dictation starts.
    pub fn start(app: AppHandle, session: String, pasted: String, pid: u32) {
        if pid == 0 || pasted.split_whitespace().count() < 2 { return; }
        tauri::async_runtime::spawn(async move {
            let shared = dictation::shared(&app);
            let mut previous: Option<Suggestion> = None;
            for _ in 0..30 {
                tokio::time::sleep(Duration::from_millis(1500)).await;
                {
                    let voice = shared.voice.lock();
                    if voice.session_id != session && voice.active() { return; }
                }
                let Some(field) = read_field().await else { continue };
                if field.pid != pid { continue; }
                let found = learned_correction(&pasted, &field.text);
                // Wait until the edit holds still for one more look, so half-typed words are ignored.
                if let (Some(now), Some(before)) = (&found, &previous) {
                    if now == before {
                        let known = shared.settings.lock().dictionary.iter().any(|e| e.term.eq_ignore_ascii_case(&now.term));
                        if !known && !dismissed().lock().contains(&now.term.to_lowercase()) {
                            let _ = crate::pill::show(&app);
                            let _ = app.emit("learn:suggestion", now.clone());
                        }
                        return;
                    }
                }
                previous = found;
            }
        });
    }
}

#[cfg(target_os = "macos")]
pub use watch::{dismissed, start};

#[cfg(not(target_os = "macos"))]
pub fn start(_app: tauri::AppHandle, _session: String, _pasted: String, _pid: u32) {}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn a_replaced_word_is_offered() {
        let pasted = "Ya lo estoy usando con Deep Grip Nova-3 y funciona.";
        let field = "Hola. Ya lo estoy usando con Deepgram Nova-3 y funciona. Más texto";
        assert_eq!(learned_correction(pasted, field), Some(Suggestion { heard: "Deep Grip".into(), term: "Deepgram".into() }));
    }
    #[test] fn untouched_or_extended_text_is_ignored() {
        let pasted = "Mañana revisamos el diseño.";
        assert_eq!(learned_correction(pasted, "Mañana revisamos el diseño. Y algo más que escribí"), None);
        assert_eq!(learned_correction(pasted, "mañana revisamos el diseño"), None);
        assert_eq!(learned_correction(pasted, "Otra cosa totalmente diferente sin relación"), None);
    }
    #[test] fn several_edits_are_not_a_single_word_fix() {
        let pasted = "uno dos tres cuatro cinco seis siete ocho";
        assert_eq!(learned_correction(pasted, "uno DOS-X tres cuatro cinco seis SIETE-X ocho"), None);
    }
    #[test] fn a_name_typed_in_place_of_a_misheard_one() {
        assert_eq!(learned_correction("Le escribí a Yahir sobre el proyecto", "Le escribí a Yair sobre el proyecto"), Some(Suggestion { heard: "Yahir".into(), term: "Yair".into() }));
    }
}

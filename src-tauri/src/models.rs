//! The models each service offers, for the pickers in Conexiones. Asks the service itself
//! (with your key) so new models show up on their own; a curated list fills in the labels
//! and covers you when there is no key yet or no connection.

use crate::{model::{validate_base_url, Settings}, providers};
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelOption { pub id: String, pub label: String, pub note: String, pub recommended: bool }

fn option(id: &str, label: &str, note: &str, recommended: bool) -> ModelOption {
    ModelOption { id: id.into(), label: label.into(), note: note.into(), recommended }
}

fn curated(provider: &str, purpose: &str) -> Vec<ModelOption> {
    match (provider, purpose) {
        ("groq", "stt") => vec![
            option("whisper-large-v3-turbo", "Whisper Large v3 Turbo", "Rápido y económico", true),
            option("whisper-large-v3", "Whisper Large v3", "La más precisa de Groq", false),
            option("distil-whisper-large-v3-en", "Distil Whisper (inglés)", "Solo inglés, la más rápida", false),
        ],
        ("openai", "stt") => vec![
            option("gpt-4o-mini-transcribe", "GPT-4o mini Transcribe", "Precisa y económica", true),
            option("gpt-4o-transcribe", "GPT-4o Transcribe", "La más precisa de OpenAI", false),
            option("whisper-1", "Whisper", "El modelo clásico", false),
        ],
        ("deepgram", "stt") => vec![
            option("nova-3", "Nova-3", "En vivo y multilingüe (español + inglés)", true),
            option("nova-3-medical", "Nova-3 Medical", "Vocabulario médico", false),
            option("nova-2", "Nova-2", "Generación anterior", false),
            option("nova-2-meeting", "Nova-2 Meeting", "Reuniones con varias voces", false),
            option("nova-2-phonecall", "Nova-2 Phonecall", "Audio de llamada", false),
            option("enhanced", "Enhanced", "Clásico", false),
            option("base", "Base", "El más económico", false),
        ],
        ("custom", "stt") => vec![
            option("Systran/faster-whisper-small", "faster-whisper small", "Equilibrio para CPU", true),
            option("Systran/faster-whisper-medium", "faster-whisper medium", "Más preciso, más lento", false),
            option("Systran/faster-whisper-large-v3", "faster-whisper large v3", "Para servidores con GPU", false),
            option("deepdml/faster-whisper-large-v3-turbo-ct2", "faster-whisper large v3 turbo", "Rápido con GPU", false),
        ],
        ("groq", "polish") => vec![
            option("openai/gpt-oss-120b", "GPT-OSS 120B", "La mejor puntuación en Groq", true),
            option("openai/gpt-oss-20b", "GPT-OSS 20B", "Más rápida, algo menos fina", false),
            option("llama-3.3-70b-versatile", "Llama 3.3 70B", "Sólida y estable", false),
            option("moonshotai/kimi-k2-instruct", "Kimi K2", "Muy buena en español", false),
            option("llama-3.1-8b-instant", "Llama 3.1 8B", "Instantánea, básica", false),
        ],
        ("claude", "polish") => vec![
            option("claude-haiku-5-5", "Claude Haiku 5.5", "Rápida y económica", true),
            option("claude-sonnet-5-5", "Claude Sonnet 5.5", "Mejor redacción", false),
            option("claude-opus-5-5", "Claude Opus 5.5", "La más capaz", false),
        ],
        _ => vec![],
    }
}

fn pretty(id: &str) -> String {
    id.rsplit('/').next().unwrap_or(id).split(['-', '_']).filter(|p| !p.is_empty())
        .map(|p| { let mut c = p.chars(); c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default() })
        .collect::<Vec<_>>().join(" ")
}

async fn fetch(provider: &str, settings: &Settings) -> Option<Vec<(String, String)>> {
    let client = reqwest::Client::builder().timeout(Duration::from_secs(8)).build().ok()?;
    let key = |name: &str| providers::key(name).ok();
    let request = match provider {
        "groq" => client.get("https://api.groq.com/openai/v1/models").bearer_auth(key("groq")?),
        "openai" => client.get("https://api.openai.com/v1/models").bearer_auth(key("openai")?),
        "claude" => client.get("https://api.anthropic.com/v1/models?limit=100").header("x-api-key", key("claude")?).header("anthropic-version", "2023-06-01"),
        "deepgram" => client.get("https://api.deepgram.com/v1/models").header("Authorization", format!("Token {}", key("deepgram")?)),
        "custom" => {
            let mut base = validate_base_url(&settings.stt_base_url).ok()?;
            if !base.path().ends_with('/') { base.set_path(&format!("{}/", base.path())); }
            let request = client.get(base.join("models").ok()?);
            match key("custom") { Some(k) => request.bearer_auth(k), None => request }
        }
        _ => return None,
    };
    let response = request.send().await.ok()?;
    if !response.status().is_success() { return None; }
    let bytes = response.bytes().await.ok()?;
    if bytes.len() > 4_000_000 { return None; }
    let data: Value = serde_json::from_slice(&bytes).ok()?;
    let mut out = Vec::new();
    if provider == "deepgram" {
        for item in data["stt"].as_array()? {
            let id = item["canonical_name"].as_str().or(item["name"].as_str()).unwrap_or("");
            if !id.is_empty() && item["streaming"].as_bool() != Some(false) { out.push((id.to_string(), String::new())); }
        }
    } else {
        for item in data["data"].as_array()? {
            let id = item["id"].as_str().unwrap_or("");
            let name = item["display_name"].as_str().unwrap_or("").to_string();
            if !id.is_empty() { out.push((id.to_string(), name)); }
        }
    }
    Some(out)
}

fn wanted(provider: &str, purpose: &str, id: &str) -> bool {
    let id = id.to_lowercase();
    match (provider, purpose) {
        ("deepgram", "stt") => true,
        ("groq" | "openai", "stt") => id.contains("whisper") || id.contains("transcribe"),
        ("custom", "stt") => !id.contains("tts") && !id.contains("kokoro") && !id.contains("piper"),
        ("groq", "polish") => !["whisper", "guard", "tts", "playai", "orpheus", "distil", "allam"].iter().any(|w| id.contains(w)),
        ("claude", "polish") => id.starts_with("claude-"),
        _ => false,
    }
}

/// Every model the service offers for this purpose, the recommended one first.
pub async fn list(provider: &str, purpose: &str, settings: &Settings) -> Vec<ModelOption> {
    let mut options = curated(provider, purpose);
    if let Some(found) = fetch(provider, settings).await {
        let mut seen: std::collections::HashSet<String> = options.iter().map(|o| o.id.clone()).collect();
        let mut extra: Vec<ModelOption> = found.into_iter()
            .filter(|(id, _)| wanted(provider, purpose, id) && id.len() <= 100 && seen.insert(id.clone()))
            .map(|(id, name)| ModelOption { label: if name.is_empty() { pretty(&id) } else { name }, note: String::new(), recommended: false, id })
            .collect();
        extra.sort_by(|a, b| a.label.cmp(&b.label));
        options.extend(extra);
    }
    options.truncate(80);
    options
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn ids_become_readable_labels() {
        assert_eq!(pretty("meta-llama/llama-4-scout-17b"), "Llama 4 Scout 17b");
        assert!(wanted("groq", "polish", "llama-3.3-70b-versatile"));
        assert!(!wanted("groq", "polish", "whisper-large-v3"));
        assert!(wanted("openai", "stt", "gpt-4o-transcribe"));
        assert!(!wanted("openai", "stt", "gpt-4o"));
    }
}

# Security

## Your keys stay yours

Bruma is "bring your own key". There is no Bruma server.

- API keys are typed by you in **Conexiones** and stored only on your computer: on macOS in `~/Library/Application Support/com.bruma.voice.personal/credentials.json` (readable by your user only, mode 0600); on Windows in Credential Manager.
- Keys are read by the Rust core and sent only to the provider they belong to, over HTTPS. They are never returned to the interface, written to logs, history or settings, or sent anywhere else.
- Provider endpoints are fixed in code (except your own server, which you enter yourself). The app opens only an allowlist of web pages.

## Your voice and text

- Audio is captured only while you dictate, kept in memory and sent to the speech engine you chose (Groq, OpenAI, Deepgram or your own server). It is never written to disk.
- If polishing is on, the transcript (plus your dictionary, tone, personal rules and, if enabled, the few words before your cursor) is sent to the editor you chose (Claude or Groq). Password fields are never read.
- History (text, app name, counts) lives in `history.json` on your machine. You can turn it off or clear it.
- Bruma pastes with ⌘V / Ctrl+V and restores your clipboard. It never presses Enter or sends messages.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private advisory form: **Security → Report a vulnerability** on this repository. Include steps to reproduce with sample data only; never include real keys or personal text. You will get a reply within a few days.

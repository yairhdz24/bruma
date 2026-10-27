# Bruma — notes for contributors and coding agents

Bruma is an open-source voice keyboard for macOS (Windows in beta): tap **fn** (or a shortcut), speak, tap again, and polished text is pasted wherever the cursor is. Hold fn for push-to-talk. Esc cancels from any app.

## Ground rules

- **Bring your own keys.** Bruma never ships, proxies or logs API keys. Keys are entered by each user, stored on their own machine (macOS: `credentials.json`, mode 0600, in the app's config folder; Windows: Credential Manager) and only ever read by Rust. The webview only learns whether a key exists.
- Never commit secrets, `.env` files, certificates or personal data. CI runs a secret scanner on every push and pull request.
- Audio stays in memory and is sent only to the speech engine the user picked. History is local, can be disabled and never leaves the machine.
- Never send messages automatically: Bruma pastes, it never presses Enter.
- Clipboard is restored after pasting (all types). Review-before-paste is opt-in.
- Do not copy code, images, sounds or logos from other products. Third-party brand logos come from [svgl](https://svgl.app) and are used only to identify services.
- Native packages are built in CI (GitHub Actions). You do not need Xcode to work on the UI: `npm run dev` runs a browser preview with a demo mode.

## Architecture in one breath

React + TypeScript + Tailwind v4 UI (`src/`) in a Tauri 2 shell (`src-tauri/`). Rust owns microphone capture, providers, credentials, pasting, history and the floating pill window. A few small Objective-C files (`src-tauri/native/`) talk to AppKit/Accessibility: the fn key, pasting, the text before the cursor and app icons. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Checks before a pull request

```sh
npm ci && npm run build && npm test          # UI + Playwright (PW_EXECUTABLE=/path/to/chromium if needed)
cd src-tauri && cargo test                   # Rust
```

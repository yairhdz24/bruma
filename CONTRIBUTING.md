# Contributing to Bruma

Thanks for helping! Bruma is small on purpose: a fast, private, beautiful voice keyboard.

## Getting started

```sh
git clone https://github.com/yairhdz24/bruma && cd bruma
npm ci
npm run dev        # browser preview at http://127.0.0.1:1420 (demo mode, no microphone)
```

The full desktop app needs Rust and the Tauri prerequisites (`npm run tauri dev`). If you only touch the interface, the browser preview is enough; CI builds the macOS and Windows apps for every pull request.

## Pull requests

1. Open an issue first for anything bigger than a small fix, so we agree on the approach.
2. Keep changes focused. One feature or fix per pull request.
3. Run the checks: `npm run build && npm test` and `cd src-tauri && cargo test`.
4. Interface text is in Spanish (the app's language); code and comments are in English.
5. Never include API keys, recordings or personal text in code, tests, screenshots or logs.

## Good first contributions

- New app categories and styles (`src-tauri/src/platform.rs`, `style_for` in `providers.rs`).
- Translations of the interface.
- Windows improvements (pasting, shortcuts, app icons).
- A local Whisper engine (whisper.cpp / WhisperKit) as an alternative to cloud engines.

By contributing you agree that your work is released under the [MIT License](LICENSE).

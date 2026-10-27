<div align="center">

<img src="public/bruma-icon-256.png" width="112" alt="Ícono de Bruma" />

# Bruma

**Habla. Bruma escribe.**

Teclado por voz gratuito y de código abierto para tu Mac. Toca <kbd>fn</kbd>, habla, y el texto aparece limpio y bien puntuado donde está tu cursor, en cualquier app.

<p>
  <a href="https://github.com/yairhdz24/bruma/releases/latest"><img src="https://img.shields.io/github/v/release/yairhdz24/bruma?style=flat-square&color=0A84FF&label=versión&cacheSeconds=600" alt="Release" /></a>
  <a href="https://github.com/yairhdz24/bruma/releases"><img src="https://img.shields.io/github/downloads/yairhdz24/bruma/total?style=flat-square&color=34C759&label=descargas&cacheSeconds=600" alt="Downloads" /></a>
  <a href="https://github.com/yairhdz24/bruma/stargazers"><img src="https://img.shields.io/github/stars/yairhdz24/bruma?style=flat-square&color=FFD34D&logo=github&label=estrellas&cacheSeconds=600" alt="Stars" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licencia-MIT-8E8E93?style=flat-square" alt="MIT" /></a>
  <br />
  <a href="#descargar"><img src="https://img.shields.io/badge/macOS-Apple%20Silicon-111111?style=flat-square&logo=apple&logoColor=white" alt="macOS" /></a>
  <a href="#descargar"><img src="https://img.shields.io/badge/Windows-beta-0078D4?style=flat-square&logo=windows&logoColor=white" alt="Windows" /></a>
  <img src="https://img.shields.io/badge/Tauri%202-Rust%20%2B%20React-24C8DB?style=flat-square&logo=tauri&logoColor=white" alt="Tauri" />
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-bienvenidos-FF2D55?style=flat-square" alt="PRs welcome" /></a>
  <a href="https://github.com/yairhdz24/bruma/issues?q=is%3Aopen+label%3A%22good+first+issue%22"><img src="https://img.shields.io/github/issues/yairhdz24/bruma/good%20first%20issue?style=flat-square&color=AF52DE&label=good%20first%20issues&cacheSeconds=600" alt="Good first issues" /></a>
</p>

[**Descargar**](#descargar) · [English](README.md) · [Cómo funciona](docs/ARCHITECTURE.md) · [Reportar un problema](https://github.com/yairhdz24/bruma/issues/new/choose)

<a href="https://github.com/yairhdz24/bruma/stargazers"><img src="https://img.shields.io/github/stars/yairhdz24/bruma?style=for-the-badge&logo=github&label=%E2%AD%90%20Dale%20una%20estrella&color=FFD34D&labelColor=111111&cacheSeconds=600" alt="Dale una estrella a Bruma en GitHub" /></a>

**Si Bruma te ahorra tiempo, regálale una ⭐. Es gratis, toma un segundo y así más gente la encuentra.**

<img src="docs/assets/pill.gif" width="600" alt="La píldora de Bruma escuchando, teñida del color de la app donde escribes" />

</div>

<img src="docs/assets/home-light.png" alt="Pantalla de inicio de Bruma" />

## Por qué Bruma

- **Gratis para uso personal.** Usas tu propia clave. Con el plan gratuito de Groq puedes dictar horas al día sin pagar nada. Sin suscripción, sin cuenta y sin servidor de Bruma.
- **Privada por diseño.** Tu audio vive en memoria y va directo de tu Mac al motor que tú elijas. Las claves solo existen en tu computadora.
- **Se siente nativa.** Una píldora pequeña sobre el Dock que se tiñe del color de la app donde escribes, ventanas de vidrio líquido, tipografía San Francisco y los botones reales de macOS.
- **Escribe como tú.** Quita muletillas y titubeos, aplica autocorrecciones ("el martes, no, el viernes" → "el viernes"), puntúa bien en español (¿? ¡!), respeta las palabras que dices en inglés y se adapta a cada app: breve en WhatsApp, en párrafos en Correo y exacta en tu editor de código.

## Funciones

| | |
| --- | --- |
| 🎙️ **fn para hablar** | Toca <kbd>fn</kbd> para empezar y otra vez para pegar, o mantenla y suéltala. También fn + Espacio o cualquier atajo. <kbd>Esc</kbd> cancela en cualquier app. |
| ⚡ **Palabras en vivo** | Con Deepgram Nova-3 las palabras aparecen sobre la píldora mientras hablas. |
| 🧠 **Entiende el contexto** | Lee las últimas palabras antes del cursor para acertar con espacios y mayúsculas (nunca en campos de contraseña). |
| 📚 **Aprende tus palabras** | Si corriges una palabra después de pegar, la píldora te ofrece guardarla en tu diccionario. |
| ✍️ **Tus reglas** | Instrucciones fijas en lenguaje normal: "tutea siempre", "firma los correos como Ana", "nada de emojis". |
| 🗣️ **Atajos de voz** | Di "mi correo" y se escribe tu dirección. |
| 🌎 **Idiomas mezclados** | Mezcla español e inglés en la misma frase; no se traduce nada si no lo pides. |
| 🔌 **Cualquier motor y modelo** | Groq, OpenAI, Deepgram o tu propio servidor Whisper, con todos los modelos de cada servicio. Claude o Groq para pulir. |
| 📈 **Tus estadísticas** | Palabras, palabras por minuto, tiempo ahorrado y racha, todo local. |

<table>
<tr>
<td><img src="docs/assets/connections.png" alt="Conexiones: elige motores y modelos" /></td>
<td><img src="docs/assets/home-dark.png" alt="Bruma en modo oscuro" /></td>
</tr>
</table>

## Descargar

| | |
| --- | --- |
| 🍎 **macOS** · Apple Silicon (M1–M4), macOS 12 o superior | [**Descargar Bruma para Mac (.dmg)**](https://github.com/yairhdz24/bruma/releases/latest/download/Bruma-macOS-Apple-Silicon.dmg) |
| 🪟 **Windows** 10/11 · 64 bits (beta) | [**Descargar Bruma para Windows (.exe)**](https://github.com/yairhdz24/bruma/releases/latest/download/Bruma-Windows-x64-setup.exe) |

Todas las versiones y sus novedades: [Releases](https://github.com/yairhdz24/bruma/releases).

### Instalar en macOS

1. Abre el `.dmg` y arrastra **Bruma** a **Aplicaciones**.
2. Bruma todavía no está notarizada por Apple, así que la primera vez haz **clic derecho en Bruma → Abrir → Abrir**. (O ejecuta `xattr -dr com.apple.quarantine /Applications/Bruma.app` en Terminal.)
3. La bienvenida te pide **Micrófono** (para escucharte) y **Accesibilidad** (para pegar el texto y leer la tecla fn). Activa Bruma en cada lista.
4. En **Ajustes del Sistema → Teclado**, cambia **"Al presionar la tecla 🌐" → "No hacer nada"**, para que fn quede libre para Bruma.

<details>
<summary><b>¿Prefieres Terminal? Una línea que además conserva tus permisos en cada actualización</b></summary>

```sh
curl -fsSL https://raw.githubusercontent.com/yairhdz24/bruma/main/scripts/install-mac.sh | zsh
```

Descarga la última versión y la firma con un certificado creado en tu propia Mac, así macOS recuerda los permisos de Micrófono y Accesibilidad cada vez que actualizas. Ejecútala de nuevo para actualizar.
</details>

### Instalar en Windows

1. Ejecuta `Bruma-Windows-x64-setup.exe`. Si aparece SmartScreen, haz clic en **Más información → Ejecutar de todas formas** (la app todavía no está firmada).
2. Permite el acceso al micrófono si Windows lo pide (**Configuración → Privacidad → Micrófono**).
3. Usa un atajo como <kbd>Ctrl</kbd>+<kbd>Espacio</kbd> para dictar (la tecla fn solo existe en macOS).

## Consigue tu clave gratis

Bruma no tiene servidor, así que usa **tu propia clave**, que nunca sale de tu computadora. Para empezar solo necesitas **una**, y la de Groq es gratis.

### Groq: gratis (recomendada)

1. Entra a **[console.groq.com](https://console.groq.com)** e inicia sesión con Google, GitHub o correo. No pide tarjeta.
2. En el menú, abre **API Keys** → **Create API Key** y ponle de nombre `Bruma`.
3. Copia la clave (empieza con `gsk_`). Solo se muestra una vez.
4. En Bruma: **Conexiones → Groq → pega la clave → Guardar**. Listo, ya puedes dictar.

Con esa misma clave Bruma también puede pulir tu texto gratis (Conexiones → Pulir el texto → Groq).

### Claves opcionales

| Servicio | Qué agrega | Dónde se consigue | Costo |
| --- | --- | --- | --- |
| **Claude** (Anthropic) | La mejor redacción y puntuación | [console.anthropic.com → Settings → API Keys](https://console.anthropic.com/settings/keys) (empieza con `sk-ant-`) | Pago por uso; necesitas créditos en Billing |
| **Deepgram** | Las palabras aparecen en vivo mientras hablas | [console.deepgram.com](https://console.deepgram.com) → API Keys → Create | US$200 de crédito gratis para empezar |
| **OpenAI** | Modelos GPT-4o Transcribe | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) (empieza con `sk-`) | Pago por uso |
| **Tu propio servidor** | 100% tuyo, sin terceros | Cualquier Whisper compatible con OpenAI, por ejemplo [Speaches](https://github.com/speaches-ai/speaches) | Tu hardware |

Pega cada clave en **Conexiones**, elige el modelo que quieras de la lista y listo.

## Cómo se usa

| Acción | macOS | Windows |
| --- | --- | --- |
| Empezar / terminar y pegar | Toca <kbd>fn</kbd> | <kbd>Ctrl</kbd>+<kbd>Espacio</kbd> (configurable) |
| Mantener para hablar | Mantén <kbd>fn</kbd>, habla y suéltala | — |
| Tecla alternativa | <kbd>fn</kbd>+<kbd>Espacio</kbd> o cualquier atajo (Ajustes → Atajo) | Cualquier atajo |
| Cancelar | <kbd>Esc</kbd> | <kbd>Esc</kbd> |

- **Pon el cursor donde quieres el texto**, en cualquier app: WhatsApp, Slack, Correo, Notas, Claude, ChatGPT o tu editor de código.
- **La píldora sobre el Dock** te dice qué está pasando. Mientras escucha se tiñe del color de la app donde vas a escribir, muestra puntos mientras escribe y una palomita cuando pega. Si pasas el puntero encima mientras escucha, puedes cancelar o terminar con el mouse.
- **Habla natural.** Puedes decir "nueva línea", "coma" o "signo de interrogación". Corrígete en voz alta ("a las cinco, no, a las seis") y Bruma se queda con la corrección.
- **Diccionario:** agrega nombres y términos que quieres bien escritos (Supabase, tu empresa, personas). Si corriges una palabra justo después de pegar, Bruma te ofrece agregarla.
- **Atajos de voz:** di "mi correo" y se escribe tu dirección.
- **Tus reglas:** en **Ajustes → Tus reglas** escribe instrucciones fijas como "tutea siempre" o "nada de emojis".
- **Historial:** todo lo que dictaste, con la app a la que fue, para copiarlo otra vez. Es local y lo puedes desactivar.

## Cómo funciona

```mermaid
flowchart LR
  K["fn"] --> M["Micrófono (solo memoria)"] --> S["Motor de voz<br/>Groq · OpenAI · Deepgram · tu servidor"]
  S --> P["Editor<br/>Claude · Groq"] --> V["Pegar en tu cursor"]
  C["Texto antes del cursor + diccionario + tus reglas"] --> P
```

Bruma es una app de [Tauri 2](https://tauri.app): interfaz en React + TypeScript sobre un núcleo en Rust, más unos pocos módulos en Objective-C para la tecla fn, el pegado y Accesibilidad. Los detalles están en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Cuánto cuesta

| Motor | Precio | Notas |
| --- | --- | --- |
| **Groq** Whisper Large v3 Turbo | **Plan gratis**, unas 8 h de audio al día | Por defecto. Muy rápido. |
| **Groq** para pulir | **Plan gratis** | GPT-OSS 120B; si falla, Llama 3.3. |
| Claude Haiku para pulir | Fracciones de centavo por dictado | La mejor redacción. Usa tus créditos de la API de Anthropic. |
| Deepgram Nova-3 | US$200 de crédito inicial, después ~US$0.46/h | Palabras en vivo mientras hablas. |
| OpenAI | Pago por uso | Modelos GPT-4o Transcribe. |
| Tu propio servidor | Tu hardware | Cualquier Whisper compatible con OpenAI, por ejemplo [Speaches](https://github.com/speaches-ai/speaches). |

Los precios los fija cada proveedor y pueden cambiar; revisa sus sitios.

## Privacidad y seguridad

- **Sin servidor de Bruma, sin telemetría y sin cuenta.**
- **Tus claves nunca salen de tu computadora.** En macOS van en un archivo privado que solo tu usuario puede leer (`credentials.json`, permisos 0600); en Windows, en el Administrador de credenciales. La interfaz nunca las ve.
- **El audio nunca se guarda.** Vive en memoria y solo se envía al motor que elegiste.
- **El historial es local** y puedes desactivarlo o borrarlo.
- **Nunca envía por ti.** Bruma pega, nunca presiona Enter, y después restaura tu portapapeles.

Para reportar una vulnerabilidad de forma privada, consulta [SECURITY.md](SECURITY.md).

## Compilar desde el código

```sh
git clone https://github.com/yairhdz24/bruma && cd bruma
npm ci
npm run dev          # vista previa de la interfaz en el navegador (modo demostración)
npm run tauri dev    # app de escritorio completa (requiere Rust y los requisitos de Tauri)
npm test             # Playwright
cd src-tauri && cargo test
```

## Lo que viene

- [ ] Editar con la voz: selecciona un texto y di "hazlo formal" o "tradúcelo al inglés".
- [ ] Modo prompt: convierte lo que hablas en un prompt bien estructurado para apps de IA.
- [ ] Palabras en vivo con motores gratuitos (Whisper por fragmentos).
- [ ] Whisper local (WhisperKit / whisper.cpp) para dictar sin internet.
- [ ] Versiones de macOS notarizadas y una versión para Intel.

Las ideas y los pull requests son bienvenidos; empieza por [CONTRIBUTING.md](CONTRIBUTING.md).

## Contribuir

Bruma se construye en público y cualquier contribución es bienvenida, desde corregir un texto hasta agregar un motor nuevo.

1. Elige un issue con la etiqueta [**good first issue**](https://github.com/yairhdz24/bruma/issues?q=is%3Aopen+label%3A%22good+first+issue%22) o [**help wanted**](https://github.com/yairhdz24/bruma/issues?q=is%3Aopen+label%3A%22help+wanted%22), o [propón una idea](https://github.com/yairhdz24/bruma/discussions).
2. Haz un fork, ejecuta `npm ci && npm run dev` y haz tu cambio. CI compila las apps de macOS y Windows en cada pull request, así que no necesitas Xcode para trabajar en la interfaz.
3. Abre un pull request. La guía completa está en [CONTRIBUTING.md](CONTRIBUTING.md).

<a href="https://github.com/yairhdz24/bruma/graphs/contributors"><img src="https://contrib.rocks/image?repo=yairhdz24/bruma" alt="Personas que contribuyen" /></a>

## Apoya a Bruma

Bruma es gratis y se construye en público. Las mejores formas de ayudar:

- ⭐ **[Dale una estrella al repo](https://github.com/yairhdz24/bruma/stargazers)**: es la forma número uno en que la gente la descubre.
- 🐛 **[Reporta un problema o pide una función](https://github.com/yairhdz24/bruma/issues/new/choose).**
- 🔁 **Compártela** con alguien que escriba mucho, o publica un clip de la píldora en acción.
- 🛠️ **Contribuye**: revisa [CONTRIBUTING.md](CONTRIBUTING.md).

## Historial de estrellas

[![Historial de estrellas](https://api.star-history.com/svg?repos=yairhdz24/bruma&type=Date)](https://star-history.com/#yairhdz24/bruma&Date)

## Créditos

Creada por **[Yair Hernández](https://github.com/yairhdz24)**. Los logos de servicios vienen de [svgl](https://svgl.app) y pertenecen a sus dueños; consulta [docs/brand-assets.md](docs/brand-assets.md).

Publicada con la [licencia MIT](LICENSE).

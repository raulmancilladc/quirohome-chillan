# QuiroHome Live

Aplicación de escritorio para transmitir en vivo a **Facebook, Instagram, TikTok y YouTube al mismo tiempo** con una sola cámara, y **responder automáticamente las preguntas** que deja el público durante el live (¿dónde quedan?, ¿cómo llego?, ¿cuál es la web?, ¿cómo agendo?, ¿qué tratan?).

Pensada para ser simple: elegir **vertical u horizontal**, activar las plataformas, pulsar **Iniciar transmisión**.

## Qué hace

- **Multi-transmisión**: un solo video se codifica una vez (FFmpeg) y se envía en paralelo a todas las plataformas activas. Si una plataforma falla, las demás siguen.
- **Vertical / horizontal con un botón**: 1080×1920 para TikTok/Instagram/Reels, 1920×1080 para YouTube/Facebook clásico. La cámara se recorta automáticamente.
- **Grabación local** de cada transmisión (carpeta Videos / QuiroHome Live).
- **Chat unificado**: los comentarios de YouTube, Facebook y TikTok llegan a un solo panel.
- **Respuestas automáticas**:
  - Reconoce preguntas frecuentes por palabras clave y arma la respuesta con los datos del negocio (dirección, web, link de agenda, teléfono, horario, servicios).
  - Modo **Sugerir** (tú apruebas con un clic) o **Automático** (responde sola).
  - La respuesta se **muestra sobre el video**, así la ven en todas las plataformas, incluso donde no se puede escribir en el chat.
  - Además se **publica en el chat** donde la API lo permite (YouTube, Facebook; TikTok opcional con cookie de sesión).
  - Opcional: **IA (Claude)** responde preguntas que no están en la lista usando solo los datos del negocio y sin dar indicaciones médicas.
- **Pregunta manual**: para Instagram (que no entrega los comentarios del live por API) escribes la pregunta que ves en el celular y la respuesta sale en pantalla al instante.
- **Títulos y textos**: cinco estilos (título grande, nombre y cargo, banda, burbuja, cinta en movimiento), diez tipografías, colores y animación. Se muestran con un clic o con Shift + número.
- **Sonidos**: ocho efectos incluidos y los tuyos (mp3, wav…), con tecla rápida. Van mezclados a la transmisión y a la grabación.
- **Cámaras**: botones numerados (teclas 1-9) para cambiar en vivo, segunda cámara en recuadro, encuadre llenar/completo, zoom y rotación 90° (para montar la Osmo en vertical).
- **Audio**: medidor del micrófono, silencio, detector de acople con aviso de qué apagar y botón para silenciar los parlantes del Mac.
- **Varias cuentas por plataforma**, grabación en alta calidad con los comentarios sobre el video y archivo .srt con cada comentario y su segundo.
- **Codificador de hardware** (VideoToolbox en Mac, NVENC/QuickSync en Windows) y modo Ligero para equipos cargados.
- **Instaladores** para macOS y Windows generados automáticamente (pestaña Releases del repositorio).

## Límites honestos por plataforma

| Plataforma | Transmitir | Leer chat | Responder en el chat | Respuesta en pantalla |
|---|---|---|---|---|
| YouTube | ✅ RTMP (clave automática con Google) | ✅ API oficial | ✅ API oficial | ✅ |
| Facebook (página) | ✅ RTMPS (crea el live por API) | ✅ API oficial | ✅ API oficial | ✅ |
| TikTok | ✅ RTMP (requiere clave habilitada por TikTok en LIVE Studio) | ✅ conexión no oficial | ⚠️ solo con cookie de sesión | ✅ |
| Instagram | ✅ RTMPS (cuenta profesional, “Software de transmisión”) | ❌ sin API | ❌ sin API | ✅ |

## Requisitos

- Node.js 20 o superior.
- FFmpeg: se instala solo con `npm install` (paquete `ffmpeg-static`). Si falla, instala FFmpeg en el sistema y la app lo detecta.
- Windows, macOS o Linux.

## Instalar

Descarga el instalador desde la sección **Releases** del repositorio: `.dmg` para macOS (arm64 para chip Apple, x64 para Intel) o `.exe` para Windows. En macOS, la primera vez: clic derecho sobre la app → Abrir.

## Cómo correrla en modo desarrollo

```bash
npm install
npm run dev        # modo desarrollo (abre la app)
npm run dist       # genera el instalador para tu sistema (carpeta release/)
```

## Primera configuración (5 minutos)

1. **Respuestas automáticas → Datos del negocio**: dirección, cómo llegar, web, link para agendar, WhatsApp, horario, qué tratan.
2. **Plataformas**: activa las que uses y pega la clave de transmisión de cada una (la app te dice dónde encontrarla).
3. **Ajustes → chats**: 
   - YouTube: pega el Client ID / Secret de Google Cloud e inicia sesión con Google. Luego en Plataformas puedes pulsar “Obtener clave automáticamente”.
   - Facebook: ID de la página + Page Access Token. Luego “Crear transmisión en Facebook” te da la clave sin salir de la app.
   - TikTok: solo tu usuario.
4. **En vivo**: elige Vertical u Horizontal, revisa la cámara y pulsa **Iniciar transmisión**.

Todas las claves se guardan solo en tu computador (`settings.json` en la carpeta de datos de la app).

## Estructura del proyecto

```
electron/
  main.ts                 Proceso principal: ventana, IPC, orquestación
  preload.ts              Puente seguro hacia la interfaz
  streaming/ffmpeg.ts     Motor FFmpeg (muxer "tee" hacia varias plataformas + grabación)
  chat/                   Conectores: youtube.ts, facebook.ts, tiktok.ts, instagram.ts, aggregator.ts
  autoanswer/engine.ts    Reconocimiento de preguntas frecuentes
  autoanswer/claude.ts    Respuestas con IA (opcional)
  autoanswer/faq.default.json  Preguntas frecuentes iniciales
  store.ts                Guardado de configuración
shared/types.ts           Tipos compartidos
src/
  App.tsx                 Pantalla principal
  lib/compositor.ts       Canvas: orientación, recorte, texto sobre el video
  lib/recorder.ts         Captura del canvas + micrófono hacia FFmpeg
  components/             Preview, ChatPanel, Destinations, FaqEditor, Settings
```

## Cómo funciona por dentro

Cámara → canvas (orientación + overlay) → `MediaRecorder` (WebM) → proceso principal → **FFmpeg** (`libx264` + `aac`, muxer `tee`) → RTMP a cada plataforma + archivo local.

Chat: cada conector emite mensajes a un agregador; el motor de respuestas busca coincidencias en las preguntas frecuentes y, si no hay, opcionalmente consulta a Claude. La respuesta se envía al chat de origen y se dibuja sobre el video durante unos segundos.

## Próximos pasos sugeridos

- Pantalla compartida y segunda cámara como fuentes adicionales.
- Logo e intro personalizables.
- Historial de preguntas por live para mejorar las respuestas frecuentes.
- Twitch, Kick y otros destinos (ya se pueden agregar como RTMP personalizado).

# Hanzi XP — HSK 1–3 (HSK 3.0, temario 2025)

PWA para aprender chino donde **cada carácter y cada palabra tiene su propio XP y nivel de dominio (0–10), desglosado por habilidad**: reconocimiento, pinyin y tono, escucha, escritura y producción. Repetición espaciada con FSRS-7, funciona offline y guarda el progreso en el dispositivo (IndexedDB).

## Uso rápido

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # tests unitarios (XP, FSRS, propagación, respaldo…)
npm run e2e          # pruebas en navegador (Playwright, viewport móvil)
npm run build        # build de producción + service worker
```

## Datos

| Paso | Comando | Qué hace |
|---|---|---|
| Descargar fuentes | `npm run data:fetch` | API oficial chinesetest.cn, CC-CEDICT, Make Me a Hanzi, Tatoeba, LXGW WenKai → `data/raw/` (no versionado; huellas en `data/sources.lock.json`) |
| Construir | `npm run data` | Genera `data/build/*.json`, `public/strokes/`, la tipografía subconjuntada y `reports/data-gaps.md` |

- **Lista oficial**: temario HSK 3.0 publicado por el CLEC en nov. 2025 (en vigor desde jul. 2026), leído de la API de chinesetest.cn: HSK 1 = 300 palabras / 246 caracteres, HSK 2 = +200 / +125, HSK 3 = +500 / +284; gramática 70 / 78 / 96 puntos.
- **Capa en español** (`data/authored/`): significados de las 1000 palabras y 655 caracteres, y ≥2 ejemplos por palabra, redactados con ayuda de IA y marcados `review: pending`. Los ejemplos (de Tatoeba o redactados) solo usan vocabulario del mismo nivel HSK o inferior; el build lo comprueba.
- El build **falla** si falta pinyin, tono o traducción en los niveles marcados como completos (`REQUIRED_ES_LEVELS` en `scripts/data/validate.ts`).

## Ejercicios

Frases: **ordena la frase** (fichas con hanzi y pinyin a partir de la traducción) y **encuentra la palabra** en una frase (por su significado, por su hanzi con la frase en pinyin o por su sonido). Usan los ejemplos de cada palabra y un repertorio de 126 **frases útiles** por temas (`data/authored/phrases.json`, validadas: solo vocabulario HSK 1–3 y nombres propios de una lista blanca).

Flashcards (ambas direcciones), opción múltiple (hanzi→significado, significado→hanzi, hanzi→pinyin), escucha (oír → elegir el hanzi, con pares mínimos y sin homófonos) y tonos (oír → elegir los tonos sobre el pinyin sin tonos). La escucha se desbloquea para las palabras vistas un día anterior y requiere una voz zh-CN en el dispositivo. Modos: sesión diaria, frases útiles, debilidades y entrenamiento de tonos.

## Modelo de progreso

- Estado por `(ítem, habilidad)`: XP, pico de XP, tarjeta FSRS, débil, racha de aciertos. Registro de repasos append-only (base para una futura sincronización).
- Acierto: XP base del ejercicio × valoración × **bonus de repaso espaciado** (×1 → ×3 según los días desde el último repaso). Fallo: −2 XP y "débil" hasta 2 aciertos seguidos.
- Practicar una palabra da el 40 % del XP a cada uno de sus caracteres (un fallo les resta 1, sin marcarlos débiles).
- **Dominio efectivo** = XP × retención estimada (FSRS); baja si no repasas. El XP ganado no se pierde.
- Niveles por habilidad: 0, 5, 15, 30, 50, 75, 105, 140, 180, 225, 275 XP (Nuevo → Visto → Aprendiendo → Familiar → Dominado).

## Sincronización entre dispositivos

Progreso → Sincronización: pega un token clásico de GitHub con solo el permiso `gist`. La app crea un **gist secreto** en tu cuenta (`hanzi-xp.estado.b64` + un archivo de registro por mes, JSON gzip+base64) y sincroniza al abrir, al terminar cada sesión, al salir y cada 10 minutos. Fusión: registro por unión (append-only), estados por el más reciente, estadísticas diarias recalculadas. El progreso local sigue funcionando sin conexión.

## Estructura

```
src/core/      lógica pura y testeada: xp, mastery, scheduler (FSRS), engine, queue, stats, pinyin
src/db/        Dexie (IndexedDB) + ProgressRepo + exportar/importar
src/sync/      sincronización con gist: formato, fusión y cliente de GitHub
src/content/   carga de los JSON e índices
src/app/       servicios para la UI (audio, ejercicios, planificación)
src/features/  pantallas: home, session, item, map, words, progress
scripts/data/  pipeline de datos
```

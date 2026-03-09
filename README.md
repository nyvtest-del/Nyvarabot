# 🤖 Nyvarabot

Agente de IA personal que se comunica vía **Telegram**, piensa usando un **LLM** y recuerda información de forma persistente.

> **100% local** · Sin servidor web · Seguro · Modular · Escalable

---

## 🚀 Inicio rápido

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar credenciales

Edita el archivo `.env` con tus claves reales:

| Variable | Descripción | Cómo obtenerla |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Token del bot | Habla con [@BotFather](https://t.me/BotFather) en Telegram |
| `TELEGRAM_ALLOWED_USER_IDS` | Tu ID de Telegram (separados por coma si son varios) | Usa [@userinfobot](https://t.me/userinfobot) |
| `GROQ_API_KEY` | API key de Groq | [console.groq.com](https://console.groq.com) |
| `OPENROUTER_API_KEY` | API key de OpenRouter (opcional, fallback) | [openrouter.ai](https://openrouter.ai) |

### 3. Ejecutar

```bash
npm run dev
```

### 4. ¡Habla con tu bot en Telegram! 🎉

---

## 📂 Estructura del proyecto

```
src/
├── index.ts          → Punto de entrada
├── config.ts         → Variables de entorno (Zod)
├── bot.ts            → Bot de Telegram (grammy)
├── agent.ts          → Agent loop
├── llm/
│   ├── groq.ts       → Cliente Groq (principal)
│   ├── openrouter.ts → Cliente OpenRouter (fallback)
│   ├── types.ts      → Tipos compartidos
│   └── index.ts      → Fallback automático
├── tools/
│   ├── get-current-time.ts
│   ├── memory-save.ts
│   ├── memory-search.ts
│   ├── types.ts
│   └── index.ts      → Registro de herramientas
└── memory/
    ├── database.ts   → SQLite (better-sqlite3)
    └── index.ts
```

## 🛠️ Comandos del bot

| Comando | Descripción |
|---|---|
| `/start` | Mensaje de bienvenida |
| `/clear` | Borrar historial de conversación |
| `/memory` | Ver todas las memorias guardadas |

## 🔧 Herramientas del agente

| Herramienta | Descripción |
|---|---|
| `get_current_time` | Obtiene la fecha y hora actual |
| `memory_save` | Guarda información persistente |
| `memory_search` | Busca en la memoria guardada |

## 🧱 Stack tecnológico

- **grammy** → Bot de Telegram (long polling)
- **groq-sdk** → LLM principal (Llama 3.3 70B)
- **OpenRouter** → LLM fallback
- **better-sqlite3** → Memoria persistente
- **Zod** → Validación de configuración
- **tsx** → Ejecución en desarrollo

## 🔒 Seguridad

- Sin servidor web expuesto
- Whitelist de user IDs de Telegram
- Credenciales en `.env` (no se commitean)
- Validación estricta de configuración al arrancar
- Límite de iteraciones en el agent loop

## 📋 Scripts

```bash
npm run dev        # Desarrollo con hot-reload
npm run build      # Compilar TypeScript
npm run start      # Ejecutar versión compilada
npm run typecheck  # Verificar tipos sin compilar
```

---

*Hecho con ❤️ — Nyvarabot v1.0.0*

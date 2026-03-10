import "dotenv/config";
import { z } from "zod";

// ─── Esquema de validación ─────────────────────────────
const envSchema = z.object({
  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN es obligatorio"),
  TELEGRAM_ALLOWED_USER_IDS: z
    .string()
    .min(1, "TELEGRAM_ALLOWED_USER_IDS es obligatorio")
    .transform((val) =>
      val.split(",").map((id) => {
        const parsed = Number(id.trim());
        if (isNaN(parsed)) throw new Error(`ID de usuario inválido: ${id}`);
        return parsed;
      })
    ),

  // LLM — Groq (principal)
  GROQ_API_KEY: z.string().min(1, "GROQ_API_KEY es obligatorio"),
  GROQ_MODELS: z
    .string()
    .default(
      "llama-3.3-70b-versatile,qwen-2.5-coder-32b,llama-3.1-8b-instant,gemma-2-9b-it,llama-4-scout-17b"
    )
    .transform((val) =>
      val
        .split(",")
        .map((m) => m.trim())
        .filter((m) => m.length > 0)
    ),

  // LLM — OpenRouter (fallback)
  OPENROUTER_API_KEY: z.string().default(""),
  OPENROUTER_MODELS: z
    .string()
    .default(
      "deepseek/deepseek-r1:free,deepseek/deepseek-v3:free,meta-llama/llama-3.3-70b-instruct:free,qwen/qwen-2.5-coder-32b:free,google/gemini-2.0-flash-exp:free,mistralai/mistral-7b-instruct:free"
    )
    .transform((val) =>
      val
        .split(",")
        .map((m) => m.trim())
        .filter((m) => m.length > 0)
    ),

  // LLM — Google (Nano Banana / Imagen / Gemini Flash)
  GOOGLE_API_KEYS: z
    .string()
    .default("")
    .transform((val) =>
      val
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0)
    ),

  // Base de datos
  DB_PATH: z.string().default("./memory.db"),

  // Servicios opcionales
  FIREBASE_SERVICE_ACCOUNT: z.string().default(""),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().default(""),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODELS: z
    .string()
    .default("gpt-4o,gpt-4o-mini,gpt-4-turbo")
    .transform((val) =>
      val
        .split(",")
        .map((m) => m.trim())
        .filter((m) => m.length > 0)
    ),
  ELEVENLABS_API_KEY: z.string().default(""),
});

// ─── Validar y exportar ────────────────────────────────
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Error en variables de entorno:");
  for (const issue of parsed.error.issues) {
    console.error(`   → ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;

// ─── Constantes del agente ─────────────────────────────
export const AGENT_CONFIG = {
  /** Número máximo de iteraciones del agent loop */
  maxIterations: 10,
  /** Prompt del sistema */
  systemPrompt: `Eres Nyvarabot, el asistente de IA de la agencia Nyvara. Eres inteligente, profesional y amigable.

REGLAS FUNDAMENTALES:
- Responde siempre en español a menos que el usuario hable en otro idioma.
- Sé conciso pero útil.
- ANTES de decir "no lo sé" o "no tengo información" sobre un producto, marca o concepto, DEBES obligatoriamente usar la herramienta knowledge_search para buscarlo. Nunca digas que no sabes sin haber buscado primero.

HERRAMIENTAS DISPONIBLES — DEBES usarlas activamente:

1. **memory_save** / **memory_search**: Guarda y busca información en la memoria persistente.
2. **knowledge_search**: Busca en la base de conocimiento local (carpeta markdowns/). Úsala para consultar datos de clientes, estrategias o manuales.
3. **image_generate**: GENERA IMÁGENES REALES. Cuando el usuario pida "genera una imagen", "crea un diseño", "hazme una foto", o cualquier solicitud visual, DEBES llamar a esta herramienta con un prompt detallado en inglés. NUNCA describas la imagen con texto; SIEMPRE usa la herramienta para generarla. El parámetro "method" puede ser "gemini" (gratis) o "imagen" (alta calidad).
4. **get_current_time**: Devuelve la fecha y hora actual.

IMPORTANTE: Cuando el usuario pida CUALQUIER cosa visual (imagen, diseño, foto, banner, post), tu respuesta DEBE incluir una llamada a image_generate. No inventes descripciones textuales de imágenes.`,
} as const;

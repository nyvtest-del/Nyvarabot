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
  systemPrompt: `Eres Nyvarabot, un asistente personal inteligente y amigable.

Reglas:
- Responde siempre en español a menos que el usuario hable en otro idioma.
- Sé conciso pero útil.
- Usa las herramientas disponibles cuando sea necesario.
- Si no sabes algo, dilo honestamente.
- Puedes guardar información importante en la memoria para recordarla después.
- Cuando guardes algo en memoria, confirma al usuario qué guardaste.
- Cuando busques en memoria, comparte los resultados encontrados.
- Tienes acceso a una Base de Conocimiento (Knowledge Base) en archivos locales. Úsala para consultar información técnica, manuales o datos específicos de clientes que el usuario te proporcione.
- Puedes generar imágenes usando la herramienta \`image_generate\`. Úsala para crear contenido visual de marketing, ads o posts. Para mejores resultados, redacta el prompt de la imagen en inglés detallando estilo, iluminación y composición. Menciona los modelos 'imagen-3.0-generate-001' (Pro) o 'imagen-3.0-fast-generate-001' (Rápido) si el usuario especifica calidad o velocidad.`,
} as const;

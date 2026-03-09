import { OpenAIProvider } from "./openai.js";
import { GroqProvider } from "./groq.js";
import { OpenRouterProvider } from "./openrouter.js";
import type { LLMMessage, LLMToolDefinition, LLMResponse } from "./types.js";

export type { LLMMessage, LLMToolDefinition, LLMResponse } from "./types.js";

const openai = new OpenAIProvider();
const groq = new GroqProvider();
const openRouter = new OpenRouterProvider();

/**
 * Llama al LLM con cadena de fallback:
 *   1. OpenAI (si hay API Key)
 *   2. Groq (Llama 3.3 70B) → rápido y potente
 *   3. OpenRouter → cadena de modelos gratuitos
 *
 * Garantiza que SIEMPRE haya una respuesta.
 */
export async function callLLM(
  messages: LLMMessage[],
  tools?: LLMToolDefinition[]
): Promise<LLMResponse> {
  // ── Intento 1: OpenAI ──
  try {
    console.log(`🧠 Enviando a ${openai.name}...`);
    return await openai.chat(messages, tools);
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (!errorMsg.includes("no configurada")) {
      console.warn(`⚠️  OpenAI falló: ${errorMsg.substring(0, 100)}`);
    }
  }

  // ── Intento 2: Groq ──
  try {
    console.log(`🧠 Enviando a ${groq.name}...`);
    return await groq.chat(messages, tools);
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️  Groq falló: ${errorMsg.substring(0, 100)}`);
  }

  // ── Intento 3: OpenRouter (cadena de modelos) ──
  try {
    console.log(`🔀 Cambiando a ${openRouter.name} (cadena de modelos)...`);
    return await openRouter.chat(messages, tools);
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ OpenRouter también falló: ${errorMsg.substring(0, 200)}`);
  }

  // ── Si todo falla: respuesta de emergencia ──
  console.error("🚨 TODOS los proveedores LLM fallaron");
  return {
    content:
      "⚠️ Lo siento, no pude conectar con ningún modelo de IA en este momento. " +
      "Puede ser un problema temporal de los servidores. Inténtalo de nuevo en unos minutos.",
    toolCalls: [],
    finishReason: "error",
  };
}

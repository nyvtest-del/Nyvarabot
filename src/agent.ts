import { callLLM } from "./llm/index.js";
import type { LLMMessage } from "./llm/types.js";
import { toolRegistry } from "./tools/index.js";
import type { ToolContext } from "./tools/types.js";
import { AGENT_CONFIG } from "./config.js";
import type { MemoryDB } from "./memory/index.js";

// ─── Agent Loop ─────────────────────────────────────────

export interface AgentInput {
  userMessage: string;
  userId: number;
  memory: MemoryDB;
}

export interface AgentResult {
  response: string;
  iterations: number;
}

/**
 * Ejecuta el bucle del agente:
 * 1. Construye el contexto (system prompt + historial + mensaje)
 * 2. Envía al LLM
 * 3. Si el LLM pide ejecutar herramientas → las ejecuta → agrega resultados → repite
 * 4. Cuando el LLM da una respuesta final (sin tool calls) → retorna
 * 5. Límite de seguridad: máximo N iteraciones
 */
export async function runAgent(input: AgentInput): Promise<AgentResult> {
  const { userMessage, userId, memory } = input;
  const maxIter = AGENT_CONFIG.maxIterations;

  // Contexto de herramientas
  const toolContext: ToolContext = { memory, userId };
  const toolDefinitions = toolRegistry.getDefinitions();

  // Construir mensajes
  const history = await memory.getConversationHistory(userId, 20);
  const messages: LLMMessage[] = [
    { role: "system", content: AGENT_CONFIG.systemPrompt },
    ...history.map((h) => ({
      role: h.role as LLMMessage["role"],
      content: h.content,
    })),
    { role: "user", content: userMessage },
  ];

  // Guardar mensaje del usuario en historial
  await memory.addMessage(userId, "user", userMessage);

  let iterations = 0;

  while (iterations < maxIter) {
    iterations++;
    console.log(`\n🔄 Iteración ${iterations}/${maxIter}`);

    // Llamar al LLM
    const response = await callLLM(messages, toolDefinitions);

    // Si no hay tool calls → respuesta final
    if (response.toolCalls.length === 0) {
      const finalResponse = response.content ?? "No tengo respuesta.";

      // Guardar respuesta en historial
      await memory.addMessage(userId, "assistant", finalResponse);

      console.log(`✅ Respuesta final (iteración ${iterations})`);
      return { response: finalResponse, iterations };
    }

    // Agregar mensaje del asistente con tool calls
    messages.push({
      role: "assistant",
      content: response.content,
      tool_calls: response.toolCalls,
    });

    // Ejecutar cada herramienta solicitada
    for (const toolCall of response.toolCalls) {
      const { name, arguments: argsStr } = toolCall.function;

      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(argsStr);
      } catch {
        console.error(`❌ Error parseando argumentos de ${name}: ${argsStr}`);
        args = {};
      }

      const result = await toolRegistry.execute(name, args, toolContext);

      // Agregar resultado de la herramienta al contexto
      messages.push({
        role: "tool",
        content: result,
        tool_call_id: toolCall.id,
        name,
      });
    }
  }

  // Si se alcanza el límite de iteraciones
  const fallbackMsg =
    "He alcanzado el límite de pasos de razonamiento. ¿Podrías reformular tu pregunta?";
  await memory.addMessage(userId, "assistant", fallbackMsg);

  console.warn(`⚠️ Límite de iteraciones alcanzado (${maxIter})`);
  return { response: fallbackMsg, iterations };
}

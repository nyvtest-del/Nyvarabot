import Groq from "groq-sdk";
import { config } from "../config.js";
import type {
  LLMMessage,
  LLMToolDefinition,
  LLMResponse,
  LLMProvider,
} from "./types.js";

/**
 * Groq con cadena de modelos.
 * Si un modelo falla (rate limit, no disponible, etc.), salta al siguiente.
 */
export class GroqProvider implements LLMProvider {
  name = "Groq";
  private client: Groq;

  constructor() {
    this.client = new Groq({ apiKey: config.GROQ_API_KEY });
  }

  async chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[]
  ): Promise<LLMResponse> {
    const models = config.GROQ_MODELS;
    const errors: string[] = [];

    for (const model of models) {
      try {
        console.log(`   🔄 Intentando Groq → ${model}`);
        const result = await this.chatWithModel(model, messages, tools);
        console.log(`   ✅ Respuesta exitosa de Groq → ${model}`);
        return result;
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : String(error);
        console.warn(`   ⚠️  Groq ${model} falló: ${msg.substring(0, 80)}`);
        errors.push(`${model}: ${msg}`);
      }
    }

    throw new Error(
      `Todos los modelos de Groq fallaron (${models.length} intentos):\n${errors.join("\n")}`
    );
  }

  private async chatWithModel(
    model: string,
    messages: LLMMessage[],
    tools?: LLMToolDefinition[]
  ): Promise<LLMResponse> {
    const params: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content ?? "",
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        ...(m.name ? { name: m.name } : {}),
      })),
      temperature: 0.7,
      max_tokens: 2048,
    };

    if (tools && tools.length > 0) {
      params.tools = tools;
      params.tool_choice = "auto";
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (this.client.chat.completions.create as any)(params);
    const choice = response.choices[0];

    let content = choice.message.content || "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolCalls = (choice.message.tool_calls ?? []).map((tc: any) => ({
      id: tc.id,
      type: "function" as const,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    }));

    // Parseo manual agresivo para interceptar pseudo-XML tool calls
    // (ej: modelos Llama-3 en OpenRouter o Groq que filtran tags de función)
    const exactRegex = /<function=([a-zA-Z0-9_]+)[\s\S]*?(\{[\s\S]*?\})?>(?:[\s\S]*?<\/function>)?/g;

    let match;
    while ((match = exactRegex.exec(content)) !== null) {
      const name = match[1];
      const argsStr = match[2] || "{}";

      toolCalls.push({
        id: `call_manual_gq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        type: "function",
        function: { name, arguments: argsStr }
      });

      // Remover la etiqueta del texto para que no se vea en WhatsApp
      content = content.replace(match[0], "").trim();
    }

    return {
      content,
      toolCalls,
      finishReason: choice.finish_reason ?? (toolCalls.length > 0 ? "tool_calls" : "stop"),
    };
  }
}

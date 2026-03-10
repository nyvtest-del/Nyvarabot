import { config } from "../config.js";
import type {
  LLMMessage,
  LLMToolDefinition,
  LLMResponse,
  LLMProvider,
} from "./types.js";

/**
 * OpenRouter con cadena de modelos gratuitos.
 * Si un modelo falla (rate limit, error, etc.), salta al siguiente automáticamente.
 */
export class OpenRouterProvider implements LLMProvider {
  name = "OpenRouter";
  private baseUrl = "https://openrouter.ai/api/v1/chat/completions";

  async chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[]
  ): Promise<LLMResponse> {
    if (!config.OPENROUTER_API_KEY) {
      throw new Error(
        "OPENROUTER_API_KEY no configurada — fallback no disponible"
      );
    }

    const models = config.OPENROUTER_MODELS;
    if (models.length === 0) {
      throw new Error("No hay modelos configurados en OPENROUTER_MODELS");
    }

    // Intentar cada modelo en orden hasta que uno funcione
    const errors: string[] = [];

    for (const model of models) {
      try {
        console.log(`   🔄 Intentando modelo: ${model}`);
        const result = await this.chatWithModel(model, messages, tools);
        console.log(`   ✅ Respuesta exitosa de: ${model}`);
        return result;
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : String(error);
        console.warn(`   ⚠️  ${model} falló: ${msg.substring(0, 80)}`);
        errors.push(`${model}: ${msg}`);
        // Continuar con el siguiente modelo
      }
    }

    // Si todos fallaron
    throw new Error(
      `Todos los modelos de OpenRouter fallaron (${models.length} intentos):\n${errors.join("\n")}`
    );
  }

  private async chatWithModel(
    model: string,
    messages: LLMMessage[],
    tools?: LLMToolDefinition[]
  ): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
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
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://nyvarabot.local",
          "X-Title": "Nyvarabot",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message: {
            content: string | null;
            tool_calls?: Array<{
              id: string;
              type: string;
              function: { name: string; arguments: string };
            }>;
          };
          finish_reason: string;
        }>;
        error?: { message: string };
      };

      // Algunos modelos devuelven error dentro del JSON
      if (data.error) {
        throw new Error(data.error.message);
      }

      if (!data.choices || data.choices.length === 0) {
        throw new Error("Respuesta sin choices");
      }

      const choice = data.choices[0];

      let content = choice.message.content || "";
      const toolCalls = (choice.message.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }));

      // Parseo manual agresivo para interceptar múltiples formatos de tool calls
      const formats = [
        /<function=([a-zA-Z0-9_]+)[\s\S]*?(\{[\s\S]*?\})?>(?:[\s\S]*?<\/function>)?/g,
        /<([a-zA-Z0-9_]+)>(\{[\s\S]*?\})<\/\1>/g,
        /([a-zA-Z0-9_]+)>(\{[\s\S]*?\})<\/function>/g
      ];

      for (const regex of formats) {
        let match;
        while ((match = regex.exec(content)) !== null) {
          const name = match[1];
          const argsStr = match[2] || "{}";

          if (!toolCalls.some(tc => tc.function.name === name && tc.function.arguments === argsStr)) {
            toolCalls.push({
              id: `call_manual_or_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              type: "function",
              function: { name, arguments: argsStr }
            });
            content = content.replace(match[0], "").trim();
          }
        }
      }

      return {
        content,
        toolCalls,
        finishReason: choice.finish_reason ?? (toolCalls.length > 0 ? "tool_calls" : "stop"),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

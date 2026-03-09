import OpenAI from "openai";
import { config } from "../config.js";
import type {
  LLMMessage,
  LLMToolDefinition,
  LLMResponse,
  LLMProvider,
} from "./types.js";

/**
 * Proveedor de OpenAI con soporte para múltiples modelos.
 */
export class OpenAIProvider implements LLMProvider {
  name = "OpenAI";
  private client: OpenAI | null = null;

  constructor() {
    if (config.OPENAI_API_KEY) {
      this.client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
    }
  }

  async chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[]
  ): Promise<LLMResponse> {
    if (!this.client) {
      throw new Error("OPENAI_API_KEY no configurada");
    }

    const models = config.OPENAI_MODELS;
    const errors: string[] = [];

    for (const model of models) {
      try {
        console.log(`   🔄 Intentando OpenAI → ${model}`);
        const result = await this.chatWithModel(model, messages, tools);
        console.log(`   ✅ Respuesta exitosa de OpenAI → ${model}`);
        return result;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`   ⚠️  OpenAI ${model} falló: ${msg.substring(0, 80)}`);
        errors.push(`${model}: ${msg}`);
      }
    }

    throw new Error(
      `Todos los modelos de OpenAI fallaron (${models.length} intentos):\n${errors.join("\n")}`
    );
  }

  private async chatWithModel(
    model: string,
    messages: LLMMessage[],
    tools?: LLMToolDefinition[]
  ): Promise<LLMResponse> {
    if (!this.client) throw new Error("Cliente no inicializado");

    const params: Record<string, any> = {
      model: model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
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

    const response = await this.client.chat.completions.create(params as any);
    const choice = response.choices[0];

    return {
      content: choice.message.content,
      toolCalls: (choice.message.tool_calls ?? []).map((tc: any) => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
      finishReason: choice.finish_reason ?? "stop",
    };
  }
}

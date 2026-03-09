import type { Tool, ToolContext } from "./types.js";
import type { LLMToolDefinition } from "../llm/types.js";
import { getCurrentTimeTool } from "./get-current-time.js";
import { memorySaveTool } from "./memory-save.js";
import { memorySearchTool } from "./memory-search.js";

export type { Tool, ToolContext } from "./types.js";

// ─── Registro de herramientas ───────────────────────────

class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    this.tools.set(tool.definition.name, tool);
    console.log(`🔧 Herramienta registrada: ${tool.definition.name}`);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** Devuelve las definiciones en formato LLM */
  getDefinitions(): LLMToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.definition.name,
        description: tool.definition.description,
        parameters: tool.definition.parameters,
      },
    }));
  }

  /** Ejecuta una herramienta por nombre */
  async execute(
    name: string,
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      return JSON.stringify({
        error: `Herramienta desconocida: ${name}`,
      });
    }

    try {
      console.log(`🔧 Ejecutando: ${name}(${JSON.stringify(args)})`);
      const result = await tool.execute(args, context);
      console.log(`✅ Resultado de ${name}: ${result.substring(0, 100)}...`);
      return result;
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Error desconocido";
      console.error(`❌ Error en herramienta ${name}:`, msg);
      return JSON.stringify({ error: msg });
    }
  }
}

// ─── Instancia global ──────────────────────────────────

export const toolRegistry = new ToolRegistry();

// Registrar herramientas disponibles
toolRegistry.register(getCurrentTimeTool);
toolRegistry.register(memorySaveTool);
toolRegistry.register(memorySearchTool);

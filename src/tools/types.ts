import type { MemoryDB } from "../memory/index.js";

// ─── Tipos del sistema de herramientas ──────────────────

export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameter>;
    required: string[];
  };
}

export interface ToolContext {
  memory: MemoryDB;
  userId: number;
}

export interface Tool {
  definition: ToolDefinition;
  execute: (
    args: Record<string, unknown>,
    context: ToolContext
  ) => Promise<string>;
}

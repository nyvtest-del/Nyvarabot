import type { Tool } from "./types.js";

export const memorySearchTool: Tool = {
  definition: {
    name: "memory_search",
    description:
      "Busca información previamente guardada en la memoria persistente. Usa esto cuando el usuario pregunte por algo que podría haber sido guardado antes.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Término de búsqueda para encontrar memorias relevantes",
        },
      },
      required: ["query"],
    },
  },

  async execute(args, context) {
    const query = args.query as string;
    const results = await context.memory.searchMemory(query);

    if (results.length === 0) {
      return JSON.stringify({
        found: false,
        message: `No encontré nada en memoria para: "${query}"`,
        results: [],
      });
    }

    return JSON.stringify({
      found: true,
      count: results.length,
      results: results.map((r) => ({
        key: r.key,
        content: r.content,
        saved_at: r.created_at,
      })),
    });
  },
};

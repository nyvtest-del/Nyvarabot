import type { Tool } from "./types.js";

export const memorySaveTool: Tool = {
  definition: {
    name: "memory_save",
    description:
      "Guarda información importante en la memoria persistente del agente. Usa esto para recordar datos que el usuario quiera que recuerdes: nombres, preferencias, tareas, notas, etc.",
    parameters: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description:
            "Clave identificadora del recuerdo (ej: 'nombre_usuario', 'cumpleaños', 'tarea_pendiente')",
        },
        content: {
          type: "string",
          description: "El contenido a memorizar",
        },
      },
      required: ["key", "content"],
    },
  },

  async execute(args, context) {
    const key = args.key as string;
    const content = args.content as string;

    await context.memory.saveMemory(key, content);

    return JSON.stringify({
      success: true,
      message: `Guardado en memoria: "${key}" → "${content}"`,
    });
  },
};

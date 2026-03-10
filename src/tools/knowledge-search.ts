import fs from "node:fs/promises";
import path from "node:path";
import type { Tool } from "./types.js";

/**
 * Herramienta para buscar información en la base de conocimiento local (carpeta markdowns).
 * Lee los archivos markdown y busca coincidencias con la consulta.
 */
export const knowledgeSearchTool: Tool = {
  definition: {
    name: "knowledge_search",
    description: "Busca información detallada sobre clientes, productos, procesos o marketing en los archivos locales de conocimiento (markdowns). Úsala cuando necesites datos específicos sobre un cliente o proyecto que no estén en la memoria de la conversación.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "La búsqueda o palabras clave (ej: 'Hansbiomed productos', 'estilo gráfico cliente X').",
        },
        client: {
          type: "string",
          description: "Opcional: El nombre de la carpeta del cliente si se conoce (ej: 'hansbiomed').",
        },
      },
      required: ["query"],
    },
  },
  execute: async (args: Record<string, unknown>) => {
    const query = args.query as string;
    const client = args.client as string | undefined;
    const baseDir = path.join(process.cwd(), "markdowns");

    try {
      // 1. Obtener lista de archivos a buscar
      let filesToSearch: string[] = [];

      if (client) {
        // Buscar solo en la subcarpeta del cliente
        const clientDir = path.join(baseDir, client.toLowerCase().replace(/\s+/g, '-'));
        try {
          const stats = await fs.stat(clientDir);
          if (stats.isDirectory()) {
            const files = await fs.readdir(clientDir);
            filesToSearch = files
              .filter(f => f.endsWith(".md") || f.endsWith(".txt"))
              .map(f => path.join(clientDir, f));
          }
        } catch {
          // Si no existe la carpeta del cliente, buscar en todo
        }
      }

      if (filesToSearch.length === 0) {
        // Buscar recursivamente en todo markdowns/
        async function getFiles(dir: string): Promise<string[]> {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          const files = await Promise.all(entries.map((res) => {
            const resPath = path.resolve(dir, res.name);
            return res.isDirectory() ? getFiles(resPath) : resPath;
          }));
          return files.flat().filter(f => f.endsWith(".md") || f.endsWith(".txt"));
        }
        filesToSearch = await getFiles(baseDir);
      }

      if (filesToSearch.length === 0) {
        return "No hay archivos de conocimiento configurados todavía en la carpeta 'markdowns/'.";
      }

      // 2. Buscar contenido relevante (simple keyword match por ahora)
      const results: { file: string; content: string }[] = [];
      const keywords = query.toLowerCase().split(/\s+/);

      for (const file of filesToSearch) {
        const content = await fs.readFile(file, "utf-8");
        const lowerContent = content.toLowerCase();

        // Ver si contiene alguna de las palabras clave
        const matches = keywords.some(k => lowerContent.includes(k));
        if (matches) {
          results.push({
            file: path.relative(baseDir, file),
            content: content.substring(0, 3000) // Limitar tamaño
          });
        }
      }

      if (results.length === 0) {
        return `No encontré información relevante para "${query}" en los archivos de conocimiento.`;
      }

      // 3. Formatear resultados
      const formatted = results.map(r => `--- ARCHIVO: ${r.file} ---\n${r.content}`).join("\n\n");
      return `Resultados de búsqueda en conocimiento:\n\n${formatted}`;

    } catch (error) {
      return `Error buscando en conocimiento: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

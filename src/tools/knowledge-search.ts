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
        description: "Busca información detallada sobre HansBiomed, sus productos (MINT, Klardie, Lion, Fusicare), procesos o marketing en los archivos locales de conocimiento (markdowns). Úsala siempre para evitar inventar datos.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "La búsqueda o palabras clave (ej: 'MINT Lift', 'Klardie D+', 'Lion HansBiomed').",
                },
                client: {
                    type: "string",
                    description: "Opcional: El nombre de la carpeta del sub-tema si se conoce (ej: 'hansbiomed').",
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
                // Buscar la carpeta del cliente de forma case-insensitive
                try {
                    const dirs = await fs.readdir(baseDir);
                    const match = dirs.find(d => d.toLowerCase() === client.toLowerCase());
                    if (match) {
                        const clientDir = path.join(baseDir, match);
                        const stats = await fs.stat(clientDir);
                        if (stats.isDirectory()) {
                            const files = await fs.readdir(clientDir);
                            filesToSearch = files
                                .filter(f => f.endsWith(".md") || f.endsWith(".txt"))
                                .map(f => path.join(clientDir, f));
                        }
                    }
                } catch {
                    // Si falla, buscar en todo
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

            // 2. Buscar contenido relevante (keyword match)
            const results: { file: string; content: string; score: number }[] = [];

            const rawQuery = query.trim();
            const keywords = rawQuery.length <= 3
                ? [rawQuery.toLowerCase()]
                : rawQuery.toLowerCase().split(/\s+/).filter(k =>
                    k.length > 2 || /[^a-z]/.test(k)
                );

            if (keywords.length === 0 && rawQuery.length > 0) {
                keywords.push(rawQuery.toLowerCase());
            }

            for (const file of filesToSearch) {
                const content = await fs.readFile(file, "utf-8");
                const lowerContent = content.toLowerCase();

                const matchCount = keywords.filter(k => lowerContent.includes(k)).length;
                if (matchCount > 0) {
                    const paragraphs = content.split(/\n{2,}/);
                    const relevant = paragraphs
                        .filter(p => keywords.some(k => p.toLowerCase().includes(k)))
                        .slice(0, 15)
                        .join("\n\n");

                    results.push({
                        file: path.relative(baseDir, file),
                        content: relevant.substring(0, 8000),
                        score: matchCount
                    });
                }
            }

            if (results.length === 0) {
                return `No encontré información relevante para "${query}" en los archivos de conocimiento.`;
            }

            results.sort((a, b) => b.score - a.score);

            const formatted = results
                .slice(0, 4)
                .map(r => `--- ARCHIVO: ${r.file} ---\n${r.content}`)
                .join("\n\n");
            return `Resultados de búsqueda en conocimiento (${results.length} archivos):\n\n${formatted}`;

        } catch (error) {
            return `Error buscando en conocimiento: ${error instanceof Error ? error.message : String(error)}`;
        }
    },
};

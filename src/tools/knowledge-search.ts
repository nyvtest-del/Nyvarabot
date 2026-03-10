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
        description: "Busca información detallada sobre HansBiomed, sus productos (MINT, Klardie, Lion, Fusicare), procesos o marketing en los archivos locales de conocimiento (markdowns). Úsala siempre para evitar inventar datos. Si buscas algo general sobre la empresa (como certificaciones o historia), búscalo aquí también.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "La búsqueda o palabras clave (ej: 'MINT certificaciones', 'Klardie D+ ingredientes', 'historia HansBiomed').",
                },
            },
            required: ["query"],
        },
    },
    execute: async (args: Record<string, unknown>) => {
        const query = args.query as string;
        const baseDir = path.join(process.cwd(), "markdowns");

        try {
            async function getFiles(dir: string): Promise<string[]> {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                const files = await Promise.all(entries.map((res) => {
                    const resPath = path.resolve(dir, res.name);
                    return res.isDirectory() ? getFiles(resPath) : resPath;
                }));
                return files.flat().filter(f => f.endsWith(".md") || f.endsWith(".txt"));
            }

            const allFiles = await getFiles(baseDir);
            if (allFiles.length === 0) return "No hay archivos de conocimiento.";

            const results: { file: string; content: string; score: number }[] = [];
            const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 2 || /[^a-z]/.test(k));

            for (const file of allFiles) {
                const content = await fs.readFile(file, "utf-8");
                const lowerContent = content.toLowerCase();
                const fileName = path.basename(file).toLowerCase();

                // Bonus por coincidencia en el nombre del archivo
                let score = keywords.filter(k => fileName.includes(k)).length * 5;
                score += keywords.filter(k => lowerContent.includes(k)).length;

                if (score > 0) {
                    // Extraer párrafos relevantes
                    const paragraphs = content.split(/\n{2,}/);
                    const relevant = paragraphs
                        .filter(p => keywords.some(k => p.toLowerCase().includes(k)))
                        .slice(0, 10)
                        .join("\n\n");

                    results.push({
                        file: path.relative(baseDir, file),
                        content: relevant || content.substring(0, 2000), // Si no hay párrafos específicos, dar el inicio
                        score
                    });
                }
            }

            if (results.length === 0) return `No hay resultados para "${query}".`;

            results.sort((a, b) => b.score - a.score);

            const output = results.slice(0, 3).map(r =>
                `[ARCHIVO: ${r.file}]\n${r.content}`
            ).join("\n\n---\n\n");

            return `Resultados para "${query}":\n\n${output}`;

        } catch (error) {
            return `Error: ${error instanceof Error ? error.message : String(error)}`;
        }
    },
};

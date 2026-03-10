import fs from "node:fs/promises";
import path from "node:path";
import type { Tool } from "./types.js";

const KNOWLEDGE_PATH = path.join(process.cwd(), "markdowns", "hansbiomed");

export const knowledgeSearchTool: Tool = {
    definition: {
        name: "knowledge_search",
        description: "Busca y lee información oficial sobre la empresa HansBiomed y sus productos (MINT, Klardie, Lion, Fusicare). Usa esto siempre que el usuario pregunte algo técnico, comercial o general sobre la empresa para evitar inventar datos.",
        parameters: {
            type: "object",
            properties: {
                topic: {
                    type: "string",
                    description: "El producto o tema específico a buscar (ej: 'MINT', 'Empresa', 'Lion'). Si se deja vacío, listará todos los temas disponibles.",
                },
            },
            required: [],
        },
    },

    async execute(args) {
        const topic = (args.topic as string || "").toLowerCase();

        try {
            const files = await fs.readdir(KNOWLEDGE_PATH);

            // Si no hay tópico, listar archivos disponibles
            if (!topic) {
                return JSON.stringify({
                    message: "Selecciona un tema o producto para obtener detalles específicos.",
                    available_topics: files.map(f => f.replace(".md", ""))
                });
            }

            // Buscar el archivo más cercano
            const matchedFile = files.find(f => f.toLowerCase().includes(topic));

            if (!matchedFile) {
                return JSON.stringify({
                    error: `No encontré información sobre '${topic}'.`,
                    available_topics: files.map(f => f.replace(".md", ""))
                });
            }

            const content = await fs.readFile(path.join(KNOWLEDGE_PATH, matchedFile), "utf-8");

            return JSON.stringify({
                topic: matchedFile.replace(".md", ""),
                content: content.substring(0, 5000) // Limitar para no saturar el contexto del LLM
            });

        } catch (error) {
            console.error("Error en knowledge_search:", error);
            return JSON.stringify({ error: "No se pudo acceder a la base de conocimientos local." });
        }
    },
};

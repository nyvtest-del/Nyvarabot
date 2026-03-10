import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config.js";
import type { Tool } from "./types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Herramienta para generar imágenes usando Google Imagen 3 (Nano Banana Pro / Veo).
 */
export const imageGenerateTool: Tool = {
    definition: {
        name: "image_generate",
        description: "Genera imágenes de alta calidad. Úsala para crear contenido visual. Modelos: 'imagen-3.0-generate-001' (Pro/Nano Banana Pro), 'imagen-3.0-fast-generate-001' (Fast/Nano Banana 2).",
        parameters: {
            type: "object",
            properties: {
                prompt: {
                    type: "string",
                    description: "Descripción detallada en inglés para mejores resultados.",
                },
                model: {
                    type: "string",
                    enum: ["imagen-3.0-generate-001", "imagen-3.0-fast-generate-001", "imagen-3.0-generate-002"],
                    description: "El modelo a usar. El 001 Pro es el estándar de alta calidad.",
                    default: "imagen-3.0-generate-001",
                },
                aspectRatio: {
                    type: "string",
                    enum: ["1:1", "4:3", "3:4", "16:9", "9:16"],
                    description: "Relación de aspecto.",
                    default: "1:1",
                }
            },
            required: ["prompt"],
        },
    },
    execute: async (args: Record<string, unknown>) => {
        const prompt = args.prompt as string;
        const model = (args.model as string) || "imagen-3.0-generate-001";
        const aspectRatio = (args.aspectRatio as string) || "1:1";

        if (!config.GOOGLE_API_KEY) {
            return "Error: GOOGLE_API_KEY no configurada.";
        }

        try {
            // Usando fetch directo para asegurar compatibilidad con la API de Imagen en Gemini
            // ya que el SDK a veces cambia los métodos de imagen.
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${config.GOOGLE_API_KEY}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    instances: [
                        { prompt }
                    ],
                    parameters: {
                        sampleCount: 1,
                        aspectRatio: aspectRatio,
                        // safetySetting: "block_none" // Depende de la cuenta
                    }
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(`API Error ${response.status}: ${JSON.stringify(errData)}`);
            }

            const data = await response.json();

            // La API de Imagen devuelve las imágenes en base64 en predictions[0].bytesBase64Encoded
            const base64Image = data.predictions?.[0]?.bytesBase64Encoded;

            if (!base64Image) {
                return "No se recibió ninguna imagen de la API. Verifica el prompt o el modelo.";
            }

            // Guardar imagen temporalmente
            const tempDir = path.join(process.cwd(), "markdowns", "temp");
            const fileName = `gen_${randomUUID()}.png`;
            const filePath = path.join(tempDir, fileName);

            await fs.writeFile(filePath, Buffer.from(base64Image, 'base64'));

            // Retornar un tag que el bot pueda detectar
            return `✅ Imagen generada satisfactoriamente con ${model}.\nSENT_IMAGE_PATH:${filePath}`;

        } catch (error) {
            console.error("❌ Error en image_generate:", error);
            return `Error generando imagen: ${error instanceof Error ? error.message : String(error)}`;
        }
    },
};

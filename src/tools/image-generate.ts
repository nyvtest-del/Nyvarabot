import { config } from "../config.js";
import type { Tool } from "./types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Herramienta para generar imágenes.
 * Soporta múltiples modelos con fallback automático entre API keys.
 *
 * Modelos disponibles (Gemini — generateContent con responseModalities):
 *   - gemini-2.0-flash-exp-image-generation  (Nano Banana 2 — gratis en free tier)
 *   - gemini-3-pro-image-preview             (Nano Banana Pro — mejor calidad)
 *   - gemini-3.1-flash-image-preview         (Nano Banana 2 más nuevo)
 *   - gemini-2.5-flash-image                 (Gemini 2.5 con imagen)
 *
 * Modelos disponibles (Imagen — predict, requiere plan de pago):
 *   - imagen-4.0-generate-001
 *   - imagen-4.0-fast-generate-001
 *   - imagen-4.0-ultra-generate-001
 */

// Lista de modelos Gemini a probar en orden de preferencia
const GEMINI_IMAGE_MODELS = [
    "gemini-2.0-flash-exp-image-generation",
    "gemini-3.1-flash-image-preview",
    "gemini-3-pro-image-preview",
    "gemini-2.5-flash-image",
];

const IMAGEN_MODELS = [
    "imagen-4.0-fast-generate-001",
    "imagen-4.0-generate-001",
    "imagen-4.0-ultra-generate-001",
];

export const imageGenerateTool: Tool = {
    definition: {
        name: "image_generate",
        description:
            "Genera imágenes de alta calidad. Métodos: 'gemini' (gratis en free tier, usa Nano Banana) o 'imagen' (Imagen 4, requiere plan de pago, máxima calidad). Por defecto usa 'gemini'.",
        parameters: {
            type: "object",
            properties: {
                prompt: {
                    type: "string",
                    description:
                        "Descripción detallada de la imagen (en inglés para mejores resultados).",
                },
                method: {
                    type: "string",
                    enum: ["gemini", "imagen"],
                    description:
                        "'gemini' = Nano Banana gratis. 'imagen' = Imagen 4 (plan de pago).",
                    default: "gemini",
                },
                aspectRatio: {
                    type: "string",
                    enum: ["1:1", "4:3", "3:4", "16:9", "9:16"],
                    description: "Relación de aspecto de la imagen.",
                    default: "1:1",
                },
            },
            required: ["prompt"],
        },
    },
    execute: async (args: Record<string, unknown>) => {
        const prompt = args.prompt as string;
        const method = (args.method as string) || "gemini";
        const aspectRatio = (args.aspectRatio as string) || "1:1";

        const keys = config.GOOGLE_API_KEYS;
        if (keys.length === 0) {
            return "Error: GOOGLE_API_KEYS no configurada. Agrega al menos una API key de Google AI Studio.";
        }

        const models = method === "imagen" ? IMAGEN_MODELS : GEMINI_IMAGE_MODELS;

        // Intentar con cada API key + cada modelo
        for (const apiKey of keys) {
            for (const model of models) {
                console.log(`🎨 Probando ${model} con key ...${apiKey.slice(-6)}...`);

                try {
                    let base64Image: string | null = null;

                    if (method === "imagen") {
                        base64Image = await generateWithImagen(prompt, aspectRatio, apiKey, model);
                    } else {
                        base64Image = await generateWithGemini(prompt, aspectRatio, apiKey, model);
                    }

                    if (!base64Image) continue;

                    // Guardar imagen
                    const tempDir = path.join(process.cwd(), "markdowns", "temp");
                    await fs.mkdir(tempDir, { recursive: true });
                    const fileName = `gen_${randomUUID()}.png`;
                    const filePath = path.join(tempDir, fileName);
                    await fs.writeFile(filePath, Buffer.from(base64Image, "base64"));

                    console.log(`✅ Imagen generada con ${model}: ${filePath}`);
                    return `✅ Imagen generada con ${model}.\nSENT_IMAGE_PATH:${filePath}`;
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    console.warn(`⚠️ ${model} falló: ${msg}`);
                    // Si es error de cuota, probar con la siguiente key/modelo
                    continue;
                }
            }
        }

        return "Error: No se pudo generar la imagen. Todas las API keys/modelos están agotados o no disponibles. Verifica tus claves en GOOGLE_API_KEYS o añade más keys de otros proyectos de Google AI Studio.";
    },
};

// ─── Gemini: generateContent con responseModalities ─────
async function generateWithGemini(
    prompt: string,
    aspectRatio: string,
    apiKey: string,
    model: string
): Promise<string | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        {
                            text: `Generate a high-quality image based on this description. Output ONLY the image.\n\nDescription: ${prompt}\nAspect ratio: ${aspectRatio}`,
                        },
                    ],
                },
            ],
            generationConfig: {
                responseModalities: ["IMAGE", "TEXT"],
            },
        }),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(`${model} ${response.status}: ${JSON.stringify(errData).substring(0, 200)}`);
    }

    const data = await response.json();
    const candidates = data.candidates || [];
    for (const candidate of candidates) {
        for (const part of candidate.content?.parts || []) {
            if (part.inlineData?.data) {
                return part.inlineData.data;
            }
        }
    }
    return null;
}

// ─── Imagen: predict ────────────────────────────────────
async function generateWithImagen(
    prompt: string,
    aspectRatio: string,
    apiKey: string,
    model: string
): Promise<string | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`;

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            instances: [{ prompt }],
            parameters: { sampleCount: 1, aspectRatio },
        }),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(`${model} ${response.status}: ${JSON.stringify(errData).substring(0, 200)}`);
    }

    const data = await response.json();
    return data.predictions?.[0]?.bytesBase64Encoded || null;
}

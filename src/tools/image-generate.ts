import { config } from "../config.js";
import type { Tool } from "./types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Herramienta para generar imágenes.
 * Soporta dos métodos:
 *   1. Imagen 3 API (Nano Banana Pro) — alta calidad dedicada
 *   2. Gemini Flash nativo (Nano Banana 2) — gratis en free tier
 * Con fallback automático entre múltiples API keys.
 */
export const imageGenerateTool: Tool = {
    definition: {
        name: "image_generate",
        description:
            "Genera imágenes de alta calidad. Métodos: 'gemini' (Nano Banana 2 o Pro, genera imagen dentro del chat, gratis en free tier) o 'imagen' (Imagen 3 API dedicada, mejor calidad pero consume créditos). Por defecto usa 'gemini'.",
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
                        "'gemini' = Nano Banana 2/Pro gratis via Gemini Flash. 'imagen' = Imagen 3 API dedicada (consume créditos).",
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

        // Intentar con cada API key hasta que una funcione
        for (let i = 0; i < keys.length; i++) {
            const apiKey = keys[i];
            console.log(
                `🎨 Intentando con API key #${i + 1}/${keys.length} (método: ${method})...`
            );

            try {
                let base64Image: string | null = null;

                if (method === "gemini") {
                    base64Image = await generateWithGemini(prompt, aspectRatio, apiKey);
                } else {
                    base64Image = await generateWithImagen(prompt, aspectRatio, apiKey);
                }

                if (!base64Image) {
                    console.warn(`⚠️ Key #${i + 1} no devolvió imagen, probando siguiente...`);
                    continue;
                }

                // Guardar imagen en carpeta temporal
                const tempDir = path.join(process.cwd(), "markdowns", "temp");
                await fs.mkdir(tempDir, { recursive: true });
                const fileName = `gen_${randomUUID()}.png`;
                const filePath = path.join(tempDir, fileName);
                await fs.writeFile(filePath, Buffer.from(base64Image, "base64"));

                console.log(`✅ Imagen generada con key #${i + 1}: ${filePath}`);
                return `✅ Imagen generada con ${method === "gemini" ? "Nano Banana (Gemini)" : "Imagen 3 Pro"}.\nSENT_IMAGE_PATH:${filePath}`;
            } catch (error) {
                const errMsg =
                    error instanceof Error ? error.message : String(error);
                console.warn(`⚠️ Key #${i + 1} falló: ${errMsg}`);

                // Si es error de cuota/rate limit, probar con la siguiente key
                if (
                    errMsg.includes("429") ||
                    errMsg.includes("quota") ||
                    errMsg.includes("RESOURCE_EXHAUSTED")
                ) {
                    continue;
                }
                // Si es otro tipo de error, también probar la siguiente
                continue;
            }
        }

        return "Error: Todas las API keys están agotadas o fallaron. Verifica tus claves en GOOGLE_API_KEYS.";
    },
};

// ─── Método 1: Gemini Flash con imagen nativa (Nano Banana 2) ───
async function generateWithGemini(
    prompt: string,
    aspectRatio: string,
    apiKey: string
): Promise<string | null> {
    const model = "gemini-2.0-flash-exp"; // Soporta generación de imágenes nativa
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        {
                            text: `Generate an image with the following description. Output ONLY the image, no text explanation.\n\nDescription: ${prompt}\nAspect ratio: ${aspectRatio}`,
                        },
                    ],
                },
            ],
            generationConfig: {
                responseModalities: ["IMAGE", "TEXT"],
                responseMimeType: "text/plain",
            },
        }),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
            `Gemini API ${response.status}: ${JSON.stringify(errData)}`
        );
    }

    const data = await response.json();

    // Buscar la parte de imagen en la respuesta
    const candidates = data.candidates || [];
    for (const candidate of candidates) {
        const parts = candidate.content?.parts || [];
        for (const part of parts) {
            if (part.inlineData?.data) {
                return part.inlineData.data; // base64
            }
        }
    }

    return null;
}

// ─── Método 2: Imagen 3 API dedicada (Nano Banana Pro) ──────────
async function generateWithImagen(
    prompt: string,
    aspectRatio: string,
    apiKey: string
): Promise<string | null> {
    const model = "imagen-3.0-generate-001";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`;

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            instances: [{ prompt }],
            parameters: {
                sampleCount: 1,
                aspectRatio,
            },
        }),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
            `Imagen API ${response.status}: ${JSON.stringify(errData)}`
        );
    }

    const data = await response.json();
    return data.predictions?.[0]?.bytesBase64Encoded || null;
}

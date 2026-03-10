import { config } from "../config.js";
import type { Tool } from "./types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Herramienta para generar imágenes.
 * 
 * Métodos disponibles:
 *   1. "pollinations" (default) — Pollinations AI, gratis sin API key
 *   2. "gemini" — Google Gemini con generación de imágenes nativa (requiere API key con cuota)
 *   3. "imagen" — Google Imagen 4 API dedicada (requiere plan de pago)
 */

// Modelos Gemini con soporte de imagen (fallback entre ellos)
const GEMINI_IMAGE_MODELS = [
    "gemini-2.0-flash-exp-image-generation",
    "gemini-3.1-flash-image-preview",
    "gemini-3-pro-image-preview",
    "gemini-2.5-flash-image",
];

const IMAGEN_MODELS = [
    "imagen-4.0-fast-generate-001",
    "imagen-4.0-generate-001",
];

export const imageGenerateTool: Tool = {
    definition: {
        name: "image_generate",
        description:
            "Genera imágenes reales de alta calidad. Métodos: 'pollinations' (gratis, sin límite, por defecto), 'gemini' (Nano Banana, necesita API key con cuota), 'imagen' (Imagen 4, plan de pago). SIEMPRE usa esta herramienta cuando el usuario pida cualquier imagen o diseño visual.",
        parameters: {
            type: "object",
            properties: {
                prompt: {
                    type: "string",
                    description:
                        "Descripción detallada de la imagen EN INGLÉS para mejores resultados.",
                },
                method: {
                    type: "string",
                    enum: ["pollinations", "gemini", "imagen"],
                    description:
                        "Método de generación. Por defecto 'pollinations' (gratis).",
                    default: "pollinations",
                },
                aspectRatio: {
                    type: "string",
                    enum: ["1:1", "4:3", "3:4", "16:9", "9:16"],
                    description: "Relación de aspecto.",
                    default: "1:1",
                },
            },
            required: ["prompt"],
        },
    },
    execute: async (args: Record<string, unknown>) => {
        const prompt = args.prompt as string;
        const method = (args.method as string) || "pollinations";
        const aspectRatio = (args.aspectRatio as string) || "1:1";

        const tempDir = path.join(process.cwd(), "markdowns", "temp");
        await fs.mkdir(tempDir, { recursive: true });

        // ─── Método 1: Pollinations AI (gratis, sin API key) ───
        if (method === "pollinations") {
            return await generateWithPollinations(prompt, aspectRatio, tempDir);
        }

        // ─── Métodos 2 y 3: Google (requiere API keys) ─────────
        const keys = config.GOOGLE_API_KEYS;
        if (keys.length === 0) {
            // Fallback a Pollinations si no hay keys de Google
            console.log("⚠️ No hay GOOGLE_API_KEYS, usando Pollinations como fallback...");
            return await generateWithPollinations(prompt, aspectRatio, tempDir);
        }

        const models = method === "imagen" ? IMAGEN_MODELS : GEMINI_IMAGE_MODELS;

        for (const apiKey of keys) {
            for (const model of models) {
                console.log(`🎨 Probando ${model}...`);
                try {
                    let base64Image: string | null = null;

                    if (method === "imagen") {
                        base64Image = await generateWithImagen(prompt, aspectRatio, apiKey, model);
                    } else {
                        base64Image = await generateWithGemini(prompt, aspectRatio, apiKey, model);
                    }

                    if (!base64Image) continue;

                    const fileName = `gen_${randomUUID()}.png`;
                    const filePath = path.join(tempDir, fileName);
                    await fs.writeFile(filePath, Buffer.from(base64Image, "base64"));
                    console.log(`✅ Imagen generada con ${model}`);
                    return `✅ Imagen generada con ${model}.\nSENT_IMAGE_PATH:${filePath}`;
                } catch (error) {
                    console.warn(`⚠️ ${model} falló: ${error instanceof Error ? error.message : error}`);
                    continue;
                }
            }
        }

        // Si Google falló, intentar con Pollinations como último recurso
        console.log("⚠️ Todos los modelos de Google fallaron, usando Pollinations...");
        return await generateWithPollinations(prompt, aspectRatio, tempDir);
    },
};

// ─── Pollinations AI (gratis, sin API key) ──────────────
async function generateWithPollinations(
    prompt: string,
    aspectRatio: string,
    tempDir: string
): Promise<string> {
    // Calcular dimensiones según aspect ratio
    const dimensions: Record<string, { w: number; h: number }> = {
        "1:1": { w: 1024, h: 1024 },
        "4:3": { w: 1024, h: 768 },
        "3:4": { w: 768, h: 1024 },
        "16:9": { w: 1280, h: 720 },
        "9:16": { w: 720, h: 1280 },
    };
    const { w, h } = dimensions[aspectRatio] || dimensions["1:1"];
    const encoded = encodeURIComponent(prompt);
    const seed = Math.floor(Math.random() * 999999);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=${w}&height=${h}&seed=${seed}&nologo=true&model=flux`;

    console.log(`🎨 Generando con Pollinations AI (${w}x${h})...`);

    // Pollinations puede tardar, intentar hasta 3 veces
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(60000) });

            if (!response.ok) {
                console.warn(`⚠️ Pollinations intento ${attempt}: HTTP ${response.status}`);
                if (attempt < 3) {
                    await new Promise((r) => setTimeout(r, 2000));
                    continue;
                }
                throw new Error(`Pollinations HTTP ${response.status}`);
            }

            const buffer = Buffer.from(await response.arrayBuffer());

            if (buffer.length < 1000) {
                console.warn(`⚠️ Imagen muy pequeña (${buffer.length} bytes), reintentando...`);
                continue;
            }

            const fileName = `gen_${randomUUID()}.png`;
            const filePath = path.join(tempDir, fileName);
            await fs.writeFile(filePath, buffer);
            console.log(`✅ Imagen generada con Pollinations AI (${buffer.length} bytes)`);
            return `✅ Imagen generada con Pollinations AI.\nSENT_IMAGE_PATH:${filePath}`;
        } catch (error) {
            console.warn(`⚠️ Pollinations intento ${attempt} error: ${error instanceof Error ? error.message : error}`);
            if (attempt < 3) {
                await new Promise((r) => setTimeout(r, 3000));
            }
        }
    }

    return "Error: No se pudo generar la imagen. Pollinations AI no respondió. Intenta de nuevo en unos minutos.";
}

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
                            text: `Generate a high-quality image. Output ONLY the image.\n\nDescription: ${prompt}\nAspect ratio: ${aspectRatio}`,
                        },
                    ],
                },
            ],
            generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
        }),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(`${model} ${response.status}: ${JSON.stringify(errData).substring(0, 200)}`);
    }

    const data = await response.json();
    for (const candidate of data.candidates || []) {
        for (const part of candidate.content?.parts || []) {
            if (part.inlineData?.data) return part.inlineData.data;
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

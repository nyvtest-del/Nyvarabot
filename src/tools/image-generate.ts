import OpenAI from "openai";
import { config } from "../config.js";
import type { Tool } from "./types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Herramienta para generar imágenes.
 *
 * Cadena de métodos (prueba en orden hasta que uno funcione):
 *   1. OpenAI DALL-E 3 — confiable, alta calidad (consume créditos OpenAI)
 *   2. Pollinations AI — gratis, sin API key (puede estar rate limited)
 *   3. Google Gemini — Nano Banana (requiere cuota en free tier)
 */

export const imageGenerateTool: Tool = {
    definition: {
        name: "image_generate",
        description:
            "Genera imágenes reales de alta calidad. SIEMPRE usa esta herramienta cuando el usuario pida una imagen, diseño, foto, banner o post visual. El prompt debe ser EN INGLÉS para mejores resultados.",
        parameters: {
            type: "object",
            properties: {
                prompt: {
                    type: "string",
                    description:
                        "Descripción detallada de la imagen EN INGLÉS.",
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
        const aspectRatio = (args.aspectRatio as string) || "1:1";

        const tempDir = path.join(process.cwd(), "markdowns", "temp");
        await fs.mkdir(tempDir, { recursive: true });

        // ─── 1. Intentar con OpenAI DALL-E ─────────────────────
        if (config.OPENAI_API_KEY) {
            try {
                console.log("🎨 Generando con OpenAI DALL-E 3...");
                const result = await generateWithDallE(prompt, aspectRatio, tempDir);
                if (result) return result;
            } catch (error) {
                console.warn(`⚠️ DALL-E falló: ${error instanceof Error ? error.message : error}`);
            }
        }

        // ─── 2. Intentar con Pollinations AI ───────────────────
        try {
            console.log("🎨 Intentando Pollinations AI...");
            const result = await generateWithPollinations(prompt, aspectRatio, tempDir);
            if (result) return result;
        } catch (error) {
            console.warn(`⚠️ Pollinations falló: ${error instanceof Error ? error.message : error}`);
        }

        // ─── 3. Intentar con Google Gemini ─────────────────────
        const keys = config.GOOGLE_API_KEYS;
        for (const apiKey of keys) {
            try {
                console.log("🎨 Intentando Google Gemini...");
                const result = await generateWithGemini(prompt, aspectRatio, apiKey, tempDir);
                if (result) return result;
            } catch (error) {
                console.warn(`⚠️ Gemini falló: ${error instanceof Error ? error.message : error}`);
            }
        }

        return "Error: No se pudo generar la imagen con ningún servicio. Todos están temporalmente fuera de servicio o sin cuota. Intenta de nuevo más tarde.";
    },
};

// ─── OpenAI DALL-E 3 ────────────────────────────────────
async function generateWithDallE(
    prompt: string,
    aspectRatio: string,
    tempDir: string
): Promise<string | null> {
    const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

    // Mapear aspect ratio a tamaños de DALL-E
    const sizeMap: Record<string, "1024x1024" | "1792x1024" | "1024x1792"> = {
        "1:1": "1024x1024",
        "4:3": "1792x1024",
        "3:4": "1024x1792",
        "16:9": "1792x1024",
        "9:16": "1024x1792",
    };
    const size = sizeMap[aspectRatio] || "1024x1024";

    const response = await openai.images.generate({
        model: "dall-e-3",
        prompt,
        n: 1,
        size,
        response_format: "b64_json",
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) return null;

    const fileName = `gen_${randomUUID()}.png`;
    const filePath = path.join(tempDir, fileName);
    await fs.writeFile(filePath, Buffer.from(b64, "base64"));
    console.log(`✅ Imagen generada con DALL-E 3 (${size})`);
    return `✅ Imagen generada con DALL-E 3.\nSENT_IMAGE_PATH:${filePath}`;
}

// ─── Pollinations AI (gratis) ───────────────────────────
async function generateWithPollinations(
    prompt: string,
    aspectRatio: string,
    tempDir: string
): Promise<string | null> {
    const dimensions: Record<string, { w: number; h: number }> = {
        "1:1": { w: 1024, h: 1024 },
        "4:3": { w: 1024, h: 768 },
        "3:4": { w: 768, h: 1024 },
        "16:9": { w: 1280, h: 720 },
        "9:16": { w: 720, h: 1280 },
    };
    const { w, h } = dimensions[aspectRatio] || dimensions["1:1"];
    const seed = Math.floor(Math.random() * 999999);
    const encoded = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=${w}&height=${h}&seed=${seed}&nologo=true&model=flux`;

    const response = await fetch(url, { signal: AbortSignal.timeout(45000) });

    if (!response.ok) throw new Error(`Pollinations HTTP ${response.status}`);

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 1000) throw new Error("Imagen vacía");

    const fileName = `gen_${randomUUID()}.png`;
    const filePath = path.join(tempDir, fileName);
    await fs.writeFile(filePath, buffer);
    console.log(`✅ Imagen generada con Pollinations AI`);
    return `✅ Imagen generada con Pollinations AI.\nSENT_IMAGE_PATH:${filePath}`;
}

// ─── Google Gemini (Nano Banana) ────────────────────────
async function generateWithGemini(
    prompt: string,
    aspectRatio: string,
    apiKey: string,
    tempDir: string
): Promise<string | null> {
    const model = "gemini-2.0-flash-exp-image-generation";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: `Generate a high-quality image. Output ONLY the image.\n\nDescription: ${prompt}\nAspect ratio: ${aspectRatio}` }] }],
            generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
        }),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(`Gemini ${response.status}: ${JSON.stringify(errData).substring(0, 200)}`);
    }

    const data = await response.json();
    for (const candidate of data.candidates || []) {
        for (const part of candidate.content?.parts || []) {
            if (part.inlineData?.data) {
                const fileName = `gen_${randomUUID()}.png`;
                const filePath = path.join(tempDir, fileName);
                await fs.writeFile(filePath, Buffer.from(part.inlineData.data, "base64"));
                console.log(`✅ Imagen generada con Gemini`);
                return `✅ Imagen generada con Gemini.\nSENT_IMAGE_PATH:${filePath}`;
            }
        }
    }
    return null;
}

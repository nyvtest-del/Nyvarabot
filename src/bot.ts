import { Bot, InputFile } from "grammy";
import { config } from "./config.js";
import { runAgent } from "./agent.js";
import type { MemoryDB } from "./memory/index.js";
import fs from "node:fs";
import path from "node:path";

// ─── Bot de Telegram ────────────────────────────────────

export function createBot(memory: MemoryDB): Bot {
  const bot = new Bot(config.TELEGRAM_BOT_TOKEN);
  const allowedUsers = config.TELEGRAM_ALLOWED_USER_IDS;

  // ─── Middleware de seguridad ────────────────────────────
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;

    if (!userId || !allowedUsers.includes(userId)) {
      console.warn(
        `🚫 Acceso denegado — User ID: ${userId ?? "desconocido"}`
      );
      await ctx.reply("⛔ No tienes permiso para usar este bot.");
      return;
    }

    await next();
  });

  // ─── Comando /start ────────────────────────────────────
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "👋 ¡Hola! Soy **Nyvarabot**, tu asistente personal.\n\n" +
      "Puedo:\n" +
      "• Responder preguntas\n" +
      "• Recordar información\n" +
      "• Decirte la hora\n\n" +
      "Escríbeme lo que necesites 🚀",
      { parse_mode: "Markdown" }
    );
  });

  // ─── Comando /clear ────────────────────────────────────
  bot.command("clear", async (ctx) => {
    const userId = ctx.from!.id;
    await memory.clearConversation(userId);
    await ctx.reply("🧹 Historial de conversación borrado.");
  });

  // ─── Comando /memory ───────────────────────────────────
  bot.command("memory", async (ctx) => {
    const memories = await memory.getAllMemories();

    if (memories.length === 0) {
      await ctx.reply("📭 No hay nada guardado en memoria.");
      return;
    }

    const list = memories
      .map((m, i) => `${i + 1}. **${m.key}**: ${m.content}`)
      .join("\n");

    await ctx.reply(`🧠 **Memorias guardadas:**\n\n${list}`, {
      parse_mode: "Markdown",
    });
  });

  // ─── Handler de mensajes de texto ──────────────────────
  bot.on("message:text", async (ctx) => {
    const userId = ctx.from.id;
    const userMessage = ctx.message.text;

    console.log(`\n📩 Mensaje de ${userId}: ${userMessage.substring(0, 50)}...`);

    // Indicador de "escribiendo..."
    await ctx.replyWithChatAction("typing");

    // Configurar intervalo para mantener el indicador activo
    const typingInterval = setInterval(async () => {
      try {
        await ctx.replyWithChatAction("typing");
      } catch {
        // Ignorar errores del indicador
      }
    }, 4000);

    try {
      const result = await runAgent({
        userMessage,
        userId,
        memory,
      });

      clearInterval(typingInterval);

      // --- Manejo de Imágenes ---
      // Buscar si el resultado contiene el tag de imagen generada
      let responseText = result.response;
      const imageTagMatch = responseText.match(/SENT_IMAGE_PATH:(.+)/);

      if (imageTagMatch && imageTagMatch[1]) {
        const imagePath = imageTagMatch[1].trim();
        // Limpiar el tag del texto final
        responseText = responseText.replace(/SENT_IMAGE_PATH:.+/, "").trim();

        if (fs.existsSync(imagePath)) {
          console.log(`📸 Enviando imagen: ${imagePath}`);
          await ctx.replyWithPhoto(new InputFile(imagePath)).catch(e => {
            console.error("❌ Error enviando foto:", e);
          });
        }
      }

      // Enviar respuesta de texto (dividirla si es muy larga)
      const maxLength = 4096;
      if (responseText.length <= maxLength) {
        if (responseText.length > 0) {
          await ctx.reply(responseText, { parse_mode: "Markdown" }).catch(
            async () => await ctx.reply(responseText)
          );
        }
      } else {
        const chunks = splitMessage(responseText, maxLength);
        for (const chunk of chunks) {
          await ctx.reply(chunk, { parse_mode: "Markdown" }).catch(
            async () => await ctx.reply(chunk)
          );
        }
      }

      console.log(
        `📤 Respuesta enviada (${result.iterations} iteraciones, ${responseText.length} chars)`
      );
    } catch (error) {
      clearInterval(typingInterval);
      console.error("❌ Error procesando mensaje:", error);
      await ctx.reply(
        "😵 Ocurrió un error procesando tu mensaje. Inténtalo de nuevo."
      );
    }
  });

  // ─── Manejo de errores global ──────────────────────────
  bot.catch((err) => {
    console.error("❌ Error en el bot:", err.message);
  });

  return bot;
}

// ─── Utilidades ─────────────────────────────────────────

function splitMessage(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Intentar cortar en un salto de línea
    let cutIndex = remaining.lastIndexOf("\n", maxLength);
    if (cutIndex <= 0) {
      // Si no hay salto de línea, cortar en espacio
      cutIndex = remaining.lastIndexOf(" ", maxLength);
    }
    if (cutIndex <= 0) {
      cutIndex = maxLength;
    }

    chunks.push(remaining.substring(0, cutIndex));
    remaining = remaining.substring(cutIndex).trimStart();
  }

  return chunks;
}

import { config } from "./config.js";
import { MemoryDB } from "./memory/index.js";
import { createBot } from "./bot.js";

// ─── Punto de entrada ───────────────────────────────────

async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════╗");
  console.log("║         🤖 Nyvarabot v1.0.0         ║");
  console.log("║   Agente de IA Personal · Telegram   ║");
  console.log("╚══════════════════════════════════════╝");
  console.log();

  // Inicializar memoria (async por sql.js)
  const memory = await MemoryDB.create();

  // Crear y arrancar el bot
  const bot = createBot(memory);

  // Cierre limpio
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Señal ${signal} recibida — cerrando...`);
    await bot.stop();
    memory.close();
    console.log("👋 Nyvarabot detenido. ¡Hasta pronto!");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // ─── Health check para Easypanel ──────────────────────
  // Muchos paneles (como Easypanel) matan el bot si no ven un puerto abierto.
  try {
    const { createServer } = await import("node:http");
    const port = process.env.PORT || 3000;
    createServer((_, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Nyvarabot is ALIVE\n");
    }).listen(port, () => {
      console.log(`🌐 Servidor de salud activo en puerto ${port}`);
    });
  } catch (e) {
    console.warn("⚠️ No se pudo iniciar el servidor de salud, pero el bot seguirá intentando...");
  }

  // Arrancar con long polling
  console.log(`📡 Usuarios permitidos: [${config.TELEGRAM_ALLOWED_USER_IDS.join(", ")}]`);
  console.log(`🧠 LLM: Cadena híbrida (OpenAI → Groq → OpenRouter)`);
  console.log(`💾 Base de datos: ${config.DB_PATH}`);
  console.log();
  console.log("🚀 Bot iniciado — esperando mensajes...\n");

  bot.start();
}

main().catch((error) => {
  console.error("💥 Error fatal:", error);
  process.exit(1);
});

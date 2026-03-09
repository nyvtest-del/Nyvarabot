import type { Tool } from "./types.js";

export const getCurrentTimeTool: Tool = {
  definition: {
    name: "get_current_time",
    description:
      "Obtiene la fecha y hora actual. Útil para saber la hora, poner fechas en recordatorios, etc.",
    parameters: {
      type: "object",
      properties: {
        timezone: {
          type: "string",
          description:
            'Zona horaria (ej: "America/Mexico_City", "Europe/Madrid"). Por defecto usa la zona local.',
        },
      },
      required: [],
    },
  },

  async execute(args) {
    const timezone =
      (args.timezone as string) ||
      Intl.DateTimeFormat().resolvedOptions().timeZone;

    const now = new Date();
    const formatted = now.toLocaleString("es-ES", {
      timeZone: timezone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    return JSON.stringify({
      datetime: now.toISOString(),
      formatted,
      timezone,
      unix: Math.floor(now.getTime() / 1000),
    });
  },
};

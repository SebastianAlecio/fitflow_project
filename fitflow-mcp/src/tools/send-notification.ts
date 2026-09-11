import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { discoverService } from "../lib/consul.js";

export function registerSendNotification(server: McpServer): void {
  server.registerTool(
    "send_notification",
    {
      description: "Envía una notificación a un usuario de FitFlow.",
      inputSchema: {
        userId: z.number().describe("ID del usuario a notificar"),
        message: z.string().describe("Texto de la notificación"),
      },
    },
    async ({ userId, message }) => {
      const notif = await discoverService("notif-svc");
      const res = await fetch(`http://${notif.address}:${notif.port}/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, message, channel: "log" }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(`notif-svc respondió ${res.status}: ${JSON.stringify(body)}`);
      }
      return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
    }
  );
}

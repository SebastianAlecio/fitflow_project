import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { discoverService } from "../lib/consul.js";

export function registerGetNotificationHistory(server: McpServer): void {
  server.registerTool(
    "get_notification_history",
    {
      description: "Obtiene el historial de notificaciones de un usuario de FitFlow.",
      inputSchema: {
        userId: z.number().describe("ID del usuario"),
      },
    },
    async ({ userId }) => {
      const notif = await discoverService("notif-svc");
      const res = await fetch(
        `http://${notif.address}:${notif.port}/notifications/user/${userId}`
      );
      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`notif-svc respondió ${res.status}: ${errorBody}`);
      }
      const body = await res.json();
      return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
    }
  );
}

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { discoverService } from "../lib/consul.js";
import { mintServiceToken } from "../lib/auth.js";

export function registerCreateBooking(server: McpServer): void {
  server.registerTool(
    "create_booking",
    {
      description: "Crea una reserva de una clase fitness para un usuario existente de FitFlow.",
      inputSchema: {
        userId: z.number().describe("ID del usuario que hace la reserva"),
        classId: z.number().describe("ID de la clase a reservar"),
      },
    },
    async ({ userId, classId }) => {
      const booking = await discoverService("booking-svc");
      const token = mintServiceToken(userId);

      const res = await fetch(`http://${booking.address}:${booking.port}/bookings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ classId }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(`booking-svc respondió ${res.status}: ${JSON.stringify(body)}`);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
      };
    }
  );
}

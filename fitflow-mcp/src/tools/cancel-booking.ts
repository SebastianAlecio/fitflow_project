import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { discoverService } from "../lib/consul.js";
import { mintServiceToken } from "../lib/auth.js";

export function registerCancelBooking(server: McpServer): void {
  server.registerTool(
    "cancel_booking",
    {
      description: "Cancela una reserva existente de FitFlow.",
      inputSchema: {
        userId: z.number().describe("ID del usuario dueño de la reserva"),
        bookingId: z.number().describe("ID de la reserva a cancelar"),
      },
    },
    async ({ userId, bookingId }) => {
      const booking = await discoverService("booking-svc");
      const token = mintServiceToken(userId);

      const res = await fetch(`http://${booking.address}:${booking.port}/bookings/${bookingId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
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

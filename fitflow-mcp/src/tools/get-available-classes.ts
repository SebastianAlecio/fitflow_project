import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { discoverService } from "../lib/consul.js";

export function registerGetAvailableClasses(server: McpServer): void {
  server.registerTool(
    "get_available_classes",
    {
      description:
        "Lista las clases fitness disponibles en FitFlow, con su instructor, horario, capacidad y cupos reservados.",
      inputSchema: {},
    },
    async () => {
      const booking = await discoverService("booking-svc");
      const res = await fetch(`http://${booking.address}:${booking.port}/classes`);
      if (!res.ok) {
        throw new Error(`booking-svc respondió ${res.status}`);
      }
      const classes = await res.json();
      return {
        content: [{ type: "text", text: JSON.stringify(classes, null, 2) }],
      };
    }
  );
}

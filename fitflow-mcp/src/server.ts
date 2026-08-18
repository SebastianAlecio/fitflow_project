import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerGetAvailableClasses } from "./tools/get-available-classes.js";
import { registerCreateBooking } from "./tools/create-booking.js";
import { registerCancelBooking } from "./tools/cancel-booking.js";

function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "fitflow-mcp", version: "1.0.0" });
  registerGetAvailableClasses(server);
  registerCreateBooking(server);
  registerCancelBooking(server);
  return server;
}

const app = express();
app.use(express.json());

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/mcp", async (req, res) => {
  const server = buildMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", (_req, res) => {
  res.status(405).json({ error: "Method not allowed in stateless mode" });
});

app.delete("/mcp", (_req, res) => {
  res.status(405).json({ error: "Method not allowed in stateless mode" });
});

const PORT = Number(process.env.PORT || 8000);

app.listen(PORT, () => {
  console.log(`fitflow-mcp listening on port ${PORT}`);
});

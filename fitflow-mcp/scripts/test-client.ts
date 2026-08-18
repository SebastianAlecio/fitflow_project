import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main() {
  const client = new Client({ name: "fitflow-mcp-test-client", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost:8000/mcp"));

  await client.connect(transport);

  const tools = await client.listTools();
  console.log(
    "Tools disponibles:",
    tools.tools.map((t) => t.name)
  );

  const classes = await client.callTool({ name: "get_available_classes", arguments: {} });
  console.log("get_available_classes ->", JSON.stringify(classes, null, 2));

  const booking = await client.callTool({
    name: "create_booking",
    arguments: { userId: 1, classId: 3 },
  });
  console.log("create_booking ->", JSON.stringify(booking, null, 2));

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

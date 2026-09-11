import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export async function callMcpTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const client = new Client({ name: "notification-agent", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(process.env.FITFLOW_MCP_URL as string)
  );

  await client.connect(transport);
  try {
    const result = (await client.callTool({ name, arguments: args })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    const text = result.content.map((c) => c.text).join("\n");
    if (result.isError) {
      throw new Error(text);
    }
    return JSON.parse(text);
  } finally {
    await client.close();
  }
}

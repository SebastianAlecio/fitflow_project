const CONSUL_URL = `http://${process.env.CONSUL_HOST || "consul"}:${process.env.CONSUL_PORT || "8500"}`;

export interface DiscoveredInstance {
  address: string;
  port: number;
}

export async function discoverService(name: string): Promise<DiscoveredInstance> {
  const res = await fetch(`${CONSUL_URL}/v1/health/service/${name}?passing=true`);
  if (!res.ok) {
    throw new Error(`Consul lookup for ${name} failed: ${res.status}`);
  }
  const nodes = (await res.json()) as Array<{
    Service: { Address: string; Port: number };
    Node: { Address: string };
  }>;
  if (nodes.length === 0) {
    throw new Error(`No healthy instances of ${name} registered in Consul`);
  }
  const node = nodes[0];
  return {
    address: node.Service.Address || node.Node.Address,
    port: node.Service.Port,
  };
}

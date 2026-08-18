const CONSUL_URL = `http://${process.env.CONSUL_HOST || "consul"}:${process.env.CONSUL_PORT || "8500"}`;

export interface RegisterOptions {
  id: string;
  name: string;
  address: string;
  port: number;
  healthPath?: string;
}

export async function registerService(opts: RegisterOptions): Promise<void> {
  const healthPath = opts.healthPath ?? "/healthz";
  const body = {
    ID: opts.id,
    Name: opts.name,
    Address: opts.address,
    Port: opts.port,
    Check: {
      HTTP: `http://${opts.address}:${opts.port}${healthPath}`,
      Interval: "10s",
      Timeout: "5s",
      DeregisterCriticalServiceAfter: "30s",
    },
  };

  const res = await fetch(`${CONSUL_URL}/v1/agent/service/register`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Failed to register ${opts.name} in Consul: ${res.status} ${await res.text()}`);
  }
}

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

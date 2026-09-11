import { logEvent } from "./logger";
import { ParsedIntent } from "./parser";

interface AgentCard {
  name: string;
  description: string;
  url: string;
  skills: Array<{ id: string; name: string; description?: string }>;
}

export interface TaskResult {
  skill: string;
  status: "completed" | "failed" | "skipped";
  output?: unknown;
  error?: string;
}

const AGENT_URLS: Record<ParsedIntent["skill"], string> = {
  create_booking: process.env.BOOKING_AGENT_URL as string,
  cancel_booking: process.env.BOOKING_AGENT_URL as string,
  send_notification: process.env.NOTIFICATION_AGENT_URL as string,
};

async function discoverAgent(taskId: string, url: string, skillId: string): Promise<AgentCard> {
  const res = await fetch(`${url}/.well-known/agent.json`);
  if (!res.ok) {
    throw new Error(`No se pudo descubrir el agente en ${url}: ${res.status}`);
  }
  const card = (await res.json()) as AgentCard;
  logEvent(taskId, "a2a_agent_discovered", "info", { agent: card.name, url });

  const hasSkill = card.skills.some((s) => s.id === skillId);
  if (!hasSkill) {
    throw new Error(`El agente ${card.name} no expone el skill ${skillId}`);
  }
  return card;
}

async function delegateTask(
  taskId: string,
  url: string,
  skillId: string,
  input: Record<string, unknown>
): Promise<TaskResult> {
  await discoverAgent(taskId, url, skillId);

  logEvent(taskId, "a2a_task_delegated", "info", { skill: skillId, url });

  const res = await fetch(`${url}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId, skillId, input }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`El agente en ${url} respondió ${res.status}: ${errorBody}`);
  }

  const result = (await res.json()) as {
    status: "completed" | "failed";
    output?: unknown;
    error?: string;
  };
  logEvent(taskId, "a2a_task_result", "info", { skill: skillId, status: result.status });

  return { skill: skillId, status: result.status, output: result.output, error: result.error };
}

export async function runIntents(
  taskId: string,
  userId: number,
  intents: ParsedIntent[]
): Promise<TaskResult[]> {
  const results: TaskResult[] = [];
  let primarySucceeded = true;

  for (const intent of intents) {
    if (intent.skill === "send_notification" && !primarySucceeded) {
      logEvent(taskId, "a2a_task_skipped", "warn", {
        skill: intent.skill,
        reason: "primary intent failed",
      });
      results.push({ skill: intent.skill, status: "skipped" });
      continue;
    }

    const url = AGENT_URLS[intent.skill];
    const input: Record<string, unknown> =
      intent.skill === "create_booking"
        ? { userId, className: intent.className }
        : intent.skill === "cancel_booking"
          ? { userId, bookingId: intent.bookingId }
          : { userId, message: intent.message };

    const result = await delegateTask(taskId, url, intent.skill, input);
    results.push(result);

    if (
      (intent.skill === "create_booking" || intent.skill === "cancel_booking") &&
      result.status === "failed"
    ) {
      primarySucceeded = false;
    }
  }

  return results;
}

const CLASS_NAMES = ["Yoga", "Spinning", "CrossFit", "Pilates", "Zumba"];

export type ParsedIntent =
  | { skill: "create_booking"; className: string }
  | { skill: "cancel_booking"; bookingId: number }
  | { skill: "send_notification"; message: string };

export interface ParseResult {
  intents: ParsedIntent[];
  unresolvedPrimary?: "create_booking" | "cancel_booking";
}

export function parseInstruction(instruction: string): ParseResult {
  const lower = instruction.toLowerCase();
  const intents: ParsedIntent[] = [];
  let unresolvedPrimary: "create_booking" | "cancel_booking" | undefined;

  if (/cancela|cancelar/.test(lower)) {
    const match = lower.match(/\d+/);
    if (match) {
      intents.push({ skill: "cancel_booking", bookingId: Number(match[0]) });
    } else {
      unresolvedPrimary = "cancel_booking";
    }
  } else if (/reserva|reservar/.test(lower)) {
    const className = CLASS_NAMES.find((name) => lower.includes(name.toLowerCase()));
    if (className) {
      intents.push({ skill: "create_booking", className });
    } else {
      unresolvedPrimary = "create_booking";
    }
  }

  if (/avisa|avísame|avisame|notific/.test(lower)) {
    const primary = intents[0];
    let message: string;
    if (primary?.skill === "create_booking") {
      message = `Tu reserva de ${primary.className} fue confirmada.`;
    } else if (primary?.skill === "cancel_booking") {
      message = "Tu reserva fue cancelada.";
    } else {
      message = "Tenés una notificación pendiente de FitFlow.";
    }
    intents.push({ skill: "send_notification", message });
  }

  return { intents, unresolvedPrimary };
}

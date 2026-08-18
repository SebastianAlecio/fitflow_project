import { discoverService } from "./consul";

export async function notifyBookingCreated(userId: number, classId: number): Promise<void> {
  try {
    const notif = await discoverService("notif-svc");
    const res = await fetch(`http://${notif.address}:${notif.port}/notifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        message: `Tu reserva para la clase ${classId} fue confirmada.`,
        channel: "log",
      }),
    });
    if (!res.ok) {
      console.error(`notif-svc responded with ${res.status}`);
    }
  } catch (err) {
    console.error("Could not reach notif-svc (booking still succeeds):", err);
  }
}

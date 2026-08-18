import { prisma } from "./prisma";

export async function seedClasses(): Promise<void> {
  const count = await prisma.class.count();
  if (count > 0) {
    return;
  }

  const now = new Date();
  const inDays = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  await prisma.class.createMany({
    data: [
      { name: "Yoga", instructor: "Ana Martinez", schedule: inDays(1), capacity: 15 },
      { name: "Spinning", instructor: "Carlos Ruiz", schedule: inDays(1), capacity: 20 },
      { name: "CrossFit", instructor: "Laura Gomez", schedule: inDays(2), capacity: 12 },
      { name: "Pilates", instructor: "Marta Diaz", schedule: inDays(2), capacity: 15 },
      { name: "Zumba", instructor: "Pedro Alvarez", schedule: inDays(3), capacity: 25 },
    ],
  });

  console.log("Seeded 5 sample classes.");
}

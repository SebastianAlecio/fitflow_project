import jwt from "jsonwebtoken";

export function mintServiceToken(userId: number): string {
  return jwt.sign({ userId }, process.env.JWT_SECRET as string, { expiresIn: "60s" });
}

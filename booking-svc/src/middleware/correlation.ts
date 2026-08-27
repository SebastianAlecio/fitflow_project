import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";

export interface CorrelatedRequest extends Request {
  correlationId: string;
}

export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers["x-correlation-id"];
  const correlationId =
    typeof incoming === "string" && incoming.length > 0 ? incoming.slice(0, 128) : randomUUID();
  (req as CorrelatedRequest).correlationId = correlationId;
  res.setHeader("x-correlation-id", correlationId);
  next();
}

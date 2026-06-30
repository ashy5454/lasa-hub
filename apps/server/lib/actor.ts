import { auth } from "./firebase";
import { normalizePhone } from "./phone";

export type Role = "kirana" | "wholesaler" | "admin";

export interface Actor {
  phone: string;
  role: Role;
  wholesalerId?: string;
}

export async function getActor(req: any): Promise<Actor | null> {
  const authHeader = req.headers["authorization"];
  if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  try {
    const decoded = await auth.verifyIdToken(token);
    const rawPhone = decoded.phone_number;
    if (!rawPhone) return null;
    const phone = normalizePhone(rawPhone);
    const role = (req.headers["x-user-role"] as Role) ?? "kirana";
    const wholesalerId =
      typeof req.headers["x-user-wholesaler-id"] === "string"
        ? req.headers["x-user-wholesaler-id"]
        : undefined;
    return { phone, role, wholesalerId };
  } catch {
    return null;
  }
}

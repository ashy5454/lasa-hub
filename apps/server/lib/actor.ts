type Role = "kirana" | "wholesaler" | "admin";

export interface Actor {
  phone: string;
  role: Role;
  wholesalerId?: string;
}

export function getActor(req: any): Actor | null {
  const phone = req.headers["x-user-phone"];
  const role = req.headers["x-user-role"];
  if (typeof phone !== "string" || typeof role !== "string") return null;
  return {
    phone,
    role: role as Role,
    wholesalerId:
      typeof req.headers["x-user-wholesaler-id"] === "string"
        ? req.headers["x-user-wholesaler-id"]
        : undefined,
  };
}

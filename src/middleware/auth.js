import { clerkMiddleware, getAuth } from "@clerk/express";

// Inicializa o Clerk
export const clerk = clerkMiddleware();

// Para rotas de API: retorna 401 JSON em vez de redirecionar
export function requireAuthenticated(req, res, next) {
  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

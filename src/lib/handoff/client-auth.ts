// LOGAN OS — Handoff — auth del panel del cliente (DEC-LOGAN-022, Fase 3.1).
//
// Login SIMPLE por proyecto (Opción A): cada proyecto tiene una contraseña
// (Project.clientPanelPassword). El dueño del negocio entra a /panel/[projectId],
// ingresa la contraseña, y se le setea una cookie ACOTADA a ese proyecto:
//   client_auth_<projectId> = "authenticated"
//
// Esto NO usa la cookie de admin de LOGAN (logan_auth); son sistemas separados.
// Un cliente autenticado en su proyecto NO obtiene acceso de administrador.

import type { NextRequest } from "next/server";

/** Nombre de la cookie de sesión del cliente para un proyecto dado. */
export function clientCookieName(projectId: string): string {
  return `client_auth_${projectId}`;
}

/** ¿El request está autenticado como cliente de ESTE proyecto? */
export function isClientAuthenticated(
  req: NextRequest,
  projectId: string,
): boolean {
  const cookie = req.cookies.get(clientCookieName(projectId));
  return cookie?.value === "authenticated";
}

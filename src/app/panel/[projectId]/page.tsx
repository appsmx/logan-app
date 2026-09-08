"use client";

// LOGAN OS — Panel del cliente por ID: /panel/[projectId] (DEC-LOGAN-022).
// Acceso directo por id de proyecto. Reutiliza el componente compartido ClientPanel.

import { use } from "react";
import { ClientPanel } from "../ClientPanel";
import { ServiceWorkerRegister } from "./sw-register";

export default function ClientPanelByIdPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  return (
    <>
      <ServiceWorkerRegister />
      <ClientPanel projectId={projectId} />
    </>
  );
}

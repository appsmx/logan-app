// LOGAN OS — Panel del cliente por subdominio (DEC-LOGAN-022, Fase 3.5).
//
// El middleware reescribe {slug}.loganos.com → /panel/by-slug/{slug}.
// Este Server Component resuelve slug→projectId desde la BD y renderiza el
// mismo panel del cliente (ClientPanel). Así la URL del navegador queda bonita
// (mariscosquiroa.loganos.com) mientras por dentro se usa el panel existente.

import { db } from "@/lib/db";
import { ClientPanel } from "../../ClientPanel";
import { ServiceWorkerRegister } from "../../[projectId]/sw-register";

export const dynamic = "force-dynamic";

export default async function ClientPanelBySlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const project = await db.project.findUnique({
    where: { slug },
    select: { id: true, clientPanelPassword: true },
  });

  // Slug inexistente o panel no habilitado → mensaje neutro (no revelamos detalles).
  if (!project || !project.clientPanelPassword) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[oklch(0.10_0.006_60)] px-4 text-center text-[oklch(0.85_0.012_75)]">
        <img src="/logo.svg" alt="LOGAN" width={48} height={48} className="size-12" />
        <p className="font-serif text-lg">Panel no disponible</p>
        <p className="max-w-sm text-sm text-[oklch(0.6_0.012_70)]">
          Este panel de atención no existe o aún no está habilitado. Verifica la
          dirección o contacta a tu proveedor.
        </p>
      </div>
    );
  }

  return (
    <>
      <ServiceWorkerRegister />
      <ClientPanel projectId={project.id} />
    </>
  );
}

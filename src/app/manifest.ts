import type { MetadataRoute } from "next";

// PWA manifest (DEC-LOGAN-022, Fase 3.4).
// Hace instalable el panel del cliente como "app" (ícono en pantalla de inicio,
// ventana propia sin barra del navegador). Next.js lo sirve en /manifest.webmanifest.
//
// start_url apunta a la raíz; cuando el cliente instala desde /panel/[id], el
// navegador recuerda el scope. El ícono usa el logo átomo de LOGAN.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LOGAN · Atención a clientes",
    short_name: "LOGAN Atención",
    description:
      "Atiende a tus clientes: deja que el agente de IA responda o toma el control cuando quieras.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0908",
    theme_color: "#f7982f",
    icons: [
      {
        src: "/logo.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}

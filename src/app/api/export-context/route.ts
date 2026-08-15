// POST /api/export-context — genera contexto de IA para un proyecto
// DEC-LOGAN-017: estándar de exportación de contexto para handoff entre IAs.

import { NextRequest, NextResponse } from "next/server";
import { generateContextExport } from "@/lib/export/generate-context";

export async function POST(req: NextRequest) {
  try {
    const { projectId, includeSource } = await req.json();

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId es requerido" },
        { status: 400 },
      );
    }

    const result = await generateContextExport({ projectId, includeSource });

    return NextResponse.json({
      success: true,
      context: result.contextMarkdown,
      contextSize: result.contextSize,
      fileCount: result.fileCount,
      message: "Contexto generado. Copia el campo 'context' a un archivo .md para compartir con otra IA.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({
      endpoint: "POST /api/export-context",
      description: "Genera contexto de IA para handoff entre IAs (DEC-LOGAN-017)",
      body: {
        projectId: "string (required)",
        includeSource: "boolean (optional, default false)",
      },
      response: {
        success: "boolean",
        context: "string (markdown del contexto curado)",
        contextSize: "number (bytes)",
        fileCount: "number",
      },
    });
  }

  try {
    const result = await generateContextExport({ projectId });
    return new NextResponse(result.contextMarkdown, {
      headers: {
        "Content-Type": "text/markdown",
        "Content-Disposition": `attachment; filename="contexto-ia.md"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}

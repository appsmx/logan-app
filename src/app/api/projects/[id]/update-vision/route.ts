// Endpoint temporal para actualizar la visión de un proyecto.
// Se usa una vez y se puede eliminar después.
// POST /api/projects/[id]/update-vision
// Body: { vision: string, secret: "logan-update-2026" }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const UPDATE_SECRET = "logan-update-2026";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  // Simple secret to prevent unauthorized calls
  if (body.secret !== UPDATE_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (typeof body.vision !== "string" || !body.vision.trim()) {
    return NextResponse.json({ error: "vision is required" }, { status: 400 });
  }

  try {
    const updated = await db.project.update({
      where: { id },
      data: { vision: body.vision.trim() },
    });
    return NextResponse.json({ ok: true, name: updated.name, visionLength: updated.vision.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

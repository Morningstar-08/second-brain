import { NextRequest, NextResponse } from "next/server";
import { listAllFullDocuments } from "@/lib/vectorStore";

export const runtime = "nodejs";

// GET /api/documents - List all documents
export async function GET(request: NextRequest) {
  try {
    const result = await listAllFullDocuments();

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: result.total,
      documents: result.documents,
    });
  } catch (error: any) {
    console.error("Error listing documents:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getFullDocument, deleteFullDocument } from "@/lib/vectorStore";

export const runtime = "nodejs";

// GET /api/documents/[id] - Retrieve full document
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const document = await getFullDocument(documentId);

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      document,
    });
  } catch (error: any) {
    console.error("Error retrieving document:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/documents/[id] - Delete document and its chunks
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const result = await deleteFullDocument(documentId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    console.error("Error deleting document:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

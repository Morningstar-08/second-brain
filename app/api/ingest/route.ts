import { NextRequest, NextResponse } from "next/server";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import {
  storeChunksWithEmbeddings,
  storeFullDocument,
} from "@/lib/vectorStore";

export const runtime = "nodejs";

interface IngestRequest {
  content: string;
  filename: string;
  type: "text" | "pdf" | "audio" | "image";
}

export async function POST(request: NextRequest) {
  try {
    const { content, filename, type }: IngestRequest = await request.json();

    if (!content || !filename || !type) {
      return NextResponse.json(
        { error: "Missing required fields: content, filename, type" },
        { status: 400 }
      );
    }

    let textContent = content;

    // Validate that content is readable text, not binary data
    const hasControlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(
      textContent
    );
    if (hasControlChars && textContent.length > 100) {
      return NextResponse.json(
        {
          error:
            "Content appears to be binary data. Please ensure DOCX, PDF, or other binary files are properly extracted before upload.",
        },
        { status: 400 }
      );
    }

    // For PDF type, content should already be extracted text from client
    // This endpoint expects plain text, not base64 PDF buffer
    if (type === "pdf" && !textContent.trim()) {
      return NextResponse.json(
        { error: "No text content provided for PDF" },
        { status: 400 }
      );
    }

    // Split into chunks
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const chunks = await splitter.splitText(textContent);

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "No text content found to chunk" },
        { status: 400 }
      );
    }

    const documentId =
      filename.replace(/\W+/g, "_") +
      "_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 8);

    // Store full document first to get uploadDate
    const fileSize = Buffer.byteLength(textContent, "utf8");
    const uploadDate = new Date().toISOString();

    const documentStoreResult = await storeFullDocument(
      documentId,
      filename,
      textContent,
      type,
      fileSize,
      chunks.length,
      uploadDate
    );

    // Store chunks with the same uploadDate for consistency
    const embeddingResult = await storeChunksWithEmbeddings(
      chunks,
      documentId,
      filename,
      uploadDate,
      type
    );

    return NextResponse.json({
      success: embeddingResult.success && documentStoreResult.success,
      filename,
      documentId,
      chunksCount: chunks.length,
      fileSize,
      previewChunks: chunks.slice(0, 3),
      embeddingStatus: embeddingResult,
      documentStoreStatus: documentStoreResult,
    });
  } catch (err: any) {
    console.error("Ingest Error:", err);
    return NextResponse.json(
      { error: "Server error: " + err.message },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { searchRelevantChunks, qdrantClient } from '@/lib/vectorStore';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface SummarizeRequest {
  documentId: string;
}

export async function POST(request: NextRequest) {
  try {
    const { documentId }: SummarizeRequest = await request.json();

    if (!documentId) {
      return NextResponse.json(
        { error: 'Missing required field: documentId' },
        { status: 400 }
      );
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: 'Groq API key not configured' },
        { status: 500 }
      );
    }

    // Fetch all chunks for this document from Qdrant
    const collectionName = 'documents';
    let allPoints: any[] = [];
    let fullText = '';
    let chunks: string[] = [];
    
    try {
      // Scroll through all points (Qdrant Cloud may have different filter syntax)
      let offset = null;
      let hasMore = true;
      
      while (hasMore && allPoints.length < 1000) {
        const scrollResult = await qdrantClient.scroll(collectionName, {
          limit: 100,
          with_payload: true,
          offset: offset,
        });
        
        if (scrollResult.points && scrollResult.points.length > 0) {
          allPoints.push(...scrollResult.points);
          offset = scrollResult.next_page_offset;
          hasMore = !!scrollResult.next_page_offset;
        } else {
          hasMore = false;
        }
      }
      
      // Filter points by document_id on the client side
      const documentPoints = allPoints.filter(
        (p: any) => p.payload?.document_id === documentId
      );
      
      if (documentPoints.length === 0) {
        return NextResponse.json(
          { error: 'Document not found' },
          { status: 404 }
        );
      }
      
      // Extract and combine all chunks in order
      chunks = documentPoints
        .sort((a: any, b: any) => a.payload?.chunk_index - b.payload?.chunk_index)
        .map((p: any) => p.payload?.content || '')
        .filter(Boolean);
      
      fullText = chunks.join('\n\n');
      
    } catch (qdrantError: any) {
      console.error('Qdrant scroll error:', qdrantError);
      return NextResponse.json(
        { error: 'Failed to retrieve document from Qdrant: ' + qdrantError.message },
        { status: 500 }
      );
    }

    // Use Groq to generate summary
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that creates concise, informative summaries of documents. Provide key points, main ideas, and important details.',
          },
          {
            role: 'user',
            content: `Please provide a comprehensive summary of the following document:\n\n${fullText.substring(0, 8000)}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content || 'Unable to generate summary';

    return NextResponse.json({
      success: true,
      documentId,
      chunksCount: chunks.length,
      summary,
    });
  } catch (error) {
    console.error('Summarize error:', error);
    return NextResponse.json(
      {
        error: 'Server error: ' + (error instanceof Error ? error.message : 'Unknown error'),
      },
      { status: 500 }
    );
  }
}

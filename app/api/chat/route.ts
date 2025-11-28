import { NextRequest } from "next/server";
import { searchRelevantChunks } from "@/lib/vectorStore";

interface ChatRequest {
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

/**
 * Main chat endpoint - streams responses from Groq API with document context
 * Searches vector database for relevant chunks and includes them in the prompt
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { messages }: ChatRequest = await request.json();

    if (!messages?.length) {
      return new Response(JSON.stringify({ error: "No messages provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!process.env.GROQ_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Groq API key not configured" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Get the user's latest question to search for relevant documents
    const userQuery = messages[messages.length - 1].content;

    // Search for relevant document chunks from vector database
    let relevantContext = "";
    try {
      const chunks = (await searchRelevantChunks(
        userQuery,
        5,
        undefined,
        true
      )) as any[];
      if (chunks.length > 0) {
        // Build context with source information
        const contextParts = chunks.map((chunk) => {
          const sourceType =
            chunk.fileType === "audio"
              ? "audio transcription"
              : chunk.fileType === "image"
              ? "image description"
              : chunk.fileType === "pdf"
              ? "PDF document"
              : "document";
          return `[Source: ${sourceType} - ${chunk.filename}]\n${chunk.content}`;
        });
        relevantContext = contextParts.join("\n\n---\n\n");
        console.log(`Found ${chunks.length} relevant chunks for query`);
      }
    } catch (error) {
      console.warn("Vector search failed, continuing without context:", error);
      // Continue without context - the LLM can still answer from general knowledge
    }

    // Build system message with context if available
    let systemMessage = "You are a helpful AI assistant.";
    if (relevantContext) {
      systemMessage = `You are a helpful AI assistant. Use the following context from the user's documents to answer their questions accurately. If the context doesn't contain relevant information, you can use your general knowledge.

Context from documents:
${relevantContext}

Now answer the user's question based on this context.`;
    }

    // Prepare messages with system prompt
    const messagesWithContext = [
      { role: "system" as const, content: systemMessage },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    // Create streaming response from Groq
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const response = await fetch(
            "https://api.groq.com/openai/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
              },
              body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: messagesWithContext,
                temperature: 0.7,
                max_tokens: 1000,
                stream: true,
              }),
            }
          );

          if (!response.ok) {
            const error = await response.text();
            controller.enqueue(
              encoder.encode(`Error: ${response.status} - ${error}`)
            );
            controller.close();
            return;
          }

          const reader = response.body?.getReader();
          if (!reader) {
            controller.enqueue(encoder.encode("Error: No response body"));
            controller.close();
            return;
          }

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") continue;

                try {
                  const json = JSON.parse(data);
                  const content = json.choices?.[0]?.delta?.content || "";
                  if (content) {
                    controller.enqueue(encoder.encode(content));
                  }
                } catch {
                  // Skip invalid JSON
                }
              }
            }
          }

          controller.close();
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `Stream error: ${
                error instanceof Error ? error.message : String(error)
              }`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error:
          "Internal error: " +
          (error instanceof Error ? error.message : "Unknown error"),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

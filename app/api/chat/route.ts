import { NextRequest } from "next/server";
import { searchRelevantChunks } from "@/lib/vectorStore";

interface ChatRequest {
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

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

    // Extract temporal filters from user query using LLM
    let dateFilters: { dateFrom?: string; dateTo?: string } = {};
    try {
      const extractionPrompt = `Extract any date or time references from this query. Today's date is ${
        new Date().toISOString().split("T")[0]
      }.

Query: "${userQuery}"

If the query mentions temporal constraints (e.g., "last week", "uploaded yesterday", "from January", "documents from 2024", "this month"), respond with JSON containing:
- dateFrom: ISO date string (YYYY-MM-DD) for the start date
- dateTo: ISO date string (YYYY-MM-DD) for the end date

If no temporal constraint is mentioned, respond with: {}

Examples:
"documents uploaded last week" -> {"dateFrom": "2024-11-24", "dateTo": "2024-12-01"}
"files from yesterday" -> {"dateFrom": "2024-11-30", "dateTo": "2024-12-01"}
"uploaded in January 2024" -> {"dateFrom": "2024-01-01", "dateTo": "2024-01-31"}
"what did I upload?" -> {}

Respond with ONLY the JSON object, nothing else.`;

      const extractionResponse = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: extractionPrompt }],
            temperature: 0.1,
            max_tokens: 150,
          }),
        }
      );

      if (extractionResponse.ok) {
        const extractionData = await extractionResponse.json();
        const extractedText =
          extractionData.choices?.[0]?.message?.content?.trim() || "{}";

        // Clean up the response to extract just the JSON
        const jsonMatch = extractedText.match(/\{[^}]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.dateFrom || parsed.dateTo) {
            dateFilters = parsed;
            console.log("Extracted temporal filters:", dateFilters);
          }
        }
      }
    } catch (error) {
      console.warn("Failed to extract temporal filters:", error);
      // Continue without temporal filters
    }

    // Search for relevant document chunks from vector database
    let relevantContext = "";
    try {
      const searchOptions =
        Object.keys(dateFilters).length > 0 ? dateFilters : undefined;

      const chunks = (await searchRelevantChunks(
        userQuery,
        5,
        searchOptions,
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
        console.log(
          `Found ${chunks.length} relevant chunks for query${
            searchOptions ? " (with temporal filters)" : ""
          }`
        );
      }
    } catch (error) {
      console.warn("Vector search failed, continuing without context:", error);
      // Continue without context - the LLM can still answer from general knowledge
    }

    // Build system message with context if available
    let systemMessage = `
You are Second Brain — an advanced AI assistant designed to retrieve, reason over, and connect information across the user's entire knowledge base.

Your capabilities:
- Retrieve and use context from the user’s documents, including temporal information (timestamps, chronology, historical sequences, dated notes).
- Link insights across multiple documents, even when they are related indirectly.
- Synthesize information into clear, structured, actionable responses.
- Ground all answers in the retrieved context whenever relevant.
- If the retrieved context does NOT contain relevant information, fall back to general knowledge — but explicitly state that the stored context was not useful.
- Avoid hallucinations at all costs; do not invent facts not supported by context or general knowledge.
- If the user's question is ambiguous or missing detail, request clarification.

Answer format:
- Be precise, logical, and concise.
- When using context, reference or restate the relevant parts clearly.
- Preserve chronology when answering temporal questions.
- Provide deeper insights when multiple documents relate to the query.
- If delivering a complex answer, use headings, bullet points, or numbered steps for clarity.
`;

    if (relevantContext) {
      systemMessage = `
You are Second Brain — an advanced AI assistant designed to retrieve, reason over, and connect information across the user's personal knowledge base.

Use the following context extracted from the user’s documents to answer the question as accurately and insightfully as possible. 
If the context contains relevant information, you MUST ground your answer in it. 
If the context is irrelevant or insufficient, say so clearly and then rely on your general knowledge.

Context from documents:
${relevantContext}

Instructions for reasoning:
- Identify temporal signals (dates, timestamps, sequence markers) and use them when relevant.
- Link related concepts across different documents.
- Avoid hallucinations; do not fabricate information not found in context or your general world knowledge.
- Produce a structured, helpful answer with clear reasoning.
- If multiple interpretations are possible, present them and explain the differences.
- If the question is unclear, ask the user to clarify.

Now answer the user’s question using the above context and reasoning guidelines.
`;
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

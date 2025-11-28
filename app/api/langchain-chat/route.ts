import { NextRequest } from "next/server";
import { searchRelevantChunks } from "@/lib/vectorStore";

interface ChatRequest {
  messages: Array<{
    id?: string;
    role: "user" | "assistant";
    content: string;
  }>;
}

export const runtime = "nodejs";

// This route uses dynamic imports so the app won't fail if `langchain` isn't installed yet.
export async function POST(request: NextRequest) {
  try {
    const { messages }: ChatRequest = await request.json();
    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: "No messages provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userQuery = messages[messages.length - 1].content;

    // Use the existing vectorStore helper to get relevant chunks (this is fast and already implemented)
    let relevantChunks: any[] = [];
    try {
      relevantChunks = (await searchRelevantChunks(
        userQuery,
        5,
        undefined,
        true
      )) as any[];
    } catch (err) {
      console.warn(
        "LangChain route: vector search failed, continuing without retrieved context",
        err
      );
      // Continue without vector context - LLM will still work
    }

    const retrievedContext =
      relevantChunks.length > 0
        ? relevantChunks
            .map((chunk) => {
              const sourceType =
                chunk.fileType === "audio"
                  ? "audio transcription"
                  : chunk.fileType === "image"
                  ? "image description"
                  : chunk.fileType === "pdf"
                  ? "PDF document"
                  : "document";
              return `[Source: ${sourceType} - ${chunk.filename}]\n${chunk.content}`;
            })
            .join("\n---\n")
        : "";

    // Build a prompt that includes retrieved context if available
    const systemPrompt = `You are a helpful assistant that answers user questions${
      retrievedContext
        ? " using the provided context when available.\n\nContext:\n" +
          retrievedContext +
          "\n\n"
        : "."
    }`;

    // Try to dynamically load LangChain and an LLM wrapper. If unavailable, fallback to a simple fetch to OpenAI or a canned response.
    try {
      // Helper to try multiple import paths for LangChain modules (some versions change layout)
      const tryImport = async (paths: string[]) => {
        for (const p of paths) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const mod = await import(p);
            return mod;
          } catch (e) {
            // ignore and try next
          }
        }
        throw new Error("Module not found");
      };

      // Try several possible locations for ChatGroq
      const chatGroqPaths = [
        "@langchain/groq",
        "langchain/chat_models/groq",
        "langchain/llms/groq",
      ];

      const chainsPaths = [
        "langchain/chains",
        "langchain/chains/retrieval_qa",
        "langchain/chains/qa",
      ];

      const chatMod = await tryImport(chatGroqPaths);
      const chainsMod = await tryImport(chainsPaths);

      const ChatGroq = chatMod?.ChatGroq || chatMod?.default || chatMod;
      const ConversationalRetrievalQAChain =
        chainsMod?.ConversationalRetrievalQAChain ||
        chainsMod?.default?.ConversationalRetrievalQAChain ||
        chainsMod;

      if (!ChatGroq || !ConversationalRetrievalQAChain) {
        throw new Error(
          "LangChain ChatGroq or ConversationalRetrievalQAChain not found in imported modules"
        );
      }

      // Build a small retriever that adapts your existing `searchRelevantChunks`
      const retriever = {
        async getRelevantDocuments(query: string) {
          try {
            const chunks: string[] = await searchRelevantChunks(query, 5);
            // Return objects that look like LangChain Documents
            return chunks.map((text: string, idx: number) => ({
              pageContent: text,
              metadata: { source: `chunk-${idx}` },
            }));
          } catch (e) {
            console.warn("Retriever wrapper: searchRelevantChunks failed", e);
            return [];
          }
        },
      };

      // Instantiate model (expects GROQ_API_KEY in env)
      const llm = new ChatGroq({
        modelName: "llama-3.3-70b-versatile",
        temperature: 0.2,
      });

      const chain = await ConversationalRetrievalQAChain.fromLLM(
        llm,
        retriever as any,
        { returnSourceDocuments: true }
      );

      const result = await chain.call({
        question: userQuery,
        chat_history: [],
      });

      const answer = result?.text || result?.answer || "";
      const sources = (result?.sourceDocuments || []).map((d: any) => ({
        content: d.pageContent,
        metadata: d.metadata || {},
      }));

      return new Response(JSON.stringify({ answer, sources }), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    } catch (langErr) {
      console.warn(
        "LangChain not available or failed to run (tried multiple import paths):",
        langErr
      );
    }

    // Fallback: If LangChain isn't available, try calling Groq API directly (if key present)
    if (process.env.GROQ_API_KEY) {
      try {
        const chatBody = {
          model: "llama-3.1-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages.map((m) => ({ role: m.role, content: m.content })),
          ],
          temperature: 0.2,
        };

        const res = await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            },
            body: JSON.stringify(chatBody),
          }
        );

        if (!res.ok) {
          const errText = await res.text();
          console.error("Groq API error", res.status, errText);
          throw new Error(`Groq API error: ${res.status}`);
        }

        const data = await res.json();
        const assistantText =
          data?.choices?.[0]?.message?.content ||
          data?.choices?.[0]?.text ||
          data?.choices?.[0]?.delta?.content ||
          "";
        return new Response(
          JSON.stringify({ answer: assistantText, sources: [] }),
          {
            status: 200,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          }
        );
      } catch (openaiErr) {
        console.error("Fallback Groq call failed:", openaiErr);
      }
    }

    // Final fallback: canned reply explaining what to do
    const fallback =
      "I couldn't reach an LLM right now. Please install and configure LangChain with Groq API key (GROQ_API_KEY). In the meantime, try again later.";
    return new Response(JSON.stringify({ answer: fallback, sources: [] }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (error) {
    console.error("LangChain route error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

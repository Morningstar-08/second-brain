"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface UploadedDocument {
  documentId: string;
  filename: string;
  fileType?: string;
  fileSize?: number;
  uploadDate: string;
  chunkCount: number;
  embeddingModel?: string;
}

export default function ChatUI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadedDocuments, setUploadedDocuments] = useState<
    UploadedDocument[]
  >([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [summaries, setSummaries] = useState<{ [key: string]: string }>({});
  const [generatingSummary, setGeneratingSummary] = useState<string | null>(
    null
  );
  const [urlInput, setUrlInput] = useState("");
  const [isScrapingUrl, setIsScrapingUrl] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch documents from Qdrant on mount
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const response = await fetch("/api/documents");
        if (!response.ok) {
          console.error("Failed to fetch documents:", response.statusText);
          return;
        }
        const data = await response.json();
        if (data.success && data.documents) {
          setUploadedDocuments(data.documents);
          // Automatically show sidebar if documents are available
          if (data.documents.length > 0) {
            setShowUpload(true);
          }
        }
      } catch (error) {
        console.error("Error fetching documents:", error);
      }
    };

    fetchDocuments();
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "u") {
        e.preventDefault();
        setShowUpload((s) => !s);
      }
      if (e.ctrlKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const el = document.getElementById("main-input");
        el?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files?.length) return;

    const file = files[0];
    setIsUploading(true);
    setUploadProgress(`Processing ${file.name}...`);

    try {
      let content: string;
      let fileType: "text" | "pdf" | "audio" | "image" = "text";

      // Handle audio files
      if (
        file.type.startsWith("audio/") ||
        /\.(mp3|m4a|wav|ogg|webm|flac)$/i.test(file.name)
      ) {
        fileType = "audio";
        setUploadProgress(`Transcribing ${file.name}...`);

        const formData = new FormData();
        formData.append("file", file);

        const transcribeResponse = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });

        if (!transcribeResponse.ok) {
          const error = await transcribeResponse.json();
          throw new Error(error.error || "Transcription failed");
        }

        const transcribeResult = await transcribeResponse.json();
        if (!transcribeResult.success || !transcribeResult.transcription) {
          throw new Error("Failed to transcribe audio");
        }

        content = transcribeResult.transcription;
        setUploadProgress(`Transcribed ${file.name}`);
      }
      // Handle PDF files
      else if (file.type === "application/pdf") {
        fileType = "pdf";
        try {
          const pdfjsLib = await import("pdfjs-dist");
          if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
          }

          const arrayBuffer = await file.arrayBuffer();
          const loadingTask = pdfjsLib.getDocument({
            data: arrayBuffer,
          });
          const pdf = await loadingTask.promise;

          let extractedText = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
              .map((item: any) => item.str)
              .join(" ");
            extractedText += pageText + "\n\n";
          }

          if (!extractedText.trim()) {
            throw new Error(
              "No text could be extracted from the PDF. The file may be image-based."
            );
          }

          content = extractedText;
          console.log("Extracted PDF text length:", content.length);
        } catch (pdfError) {
          console.error("PDF extraction error:", pdfError);
          throw new Error(
            "Failed to extract text from PDF: " +
              (pdfError instanceof Error ? pdfError.message : "Unknown error")
          );
        }
      }
      // Handle images
      else if (file.type.startsWith("image/")) {
        fileType = "image";
        setUploadProgress(`Analyzing image ${file.name}...`);

        const imageFormData = new FormData();
        imageFormData.append("image", file);

        const analyzeResponse = await fetch("/api/analyze-image", {
          method: "POST",
          body: imageFormData,
        });

        if (!analyzeResponse.ok) {
          const error = await analyzeResponse.json();
          throw new Error(error.error || "Image analysis failed");
        }

        const analyzeResult = await analyzeResponse.json();
        if (!analyzeResult.success || !analyzeResult.searchableText) {
          throw new Error("Failed to analyze image");
        }

        content = analyzeResult.searchableText;
        setUploadProgress(`Analyzed ${file.name}`);
      }
      // Handle DOCX files
      else if (
        file.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        file.name.toLowerCase().endsWith(".docx")
      ) {
        fileType = "text";
        setUploadProgress(`Extracting text from ${file.name}...`);

        try {
          const mammoth = await import("mammoth");
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          content = result.value;

          if (!content.trim()) {
            throw new Error("No text could be extracted from the DOCX file.");
          }

          console.log("Extracted DOCX text length:", content.length);
        } catch (docxError) {
          console.error("DOCX extraction error:", docxError);
          throw new Error(
            "Failed to extract text from DOCX: " +
              (docxError instanceof Error ? docxError.message : "Unknown error")
          );
        }
      }
      // Handle text files
      else {
        content = await file.text();
      }

      if (!content.trim()) {
        throw new Error("The file appears to be empty or contains no text.");
      }

      setUploadProgress(`Storing ${file.name}...`);

      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          filename: file.name,
          type: fileType,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const result = await response.json();

      // Check if Qdrant storage failed
      if (!result.success || !result.embeddingStatus?.success) {
        setUploadProgress(
          `File uploaded but not stored in database. ${
            result.embeddingStatus?.message ||
            "Start Qdrant: docker run -p 6333:6333 qdrant/qdrant"
          }`
        );
        setTimeout(() => setUploadProgress(""), 8000);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setIsUploading(false);
        return;
      }

      const newDoc: UploadedDocument = {
        documentId: result.documentId,
        filename: result.filename,
        fileType: fileType,
        chunkCount: result.chunksCount,
        uploadDate: new Date().toISOString(),
      };

      setUploadedDocuments((prev) => [newDoc, ...prev]);
      setUploadProgress(
        `Successfully uploaded ${file.name} (${result.chunksCount} chunks)`
      );

      setTimeout(() => setUploadProgress(""), 3000);
    } catch (error) {
      console.error("Upload error:", error);
      setUploadProgress(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      setTimeout(() => setUploadProgress(""), 8000);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleUrlScrape = async () => {
    if (!urlInput.trim()) return;

    setIsScrapingUrl(true);
    setUploadProgress(`Scraping ${urlInput}...`);

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Scraping failed");
      }

      const result = await response.json();

      if (!result.success || !result.content) {
        throw new Error("No content could be extracted from the URL");
      }

      setUploadProgress(`Storing web content...`);

      // Ingest the scraped content
      const ingestResponse = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: result.content,
          filename: result.title || urlInput,
          type: "text",
        }),
      });

      if (!ingestResponse.ok) {
        const error = await ingestResponse.json();
        throw new Error(error.error || "Upload failed");
      }

      const ingestResult = await ingestResponse.json();

      if (!ingestResult.success || !ingestResult.embeddingStatus?.success) {
        setUploadProgress(
          `Content scraped but not stored in database. ${
            ingestResult.embeddingStatus?.message || ""
          }`
        );
        setTimeout(() => setUploadProgress(""), 8000);
        setUrlInput("");
        setIsScrapingUrl(false);
        return;
      }

      const newDoc: UploadedDocument = {
        documentId: ingestResult.documentId,
        filename: result.title || urlInput,
        fileType: "text",
        chunkCount: ingestResult.chunksCount,
        uploadDate: new Date().toISOString(),
      };

      setUploadedDocuments((prev) => [newDoc, ...prev]);
      setUploadProgress(
        `Successfully scraped and stored ${result.title || "web page"} (${
          ingestResult.chunksCount
        } chunks)`
      );
      setUrlInput("");

      setTimeout(() => setUploadProgress(""), 3000);
    } catch (error) {
      console.error("Scraping error:", error);
      setUploadProgress(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      setTimeout(() => setUploadProgress(""), 8000);
    } finally {
      setIsScrapingUrl(false);
    }
  };

  const handleGenerateSummary = async (
    docId: string,
    filename: string
  ): Promise<void> => {
    setGeneratingSummary(docId);

    try {
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: docId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate summary");
      }

      const result = await response.json();
      setSummaries((prev) => ({
        ...prev,
        [docId]: result.summary,
      }));

      // Add summary to chat
      const summaryMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: ` **Summary of ${filename}**\n\n${result.summary}`,
      };
      setMessages((prev) => [...prev, summaryMessage]);
    } catch (error) {
      console.error("Summary error:", error);
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      setUploadProgress(`${errorMsg}`);
      setTimeout(() => setUploadProgress(""), 8000);
    } finally {
      setGeneratingSummary(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          context: "", // Will be populated with relevant documents
        }),
      });

      if (!response.ok) throw new Error("Failed to get response");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";

      const assistantId = (Date.now() + 1).toString();
      let messageAdded = false;

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        assistantMessage += decoder.decode(value);

        if (!messageAdded) {
          setMessages((prev) => [
            ...prev,
            { id: assistantId, role: "assistant", content: assistantMessage },
          ]);
          messageAdded = true;
        } else {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId
                ? { ...msg, content: assistantMessage }
                : msg
            )
          );
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Sorry, there was an error processing your request.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full h-screen bg-neutral-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/90 backdrop-blur supports-backdrop-filter:bg-neutral-900/70">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-wide text-neutral-100">
              Second Brain
            </h1>
            <p className="text-neutral-400 text-xs mt-1">
              Context-aware knowledge assistant
            </p>
          </div>
          <div className="flex gap-3">
            <span className="text-xs text-neutral-500">
              Ctrl+U: Toggle upload
            </span>
            <span className="text-xs text-neutral-500">
              Ctrl+K: Focus input
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 overflow-hidden flex max-w-5xl w-full mx-auto px-6 gap-6 py-6">
        {/* Sidebar for uploads */}
        {showUpload && (
          <aside className="w-72 bg-neutral-900/60 backdrop-blur rounded-lg border border-neutral-800 overflow-y-auto p-5 flex flex-col shadow-sm">
            <h3 className="text-neutral-200 font-medium mb-4 tracking-wide">
              Upload Content
            </h3>

            {/* Upload Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isScrapingUrl}
              className="bg-neutral-700 hover:bg-neutral-600 disabled:bg-neutral-800 disabled:cursor-not-allowed text-neutral-100 px-4 py-2 rounded-md transition-colors text-sm font-medium mb-4 w-full border border-neutral-600"
            >
              {isUploading ? "Processing…" : "Choose File"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              accept=".pdf,.txt,.md,.doc,.docx,.mp3,.m4a,.wav,.ogg,.webm,.flac,.jpg,.jpeg,.png,.gif,.webp"
              className="hidden"
              disabled={isUploading || isScrapingUrl}
            />

            {/* URL Input */}
            <div className="mb-5">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUrlScrape()}
                placeholder="https://example.com"
                disabled={isUploading || isScrapingUrl}
                className="w-full bg-neutral-800 text-neutral-100 placeholder-neutral-500 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 border border-neutral-700"
              />
              <button
                onClick={handleUrlScrape}
                disabled={!urlInput.trim() || isUploading || isScrapingUrl}
                className="mt-2 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded-md transition-colors text-sm font-medium w-full shadow-sm"
              >
                {isScrapingUrl ? "Scraping…" : "Scrape URL"}
              </button>
            </div>

            {/* Upload Progress */}
            {uploadProgress && (
              <div
                className="bg-neutral-800 text-neutral-200 text-xs p-3 rounded-md mb-4 border border-neutral-700"
                role="status"
                aria-live="polite"
              >
                {uploadProgress}
              </div>
            )}

            {/* Documents List */}
            <div className="flex-1 overflow-y-auto">
              <h4 className="text-neutral-400 text-[10px] font-semibold tracking-wider uppercase mb-3">
                Uploaded Items ({uploadedDocuments.length})
              </h4>
              {uploadedDocuments.length === 0 ? (
                <p className="text-neutral-500 text-xs">
                  No items uploaded yet
                </p>
              ) : (
                <div className="space-y-2">
                  {uploadedDocuments.map((doc) => (
                    <div
                      key={doc.documentId}
                      className="bg-neutral-800/70 border border-neutral-700 rounded-md p-3 text-xs hover:border-neutral-600 transition-colors"
                    >
                      <div className="text-neutral-200 font-medium truncate">
                        {doc.filename}
                      </div>
                      <div className="text-neutral-400 mt-1">
                        {doc.chunkCount} chunks
                      </div>
                      <div className="text-neutral-500 text-[10px] mt-1">
                        {new Date(doc.uploadDate).toLocaleString()}
                      </div>
                      <button
                        onClick={() =>
                          handleGenerateSummary(doc.documentId, doc.filename)
                        }
                        disabled={generatingSummary === doc.documentId}
                        className="mt-2 bg-neutral-700 hover:bg-neutral-600 disabled:bg-neutral-800 disabled:cursor-not-allowed text-neutral-100 px-3 py-1 rounded-sm text-[11px] w-full transition-colors border border-neutral-600"
                      >
                        {generatingSummary === doc.documentId
                          ? "Summarizing…"
                          : "Generate Summary"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Chat Area */}
        <main className="flex-1 flex flex-col bg-neutral-900/40 rounded-lg border border-neutral-800 backdrop-blur p-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="text-6xl mb-4"></div>
                <h2 className="text-2xl font-semibold text-neutral-100 mb-3">
                  Welcome to Second Brain
                </h2>
                <p className="text-neutral-400 mb-6 max-w-sm leading-relaxed">
                  Upload documents, audio, images, or paste URLs. Ask questions
                  about any content you've added — everything becomes searchable
                  context.
                </p>
                <button
                  onClick={() => setShowUpload(!showUpload)}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-md transition-colors text-sm font-medium shadow-sm"
                  aria-label="Open upload sidebar"
                >
                  Add Content
                </button>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-md lg:max-w-2xl px-5 py-4 rounded-md border ${
                        message.role === "user"
                          ? "bg-blue-600/90 border-blue-500/40 text-white shadow-sm"
                          : "bg-neutral-800/70 border-neutral-700 text-neutral-100"
                      }`}
                    >
                      {message.role === "assistant" ? (
                        <div className="prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => (
                                <p className="mb-2 last:mb-0">{children}</p>
                              ),
                              h1: ({ children }) => (
                                <h1 className="text-xl font-bold mb-2">
                                  {children}
                                </h1>
                              ),
                              h2: ({ children }) => (
                                <h2 className="text-lg font-bold mb-2">
                                  {children}
                                </h2>
                              ),
                              h3: ({ children }) => (
                                <h3 className="text-base font-bold mb-1">
                                  {children}
                                </h3>
                              ),
                              ul: ({ children }) => (
                                <ul className="list-disc ml-4 mb-2">
                                  {children}
                                </ul>
                              ),
                              ol: ({ children }) => (
                                <ol className="list-decimal ml-4 mb-2">
                                  {children}
                                </ol>
                              ),
                              li: ({ children }) => (
                                <li className="mb-1">{children}</li>
                              ),
                              strong: ({ children }) => (
                                <strong className="font-bold text-white">
                                  {children}
                                </strong>
                              ),
                              code: ({ children }) => (
                                <code className="bg-slate-800 px-1 rounded">
                                  {children}
                                </code>
                              ),
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        message.content
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex items-center space-x-2 text-slate-400">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                    <div
                      className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0.4s" }}
                    ></div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input Area */}
          <div className="border-t border-neutral-800 px-6 py-5 bg-neutral-900/70 rounded-b-lg">
            <div className="flex gap-3">
              <button
                onClick={() => setShowUpload(!showUpload)}
                className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-4 py-2 rounded-md text-sm transition-colors flex items-center gap-2 border border-neutral-700"
                aria-label="Toggle upload sidebar"
                title="Toggle upload sidebar"
              >
                Upload
              </button>
              <form onSubmit={handleSubmit} className="flex-1 flex gap-3">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask anything about your uploaded content..."
                  id="main-input"
                  className="flex-1 bg-neutral-800 text-neutral-100 placeholder-neutral-500 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-neutral-700 text-sm"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white px-6 py-2 rounded-md transition-colors font-medium text-sm shadow-sm"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

# Second Brain

An AI-powered knowledge management system that ingests documents, audio, images, and web content, then enables intelligent Q&A using RAG (Retrieval-Augmented Generation).

## What It Does

Upload any content (PDFs, DOCX, text files, audio, images, web URLs) and ask questions about it. The system chunks documents, generates embeddings, stores them in a vector database, and retrieves relevant context for accurate AI responses.

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS
- **LLM**: Groq (llama-3.3-70b-versatile)
- **Embeddings**: Google Gemini (text-embedding-004)
- **Vector DB**: Qdrant Cloud
- **Transcription**: Groq Whisper
- **Image Analysis**: Google Gemini Vision
- **Web Scraping**: Cheerio
- **Document Processing**: Mammoth (DOCX), PDF.js (PDF)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create `.env.local`:

```env
GROQ_API_KEY=your-groq-api-key
GEMINI_API_KEY=your-gemini-api-key
QDRANT_URL=your-qdrant-cloud-url
QDRANT_API_KEY=your-qdrant-api-key
```

**Get API Keys:**

- Groq: https://console.groq.com
- Gemini: https://aistudio.google.com/apikey
- Qdrant: https://cloud.qdrant.io

### 3. Run

```bash
npm run dev
```

Open http://localhost:3000

## How It Works

1. **Upload**: Drop files, paste URLs, or record audio
2. **Process**: Content is extracted, chunked (1000 chars), and embedded (768-dim vectors)
3. **Store**: Chunks stored in Qdrant with metadata (filename, type, timestamp)
4. **Query**: Questions trigger semantic search for relevant chunks
5. **Generate**: Groq LLM receives context + question, streams response

## Features

- Multi-modal input (text, PDF, DOCX, audio, images, URLs)
- Semantic search with Gemini embeddings
- Streaming chat responses
- Document management (view, delete)
- Audio transcription
- Image analysis
- Web content extraction

## API Routes

- **POST `/api/ingest`**: Upload and process documents
- **POST `/api/chat`**: RAG-powered Q&A with streaming
- **POST `/api/transcribe`**: Audio to text (Groq Whisper)
- **POST `/api/analyze-image`**: Image analysis (Gemini Vision)
- **POST `/api/scrape`**: Extract content from URLs
- **POST `/api/summarize`**: Summarize documents
- **GET/DELETE `/api/documents/[id]`**: Manage documents

## Project Structure

```
app/
├── api/                    # API endpoints
│   ├── chat/              # RAG chat
│   ├── ingest/            # Document processing
│   ├── transcribe/        # Audio transcription
│   ├── analyze-image/     # Image analysis
│   ├── scrape/            # Web scraping
│   └── documents/         # Document CRUD
├── components/
│   └── chat.tsx           # Main UI
└── layout.tsx
lib/
└── vectorStore.ts         # Qdrant operations
```

## Deployment

```bash
npm run build
npm start
```

Deploy to Vercel and add environment variables in the dashboard.

## License

MIT

# 🧠 Second Brain - AI Companion

A foundational prototype for a personal AI companion that can ingest, understand, and reason about your information. Build a second brain that has perfect memory of everything you've shown it.

## ✨ Features

- **📤 Multi-Modal Ingestion**: Upload documents (PDF, text) and audio files
- **🤖 Intelligent Q&A**: Ask questions about your uploaded content and get AI-powered answers
- **💾 Perfect Memory**: The system maintains context from all your documents
- **🔄 Real-time Streaming**: Watch responses appear token-by-token as they're generated
- **🎨 Clean UI**: Beautiful, responsive chat interface built with Tailwind CSS
- **⚡ Fast Processing**: Asynchronous pipeline for efficient document processing

## 🏗️ Architecture

### Backend Services
- **`/api/ingest`**: Processes documents (PDF/Text) with text splitting and chunking
- **`/api/transcribe`**: Converts audio to text using OpenAI Whisper API
- **`/api/chat`**: Q&A endpoint with LLM integration and streaming responses

### Frontend
- **Chat Interface**: Real-time chat with token-by-token streaming
- **Document Upload**: Sidebar for uploading documents and audio
- **Message Display**: Beautiful message bubbles with user/assistant differentiation

## 📋 Prerequisites

- Node.js 18+ installed
- An OpenAI API key (for ChatGPT and Whisper)
- Optional: Supabase account (for vector database)

### LangChain + Supabase (Recommended)

- Install LangChain and the Supabase client to enable retrieval-augmented generation using your existing vector DB:

```bash
npm install langchain @supabase/supabase-js openai
```

- Environment variables used by the LangChain + Supabase flow (add to `.env.local`):

```env
OPENAI_API_KEY=sk-your-api-key-here
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# (Optional server-side) SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# (Optional if using Hugging Face) HUGGINGFACE_API_KEY=hf_your_token_here
```

Start with a simple LangChain route (`/api/langchain-chat`) that uses your Supabase vectors as a retriever and `ChatOpenAI` as the LLM. This approach keeps retrieval logic separate from model choice so you can later swap OpenAI for Hugging Face or a local model.

## 🚀 Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Copy the example environment file and fill in your API keys:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your credentials:

```env
OPENAI_API_KEY=sk-your-api-key-here
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

**Getting API Keys:**

- **OpenAI API Key**: Visit https://platform.openai.com/api-keys
- **Supabase**: Create a project at https://supabase.com (for vector database)

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📚 Usage

### Uploading Documents

1. Click the **📤 Upload Content** button
2. Select your document (PDF, text, or audio)
3. The system will process and chunk it automatically
4. Documents are ready for querying

### Asking Questions

1. Type your question in the input field
2. Hit **Send** or press Enter
3. Watch the AI response stream in real-time
4. The AI draws context from all your uploaded documents

### Example Queries

- "What were the key points discussed in the meeting?"
- "Summarize the main ideas from the documents I uploaded"
- "What did the article say about quantum computing?"

## 🔧 API Endpoints

### POST `/api/ingest`
Processes and stores documents for retrieval.

**Request:**
```json
{
  "content": "base64-encoded file content",
  "filename": "document.pdf",
  "type": "pdf" | "text"
}
```

### POST `/api/transcribe`
Converts audio to text using Whisper API.

**Request:** (FormData)
- `file`: Audio file (WAV, MP3, M4A, etc.)

**Response:**
```json
{
  "success": true,
  "transcription": "Transcribed text here...",
  "filename": "audio.wav"
}
```

### POST `/api/chat`
Generates AI responses with streaming.

**Request:**
```json
{
  "messages": [
    { "role": "user", "content": "Your question" }
  ],
  "context": "Optional retrieved context from knowledge base"
}
```

**Response:** Streaming text (SSE)

## 🛠️ Technology Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Node.js
- **LLM**: OpenAI GPT-4 Turbo, Whisper API
- **Text Processing**: LangChain, RecursiveCharacterTextSplitter
- **Vector Database**: Supabase (optional)
- **Utilities**: pdf-parse for PDF extraction

## 📦 Project Structure

```
second-brain/
├── app/
│   ├── api/
│   │   ├── chat/
│   │   │   └── route.ts        # Q&A endpoint with streaming
│   │   ├── ingest/
│   │   │   └── route.ts        # Document ingestion
│   │   └── transcribe/
│   │       └── route.ts        # Audio transcription
│   ├── components/
│   │   └── chat.tsx            # Main chat interface
│   ├── layout.tsx
│   ├── page.tsx                # Home page
│   └── globals.css
├── package.json
├── tsconfig.json
└── .env.local.example
```

## 🔜 Future Enhancements

- [ ] Vector database integration for semantic search
- [ ] Support for web content ingestion
- [ ] Conversation history persistence
- [ ] Document management UI
- [ ] Support for multiple LLM providers
- [ ] Rate limiting and authentication
- [ ] Advanced document parsing (tables, images)

## 🐛 Troubleshooting

### "Cannot find module '@langchain/textsplitters'"
Ensure you've installed all dependencies:
```bash
npm install
```

### "OPENAI_API_KEY is not set"
Check that your `.env.local` file has the correct API key and it's accessible to the application.

### Audio transcription fails
- Ensure the audio file is under 25 MB
- Use a supported format (WAV, MP3, M4A, FLAC, OGG)
- Verify your OpenAI API key has Whisper access

## 📖 Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Vercel AI SDK](https://sdk.vercel.ai)
- [OpenAI API](https://platform.openai.com/docs)
- [LangChain](https://js.langchain.com)

## 🚀 Deployment

Deploy your Second Brain on Vercel with one click:

```bash
npm run build
npm start
```

Or deploy directly to Vercel:
- Push to GitHub
- Connect to Vercel at https://vercel.com
- Add environment variables in Vercel dashboard

## 📝 License

MIT License - feel free to use this project for personal or commercial purposes.

## 🤝 Contributing

Contributions are welcome! Feel free to submit issues and pull requests.

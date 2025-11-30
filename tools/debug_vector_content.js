const { QdrantClient } = require("@qdrant/js-client-rest");

// Hardcode for testing
const qdrantUrl = process.env.QDRANT_URL;
const qdrantApiKey = process.env.QDRANT_API_KEY;
const collectionName = "documents";

const qdrantClient = new QdrantClient({
  url: qdrantUrl,
  apiKey: qdrantApiKey,
});

async function debugVectorContent() {
  try {
    console.log("Fetching sample chunks from vector database...\n");

    const scrollResult = await qdrantClient.scroll(collectionName, {
      limit: 3,
      with_payload: true,
      with_vector: false,
    });

    if (!scrollResult.points || scrollResult.points.length === 0) {
      console.log("No chunks found in the database");
      return;
    }

    console.log(`Found ${scrollResult.points.length} chunks\n`);

    scrollResult.points.forEach((point, index) => {
      console.log(`\n--- Chunk ${index + 1} ---`);
      console.log(`Document ID: ${point.payload?.document_id}`);
      console.log(`Filename: ${point.payload?.filename}`);
      console.log(`Chunk Index: ${point.payload?.chunk_index}`);
      console.log(`Upload Date: ${point.payload?.uploadDate}`);
      console.log(`Embedding Model: ${point.payload?.embedding_model}`);
      console.log(`\nContent Preview (first 200 chars):`);
      const content = point.payload?.content || "";
      console.log(content.substring(0, 200));
      console.log(`\nContent Type: ${typeof content}`);
      console.log(`Content Length: ${content.length}`);

      // Check for encoding issues
      const hasWeirdChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(
        content
      );
      console.log(`Has control characters: ${hasWeirdChars}`);

      // Show raw bytes of first 50 chars
      if (content.length > 0) {
        console.log(`\nFirst 50 chars (char codes):`);
        const charCodes = [];
        for (let i = 0; i < Math.min(50, content.length); i++) {
          charCodes.push(content.charCodeAt(i));
        }
        console.log(charCodes.join(", "));
      }
    });
  } catch (error) {
    console.error("Error:", error);
  }
}

debugVectorContent();

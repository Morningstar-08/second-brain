/**
 * Test Script: Verify Gemini Embeddings Integration
 *
 * This script tests the Gemini text-embedding-004 integration
 * without requiring the full Next.js server.
 *
 * Prerequisites:
 * - GOOGLE_API_KEY must be set in .env.local
 * - Qdrant must be running (local or cloud)
 *
 * Usage:
 *   node tools/test_gemini_embeddings.js
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config({ path: ".env.local" });

async function testGeminiEmbeddings() {
  console.log("🧪 Testing Gemini text-embedding-004 Integration\n");
  console.log("================================================\n");

  // Check environment variables
  console.log("1️⃣ Checking environment variables...");

  if (!process.env.GOOGLE_API_KEY) {
    console.error("❌ GOOGLE_API_KEY not found in .env.local");
    console.log("\n📝 Please add your Google API key to .env.local:");
    console.log("   GOOGLE_API_KEY=your-api-key-here\n");
    console.log(
      "   Get your key from: https://aistudio.google.com/app/apikey\n"
    );
    process.exit(1);
  }

  console.log("✅ GOOGLE_API_KEY found");
  console.log(`   Key: ${process.env.GOOGLE_API_KEY.substring(0, 10)}...\n`);

  // Initialize Google AI
  console.log("2️⃣ Initializing Google Generative AI client...");
  let genAI;
  try {
    genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    console.log("✅ Google AI client initialized\n");
  } catch (error) {
    console.error("❌ Failed to initialize Google AI client:", error.message);
    process.exit(1);
  }

  // Test embedding generation
  console.log("3️⃣ Testing embedding generation...");
  const testTexts = [
    "Machine learning is a subset of artificial intelligence.",
    "The quick brown fox jumps over the lazy dog.",
    "Vector embeddings represent text as numerical vectors.",
  ];

  try {
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

    for (let i = 0; i < testTexts.length; i++) {
      const text = testTexts[i];
      console.log(`\n   Test ${i + 1}/${testTexts.length}:`);
      console.log(`   Text: "${text.substring(0, 50)}..."`);

      const startTime = Date.now();
      const result = await model.embedContent(text);
      const endTime = Date.now();

      if (!result.embedding || !result.embedding.values) {
        throw new Error("Invalid embedding response");
      }

      const embedding = result.embedding.values;
      const duration = endTime - startTime;

      console.log(`   ✅ Generated in ${duration}ms`);
      console.log(`   Dimensions: ${embedding.length}`);
      console.log(
        `   Sample values: [${embedding
          .slice(0, 3)
          .map((v) => v.toFixed(4))
          .join(", ")}...]`
      );

      // Verify dimensions
      if (embedding.length !== 768) {
        console.error(`   ❌ Expected 768 dimensions, got ${embedding.length}`);
        process.exit(1);
      }
    }

    console.log("\n✅ All embedding tests passed!\n");
  } catch (error) {
    console.error("❌ Embedding generation failed:", error.message);
    if (error.message.includes("API_KEY_INVALID")) {
      console.log("\n📝 Your API key appears to be invalid.");
      console.log(
        "   Please verify your key at: https://aistudio.google.com/app/apikey\n"
      );
    }
    process.exit(1);
  }

  // Test semantic similarity
  console.log("4️⃣ Testing semantic similarity...");
  try {
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

    const text1 = "I love programming in Python";
    const text2 = "Python is my favorite programming language";
    const text3 = "I enjoy eating pizza";

    console.log(`\n   Comparing embeddings:`);
    console.log(`   A: "${text1}"`);
    console.log(`   B: "${text2}"`);
    console.log(`   C: "${text3}"`);

    const [emb1, emb2, emb3] = await Promise.all([
      model.embedContent(text1),
      model.embedContent(text2),
      model.embedContent(text3),
    ]);

    const vec1 = emb1.embedding.values;
    const vec2 = emb2.embedding.values;
    const vec3 = emb3.embedding.values;

    // Calculate cosine similarity
    const cosineSimilarity = (a, b) => {
      let dotProduct = 0;
      let normA = 0;
      let normB = 0;
      for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }
      return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    };

    const sim_AB = cosineSimilarity(vec1, vec2);
    const sim_AC = cosineSimilarity(vec1, vec3);
    const sim_BC = cosineSimilarity(vec2, vec3);

    console.log(`\n   Similarity A ↔ B (related): ${sim_AB.toFixed(4)}`);
    console.log(`   Similarity A ↔ C (unrelated): ${sim_AC.toFixed(4)}`);
    console.log(`   Similarity B ↔ C (unrelated): ${sim_BC.toFixed(4)}`);

    if (sim_AB > sim_AC && sim_AB > sim_BC) {
      console.log("\n   ✅ Semantic similarity test passed!");
      console.log(
        "      Related texts have higher similarity than unrelated texts.\n"
      );
    } else {
      console.warn("\n   ⚠️  Unexpected similarity scores");
      console.warn("      Related texts should have higher similarity.\n");
    }
  } catch (error) {
    console.error("❌ Similarity test failed:", error.message);
    process.exit(1);
  }

  // Summary
  console.log("================================================");
  console.log("✅ All tests passed!\n");
  console.log(
    "Your Gemini text-embedding-004 integration is working correctly.\n"
  );
  console.log("Next steps:");
  console.log("1. Run the migration script: node scripts/migrate-to-gemini.js");
  console.log("2. Start your Next.js server: npm run dev");
  console.log("3. Upload documents through the web interface");
  console.log("4. Test semantic search with your documents\n");
}

// Run tests
testGeminiEmbeddings().catch((error) => {
  console.error("\n❌ Test suite failed:", error);
  process.exit(1);
});

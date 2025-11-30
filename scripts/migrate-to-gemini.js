/**
 * Migration Script: Migrate from old embeddings to Gemini text-embedding-004
 *
 * This script helps you migrate your Qdrant collection from 384-dimensional vectors
 * to 768-dimensional vectors required by Gemini text-embedding-004.
 *
 * WARNING: This will delete your existing collection and create a new one.
 * Make sure you have your original documents backed up.
 *
 * Usage:
 *   node scripts/migrate-to-gemini.js
 */

const { QdrantClient } = require("@qdrant/js-client-rest");
require("dotenv").config({ path: ".env.local" });

const qdrantUrl = process.env.QDRANT_URL || "http://localhost:6333";
const qdrantApiKey = process.env.QDRANT_API_KEY;
const collectionName = "documents";

async function migrate() {
  console.log("Starting migration to Gemini text-embedding-004...\n");

  const client = new QdrantClient({
    url: qdrantUrl,
    apiKey: qdrantApiKey,
  });

  try {
    // Check if collection exists
    let collectionExists = false;
    try {
      const info = await client.getCollection(collectionName);
      collectionExists = true;
      console.log("Found existing collection:", collectionName);
      console.log("  Current vector size:", info.config?.params?.vectors?.size);
      console.log("  Points count:", info.points_count);
      console.log("");
    } catch (e) {
      console.log("No existing collection found\n");
    }

    if (collectionExists) {
      console.log("WARNING: This will delete the existing collection!");
      console.log("   You will need to re-upload all your documents.\n");

      console.log("Deleting old collection...");
      await client.deleteCollection(collectionName);
      console.log("Old collection deleted\n");
    }

    console.log("Creating new collection with 768-dimensional vectors...");
    await client.createCollection(collectionName, {
      vectors: {
        size: 768,
        distance: "Cosine",
      },
    });
    console.log("New collection created successfully!\n");

    const newInfo = await client.getCollection(collectionName);
    console.log("Migration complete!");
    console.log("   Collection:", collectionName);
    console.log("   Vector dimensions:", newInfo.config?.params?.vectors?.size);
    console.log(
      "   Distance metric:",
      newInfo.config?.params?.vectors?.distance
    );
    console.log("\nNext steps:");
    console.log(
      "   1. Make sure GOOGLE_API_KEY is set in your .env.local file"
    );
    console.log("   2. Re-upload your documents through the web interface");
    console.log(
      "   3. Your documents will now use Gemini text-embedding-004 embeddings\n"
    );
  } catch (error) {
    console.error("Migration failed:", error.message);
    process.exit(1);
  }
}

migrate();

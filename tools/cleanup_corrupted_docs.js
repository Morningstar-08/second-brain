const { QdrantClient } = require("@qdrant/js-client-rest");

// Hardcode for testing
const qdrantUrl =
  "https://6ebb2b60-e0b2-469c-a6a9-546edb4cd31f.us-west-1-0.aws.cloud.qdrant.io:6333";
const qdrantApiKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIn0.vNXXKZblGohMhPkhtQQ1NUi1ZP42nYMaAUFgGauX_8w";

const qdrantClient = new QdrantClient({
  url: qdrantUrl,
  apiKey: qdrantApiKey,
});

async function cleanupCorruptedDocuments() {
  try {
    console.log("Starting cleanup of corrupted documents...\n");

    const collectionName = "documents";
    const fullDocsCollection = "full_documents";

    let allChunks = [];
    let offset = null;
    let hasMore = true;

    console.log("Fetching all chunks...");
    while (hasMore && allChunks.length < 10000) {
      const scrollResult = await qdrantClient.scroll(collectionName, {
        limit: 100,
        with_payload: true,
        with_vector: false,
        offset: offset,
      });

      if (scrollResult.points && scrollResult.points.length > 0) {
        allChunks.push(...scrollResult.points);
        offset = scrollResult.next_page_offset;
        hasMore = !!scrollResult.next_page_offset;
      } else {
        hasMore = false;
      }
    }

    console.log(`Found ${allChunks.length} total chunks\n`);

    // Identify corrupted chunks (those with control characters indicating binary data)
    const corruptedDocIds = new Set();

    for (const chunk of allChunks) {
      const content = chunk.payload?.content || "";
      const hasControlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(
        content
      );

      if (hasControlChars && content.length > 0) {
        corruptedDocIds.add(chunk.payload?.document_id);
      }
    }

    if (corruptedDocIds.size === 0) {
      console.log("✨ No corrupted documents found!");
      return;
    }

    console.log(`⚠️  Found ${corruptedDocIds.size} corrupted documents:`);
    for (const docId of corruptedDocIds) {
      console.log(`  - ${docId}`);
    }

    console.log("\nDeleting corrupted documents...");

    const pointIdsToDelete = [];
    for (const chunk of allChunks) {
      if (corruptedDocIds.has(chunk.payload?.document_id)) {
        pointIdsToDelete.push(chunk.id);
      }
    }

    console.log(`  Found ${pointIdsToDelete.length} chunk points to delete`);

    const batchSize = 100;
    for (let i = 0; i < pointIdsToDelete.length; i += batchSize) {
      const batch = pointIdsToDelete.slice(i, i + batchSize);
      await qdrantClient.delete(collectionName, {
        points: batch,
      });
      console.log(
        `  Deleted batch ${Math.floor(i / batchSize) + 1} (${
          batch.length
        } points)`
      );
    }

    // Delete from full_documents collection
    try {
      let fullDocs = [];
      offset = null;
      hasMore = true;

      while (hasMore && fullDocs.length < 1000) {
        const scrollResult = await qdrantClient.scroll(fullDocsCollection, {
          limit: 100,
          with_payload: true,
          with_vector: false,
          offset: offset,
        });

        if (scrollResult.points && scrollResult.points.length > 0) {
          fullDocs.push(...scrollResult.points);
          offset = scrollResult.next_page_offset;
          hasMore = !!scrollResult.next_page_offset;
        } else {
          hasMore = false;
        }
      }

      const fullDocIdsToDelete = fullDocs
        .filter((p) => corruptedDocIds.has(p.payload?.documentId))
        .map((p) => p.id);

      if (fullDocIdsToDelete.length > 0) {
        await qdrantClient.delete(fullDocsCollection, {
          points: fullDocIdsToDelete,
        });
        console.log(`  Deleted ${fullDocIdsToDelete.length} full documents`);
      }
    } catch (e) {
      console.log(`  Could not delete from full_documents: ${e.message}`);
    }

    console.log(
      `\n✨ Successfully cleaned up ${corruptedDocIds.size} corrupted documents!`
    );
    console.log(
      "\n📝 Please re-upload the DOCX files using the updated application."
    );
    console.log("   The new code will properly extract text from DOCX files.");
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

cleanupCorruptedDocuments();

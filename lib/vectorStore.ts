import { QdrantClient } from "@qdrant/js-client-rest";
import { GoogleGenerativeAI } from "@google/generative-ai";

const qdrantUrl = process.env.QDRANT_URL || "http://localhost:6333";
const qdrantApiKey = process.env.QDRANT_API_KEY;
const collectionName = "documents";

// Initialize Google Generative AI client
const genAI = process.env.GOOGLE_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)
  : null;

export const qdrantClient = new QdrantClient({
  url: qdrantUrl,
  apiKey: qdrantApiKey,
});

/**
 * Generate embeddings using Google's Gemini text-embedding-004 model
 * This model produces 768-dimensional embeddings
 */
async function generateEmbedding(text: string): Promise<number[]> {
  if (!genAI || !process.env.GOOGLE_API_KEY) {
    throw new Error(
      "Google API key not configured. Please set GOOGLE_API_KEY in your environment variables."
    );
  }

  try {
    // Use Gemini's text-embedding-004 model
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

    // Generate embedding
    const result = await model.embedContent(text);
    const embedding = result.embedding;

    if (!embedding || !embedding.values || embedding.values.length === 0) {
      throw new Error("Invalid embedding response from Gemini API");
    }

    return embedding.values;
  } catch (error) {
    console.error("Error generating embedding with Gemini:", error);
    throw new Error(
      `Failed to generate embedding: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Store document chunks with embeddings in Qdrant
 * Each chunk is stored as a separate vector with its content and metadata
 * Uses uploadDate for temporal querying consistency
 */
export async function storeChunksWithEmbeddings(
  chunks: string[],
  documentId: string,
  filename: string,
  uploadDate?: string,
  fileType?: string
) {
  try {
    // Ensure collection exists with proper vector dimensions for Gemini text-embedding-004 (768 dimensions)
    let needsRecreation = false;
    try {
      const collectionInfo = await qdrantClient.getCollection(collectionName);
      const currentSize = collectionInfo.config?.params?.vectors?.size;

      if (currentSize !== 768) {
        console.log(
          `Collection has wrong dimensions (${currentSize}). Recreating with 768 dimensions...`
        );
        needsRecreation = true;
        // Delete old collection
        await qdrantClient.deleteCollection(collectionName);
        console.log(`Deleted old collection with ${currentSize} dimensions`);
      } else {
        console.log(
          `Collection "${collectionName}" already exists with correct dimensions (768)`
        );
      }
    } catch (e) {
      // Collection doesn't exist
      needsRecreation = true;
    }

    if (needsRecreation) {
      // Create collection with 768 dimensions for Gemini embeddings
      await qdrantClient.createCollection(collectionName, {
        vectors: { size: 768, distance: "Cosine" },
      });
      console.log(
        `Created collection "${collectionName}" with 768-dimensional vectors for Gemini embeddings`
      );
    }

    // Generate embeddings for each chunk using Gemini text-embedding-004
    console.log(
      `Generating embeddings for ${chunks.length} chunks using Gemini text-embedding-004...`
    );
    const embeddingsData = await Promise.all(
      chunks.map(async (chunk, index) => {
        try {
          const embedding = await generateEmbedding(chunk);
          console.log(
            `Generated embedding ${index + 1}/${chunks.length} (${
              embedding.length
            } dimensions)`
          );
          return embedding;
        } catch (error) {
          console.error(
            `Failed to generate embedding for chunk ${index}:`,
            error
          );
          throw error;
        }
      })
    );

    // Prepare points for insertion
    const uploadTimestamp = uploadDate || new Date().toISOString();
    const points = chunks.map((chunk, index) => ({
      id: Math.floor(Math.random() * 1000000000000), // Use numeric ID for Qdrant Cloud
      vector: embeddingsData[index],
      payload: {
        document_id: documentId,
        filename,
        chunk_index: index,
        content: chunk,
        uploadDate: uploadTimestamp, // Use uploadDate for temporal queries
        embedding_model: "text-embedding-004", // Track which model was used
        fileType: fileType || "text", // Track the source file type
      },
    }));

    // Upsert points into Qdrant
    await qdrantClient.upsert(collectionName, {
      points,
    });

    console.log(
      `Successfully stored ${points.length} chunks with Gemini embeddings in Qdrant`
    );

    return {
      success: true,
      message: `Stored ${points.length} chunks with Gemini text-embedding-004 embeddings in Qdrant`,
      count: points.length,
      model: "text-embedding-004",
      dimensions: 768,
    };
  } catch (error) {
    console.error("Error storing chunks in Qdrant:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Search for relevant chunks using vector similarity in Qdrant
 * Uses Gemini text-embedding-004 to generate query embeddings
 * Supports optional temporal filtering
 */
export async function searchRelevantChunks(
  query: string,
  topK: number = 5,
  options?: {
    dateFrom?: string | Date; // Filter documents created after this date
    dateTo?: string | Date; // Filter documents created before this date
    documentId?: string; // Filter by specific document ID
    filename?: string; // Filter by filename
  },
  includeMetadata: boolean = false
) {
  try {
    // Check if collection exists first
    try {
      await qdrantClient.getCollection(collectionName);
    } catch (e) {
      // Collection doesn't exist yet - return empty results
      console.log(`Collection "${collectionName}" doesn't exist yet`);
      return includeMetadata ? [] : [];
    }

    // Generate embedding for the query using the same Gemini model
    const queryEmbedding = await generateEmbedding(query);

    console.log(
      `Searching for top ${topK} results using Gemini embedding (${queryEmbedding.length} dimensions)...`
    );

    // Build filter conditions if any options are provided
    const filter: any = options ? { must: [] } : undefined;

    if (filter && options) {
      // Document ID filter
      if (options.documentId) {
        filter.must.push({
          key: "document_id",
          match: { value: options.documentId },
        });
      }

      // Filename filter
      if (options.filename) {
        filter.must.push({
          key: "filename",
          match: { value: options.filename },
        });
      }

      // Temporal filters using uploadDate
      if (options.dateFrom || options.dateTo) {
        const rangeFilter: any = { key: "uploadDate", range: {} };

        if (options.dateFrom) {
          const fromDate =
            options.dateFrom instanceof Date
              ? options.dateFrom.toISOString()
              : new Date(options.dateFrom).toISOString();
          rangeFilter.range.gte = fromDate;
        }

        if (options.dateTo) {
          const toDate =
            options.dateTo instanceof Date
              ? options.dateTo.toISOString()
              : new Date(options.dateTo).toISOString();
          rangeFilter.range.lte = toDate;
        }

        filter.must.push(rangeFilter);
      }

      // If no filters were added, remove the filter object
      if (filter.must.length === 0) {
        delete filter.must;
      }
    }

    // Search in Qdrant with optional filters
    const searchParams: any = {
      vector: queryEmbedding,
      limit: topK,
      with_payload: true,
    };

    if (filter && filter.must && filter.must.length > 0) {
      searchParams.filter = filter;
      console.log(`Applying filters:`, JSON.stringify(filter, null, 2));
    }

    const results = await qdrantClient.search(collectionName, searchParams);

    console.log(`Found ${results.length} relevant chunks`);

    // Extract and return the relevant content with optional metadata
    if (includeMetadata) {
      return results.map((result: any) => ({
        content: result.payload?.content || "",
        filename: result.payload?.filename || "",
        fileType: result.payload?.fileType || "text",
        score: result.score,
      }));
    }

    return results
      .map((result: any) => result.payload?.content || "")
      .filter(Boolean);
  } catch (error) {
    console.error("Error searching vectors in Qdrant:", error);
    return [];
  }
}

/**
 * Get collection info to verify configuration
 */
export async function getCollectionInfo() {
  try {
    const info = await qdrantClient.getCollection(collectionName);
    return {
      success: true,
      collection: collectionName,
      info,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get all unique document IDs with metadata
 * Useful for listing all documents in the system
 */
export async function getAllDocuments() {
  try {
    // Check if collection exists first
    try {
      await qdrantClient.getCollection(collectionName);
    } catch (e) {
      // Collection doesn't exist yet - this is normal for new installations
      console.log(`Collection "${collectionName}" doesn't exist yet`);
      return {
        success: true,
        documents: [],
        total: 0,
      };
    }

    const allPoints: any[] = [];
    let offset = null;
    let hasMore = true;

    // Scroll through all points
    while (hasMore && allPoints.length < 10000) {
      const scrollResult = await qdrantClient.scroll(collectionName, {
        limit: 100,
        with_payload: true,
        offset: offset,
      });

      if (scrollResult.points && scrollResult.points.length > 0) {
        allPoints.push(...scrollResult.points);
        offset = scrollResult.next_page_offset;
        hasMore = !!scrollResult.next_page_offset;
      } else {
        hasMore = false;
      }
    }

    // Group by document_id and get metadata
    const documentsMap = new Map();
    for (const point of allPoints) {
      const docId = point.payload?.document_id;
      if (!docId) continue;

      if (!documentsMap.has(docId)) {
        documentsMap.set(docId, {
          document_id: docId,
          filename: point.payload?.filename,
          uploadDate: point.payload?.uploadDate, // Use uploadDate instead of created_at
          embedding_model: point.payload?.embedding_model,
          chunks_count: 1,
        });
      } else {
        const doc = documentsMap.get(docId);
        doc.chunks_count++;
        // Keep the earliest uploadDate
        if (
          point.payload?.uploadDate &&
          point.payload.uploadDate < doc.uploadDate
        ) {
          doc.uploadDate = point.payload.uploadDate;
        }
      }
    }

    return {
      success: true,
      documents: Array.from(documentsMap.values()).sort(
        (a, b) =>
          new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
      ),
      total: documentsMap.size,
    };
  } catch (error) {
    console.error("Error getting documents:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      documents: [],
      total: 0,
    };
  }
}

/**
 * Delete a document and all its chunks from Qdrant
 */
export async function deleteDocument(documentId: string) {
  try {
    // Delete all points with matching document_id
    await qdrantClient.delete(collectionName, {
      filter: {
        must: [
          {
            key: "document_id",
            match: { value: documentId },
          },
        ],
      },
    });

    console.log(`Deleted document: ${documentId}`);

    return {
      success: true,
      message: `Document ${documentId} deleted successfully`,
    };
  } catch (error) {
    console.error("Error deleting document:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get documents created within a specific time range
 */
export async function getDocumentsByDateRange(
  dateFrom?: string | Date,
  dateTo?: string | Date
) {
  try {
    const allDocs = await getAllDocuments();

    if (!allDocs.success) {
      return allDocs;
    }

    let filtered = allDocs.documents;

    if (dateFrom) {
      const fromDate = dateFrom instanceof Date ? dateFrom : new Date(dateFrom);
      filtered = filtered.filter((doc) => new Date(doc.uploadDate) >= fromDate);
    }

    if (dateTo) {
      const toDate = dateTo instanceof Date ? dateTo : new Date(dateTo);
      filtered = filtered.filter((doc) => new Date(doc.uploadDate) <= toDate);
    }

    return {
      success: true,
      documents: filtered,
      total: filtered.length,
    };
  } catch (error) {
    console.error("Error filtering documents by date:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      documents: [],
      total: 0,
    };
  }
}

/**
 * Convert string ID to numeric ID for Qdrant
 */
function stringToNumericId(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Store full document in a separate collection for complete document retrieval
 * This enables the system to work as both a vector DB and a normal document store
 */
export async function storeFullDocument(
  documentId: string,
  filename: string,
  fullContent: string,
  fileType: string,
  fileSize: number,
  chunkCount: number,
  uploadDate?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const documentsCollectionName = "full_documents";

    // Check if collection exists
    let collectionExists = false;
    try {
      await qdrantClient.getCollection(documentsCollectionName);
      collectionExists = true;
    } catch (e) {
      // Collection doesn't exist
    }

    if (!collectionExists) {
      // Create collection for full documents (using minimal vector since we're using it as key-value store)
      await qdrantClient.createCollection(documentsCollectionName, {
        vectors: { size: 1, distance: "Cosine" },
      });
      console.log(`Created collection: ${documentsCollectionName}`);
    }

    // Convert documentId to numeric ID
    const numericId = stringToNumericId(documentId);

    // Store full document with metadata
    const point = {
      id: numericId,
      vector: [0], // Dummy vector since we're using this as document storage
      payload: {
        documentId, // Store original string ID in payload
        filename,
        fileType,
        fileSize,
        uploadDate: uploadDate || new Date().toISOString(),
        chunkCount,
        fullContent,
        embeddingModel: "text-embedding-004",
        isFullDocument: true,
      },
    };

    await qdrantClient.upsert(documentsCollectionName, {
      points: [point],
    });

    console.log(
      `Stored full document: ${filename} (${fileSize} bytes, ${chunkCount} chunks)`
    );
    return { success: true };
  } catch (error: any) {
    console.error("Error storing full document:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Retrieve full document by ID
 */
export async function getFullDocument(documentId: string) {
  try {
    const documentsCollectionName = "full_documents";

    // Search by documentId in payload instead of using numeric ID
    const scrollResult = await qdrantClient.scroll(documentsCollectionName, {
      filter: {
        must: [
          {
            key: "documentId",
            match: { value: documentId },
          },
        ],
      },
      limit: 1,
      with_payload: true,
      with_vector: false,
    });

    if (!scrollResult.points || scrollResult.points.length === 0) {
      return null;
    }

    return scrollResult.points[0].payload;
  } catch (error) {
    console.error("Error retrieving full document:", error);
    return null;
  }
}

/**
 * List all full documents with metadata (without full content for performance)
 */
export async function listAllFullDocuments() {
  try {
    const documentsCollectionName = "full_documents";

    // Check if collection exists first
    let collectionExists = false;
    try {
      await qdrantClient.getCollection(documentsCollectionName);
      collectionExists = true;
    } catch (e) {
      // Collection doesn't exist yet - this is normal for new installations
      console.log(`Collection "${documentsCollectionName}" doesn't exist yet`);
      return {
        success: true,
        documents: [],
        total: 0,
      };
    }

    const allPoints: any[] = [];
    let offset = null;
    let hasMore = true;

    // Scroll through all points
    while (hasMore && allPoints.length < 1000) {
      const scrollResult = await qdrantClient.scroll(documentsCollectionName, {
        limit: 100,
        with_payload: true,
        with_vector: false,
        offset: offset,
      });

      if (scrollResult.points && scrollResult.points.length > 0) {
        allPoints.push(...scrollResult.points);
        offset = scrollResult.next_page_offset;
        hasMore = !!scrollResult.next_page_offset;
      } else {
        hasMore = false;
      }
    }

    // Return documents sorted by upload date (newest first)
    return {
      success: true,
      documents: allPoints
        .map((p: any) => ({
          documentId: p.payload?.documentId,
          filename: p.payload?.filename,
          fileType: p.payload?.fileType,
          fileSize: p.payload?.fileSize,
          uploadDate: p.payload?.uploadDate,
          chunkCount: p.payload?.chunkCount,
          embeddingModel: p.payload?.embeddingModel,
        }))
        .sort(
          (a, b) =>
            new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
        ),
      total: allPoints.length,
    };
  } catch (error) {
    console.error("Error listing full documents:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      documents: [],
      total: 0,
    };
  }
}

/**
 * Delete full document and all its chunks
 */
export async function deleteFullDocument(documentId: string) {
  try {
    const documentsCollectionName = "full_documents";

    // First, find all points to delete by scrolling and filtering client-side
    // This avoids the need for server-side filters which require indexes in Qdrant Cloud

    // Get full document points
    let fullDocPoints: any[] = [];
    let offset = null;
    let hasMore = true;

    try {
      while (hasMore && fullDocPoints.length < 1000) {
        const scrollResult = await qdrantClient.scroll(
          documentsCollectionName,
          {
            limit: 100,
            with_payload: true,
            with_vector: false,
            offset: offset,
          }
        );

        if (scrollResult.points && scrollResult.points.length > 0) {
          fullDocPoints.push(...scrollResult.points);
          offset = scrollResult.next_page_offset;
          hasMore = !!scrollResult.next_page_offset;
        } else {
          hasMore = false;
        }
      }

      // Filter client-side to find matching documents
      const docPointsToDelete = fullDocPoints
        .filter((p) => p.payload?.documentId === documentId)
        .map((p) => p.id);

      // Delete full document points by ID
      if (docPointsToDelete.length > 0) {
        await qdrantClient.delete(documentsCollectionName, {
          points: docPointsToDelete,
        });
        console.log(`Deleted ${docPointsToDelete.length} full document points`);
      }
    } catch (e) {
      console.log(`Could not delete from full_documents collection:`, e);
      // Continue to delete chunks even if full doc deletion fails
    }

    // Get and delete chunk points
    let chunkPoints: any[] = [];
    offset = null;
    hasMore = true;

    try {
      while (hasMore && chunkPoints.length < 10000) {
        const scrollResult = await qdrantClient.scroll(collectionName, {
          limit: 100,
          with_payload: true,
          with_vector: false,
          offset: offset,
        });

        if (scrollResult.points && scrollResult.points.length > 0) {
          chunkPoints.push(...scrollResult.points);
          offset = scrollResult.next_page_offset;
          hasMore = !!scrollResult.next_page_offset;
        } else {
          hasMore = false;
        }
      }

      // Filter client-side to find matching chunks
      const chunkPointsToDelete = chunkPoints
        .filter((p) => p.payload?.document_id === documentId)
        .map((p) => p.id);

      // Delete chunk points by ID in batches
      if (chunkPointsToDelete.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < chunkPointsToDelete.length; i += batchSize) {
          const batch = chunkPointsToDelete.slice(i, i + batchSize);
          await qdrantClient.delete(collectionName, {
            points: batch,
          });
        }
        console.log(`Deleted ${chunkPointsToDelete.length} chunk points`);
      }
    } catch (e) {
      console.log(`Could not delete chunks:`, e);
      throw e;
    }

    console.log(`Deleted document and chunks: ${documentId}`);
    return {
      success: true,
      message: `Document ${documentId} deleted successfully`,
    };
  } catch (error: any) {
    console.error("Error deleting document:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

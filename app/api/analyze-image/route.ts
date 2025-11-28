import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File;

    if (!imageFile) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      );
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: 'Groq API key not configured' },
        { status: 500 }
      );
    }

    // Convert image to base64
    const bytes = await imageFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString('base64');
    
    // Determine the image mime type
    const mimeType = imageFile.type || 'image/jpeg';

    // Call Groq Vision API
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Please analyze this image in detail. Describe:\n1. What you see in the image (objects, people, scenes, text)\n2. The context and setting\n3. Any notable details, colors, or patterns\n4. Any text visible in the image\n5. The overall mood or purpose of the image\n\nProvide a comprehensive description that would make this image easily searchable.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Groq Vision API error:', error);
      throw new Error(`Groq Vision API error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    const description = result.choices?.[0]?.message?.content || '';

    if (!description.trim()) {
      return NextResponse.json(
        { error: 'No description could be generated from the image' },
        { status: 400 }
      );
    }

    // Generate searchable metadata
    const metadata = {
      filename: imageFile.name,
      type: imageFile.type,
      size: imageFile.size,
      uploadedAt: new Date().toISOString(),
      description: description,
    };

    // Create a comprehensive searchable text combining all metadata
    const searchableText = `
Image: ${imageFile.name}
Type: ${imageFile.type}
Uploaded: ${new Date().toLocaleString()}

AI-Generated Description:
${description}

Keywords: image, photo, picture, ${imageFile.name.split('.')[0]}
`.trim();

    return NextResponse.json({
      success: true,
      description,
      metadata,
      searchableText,
      filename: imageFile.name,
    });
  } catch (error: any) {
    console.error('Image analysis error:', error);
    return NextResponse.json(
      {
        error: 'Failed to analyze image: ' + (error.message || 'Unknown error'),
      },
      { status: 500 }
    );
  }
}

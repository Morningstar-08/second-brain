import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';

export const runtime = 'nodejs';

interface ScrapeRequest {
  url: string;
}

export async function POST(request: NextRequest) {
  try {
    const { url }: ScrapeRequest = await request.json();

    if (!url) {
      return NextResponse.json(
        { error: 'Missing required field: url' },
        { status: 400 }
      );
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Fetch the webpage
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Remove script and style elements
    $('script').remove();
    $('style').remove();
    $('nav').remove();
    $('footer').remove();
    $('header').remove();

    // Extract main content
    let content = '';
    
    // Try to find main content area
    const mainSelectors = ['main', 'article', '[role="main"]', '.content', '#content'];
    let foundMain = false;
    
    for (const selector of mainSelectors) {
      const mainContent = $(selector);
      if (mainContent.length > 0) {
        content = mainContent.text();
        foundMain = true;
        break;
      }
    }
    
    // Fallback to body if no main content found
    if (!foundMain) {
      content = $('body').text();
    }

    // Clean up the text
    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();

    if (!content) {
      return NextResponse.json(
        { error: 'No content could be extracted from the URL' },
        { status: 400 }
      );
    }

    // Extract metadata
    const title = $('title').text() || $('h1').first().text() || 'Untitled';
    const description = $('meta[name="description"]').attr('content') || '';

    return NextResponse.json({
      success: true,
      url,
      title: title.trim(),
      description: description.trim(),
      content: content.substring(0, 50000), // Limit to 50k chars
      contentLength: content.length,
    });
  } catch (error: any) {
    console.error('Scrape error:', error);
    return NextResponse.json(
      {
        error: 'Failed to scrape URL: ' + (error.message || 'Unknown error'),
      },
      { status: 500 }
    );
  }
}

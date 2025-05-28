import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let texts = body.texts || body.text;
    const targetLang = body.targetLang;

    if (!texts || !targetLang) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Support both single string and array
    if (typeof texts === 'string') {
      texts = [texts];
    }

    // Use the free API endpoint
    const response = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: texts,
        target_lang: targetLang.toUpperCase(),
      }),
    });

    if (!response.ok) {
      let errorMessage = 'Translation failed';
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        // If not JSON, fallback to status text
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    // Return all translations
    const translations = data.translations.map((t: any) => t.text);
    return NextResponse.json({ translations });
  } catch (error) {
    console.error('Translation error:', error);
    return NextResponse.json(
      { error: 'Failed to translate text' },
      { status: 500 }
    );
  }
} 
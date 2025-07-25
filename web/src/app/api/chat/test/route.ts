import { NextResponse } from 'next/server';
import { getOpenAIClient, DEPLOYMENT_NAME } from '@/lib/openai';

export async function GET() {
  try {
    // Test the connection with a simple message
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: DEPLOYMENT_NAME,
      max_tokens: 100,
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: 'Hello! This is a connection test. Please respond with "Connection successful!"'
        }
      ]
    });

    const responseText = response.choices[0]?.message?.content || 'No response content';

    return NextResponse.json({
      success: true,
      message: 'Azure OpenAI connection successful',
      testResponse: responseText,
      model: DEPLOYMENT_NAME,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
      usage: response.usage
    });

  } catch (error: unknown) {
    console.error('Azure OpenAI test error:', error);
    
    let errorMessage = 'Unknown error occurred';
    let statusCode = 500;

    // Handle Azure OpenAI specific errors
    if (error && typeof error === 'object' && 'status' in error) {
      const status = (error as { status: number }).status;
      if (status === 401) {
        errorMessage = 'Invalid API key or unauthorized. Please check your AZURE_OPENAI_API_KEY.';
        statusCode = 401;
      } else if (status === 404) {
        errorMessage = 'Endpoint or deployment not found. Please check your AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_DEPLOYMENT_NAME.';
        statusCode = 404;
      } else if (status === 429) {
        errorMessage = 'Rate limit exceeded. Please try again later.';
        statusCode = 429;
      }
    }
    
    if (error instanceof Error && error.message) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: (error && typeof error === 'object' && 'status' in error) ? `HTTP ${(error as { status: number }).status}` : 'Network error',
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME
      },
      { status: statusCode }
    );
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { solrClient, SearchParams } from '@/lib/solr-client';

export async function GET(request: NextRequest) {
  // Extract searchParams outside try block so it's available in catch
  const { searchParams } = new URL(request.url);
  
  try {
    const params: SearchParams = {
      q: searchParams.get('q') || '*',
      type: searchParams.get('type') || undefined,
      catalog: searchParams.get('catalog') || undefined,
      schema: searchParams.get('schema') || undefined,
      owner: searchParams.get('owner') || undefined,
      page: searchParams.get('page') || '0',
      size: searchParams.get('size') || '20'
    };

    const result = await solrClient.search(params);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Search API error:', error);
    
    // Provide more detailed error information
    let errorMessage = 'Failed to search catalog';
    let errorDetails = '';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || '';
    }
    
    // Log detailed error information
    console.error('Search error details:', {
      message: errorMessage,
      stack: errorDetails,
      params: {
        q: searchParams.get('q'),
        type: searchParams.get('type'),
        catalog: searchParams.get('catalog'),
        schema: searchParams.get('schema'),
        owner: searchParams.get('owner'),
        page: searchParams.get('page'),
        size: searchParams.get('size')
      },
      solrUrl: process.env.SOLR_HOST ? `http://${process.env.SOLR_HOST}:${process.env.SOLR_PORT}/solr/${process.env.SOLR_CORE}` : 'undefined'
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to search catalog',
        details: errorMessage,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
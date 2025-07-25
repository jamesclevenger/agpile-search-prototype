import { NextRequest, NextResponse } from 'next/server';
import { solrClient, SearchParams } from '@/lib/solr-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
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
    return NextResponse.json(
      { error: 'Failed to search catalog' },
      { status: 500 }
    );
  }
}
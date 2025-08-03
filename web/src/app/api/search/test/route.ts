import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Test basic Solr connectivity
    const solrUrl = `http://${process.env.SOLR_HOST}:${process.env.SOLR_PORT}/solr/${process.env.SOLR_CORE}/select?q=*:*&rows=0&wt=json`;
    
    console.log('Testing Solr connectivity:', solrUrl);
    
    const response = await fetch(solrUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    console.log('Solr response status:', response.status);
    console.log('Solr response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Solr error response:', errorText);
      throw new Error(`Solr request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log('Solr response data:', data);
    
    return NextResponse.json({
      status: 'success',
      message: 'Solr connectivity test passed',
      solrUrl,
      response: {
        status: response.status,
        numFound: data.response?.numFound || 0,
        docs: data.response?.docs?.length || 0
      },
      environment: {
        SOLR_HOST: process.env.SOLR_HOST,
        SOLR_PORT: process.env.SOLR_PORT,
        SOLR_CORE: process.env.SOLR_CORE
      }
    });
    
  } catch (error) {
    console.error('Solr test error:', error);
    
    return NextResponse.json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      environment: {
        SOLR_HOST: process.env.SOLR_HOST || 'undefined',
        SOLR_PORT: process.env.SOLR_PORT || 'undefined', 
        SOLR_CORE: process.env.SOLR_CORE || 'undefined'
      },
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
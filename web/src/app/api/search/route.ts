import { NextRequest, NextResponse } from 'next/server';

interface SearchParams {
  q?: string;
  type?: string;
  catalog?: string;
  schema?: string;
  owner?: string;
  page?: string;
  size?: string;
}

interface SolrDocument {
  id: string;
  name: string;
  full_name: string;
  type: string;
  catalog_name?: string;
  schema_name?: string;
  table_name?: string;
  volume_name?: string;
  file_name?: string;
  column_name?: string;
  description?: string;
  owner?: string;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
  file_size?: number;
  is_directory?: boolean;
  data_type?: string;
  storage_location?: string;
}

interface SolrResponse {
  response: {
    numFound: number;
    start: number;
    docs: SolrDocument[];
  };
  facet_counts?: {
    facet_fields: Record<string, (string | number)[]>;
  };
}

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

    // Build Solr query
    const solrUrl = `http://${process.env.SOLR_HOST}:${process.env.SOLR_PORT}/solr/${process.env.SOLR_CORE}/select`;
    
    // Build query string
    let query: string;
    if (params.q === '*' || !params.q || params.q.trim() === '') {
      query = '*:*';
    } else {
      // Build a more flexible search query
      const searchTerm = params.q.trim();
      const escapedTerm = searchTerm.replace(/[+\-&|!(){}\[\]^"~*?:\\]/g, '\\$&');
      
      // Search across multiple fields with different strategies and boost factors
      query = [
        `name:"${escapedTerm}"^10`,       // Exact match in name (highest boost)
        `name:${escapedTerm}*^5`,         // Prefix match in name
        `name:*${escapedTerm}*^3`,        // Substring match in name
        `text:${escapedTerm}*^2`,         // Prefix match in full-text field
        `description:*${escapedTerm}*`,   // Substring match in description
        `full_name:*${escapedTerm}*`,     // Substring match in full name
        `file_name:*${escapedTerm}*`,     // Substring match in file name
        `volume_name:*${escapedTerm}*`,   // Substring match in volume name
        `table_name:*${escapedTerm}*`,    // Substring match in table name
        `column_name:*${escapedTerm}*`    // Substring match in column name
      ].join(' OR ');
    }
    
    // Add filters
    const filters: string[] = [];
    if (params.type) filters.push(`type:"${params.type}"`);
    if (params.catalog) filters.push(`catalog_name:"${params.catalog}"`);
    if (params.schema) filters.push(`schema_name:"${params.schema}"`);
    if (params.owner) filters.push(`owner:"${params.owner}"`);
    
    // Calculate pagination
    const page = parseInt(params.page || '0');
    const size = parseInt(params.size || '20');
    const start = page * size;
    
    // Build Solr request parameters
    const solrParams = new URLSearchParams({
      q: query,
      start: start.toString(),
      rows: size.toString(),
      wt: 'json',
      fl: 'id,name,full_name,type,catalog_name,schema_name,table_name,volume_name,file_name,column_name,description,owner,created_at,updated_at,tags,file_size,is_directory,data_type,storage_location',
      facet: 'true',
      'facet.mincount': '1',
      sort: params.q === '*' || !params.q || params.q.trim() === '' ? 'name asc' : 'score desc, name asc'
    });

    // Add filters if they exist
    if (filters.length > 0) {
      solrParams.append('fq', filters.join(' AND '));
    }

    // Add facet fields
    ['type', 'catalog_name', 'schema_name', 'owner'].forEach(field => {
      solrParams.append('facet.field', field);
    });

    const response = await fetch(`${solrUrl}?${solrParams.toString()}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Solr request failed: ${response.status} ${response.statusText}`);
    }

    const data: SolrResponse = await response.json();

    // Format response
    const result = {
      results: data.response.docs,
      total: data.response.numFound,
      page: page,
      size: size,
      totalPages: Math.ceil(data.response.numFound / size),
      facets: data.facet_counts ? {
        types: parseFacetField(data.facet_counts.facet_fields.type || []),
        catalogs: parseFacetField(data.facet_counts.facet_fields.catalog_name || []),
        schemas: parseFacetField(data.facet_counts.facet_fields.schema_name || []),
        owners: parseFacetField(data.facet_counts.facet_fields.owner || [])
      } : undefined
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { error: 'Failed to search catalog' },
      { status: 500 }
    );
  }
}

function parseFacetField(facetArray: (string | number)[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (let i = 0; i < facetArray.length; i += 2) {
    const key = facetArray[i] as string;
    const count = facetArray[i + 1] as number;
    result[key] = count;
  }
  return result;
}
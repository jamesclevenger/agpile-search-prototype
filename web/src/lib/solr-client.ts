export interface SearchParams {
  q?: string;
  type?: string;
  catalog?: string;
  schema?: string;
  owner?: string;
  page?: string;
  size?: string;
}

export interface SolrDocument {
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

export interface SolrResponse {
  response: {
    numFound: number;
    start: number;
    docs: SolrDocument[];
  };
  facet_counts?: {
    facet_fields: Record<string, (string | number)[]>;
  };
}

export interface SearchResponse {
  results: SolrDocument[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
  facets?: {
    types: Record<string, number>;
    catalogs: Record<string, number>;
    schemas: Record<string, number>;
    owners: Record<string, number>;
  };
}

export class SolrClient {
  private solrUrl: string;

  constructor() {
    this.solrUrl = `http://${process.env.SOLR_HOST}:${process.env.SOLR_PORT}/solr/${process.env.SOLR_CORE}/select`;
  }

  private buildQuery(searchTerm: string): string {
    if (searchTerm === '*' || !searchTerm || searchTerm.trim() === '') {
      return '*:*';
    }

    const escapedTerm = searchTerm.trim().replace(/[+\-&|!(){}\[\]^"~*?:\\]/g, '\\$&');
    
    // Search across multiple fields with different strategies and boost factors
    return [
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

  private buildFilters(params: SearchParams): string[] {
    const filters: string[] = [];
    if (params.type) filters.push(`type:"${params.type}"`);
    if (params.catalog) filters.push(`catalog_name:"${params.catalog}"`);
    if (params.schema) filters.push(`schema_name:"${params.schema}"`);
    if (params.owner) filters.push(`owner:"${params.owner}"`);
    return filters;
  }

  private parseFacetField(facetArray: (string | number)[]): Record<string, number> {
    const result: Record<string, number> = {};
    for (let i = 0; i < facetArray.length; i += 2) {
      const key = facetArray[i] as string;
      const count = facetArray[i + 1] as number;
      result[key] = count;
    }
    return result;
  }

  async search(params: SearchParams): Promise<SearchResponse> {
    const query = this.buildQuery(params.q || '*');
    const filters = this.buildFilters(params);
    
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

    const response = await fetch(`${this.solrUrl}?${solrParams.toString()}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Solr request failed: ${response.status} ${response.statusText}`);
    }

    const data: SolrResponse = await response.json();

    // Format response
    return {
      results: data.response.docs,
      total: data.response.numFound,
      page: page,
      size: size,
      totalPages: Math.ceil(data.response.numFound / size),
      facets: data.facet_counts ? {
        types: this.parseFacetField(data.facet_counts.facet_fields.type || []),
        catalogs: this.parseFacetField(data.facet_counts.facet_fields.catalog_name || []),
        schemas: this.parseFacetField(data.facet_counts.facet_fields.schema_name || []),
        owners: this.parseFacetField(data.facet_counts.facet_fields.owner || [])
      } : undefined
    };
  }

  // Intelligent query interpretation for natural language
  interpretNaturalLanguage(query: string): SearchParams {
    const lowerQuery = query.toLowerCase();
    const params: SearchParams = { q: query };

    // Type detection
    if (lowerQuery.includes('table')) params.type = 'table';
    else if (lowerQuery.includes('schema')) params.type = 'schema';
    else if (lowerQuery.includes('catalog')) params.type = 'catalog';
    else if (lowerQuery.includes('column')) params.type = 'column';
    else if (lowerQuery.includes('file')) params.type = 'file';
    else if (lowerQuery.includes('volume')) params.type = 'volume';

    // Extract specific terms for better search
    const cleanQuery = query
      .replace(/\b(show me|find|search for|list|get)\b/gi, '')
      .replace(/\b(tables?|schemas?|catalogs?|columns?|files?|volumes?)\b/gi, '')
      .trim();

    if (cleanQuery) {
      params.q = cleanQuery;
    }

    return params;
  }
}

// Singleton instance
export const solrClient = new SolrClient();
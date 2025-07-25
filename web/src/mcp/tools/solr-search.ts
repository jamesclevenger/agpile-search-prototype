import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { solrClient } from '@/lib/solr-client';

// Input schema for the search_catalog tool  
const searchCatalogSchema = {
  type: 'object' as const,
  properties: {
    query: {
      type: 'string' as const,
      description: 'Natural language search query for Unity Catalog data'
    },
    type: {
      type: 'string' as const,
      description: 'Filter by data type: table, schema, catalog, column, file, volume'
    },
    catalog: {
      type: 'string' as const,
      description: 'Filter by specific catalog name'
    },
    schema: {
      type: 'string' as const,
      description: 'Filter by specific schema name'
    },
    limit: {
      type: 'number' as const,
      minimum: 1,
      maximum: 100,
      default: 10,
      description: 'Maximum number of results to return'
    }
  },
  required: ['query']
};

const SearchCatalogInputSchema = z.object({
  query: z.string().describe('Natural language search query for Unity Catalog data'),
  type: z.string().optional().describe('Filter by data type: table, schema, catalog, column, file, volume'),
  catalog: z.string().optional().describe('Filter by specific catalog name'),
  schema: z.string().optional().describe('Filter by specific schema name'),
  limit: z.number().min(1).max(100).default(10).describe('Maximum number of results to return')
});

const getTableDetailsSchema = {
  type: 'object' as const,
  properties: {
    tableName: {
      type: 'string' as const,
      description: 'Full name of the table to get details for'
    },
    catalog: {
      type: 'string' as const,
      description: 'Catalog name if known'
    },
    schema: {
      type: 'string' as const,
      description: 'Schema name if known'
    }
  },
  required: ['tableName']
};

const GetTableDetailsInputSchema = z.object({
  tableName: z.string().describe('Full name of the table to get details for'),
  catalog: z.string().optional().describe('Catalog name if known'),
  schema: z.string().optional().describe('Schema name if known')
});

const listCatalogsSchema = {
  type: 'object' as const,
  properties: {
    limit: {
      type: 'number' as const,
      minimum: 1,
      maximum: 50,
      default: 20,
      description: 'Maximum number of catalogs to return'
    }
  },
  required: []
};

const ListCatalogsInputSchema = z.object({
  limit: z.number().min(1).max(50).default(20).describe('Maximum number of catalogs to return')
});

export const searchCatalogTool: Tool = {
  name: 'search_catalog',
  description: 'Search Unity Catalog for tables, schemas, catalogs, columns, files, and volumes using natural language queries',
  inputSchema: searchCatalogSchema
};

export const getTableDetailsTool: Tool = {
  name: 'get_table_details',
  description: 'Get detailed information about a specific table including schema, columns, and metadata',
  inputSchema: getTableDetailsSchema
};

export const listCatalogsTool: Tool = {
  name: 'list_catalogs',
  description: 'List available catalogs in Unity Catalog with basic information',
  inputSchema: listCatalogsSchema
};

// Tool implementations
export async function handleSearchCatalog(args: unknown): Promise<string> {
  try {
    const input = SearchCatalogInputSchema.parse(args);
    
    // Use natural language interpretation
    const searchParams = solrClient.interpretNaturalLanguage(input.query);
    
    // Override with explicit parameters if provided
    if (input.type) searchParams.type = input.type;
    if (input.catalog) searchParams.catalog = input.catalog;
    if (input.schema) searchParams.schema = input.schema;
    searchParams.size = input.limit.toString();

    const results = await solrClient.search(searchParams);
    
    if (results.total === 0) {
      return `No results found for "${input.query}". Try a different search term or check the spelling.`;
    }

    // Format results for AI consumption
    let response = `Found ${results.total} result(s) for "${input.query}":\n\n`;
    
    results.results.slice(0, input.limit).forEach((item, index) => {
      response += `${index + 1}. **${item.name}** (${item.type})\n`;
      response += `   Full Path: ${item.full_name}\n`;
      
      if (item.description) {
        response += `   Description: ${item.description}\n`;
      }
      
      if (item.owner) {
        response += `   Owner: ${item.owner}\n`;
      }
      
      if (item.catalog_name) {
        response += `   Catalog: ${item.catalog_name}\n`;
      }
      
      if (item.schema_name) {
        response += `   Schema: ${item.schema_name}\n`;
      }
      
      if (item.tags && item.tags.length > 0) {
        response += `   Tags: ${item.tags.join(', ')}\n`;
      }
      
      response += '\n';
    });

    // Add facet information if available
    if (results.facets) {
      response += '\n**Summary by Type:**\n';
      Object.entries(results.facets.types).forEach(([type, count]) => {
        response += `- ${type}: ${count}\n`;
      });
    }

    if (results.total > input.limit) {
      response += `\n*Showing ${input.limit} of ${results.total} results. Use more specific search terms to narrow results.*`;
    }

    return response;
  } catch (error) {
    console.error('Search catalog error:', error);
    if (error instanceof z.ZodError) {
      return `Invalid search parameters: ${error.errors.map(e => e.message).join(', ')}`;
    }
    return `Error searching catalog: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

export async function handleGetTableDetails(args: unknown): Promise<string> {
  try {
    const input = GetTableDetailsInputSchema.parse(args);
    
    // Search for the specific table
    const searchParams = {
      q: input.tableName,
      type: 'table',
      catalog: input.catalog,
      schema: input.schema,
      size: '1'
    };

    const results = await solrClient.search(searchParams);
    
    if (results.total === 0) {
      return `Table "${input.tableName}" not found. Please check the table name and try again.`;
    }

    const table = results.results[0];
    let response = `**Table Details: ${table.name}**\n\n`;
    
    response += `- **Full Path:** ${table.full_name}\n`;
    response += `- **Type:** ${table.type}\n`;
    
    if (table.catalog_name) response += `- **Catalog:** ${table.catalog_name}\n`;
    if (table.schema_name) response += `- **Schema:** ${table.schema_name}\n`;
    if (table.owner) response += `- **Owner:** ${table.owner}\n`;
    if (table.created_at) response += `- **Created:** ${new Date(table.created_at).toLocaleDateString()}\n`;
    if (table.updated_at) response += `- **Updated:** ${new Date(table.updated_at).toLocaleDateString()}\n`;
    
    if (table.description) {
      response += `\n**Description:**\n${table.description}\n`;
    }
    
    if (table.tags && table.tags.length > 0) {
      response += `\n**Tags:** ${table.tags.join(', ')}\n`;
    }

    // Search for columns in this table
    const columnSearch = await solrClient.search({
      q: `table_name:"${table.table_name || table.name}"`,
      type: 'column',
      size: '50'
    });

    if (columnSearch.total > 0) {
      response += `\n**Columns (${columnSearch.total}):**\n`;
      columnSearch.results.forEach(column => {
        response += `- **${column.name}**`;
        if (column.data_type) response += ` (${column.data_type})`;
        if (column.description) response += `: ${column.description}`;
        response += '\n';
      });
    }

    return response;
  } catch (error) {
    console.error('Get table details error:', error);
    if (error instanceof z.ZodError) {
      return `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`;
    }
    return `Error getting table details: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

export async function handleListCatalogs(args: unknown): Promise<string> {
  try {
    const input = ListCatalogsInputSchema.parse(args);
    
    const results = await solrClient.search({
      q: '*',
      type: 'catalog',
      size: input.limit.toString()
    });
    
    if (results.total === 0) {
      return 'No catalogs found in Unity Catalog.';
    }

    let response = `**Available Catalogs (${results.total}):**\n\n`;
    
    results.results.forEach((catalog, index) => {
      response += `${index + 1}. **${catalog.name}**\n`;
      if (catalog.description) {
        response += `   Description: ${catalog.description}\n`;
      }
      if (catalog.owner) {
        response += `   Owner: ${catalog.owner}\n`;
      }
      response += '\n';
    });

    if (results.facets?.schemas) {
      response += '**Schemas by Catalog:**\n';
      Object.entries(results.facets.schemas).forEach(([schema, count]) => {
        response += `- ${schema}: ${count} objects\n`;
      });
    }

    return response;
  } catch (error) {
    console.error('List catalogs error:', error);
    if (error instanceof z.ZodError) {
      return `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`;
    }
    return `Error listing catalogs: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}
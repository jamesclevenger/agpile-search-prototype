import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { solrClient, SolrDocument } from '@/lib/solr-client';

// Formatting utilities
const getTypeIcon = (type: string): string => {
  const icons: Record<string, string> = {
    table: '📊',
    schema: '📁', 
    catalog: '🗃️',
    column: '📝',
    file: '📄',
    volume: '💾'
  };
  return icons[type] || '📋';
};

const formatRelativeDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
};

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

const createSeparator = (char: string = '─', length: number = 40): string => {
  return char.repeat(length);
};

const formatMetadataField = (label: string, value: string, icon?: string): string => {
  const prefix = icon ? `${icon} ` : '  ';
  return `${prefix}**${label}:** ${value}`;
};

const createResultCard = (item: SolrDocument): string => {
  const icon = getTypeIcon(item.type);
  let card = `\n${createSeparator('═', 50)}\n`;
  card += `${icon} **${item.name}** (${item.type.toUpperCase()})\n`;
  card += `${createSeparator('─', 30)}\n`;
  
  // Core information
  card += formatMetadataField('Full Path', item.full_name, '🔗') + '\n';
  
  if (item.description) {
    const truncatedDesc = item.description.length > 100 
      ? item.description.substring(0, 100) + '...' 
      : item.description;
    card += formatMetadataField('Description', truncatedDesc, '📄') + '\n';
  }
  
  // Context information
  if (item.catalog_name) card += formatMetadataField('Catalog', item.catalog_name, '🗃️') + '\n';
  if (item.schema_name) card += formatMetadataField('Schema', item.schema_name, '📁') + '\n';
  if (item.owner) card += formatMetadataField('Owner', item.owner, '👤') + '\n';
  
  // Temporal information
  if (item.created_at) {
    card += formatMetadataField('Created', formatRelativeDate(item.created_at), '📅') + '\n';
  }
  if (item.updated_at) {
    card += formatMetadataField('Last Updated', formatRelativeDate(item.updated_at), '⏰') + '\n';
  }
  
  // File-specific information
  if (item.file_size) {
    card += formatMetadataField('Size', formatFileSize(item.file_size), '📏') + '\n';
  }
  
  // Tags and metadata
  if (item.tags && item.tags.length > 0) {
    card += formatMetadataField('Tags', item.tags.map((t: string) => `\`${t}\``).join(' '), '🏷️') + '\n';
  }
  
  if (item.data_type) {
    card += formatMetadataField('Data Type', item.data_type, '🔤') + '\n';
  }
  
  return card;
};

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
      let noResultsResponse = `🔍 **No results found for "${input.query}"**\n\n`;
      noResultsResponse += `${createSeparator('─', 40)}\n`;
      noResultsResponse += `💡 **Suggestions:**\n`;
      noResultsResponse += `• Check spelling and try different keywords\n`;
      noResultsResponse += `• Use broader search terms (e.g., "user" instead of "user_profile")\n`;
      noResultsResponse += `• Try searching for table types: "show me all tables"\n`;
      noResultsResponse += `• Browse catalogs: "list catalogs"\n`;
      return noResultsResponse;
    }

    // Header with search summary
    let response = `🔍 **Search Results for "${input.query}"**\n`;
    response += `${createSeparator('═', 50)}\n`;
    response += `📊 Found **${results.total}** result(s) • Showing **${Math.min(input.limit, results.total)}**\n`;

    // Results cards
    results.results.slice(0, input.limit).forEach((item) => {
      response += createResultCard(item);
    });

    // Summary section
    response += `\n${createSeparator('═', 50)}\n`;
    response += `📈 **Summary**\n`;
    response += `${createSeparator('─', 30)}\n`;

    // Add facet information if available
    if (results.facets && Object.keys(results.facets.types).length > 0) {
      response += `📋 **By Type:**\n`;
      Object.entries(results.facets.types)
        .sort(([,a], [,b]) => b - a) // Sort by count descending
        .forEach(([type, count]) => {
          const icon = getTypeIcon(type);
          response += `  ${icon} ${type}: **${count}**\n`;
        });
      response += '\n';
    }

    // Pagination info
    if (results.total > input.limit) {
      response += `📄 **Pagination:** Showing ${input.limit} of ${results.total} results\n`;
      response += `💡 *Use more specific search terms to narrow results or increase limit*\n`;
    }

    // Quick actions
    response += `\n🚀 **Quick Actions:**\n`;
    if (results.results.some(r => r.type === 'table')) {
      const tableName = results.results.find(r => r.type === 'table')?.name;
      response += `• Get table details: "show me details for ${tableName}"\n`;
    }
    response += `• Refine search: "show me only tables matching ${input.query}"\n`;
    response += `• Browse by catalog: "list catalogs"\n`;

    return response;
  } catch (error) {
    console.error('Search catalog error:', error);
    if (error instanceof z.ZodError) {
      return `❌ **Invalid search parameters:**\n${error.errors.map(e => `• ${e.message}`).join('\n')}`;
    }
    return `❌ **Search Error:** ${error instanceof Error ? error.message : 'Unknown error occurred'}`;
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
      let notFoundResponse = `❌ **Table Not Found: "${input.tableName}"**\n\n`;
      notFoundResponse += `${createSeparator('─', 40)}\n`;
      notFoundResponse += `💡 **Suggestions:**\n`;
      notFoundResponse += `• Check the table name spelling\n`;
      notFoundResponse += `• Try searching: "search for ${input.tableName}"\n`;
      notFoundResponse += `• Browse available tables: "show me all tables"\n`;
      if (input.catalog) {
        notFoundResponse += `• Search in catalog: "tables in ${input.catalog}"\n`;
      }
      return notFoundResponse;
    }

    const table = results.results[0];
    const tableIcon = getTypeIcon(table.type);
    
    // Header
    let response = `${tableIcon} **Table Details: ${table.name}**\n`;
    response += `${createSeparator('═', 60)}\n\n`;
    
    // Core Information Section
    response += `📋 **Basic Information**\n`;
    response += `${createSeparator('─', 40)}\n`;
    response += formatMetadataField('Full Path', table.full_name, '🔗') + '\n';
    response += formatMetadataField('Type', table.type.toUpperCase(), '📊') + '\n';
    
    if (table.catalog_name) response += formatMetadataField('Catalog', table.catalog_name, '🗃️') + '\n';
    if (table.schema_name) response += formatMetadataField('Schema', table.schema_name, '📁') + '\n';
    if (table.owner) response += formatMetadataField('Owner', table.owner, '👤') + '\n';
    
    // Temporal Information
    if (table.created_at || table.updated_at) {
      response += `\n⏰ **Timeline**\n`;
      response += `${createSeparator('─', 40)}\n`;
      if (table.created_at) {
        response += formatMetadataField('Created', formatRelativeDate(table.created_at), '📅') + '\n';
      }
      if (table.updated_at) {
        response += formatMetadataField('Last Updated', formatRelativeDate(table.updated_at), '🔄') + '\n';
      }
    }
    
    // Description Section
    if (table.description) {
      response += `\n📄 **Description**\n`;
      response += `${createSeparator('─', 40)}\n`;
      response += `${table.description}\n`;
    }
    
    // Tags Section
    if (table.tags && table.tags.length > 0) {
      response += `\n🏷️ **Tags**\n`;
      response += `${createSeparator('─', 40)}\n`;
      response += table.tags.map(tag => `\`${tag}\``).join(' • ') + '\n';
    }

    // Search for columns in this table
    const columnSearch = await solrClient.search({
      q: `table_name:"${table.table_name || table.name}"`,
      type: 'column',
      size: '50'
    });

    if (columnSearch.total > 0) {
      response += `\n📝 **Schema (${columnSearch.total} columns)**\n`;
      response += `${createSeparator('─', 40)}\n`;
      
      // Group columns by data type for better organization
      const columnsByType: Record<string, SolrDocument[]> = {};
      columnSearch.results.forEach(column => {
        const type = column.data_type || 'unknown';
        if (!columnsByType[type]) columnsByType[type] = [];
        columnsByType[type].push(column);
      });

      // Show columns grouped by type
      Object.entries(columnsByType).forEach(([dataType, columns]) => {
        if (Object.keys(columnsByType).length > 1) {
          response += `\n**${dataType.toUpperCase()} Columns (${columns.length}):**\n`;
        }
        
        columns.forEach(column => {
          response += `  📝 **${column.name}**`;
          if (column.data_type && Object.keys(columnsByType).length === 1) {
            response += ` \`${column.data_type}\``;
          }
          if (column.description) {
            response += `\n     ${column.description}`;
          }
          response += '\n';
        });
      });
    } else {
      response += `\n📝 **Schema**\n`;
      response += `${createSeparator('─', 40)}\n`;
      response += `⚠️ No column information available\n`;
    }

    // Quick Actions
    response += `\n🚀 **Quick Actions**\n`;
    response += `${createSeparator('─', 40)}\n`;
    response += `• Search related tables: "tables in ${table.schema_name || table.catalog_name}"\n`;
    response += `• Find similar tables: "tables like ${table.name}"\n`;
    if (table.owner) {
      response += `• Tables by owner: "tables owned by ${table.owner}"\n`;
    }

    return response;
  } catch (error) {
    console.error('Get table details error:', error);
    if (error instanceof z.ZodError) {
      return `❌ **Invalid parameters:**\n${error.errors.map(e => `• ${e.message}`).join('\n')}`;
    }
    return `❌ **Error getting table details:** ${error instanceof Error ? error.message : 'Unknown error occurred'}`;
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
      let noCatalogsResponse = `🗃️ **No Catalogs Found**\n\n`;
      noCatalogsResponse += `${createSeparator('─', 40)}\n`;
      noCatalogsResponse += `💡 **This might mean:**\n`;
      noCatalogsResponse += `• No catalogs are indexed yet\n`;
      noCatalogsResponse += `• The search index is empty\n`;
      noCatalogsResponse += `• Access permissions may be limited\n`;
      noCatalogsResponse += `\n🚀 **Try:**\n`;
      noCatalogsResponse += `• Check with your data admin\n`;
      noCatalogsResponse += `• Search for specific data: "show me tables"\n`;
      return noCatalogsResponse;
    }

    // Header
    let response = `🗃️ **Available Catalogs**\n`;
    response += `${createSeparator('═', 50)}\n`;
    response += `📊 Found **${results.total}** catalog(s) • Showing **${Math.min(input.limit, results.total)}**\n\n`;
    
    // Catalog cards
    results.results.forEach((catalog) => {
      const catalogIcon = getTypeIcon('catalog');
      response += `${createSeparator('─', 45)}\n`;
      response += `${catalogIcon} **${catalog.name}**\n`;
      response += `${createSeparator('·', 30)}\n`;
      
      if (catalog.description) {
        const truncatedDesc = catalog.description.length > 120 
          ? catalog.description.substring(0, 120) + '...' 
          : catalog.description;
        response += `📄 ${truncatedDesc}\n`;
      }
      
      if (catalog.owner) {
        response += `👤 **Owner:** ${catalog.owner}\n`;
      }
      
      if (catalog.created_at) {
        response += `📅 **Created:** ${formatRelativeDate(catalog.created_at)}\n`;
      }
      
      if (catalog.updated_at) {
        response += `⏰ **Updated:** ${formatRelativeDate(catalog.updated_at)}\n`;
      }
      
      response += '\n';
    });

    // Summary section with facet information
    response += `${createSeparator('═', 50)}\n`;
    response += `📈 **Summary**\n`;
    response += `${createSeparator('─', 30)}\n`;

    if (results.facets?.schemas && Object.keys(results.facets.schemas).length > 0) {
      response += `📁 **Objects by Schema:**\n`;
      Object.entries(results.facets.schemas)
        .sort(([,a], [,b]) => b - a) // Sort by count descending  
        .slice(0, 10) // Show top 10
        .forEach(([schema, count]) => {
          response += `  📁 ${schema}: **${count}** objects\n`;
        });
      
      if (Object.keys(results.facets.schemas).length > 10) {
        response += `  *... and ${Object.keys(results.facets.schemas).length - 10} more schemas*\n`;
      }
      response += '\n';
    }

    // Pagination info
    if (results.total > input.limit) {
      response += `📄 **Pagination:** Showing ${input.limit} of ${results.total} catalogs\n`;
      response += `💡 *Use a higher limit to see more catalogs*\n\n`;
    }

    // Quick Actions
    response += `🚀 **Quick Actions:**\n`;
    response += `${createSeparator('─', 30)}\n`;
    if (results.results.length > 0) {
      const firstCatalog = results.results[0].name;
      response += `• Explore catalog: "show me tables in ${firstCatalog}"\n`;
      response += `• Search across catalogs: "find customer tables"\n`;
    }
    response += `• Get detailed info: "show me details for [catalog_name]"\n`;
    response += `• Search everything: "show me all tables"\n`;

    return response;
  } catch (error) {
    console.error('List catalogs error:', error);
    if (error instanceof z.ZodError) {
      return `❌ **Invalid parameters:**\n${error.errors.map(e => `• ${e.message}`).join('\n')}`;
    }
    return `❌ **Error listing catalogs:** ${error instanceof Error ? error.message : 'Unknown error occurred'}`;
  }
}
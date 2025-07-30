import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { brapiClient, GermplasmEntry } from '@/lib/brapi-client';

// Input schemas for BrAPI germplasm tools
const SearchGermplasmByNameSchema = z.object({
  germplasmName: z.string().describe('Name or partial name of germplasm to search for'),
  includeSynonyms: z.boolean().optional().default(true).describe('Include synonym matches in search'),
  commonCropName: z.string().optional().describe('Filter by crop name (e.g., wheat, barley, rice)'),
  limit: z.number().min(1).max(100).default(20).describe('Maximum number of results to return')
});

const GetGermplasmDetailsSchema = z.object({
  germplasmDbId: z.string().describe('Unique identifier for the germplasm entry')
});

const TestBrAPIConnectionSchema = z.object({
  // No parameters needed for connection test
});

// Tool definitions
export const searchGermplasmByNameTool: Tool = {
  name: 'search_germplasm_by_name',
  description: 'Search for germplasm (plant genetic resources) by name using the configured BrAPI endpoint. Supports partial name matching and synonym searches.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      germplasmName: {
        type: 'string' as const,
        description: 'Name or partial name of germplasm to search for'
      },
      includeSynonyms: {
        type: 'boolean' as const,
        description: 'Include synonym matches in search',
        default: true
      },
      commonCropName: {
        type: 'string' as const,
        description: 'Filter by crop name (e.g., wheat, barley, rice)'
      },
      limit: {
        type: 'number' as const,
        minimum: 1,
        maximum: 100,
        default: 20,
        description: 'Maximum number of results to return'
      }
    },
    required: ['germplasmName']
  }
};

export const getGermplasmDetailsTool: Tool = {
  name: 'get_germplasm_details',
  description: 'Get detailed information about a specific germplasm entry using its unique identifier from the BrAPI endpoint',
  inputSchema: {
    type: 'object' as const,
    properties: {
      germplasmDbId: {
        type: 'string' as const,
        description: 'Unique identifier for the germplasm entry'
      }
    },
    required: ['germplasmDbId']
  }
};

export const testBrAPIConnectionTool: Tool = {
  name: 'test_brapi_connection',
  description: 'Test the connection to the currently configured BrAPI endpoint and display endpoint information',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: []
  }
};

// Utility functions for formatting
const createSeparator = (char: string = '─', length: number = 50): string => {
  return char.repeat(length);
};

const formatGermplasmTable = (germplasmList: GermplasmEntry[]): string => {
  if (germplasmList.length === 0) {
    return '';
  }

  // Create table with key columns
  let table = '\n';
  table += '| # | Name | ID | Accession | Crop | Taxonomy | Institute | Origin |\n';
  table += '|---|------|----|-----------|----- |----------|-----------|--------|\n';
  
  germplasmList.forEach((germplasm, index) => {
    const name = (germplasm.defaultDisplayName || germplasm.germplasmName || '').substring(0, 20);
    const id = (germplasm.germplasmDbId || '').substring(0, 12);
    const accession = (germplasm.accessionNumber || '').substring(0, 12);
    const crop = (germplasm.commonCropName || '').substring(0, 10);
    const taxonomy = [germplasm.genus, germplasm.species].filter(Boolean).join(' ').substring(0, 15);
    const institute = (germplasm.instituteName || germplasm.instituteCode || '').substring(0, 12);
    const origin = (germplasm.countryOfOriginCode || '').substring(0, 8);
    
    table += `| ${index + 1} | ${name} | ${id} | ${accession} | ${crop} | ${taxonomy} | ${institute} | ${origin} |\n`;
  });
  
  return table;
};


const formatEndpointPreamble = (endpointName: string, endpointUrl: string, searchType: string, query?: string): string => {
  let preamble = `🧬 **${searchType} from ${endpointName}**\n`;
  preamble += `${createSeparator('═', 60)}\n`;
  preamble += `📡 **Source:** ${endpointUrl}\n`;
  if (query) {
    preamble += `🔍 **Query:** "${query}"\n`;
  }
  preamble += `${createSeparator('─', 40)}\n`;
  return preamble;
};

// Tool implementations
export async function handleSearchGermplasmByName(args: unknown): Promise<string> {
  try {
    const input = SearchGermplasmByNameSchema.parse(args);
    
    // Get active endpoint info for preamble
    const activeEndpoint = await brapiClient.getActiveEndpoint();
    if (!activeEndpoint) {
      return `❌ **No BrAPI Endpoint Configured**\n\n${createSeparator('─', 40)}\nPlease configure a BrAPI endpoint in Settings to search for germplasm data.\n\n💡 **To configure:**\n• Go to Settings page\n• Add a BrAPI endpoint URL\n• Set it as active`;
    }

    // Perform the search
    const response = await brapiClient.searchGermplasm({
      germplasmName: input.germplasmName,
      synonyms: input.includeSynonyms,
      commonCropName: input.commonCropName,
      pageSize: input.limit
    });

    // Format response with endpoint attribution
    let result = formatEndpointPreamble(
      activeEndpoint.name, 
      activeEndpoint.url, 
      'Germplasm Search Results',
      input.germplasmName
    );

    if (response.result.data.length === 0) {
      result += `\n❌ **No germplasm found matching "${input.germplasmName}"**\n\n`;
      result += `💡 **Suggestions:**\n`;
      result += `• Try a shorter or partial name\n`;
      result += `• Check spelling variations\n`;
      result += `• Remove crop filters if applied\n`;
      if (!input.includeSynonyms) {
        result += `• Try including synonyms in search\n`;
      }
      return result;
    }

    // Add search summary
    const totalResults = response.metadata.pagination.totalCount;
    const showing = Math.min(input.limit, response.result.data.length);
    result += `\n📊 **Found ${totalResults} result(s) • Showing ${showing}**\n`;

    // Add results in table format
    result += formatGermplasmTable(response.result.data);

    // Add table legend
    result += `\n💡 **Column Guide:**\n`;
    result += `• **Name**: Germplasm display name\n`;
    result += `• **ID**: Database identifier for detailed queries\n`;
    result += `• **Accession**: Accession number\n`;
    result += `• **Crop**: Common crop name\n`;
    result += `• **Taxonomy**: Genus and species\n`;
    result += `• **Institute**: Managing institution\n`;
    result += `• **Origin**: Country of origin\n`;

    // Add pagination info if needed
    if (totalResults > input.limit) {
      result += `\n${createSeparator('═', 50)}\n`;
      result += `📄 **Pagination:** Showing ${showing} of ${totalResults} results\n`;
      result += `💡 *Increase limit parameter or use more specific search terms*\n`;
    }

    // Add quick actions
    result += `\n🚀 **Quick Actions:**\n`;
    if (response.result.data.length > 0) {
      const firstId = response.result.data[0].germplasmDbId;
      result += `• Get details: "show me details for germplasm ${firstId}"\n`;
    }
    result += `• Refine search: "search for ${input.commonCropName || 'crop'} germplasm named '${input.germplasmName}'"\n`;
    result += `• Test connection: "test BrAPI connection"\n`;

    return result;
  } catch (error) {
    console.error('Search germplasm by name error:', error);
    if (error instanceof z.ZodError) {
      return `❌ **Invalid search parameters:**\n${error.errors.map(e => `• ${e.message}`).join('\n')}`;
    }
    return `❌ **Error searching germplasm:** ${error instanceof Error ? error.message : 'Unknown error occurred'}`;
  }
}

export async function handleGetGermplasmDetails(args: unknown): Promise<string> {
  try {
    const input = GetGermplasmDetailsSchema.parse(args);
    
    // Get active endpoint info for preamble
    const activeEndpoint = await brapiClient.getActiveEndpoint();
    if (!activeEndpoint) {
      return `❌ **No BrAPI Endpoint Configured**\n\nPlease configure a BrAPI endpoint in Settings to access germplasm details.`;
    }

    // Get germplasm details
    const germplasm = await brapiClient.getGermplasmDetails(input.germplasmDbId);

    // Format response with endpoint attribution
    let result = formatEndpointPreamble(
      activeEndpoint.name, 
      activeEndpoint.url, 
      'Germplasm Details',
      germplasm.germplasmName
    );

    // Detailed information card
    result += `\n🧬 **${germplasm.defaultDisplayName || germplasm.germplasmName}**\n`;
    result += `${createSeparator('═', 60)}\n\n`;

    // Basic Information
    result += `📋 **Basic Information**\n`;
    result += `${createSeparator('─', 30)}\n`;
    result += `• **Database ID:** ${germplasm.germplasmDbId}\n`;
    if (germplasm.accessionNumber) result += `• **Accession Number:** ${germplasm.accessionNumber}\n`;
    if (germplasm.commonCropName) result += `• **Crop:** ${germplasm.commonCropName}\n`;
    
    // Taxonomy
    if (germplasm.genus || germplasm.species || germplasm.subtaxa) {
      result += `\n🧬 **Taxonomy**\n`;
      result += `${createSeparator('─', 30)}\n`;
      if (germplasm.genus) result += `• **Genus:** ${germplasm.genus}\n`;
      if (germplasm.species) result += `• **Species:** ${germplasm.species}\n`;
      if (germplasm.subtaxa) result += `• **Subtaxa:** ${germplasm.subtaxa}\n`;
    }

    // Institution & Origin
    if (germplasm.instituteName || germplasm.instituteCode || germplasm.countryOfOriginCode) {
      result += `\n🏛️ **Institution & Origin**\n`;
      result += `${createSeparator('─', 30)}\n`;
      if (germplasm.instituteName) result += `• **Institution:** ${germplasm.instituteName}\n`;
      if (germplasm.instituteCode) result += `• **Institute Code:** ${germplasm.instituteCode}\n`;
      if (germplasm.countryOfOriginCode) result += `• **Country of Origin:** ${germplasm.countryOfOriginCode}\n`;
    }

    // Breeding Information
    if (germplasm.pedigree || germplasm.seedSource || germplasm.biologicalStatusOfAccessionCode) {
      result += `\n🌱 **Breeding Information**\n`;
      result += `${createSeparator('─', 30)}\n`;
      if (germplasm.pedigree) result += `• **Pedigree:** ${germplasm.pedigree}\n`;
      if (germplasm.seedSource) result += `• **Seed Source:** ${germplasm.seedSource}\n`;
      if (germplasm.biologicalStatusOfAccessionCode) result += `• **Biological Status:** ${germplasm.biologicalStatusOfAccessionCode}\n`;
    }

    // Synonyms
    if (germplasm.synonyms && germplasm.synonyms.length > 0) {
      result += `\n📝 **Synonyms**\n`;
      result += `${createSeparator('─', 30)}\n`;
      germplasm.synonyms.forEach(synonym => {
        result += `• ${synonym}\n`;
      });
    }

    // Storage & Management
    if (germplasm.typeOfGermplasmStorageCode || germplasm.acquisitionDate) {
      result += `\n💾 **Storage & Management**\n`;
      result += `${createSeparator('─', 30)}\n`;
      if (germplasm.typeOfGermplasmStorageCode) {
        result += `• **Storage Type:** ${germplasm.typeOfGermplasmStorageCode.join(', ')}\n`;
      }
      if (germplasm.acquisitionDate) result += `• **Acquisition Date:** ${germplasm.acquisitionDate}\n`;
    }

    // External References
    if (germplasm.externalReferences && germplasm.externalReferences.length > 0) {
      result += `\n🔗 **External References**\n`;
      result += `${createSeparator('─', 30)}\n`;
      germplasm.externalReferences.forEach(ref => {
        result += `• **${ref.referenceSource}:** ${ref.referenceId}\n`;
      });
    }

    // Documentation
    if (germplasm.documentationURL) {
      result += `\n📄 **Documentation**\n`;
      result += `${createSeparator('─', 30)}\n`;
      result += `• **URL:** ${germplasm.documentationURL}\n`;
    }

    // Quick Actions
    result += `\n🚀 **Quick Actions:**\n`;
    result += `${createSeparator('─', 30)}\n`;
    if (germplasm.commonCropName) {
      result += `• Search similar: "find ${germplasm.commonCropName} germplasm like ${germplasm.germplasmName}"\n`;
    }
    if (germplasm.genus) {
      result += `• Search genus: "find ${germplasm.genus} germplasm"\n`;
    }
    result += `• Search by name: "search for germplasm named [name]"\n`;

    return result;
  } catch (error) {
    console.error('Get germplasm details error:', error);
    
    const activeEndpoint = await brapiClient.getActiveEndpoint();
    const endpointInfo = activeEndpoint ? `\n📡 **Endpoint:** ${activeEndpoint.name} (${activeEndpoint.url})` : '';
    
    if (error instanceof z.ZodError) {
      return `❌ **Invalid parameters:**\n${error.errors.map(e => `• ${e.message}`).join('\n')}`;
    }
    
    if (error instanceof Error) {
      let response = `❌ **Error getting germplasm details:** ${error.message}${endpointInfo}\n\n`;
      
      if (error.message.includes('404') || error.message.includes('not found')) {
        response += `💡 **Troubleshooting:**\n`;
        response += `• Verify the germplasm ID exists in the database\n`;
        response += `• Check if the BrAPI endpoint supports germplasm details\n`;
        response += `• Try searching for germplasm first to get valid IDs\n`;
        response += `• Test the BrAPI connection: "test BrAPI connection"\n`;
      } else if (error.message.includes('No active BrAPI endpoint')) {
        response += `💡 **Solution:** Configure a BrAPI endpoint in Settings\n`;
      }
      
      return response;
    }
    
    return `❌ **Error getting germplasm details:** Unknown error occurred${endpointInfo}`;
  }
}

export async function handleTestBrAPIConnection(args: unknown): Promise<string> {
  try {
    TestBrAPIConnectionSchema.parse(args);
    
    const result = await brapiClient.testConnection();
    
    if (result.success) {
      let response = `✅ **BrAPI Connection Successful**\n`;
      response += `${createSeparator('═', 50)}\n`;
      if (result.endpointName) response += `📡 **Endpoint:** ${result.endpointName}\n`;
      if (result.url) response += `🔗 **URL:** ${result.url}\n`;
      response += `✨ **Status:** Connected and ready for germplasm queries\n\n`;
      response += `🚀 **Try these commands:**\n`;
      response += `• "search for wheat germplasm named BR1502"\n`;
      response += `• "find barley germplasm with golden in the name"\n`;
      response += `• "show me details for germplasm ID [ID]"\n`;
      return response;
    } else {
      let response = `❌ **BrAPI Connection Failed**\n`;
      response += `${createSeparator('═', 50)}\n`;
      if (result.endpointName) response += `📡 **Endpoint:** ${result.endpointName}\n`;
      if (result.url) response += `🔗 **URL:** ${result.url}\n`;
      if (result.error) response += `💥 **Error:** ${result.error}\n\n`;
      response += `💡 **Troubleshooting:**\n`;
      response += `• Check if the BrAPI endpoint URL is correct\n`;
      response += `• Verify the endpoint is accessible and running\n`;
      response += `• Ensure the endpoint supports BrAPI v2 specification\n`;
      response += `• Check Settings to configure a different endpoint\n`;
      return response;
    }
  } catch (error) {
    console.error('Test BrAPI connection error:', error);
    return `❌ **Error testing connection:** ${error instanceof Error ? error.message : 'Unknown error occurred'}`;
  }
}
import { 
  searchCatalogTool, 
  getTableDetailsTool, 
  listCatalogsTool,
  handleSearchCatalog,
  handleGetTableDetails,
  handleListCatalogs
} from './tools/solr-search';

import {
  searchGermplasmByNameTool,
  getGermplasmDetailsTool,
  testBrAPIConnectionTool,
  handleSearchGermplasmByName,
  handleGetGermplasmDetails,
  handleTestBrAPIConnection
} from './tools/brapi-germplasm';

export const MCP_TOOLS = [
  searchCatalogTool,
  getTableDetailsTool,
  listCatalogsTool,
  searchGermplasmByNameTool,
  getGermplasmDetailsTool,
  testBrAPIConnectionTool
];

export async function executeMCPTool(toolName: string, args: unknown): Promise<string> {
  switch (toolName) {
    case 'search_catalog':
      return await handleSearchCatalog(args);
    case 'get_table_details':
      return await handleGetTableDetails(args);
    case 'list_catalogs':
      return await handleListCatalogs(args);
    case 'search_germplasm_by_name':
      return await handleSearchGermplasmByName(args);
    case 'get_germplasm_details':
      return await handleGetGermplasmDetails(args);
    case 'test_brapi_connection':
      return await handleTestBrAPIConnection(args);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// Convert MCP tools to OpenAI function definitions
export function getOpenAIFunctions() {
  return MCP_TOOLS.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
    }
  }));
}
import { 
  searchCatalogTool, 
  getTableDetailsTool, 
  listCatalogsTool,
  handleSearchCatalog,
  handleGetTableDetails,
  handleListCatalogs
} from './tools/solr-search';

export const MCP_TOOLS = [
  searchCatalogTool,
  getTableDetailsTool,
  listCatalogsTool
];

export async function executeMCPTool(toolName: string, args: unknown): Promise<string> {
  switch (toolName) {
    case 'search_catalog':
      return await handleSearchCatalog(args);
    case 'get_table_details':
      return await handleGetTableDetails(args);
    case 'list_catalogs':
      return await handleListCatalogs(args);
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
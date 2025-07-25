import OpenAI from 'openai';

let _openai: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (_openai) {
    return _openai;
  }

  // Validate required environment variables at runtime
  const requiredEnvVars = [
    'AZURE_OPENAI_API_KEY',
    'AZURE_OPENAI_ENDPOINT',
    'AZURE_OPENAI_DEPLOYMENT_NAME'
  ] as const;

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`${envVar} environment variable is required`);
    }
  }

  _openai = new OpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`,
    defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION || '2024-02-01' },
    defaultHeaders: {
      'api-key': process.env.AZURE_OPENAI_API_KEY!,
    },
  });

  return _openai;
}

export interface ChatContext {
  selectedTable?: string;
  selectedSchema?: string;
  selectedCatalog?: string;
}

export function buildSystemMessage(context?: ChatContext): string {
  let systemMessage = `You are Fairgrounds Information Booth, an AI assistant that helps users explore and understand their Unity Catalog data. You can help with:

- Finding tables, schemas, and catalogs
- Understanding data structure and relationships
- Writing queries and data analysis
- Explaining data lineage and dependencies
- General data catalog navigation

Be helpful, concise, and focus on practical data-related assistance.`;

  if (context) {
    systemMessage += `\n\nCurrent context:`;
    if (context.selectedCatalog) systemMessage += `\n- Catalog: ${context.selectedCatalog}`;
    if (context.selectedSchema) systemMessage += `\n- Schema: ${context.selectedSchema}`;
    if (context.selectedTable) systemMessage += `\n- Table: ${context.selectedTable}`;
  }

  return systemMessage;
}

// Note: Use your actual Azure OpenAI deployment name
export const DEPLOYMENT_NAME = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4';
export const MAX_TOKENS = 4000;
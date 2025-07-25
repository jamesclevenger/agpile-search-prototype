import { NextRequest, NextResponse } from 'next/server';
import { getOpenAIClient, buildSystemMessage, DEPLOYMENT_NAME, MAX_TOKENS } from '@/lib/openai';
import { v4 as uuidv4 } from 'uuid';
import { getOpenAIFunctions, executeMCPTool } from '@/mcp/server';

interface ChatRequest {
  message: string;
  conversationId?: string;
  context?: {
    selectedTable?: string;
    selectedSchema?: string;
    selectedCatalog?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { message, conversationId, context } = body;

    if (!message?.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    const systemMessage = buildSystemMessage(context);

    // For now, we'll implement basic streaming response
    // In a real implementation, you'd load conversation history here
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: DEPLOYMENT_NAME,
      max_tokens: MAX_TOKENS,
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content: systemMessage
        },
        {
          role: 'user',
          content: message
        }
      ],
      tools: getOpenAIFunctions(),
      tool_choice: 'auto',
      stream: true
    });

    // Create a ReadableStream for streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const currentConversationId = conversationId || uuidv4();
          const pendingToolCalls: Array<{
            id: string;
            type: string;
            function: { name: string; arguments: string };
          }> = [];
          
          for await (const chunk of response) {
            const delta = chunk.choices[0]?.delta;
            const content = delta?.content;
            const toolCalls = delta?.tool_calls;
            
            // Handle regular content
            if (content) {
              const data = JSON.stringify({
                type: 'content',
                content: content,
                conversationId: currentConversationId
              });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
            
            // Handle streaming tool calls
            if (toolCalls) {
              toolCalls.forEach((toolCall: unknown, index: number) => {
                if (!toolCall || typeof toolCall !== 'object') return;
                const tc = toolCall as Record<string, unknown>;
                if (!pendingToolCalls[index]) {
                  pendingToolCalls[index] = {
                    id: (tc.id as string) || '',
                    type: (tc.type as string) || '',
                    function: { name: '', arguments: '' }
                  };
                }
                
                const tcFunction = tc.function as Record<string, unknown> | undefined;
                if (tcFunction?.name && typeof tcFunction.name === 'string') {
                  pendingToolCalls[index].function.name += tcFunction.name;
                }
                if (tcFunction?.arguments && typeof tcFunction.arguments === 'string') {
                  pendingToolCalls[index].function.arguments += tcFunction.arguments;
                }
              });
            }
            
            const finishReason = chunk.choices[0]?.finish_reason;
            
            // Handle tool call execution
            if (finishReason === 'tool_calls' && pendingToolCalls.length > 0) {
              for (const toolCall of pendingToolCalls) {
                try {
                  const args = JSON.parse(toolCall.function.arguments);
                  const result = await executeMCPTool(toolCall.function.name, args);
                  
                  // Send tool result as content
                  const data = JSON.stringify({
                    type: 'content',
                    content: result,
                    conversationId: currentConversationId
                  });
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                } catch (toolError) {
                  console.error('Tool execution error:', toolError);
                  const errorData = JSON.stringify({
                    type: 'content',
                    content: `Error executing search: ${toolError instanceof Error ? toolError.message : 'Unknown error'}`,
                    conversationId: currentConversationId
                  });
                  controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
                }
              }
            }
            
            if (finishReason === 'stop' || finishReason === 'tool_calls') {
              const data = JSON.stringify({
                type: 'done',
                conversationId: currentConversationId
              });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          }
        } catch (error) {
          console.error('Stream error:', error);
          const errorData = JSON.stringify({
            type: 'error',
            error: 'Failed to generate response'
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

  } catch (error) {
    console.error('Chat API error:', error);
    
    // Handle specific Azure OpenAI errors
    let errorMessage = 'Internal server error';
    let statusCode = 500;

    if (error instanceof Error) {
      if (error.message.includes('401')) {
        errorMessage = 'Invalid Azure OpenAI API key or endpoint';
        statusCode = 401;
      } else if (error.message.includes('429')) {
        errorMessage = 'Rate limit exceeded. Please try again later.';
        statusCode = 429;
      } else if (error.message.includes('404')) {
        errorMessage = 'Azure OpenAI deployment not found. Check your deployment name.';
        statusCode = 404;
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

export interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ChatContext {
  selectedTable?: string;
  selectedSchema?: string;
  selectedCatalog?: string;
}

interface ChatContextValue {
  messages: Message[];
  loading: boolean;
  conversationId?: string;
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
  setContext: (context: ChatContext) => void;
  context: ChatContext;
}

const ChatContextInstance = createContext<ChatContextValue | undefined>(undefined);

const CHAT_STORAGE_KEY = 'fairgrounds_chat_state';

interface StoredChatState {
  messages: Array<{
    id: string;
    type: 'user' | 'assistant';
    content: string;
    timestamp: string; // ISO string for JSON serialization
  }>;
  conversationId?: string;
  context: ChatContext;
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [context, setContext] = useState<ChatContext>({});

  // Load chat state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    if (stored) {
      try {
        const parsedState: StoredChatState = JSON.parse(stored);
        
        // Convert timestamp strings back to Date objects
        const restoredMessages = parsedState.messages.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));
        
        setMessages(restoredMessages);
        setConversationId(parsedState.conversationId);
        setContext(parsedState.context || {});
      } catch (error) {
        console.error('Failed to restore chat state:', error);
        // Clear invalid stored state
        localStorage.removeItem(CHAT_STORAGE_KEY);
      }
    }
  }, []);

  // Save chat state to localStorage whenever it changes
  useEffect(() => {
    if (messages.length > 0 || conversationId) {
      try {
        const stateToStore: StoredChatState = {
          messages: messages.map(msg => ({
            ...msg,
            timestamp: msg.timestamp.toISOString()
          })),
          conversationId,
          context
        };
        
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(stateToStore));
      } catch (error) {
        console.error('Failed to save chat state to localStorage:', error);
        // Clear the stored state if we can't save it
        try {
          localStorage.removeItem(CHAT_STORAGE_KEY);
        } catch (clearError) {
          console.error('Failed to clear localStorage:', clearError);
        }
      }
    }
  }, [messages, conversationId, context]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || loading) return;

    const userMessage: Message = {
      id: uuidv4(),
      type: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: content.trim(),
          conversationId,
          context,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response stream available');
      }

      const assistantMessage: Message = {
        id: uuidv4(),
        type: 'assistant',
        content: '',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.type === 'content') {
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessage.id 
                      ? { ...msg, content: msg.content + data.content }
                      : msg
                  ));
                  
                  if (data.conversationId && !conversationId) {
                    setConversationId(data.conversationId);
                  }
                } else if (data.type === 'done') {
                  if (data.conversationId && !conversationId) {
                    setConversationId(data.conversationId);
                  }
                } else if (data.type === 'error') {
                  throw new Error(data.error || 'Stream error occurred');
                }
              } catch {
                console.warn('Failed to parse SSE data:', line);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error('Chat error:', error);
      
      const errorMessage: Message = {
        id: uuidv4(),
        type: 'assistant',
        content: 'Sorry, I encountered an error while processing your message. Please try again.',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev.slice(0, -1), errorMessage]);
    } finally {
      setLoading(false);
    }
  }, [loading, conversationId, context]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setConversationId(undefined);
    setContext({});
    localStorage.removeItem(CHAT_STORAGE_KEY);
  }, []);

  const contextValue: ChatContextValue = {
    messages,
    loading,
    conversationId,
    sendMessage,
    clearMessages,
    setContext,
    context,
  };

  return (
    <ChatContextInstance.Provider value={contextValue}>
      {children}
    </ChatContextInstance.Provider>
  );
}

export function useChatContext() {
  const context = useContext(ChatContextInstance);
  if (context === undefined) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
}
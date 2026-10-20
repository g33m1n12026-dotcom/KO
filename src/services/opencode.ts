import { BookSummaryAndMetadata, BookSummaryRequest } from '../types';

/**
 * Client service to connect to OpenCode.ai (free models) & OpenRouter / OpenAI (premium models)
 * for fetching comprehensive book summaries, themes, character guides, and metadata.
 */
export async function fetchBookSummary(request: BookSummaryRequest): Promise<BookSummaryAndMetadata> {
  const resp = await fetch('/api/book-summary', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: request.title,
      author: request.author,
      modelTier: request.modelTier || 'free_opencode',
      premiumProvider: request.premiumProvider || 'openrouter',
      language: request.language || 'Polish',
    }),
  });

  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({ error: 'Błąd pobierania streszczenia' }));
    throw new Error(errorData.error || `Błąd serwera (${resp.status})`);
  }

  return await resp.json();
}

/**
 * Checks connection status of OpenCode.ai and premium providers
 */
export async function checkOpenCodeStatus(): Promise<{
  opencode: {
    available: boolean;
    endpoint: string;
    models: string[];
    isFree: boolean;
    hasCustomKey: boolean;
  };
  premium: {
    openrouter: {
      available: boolean;
      hasKey: boolean;
      defaultModel: string;
    };
    openai: {
      available: boolean;
      hasKey: boolean;
      defaultModel: string;
    };
  };
}> {
  const resp = await fetch('/api/opencode/status');
  if (!resp.ok) {
    throw new Error('Nie udało się sprawdzić statusu serwisu OpenCode.ai');
  }
  return await resp.json();
}

/**
 * Sends messages to conversational AI Advisor
 */
export async function sendAdvisorChatMessage(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  modelTier: 'smart_auto' | 'free_opencode' | 'premium' = 'smart_auto',
  premiumProvider: 'openrouter' | 'openai' = 'openrouter'
) {
  const resp = await fetch('/api/advisor/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, modelTier, premiumProvider }),
  });

  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({ error: 'Błąd czatu doradcy' }));
    throw new Error(errorData.error || `Błąd serwera (${resp.status})`);
  }

  return await resp.json();
}


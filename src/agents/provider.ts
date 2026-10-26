/**
 * Provedor de IA — ponto único de integração com um modelo de linguagem.
 *
 * Nesta etapa NÃO há provedor conectado. A interface já existe para que, no
 * futuro, baste implementar `AIProvider` (por exemplo, chamando um servidor
 * próprio que guarda a chave da API com segurança) sem mexer nas telas.
 *
 * Importante: chaves de API nunca devem ficar no código do navegador.
 * A integração real deve passar por um servidor (backend).
 */
import type { AgentDefinition } from './definitions.ts';

export interface AIRequest {
  agent: AgentDefinition;
  messages: Array<{ role: 'user' | 'assistant'; text: string }>;
  /** Resumo dos dados do Mawe OS relevantes para o pedido. */
  context: string;
}

export interface AIResponse {
  text: string;
  /** Ações sugeridas que dependem de aprovação humana (ex.: criar tarefa). */
  proposedActions: Array<{ type: string; description: string }>;
}

export interface AIProvider {
  readonly name: string;
  readonly connected: boolean;
  generate(request: AIRequest): Promise<AIResponse>;
}

export class NoAIProvider implements AIProvider {
  readonly name = 'Nenhum modelo conectado';
  readonly connected = false;

  async generate(): Promise<AIResponse> {
    throw new Error('Nenhum modelo de IA está conectado ao Mawe OS.');
  }
}

export const aiProvider: AIProvider = new NoAIProvider();

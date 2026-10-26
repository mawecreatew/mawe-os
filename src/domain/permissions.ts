/**
 * Permissões do Mawe OS.
 *
 * Hoje há apenas dois sócios, com acesso total. A regra fica centralizada aqui
 * para que, ao adicionar autenticação real e novos papéis (ex.: colaborador),
 * baste ajustar esta tabela — as telas já consultam `can()` antes de exibir
 * informações sensíveis, como valores e pagamentos.
 *
 * Importante: no protótipo local isso controla apenas a interface. A proteção
 * real de dados sensíveis precisa acontecer no servidor/banco (ex.: regras de
 * acesso por linha), quando houver um.
 */
import type { Role, User } from './types.ts';

export type Permission =
  | 'finance:view' // valores de contratos, parcelas e pagamentos
  | 'finance:edit'
  | 'commercial:view'
  | 'commercial:edit'
  | 'projects:edit'
  | 'tasks:edit'
  | 'library:edit'
  | 'decisions:edit'
  | 'system:manage'; // restaurar/limpar dados, integrações

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  socio: [
    'finance:view',
    'finance:edit',
    'commercial:view',
    'commercial:edit',
    'projects:edit',
    'tasks:edit',
    'library:edit',
    'decisions:edit',
    'system:manage',
  ],
  // Papel preparado para o futuro: vê e executa a produção, sem acesso financeiro.
  colaborador: ['commercial:view', 'projects:edit', 'tasks:edit', 'library:edit'],
};

export function can(user: User | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  return ROLE_PERMISSIONS[user.role].includes(permission);
}

export const ROLE_LABELS: Record<Role, string> = {
  socio: 'Sócio(a)',
  colaborador: 'Colaborador(a)',
};

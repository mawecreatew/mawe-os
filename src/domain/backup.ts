/** Cópia dos dados em planilha: uma aba para cada parte do sistema. */
import type { Cell, Sheet } from '../core/xlsx.ts';
import { stageLabel } from './labels.ts';
import { peopleNames } from './people.ts';
import { clientSource } from './clientcare.ts';
import type { AppData } from './types.ts';

const yes = (v: boolean) => (v ? 'sim' : 'não');

/** Abas da planilha de backup. Sem acesso ao financeiro, valores ficam de fora. */
export function backupSheets(data: AppData, finance: boolean): Sheet[] {
  const client = (id: string | null | undefined) => data.clients.find((c) => c.id === id)?.company ?? '';
  const sheets: Sheet[] = [
    {
      name: 'Clientes',
      rows: [
        ['Empresa', 'Contato', 'Ramo', 'Cidade', 'Telefone', 'E-mail', 'Instagram', 'Situação', 'Origem', 'Próximo passo', 'Cliente desde'],
        ...data.clients.map((c): Cell[] => [c.company, c.contactName, c.segment, c.city, c.contact.phone, c.contact.email, c.contact.instagram, c.contractStatus, clientSource(data, c), c.nextStep, c.createdAt.slice(0, 10)]),
      ],
    },
    {
      name: 'Leads',
      rows: [
        ['Empresa', 'Contato', 'Ramo', 'Origem', 'Etapa', 'Telefone', 'Instagram', 'Responsáveis', 'Primeiro contato', 'Respondeu em', 'Fechou em', ...(finance ? ['Valor estimado'] : [])],
        ...data.opportunities.map((o): Cell[] => [
          o.company,
          o.contactName,
          o.segment,
          o.source,
          stageLabel(data, o.stage),
          o.contact.phone,
          o.contact.instagram,
          peopleNames(data, o.ownerIds, ''),
          o.contactedAt,
          o.repliedAt,
          o.closedAt,
          ...(finance ? [o.estimatedValue] : []),
        ]),
      ],
    },
    {
      name: 'Projetos',
      rows: [
        ['Projeto', 'Cliente', 'Tipo', 'Situação', 'Início', 'Entrega', 'Publicado em', 'Responsáveis', 'Horas trabalhadas', 'Site'],
        ...data.projects.map((p): Cell[] => [
          p.name,
          client(p.clientId),
          p.type,
          p.status,
          p.startDate,
          p.dueDate,
          p.publishedAt,
          peopleNames(data, p.ownerIds, ''),
          Math.round(((p.timeLogs ?? []).reduce((s, l) => s + l.minutes, 0) / 60) * 10) / 10,
          p.links.production,
        ]),
      ],
    },
    {
      name: 'Tarefas',
      rows: [
        ['Tarefa', 'Responsáveis', 'Prioridade', 'Situação', 'Prazo', 'Concluída em'],
        ...data.tasks.map((t): Cell[] => [t.title, peopleNames(data, t.assigneeIds, ''), t.priority, t.status, t.dueDate, t.completedAt?.slice(0, 10)]),
      ],
    },
    {
      name: 'Contratos',
      rows: [
        ['Contrato', 'Cliente', 'Tipo', 'Início', 'Fim', 'Cobrança', 'Assinado', ...(finance ? ['Valor'] : []), 'Link'],
        ...(data.contracts ?? []).map((c): Cell[] => [c.title, client(c.clientId), c.kind, c.startDate, c.endDate, c.recurrence, yes(c.signed), ...(finance ? [c.amount] : []), c.link]),
      ],
    },
    {
      name: 'Seguidores',
      rows: [['Mês', 'Seguidores', 'Alcance', 'Mensagens'], ...(data.instagramStats ?? []).map((s): Cell[] => [s.month, s.followers, s.reach, s.messages])],
    },
  ];
  if (finance) {
    sheets.push({
      name: 'Financeiro',
      rows: [
        ['Tipo', 'Descrição', 'Categoria', 'Valor', 'Vencimento', 'Pago em', 'Cliente'],
        ...data.finance.entries.map((e): Cell[] => [e.kind === 'entrada' ? 'Entrada' : 'Saída', e.description, e.category, e.amount, e.dueDate, e.paidAt, client(e.clientId)]),
      ],
    });
    sheets.push({
      name: 'Parcelas',
      rows: [
        ['Cliente', 'Descrição', 'Valor', 'Vencimento', 'Paga em', 'Forma'],
        ...data.clients.flatMap((c) => c.installments.map((i): Cell[] => [c.company, i.description, i.amount, i.dueDate, i.paidAt, i.method])),
      ],
    });
  }
  return sheets;
}

/** Nome do arquivo com a data (ex.: central-mawecreate-2026-11-23.xlsx). */
export function backupFileName(today: string, ext: 'xlsx' | 'json'): string {
  return `central-mawecreate-${today}.${ext}`;
}

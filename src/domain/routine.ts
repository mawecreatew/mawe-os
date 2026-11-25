/**
 * Rotina da prospecção: as tarefas que se repetem todo dia (com caixinhas que
 * zeram no dia seguinte) e os critérios para escolher os leads mais quentes.
 */
import { addDays, type ISODate } from '../core/dates.ts';
import { createId } from '../core/id.ts';
import type { AppData, ID, ProspectRoutine } from './types.ts';

/** Quantos dias de "feito" ficam guardados. */
const KEEP_DAYS = 30;

export const STARTER_ROUTINE: ProspectRoutine = {
  tasks: [
    { id: 'rot_leads', text: 'Cadastrar 5 leads novos (Google Maps)' },
    { id: 'rot_aquecer', text: 'Curtir 2 posts de cada perfil em aquecimento' },
    { id: 'rot_engajar', text: 'Comentar ou responder story dos perfis no dia 2' },
    { id: 'rot_mensagens', text: 'Mandar as mensagens de Quem chamar hoje' },
    { id: 'rot_story', text: 'Postar 1 story da agência (bastidores ou dica)' },
  ],
  criteria: [
    'Site desatualizado ou que não funciona no celular',
    'Só tem Instagram, sem link de site',
    'E-mail @gmail ou @hotmail (sem domínio próprio)',
    'No Google Maps só tem nome e telefone',
    'Instagram ativo, com posts recentes e boas avaliações',
  ],
  done: {},
};

export function routineOf(data: Pick<AppData, 'prospectRoutine'>): ProspectRoutine {
  return data.prospectRoutine ?? structuredClone(STARTER_ROUTINE);
}

export function routineDone(data: Pick<AppData, 'prospectRoutine'>, day: ISODate): ID[] {
  const routine = routineOf(data);
  return (routine.done[day] ?? []).filter((id) => routine.tasks.some((t) => t.id === id));
}

function ensure(draft: AppData): ProspectRoutine {
  if (!draft.prospectRoutine) draft.prospectRoutine = structuredClone(STARTER_ROUTINE);
  return draft.prospectRoutine;
}

/** Marca ou desmarca uma tarefa da rotina no dia (e esquece os dias muito antigos). */
export function toggleRoutineTask(draft: AppData, taskId: ID, day: ISODate): void {
  const routine = ensure(draft);
  if (!routine.tasks.some((t) => t.id === taskId)) throw new Error('Tarefa da rotina não encontrada.');
  const list = routine.done[day] ?? [];
  routine.done[day] = list.includes(taskId) ? list.filter((id) => id !== taskId) : [...list, taskId];
  const oldest = addDays(day, -KEEP_DAYS);
  for (const key of Object.keys(routine.done)) if (key < oldest || !routine.done[key].length) delete routine.done[key];
}

/**
 * Salva as tarefas e os critérios (um por linha). Tarefas com o mesmo texto
 * mantêm o id, para não perder o que já foi marcado hoje.
 */
export function saveRoutine(draft: AppData, tasksText: string, criteriaText: string): void {
  const routine = ensure(draft);
  const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);
  const tasks = lines(tasksText);
  if (tasks.length > 15) throw new Error('Use no máximo 15 tarefas na rotina.');
  routine.tasks = tasks.map((text) => routine.tasks.find((t) => t.text === text) ?? { id: createId('rot'), text });
  routine.criteria = lines(criteriaText).slice(0, 15);
}

import type { Channel, EditorialStage } from '@alsham/editorial';

import type { EdcalPort, PieceRow } from './edcal-port';

const agora = () => new Date().toISOString();
const hoje = () => new Date().toISOString().slice(0, 10);
const diasDe = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

let seq = 10;

const channels: { id: string; name: string; status: 'active' | 'archived' }[] = [
  { id: 'mock-ec-1', name: 'blog', status: 'active' },
  { id: 'mock-ec-2', name: 'redes da praça', status: 'active' },
];

const stages: EditorialStage[] = [
  { id: 'mock-es-1', name: 'pauta', position: 0 },
  { id: 'mock-es-2', name: 'redação', position: 1 },
  { id: 'mock-es-3', name: 'revisão', position: 2 },
];

const pieces: PieceRow[] = [
  {
    id: 'mock-ep-1',
    title: 'Bastidores da reforma do piso 2',
    brief: 'fotos da obra + fala do síndico',
    channelId: 'mock-ec-1',
    currentStageId: 'mock-es-2',
    plannedOn: diasDe(5),
    status: 'planned',
    publishedAt: null,
    dropReason: '',
    createdAt: agora(),
  },
  {
    id: 'mock-ep-2',
    title: 'Agenda cultural de agosto',
    brief: '',
    channelId: 'mock-ec-2',
    currentStageId: 'mock-es-1',
    plannedOn: diasDe(-2),
    status: 'planned',
    publishedAt: null,
    dropReason: '',
    createdAt: agora(),
  },
];

export function createEdcalMockPort(): EdcalPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(['edcal.design.manage', 'edcal.piece.manage', 'edcal.piece.decide']);
    },

    async loadChannels() {
      return channels.map((c): Channel => ({ ...c }));
    },

    async loadStages() {
      return [...stages];
    },

    async loadPieces() {
      return [...pieces];
    },

    async createChannel(input) {
      const id = `mock-ec-${(seq += 1)}`;
      channels.push({ id, name: input.name, status: 'active' });
      return { channelId: id };
    },

    async setChannelStatus(input) {
      const c = channels.find((x) => x.id === input.channelId);
      if (!c) throw new Error('canal não encontrado');
      c.status = input.status;
    },

    async createStage(input) {
      const id = `mock-es-${(seq += 1)}`;
      stages.push({ id, name: input.name, position: input.position });
      return { stageId: id };
    },

    async removeStage(input) {
      // O mock imita a FK: etapa com pauta parada não sai.
      if (pieces.some((p) => p.currentStageId === input.stageId)) {
        throw new Error('há pauta parada nesta etapa');
      }
      const i = stages.findIndex((s) => s.id === input.stageId);
      if (i >= 0) stages.splice(i, 1);
    },

    async createPiece(input) {
      const canal = channels.find((c) => c.id === input.channelId);
      if (!canal) throw new Error('canal não encontrado');
      if (canal.status === 'archived') throw new Error('canal arquivado não recebe pauta nova');
      const id = `mock-ep-${(seq += 1)}`;
      pieces.push({
        id,
        title: input.title,
        brief: input.brief,
        channelId: input.channelId,
        currentStageId: input.stageId,
        plannedOn: input.plannedOn,
        status: 'planned',
        publishedAt: null,
        dropReason: '',
        createdAt: agora(),
      });
      return { pieceId: id };
    },

    async updatePlan(input) {
      const i = pieces.findIndex((p) => p.id === input.pieceId);
      if (i < 0) throw new Error('pauta não encontrada');
      if (pieces[i]!.status !== 'planned') throw new Error('o fim da pauta não se reescreve');
      pieces[i] = { ...pieces[i]!, title: input.title, brief: input.brief, plannedOn: input.plannedOn };
    },

    async movePiece(input) {
      const i = pieces.findIndex((p) => p.id === input.pieceId);
      if (i < 0) throw new Error('pauta não encontrada');
      if (pieces[i]!.status !== 'planned') throw new Error('pauta com fim registrado não se move');
      if (!stages.some((s) => s.id === input.toStageId)) throw new Error('etapa não existe');
      pieces[i] = { ...pieces[i]!, currentStageId: input.toStageId };
    },

    async closePiece(input) {
      const i = pieces.findIndex((p) => p.id === input.pieceId);
      if (i < 0) throw new Error('pauta não encontrada');
      if (pieces[i]!.status !== 'planned') throw new Error('o fim é terminal');
      if (input.outcome === 'dropped' && input.reason.trim().length === 0) {
        throw new Error('descartar exige a razão');
      }
      pieces[i] = {
        ...pieces[i]!,
        status: input.outcome,
        currentStageId: null,
        publishedAt: input.outcome === 'published' ? `${hoje()}T12:00:00Z` : null,
        dropReason: input.outcome === 'dropped' ? input.reason.trim() : '',
      };
    },
  };
}

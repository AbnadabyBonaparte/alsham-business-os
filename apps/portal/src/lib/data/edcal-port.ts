import type { Channel, EditorialStage, Piece } from '@alsham/editorial';

export interface PieceRow extends Piece {
  readonly createdAt: string;
}

/**
 * Porta de dados do Módulo 25 — própria (Lei do Lego §5.5.8).
 *
 * Mover e registrar o fim são `rpc()`: as funções do banco escrevem a
 * trilha e conferem a permissão do ato — a porta não replica o rito, só o
 * chama. Reagendar é UPDATE honesto (o calendário é plano — decisão de
 * canon). Sem DELETE de pauta nem de canal; etapa se apaga (o desenho é
 * do tenant, com o contrapeso da FK).
 */
export interface EdcalPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadChannels(): Promise<Channel[]>;
  loadStages(): Promise<EditorialStage[]>;
  loadPieces(): Promise<PieceRow[]>;
  createChannel(input: { name: string }): Promise<{ channelId: string }>;
  setChannelStatus(input: { channelId: string; status: 'active' | 'archived' }): Promise<void>;
  createStage(input: { name: string; position: number }): Promise<{ stageId: string }>;
  removeStage(input: { stageId: string }): Promise<void>;
  createPiece(input: {
    title: string;
    brief: string;
    channelId: string;
    stageId: string;
    plannedOn: string;
  }): Promise<{ pieceId: string }>;
  updatePlan(input: {
    pieceId: string;
    title: string;
    brief: string;
    plannedOn: string;
  }): Promise<void>;
  movePiece(input: { pieceId: string; toStageId: string; note: string }): Promise<void>;
  closePiece(input: {
    pieceId: string;
    outcome: 'published' | 'dropped';
    reason: string;
  }): Promise<void>;
}

import type { NoticeAck } from '@alsham/comms';

import type { CommPort, NoticeRow } from './comm-port';

const agora = () => new Date().toISOString();
const diasAtras = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

const MOCK_USER = 'mock-user';

let seq = 2;
let ackSeq = 1;

const notices: NoticeRow[] = [
  {
    id: 'mock-cn-1',
    title: 'Manutenção do elevador na quinta-feira',
    body: 'O elevador social ficará parado das 8h às 12h para a revisão semestral. Use o de serviço.',
    audience: 'todos',
    status: 'published',
    publishedAt: diasAtras(2),
    correctsNoticeId: null,
    correctsTitle: '',
    createdAt: diasAtras(3),
  },
  {
    id: 'mock-cn-2',
    title: 'Recesso de fim de ano',
    body: '',
    audience: 'administrativo',
    status: 'draft',
    publishedAt: null,
    correctsNoticeId: null,
    correctsTitle: '',
    createdAt: diasAtras(1),
  },
];

const acks: NoticeAck[] = [];

export function createCommMockPort(): CommPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(['comm.notice.manage', 'comm.notice.ack']);
    },

    async currentUserId() {
      return MOCK_USER;
    },

    async loadNotices() {
      return [...notices];
    },

    async loadAcks() {
      return [...acks];
    },

    async createNotice(input) {
      const id = `mock-cn-${(seq += 1)}`;
      const corrigido = input.correctsNoticeId
        ? notices.find((n) => n.id === input.correctsNoticeId)
        : undefined;
      notices.push({
        id,
        title: input.title,
        body: input.body,
        audience: input.audience,
        status: 'draft',
        publishedAt: null,
        correctsNoticeId: corrigido ? corrigido.id : null,
        // O título carimbado é do servidor; o mock imita o gatilho.
        correctsTitle: corrigido ? corrigido.title : '',
        createdAt: agora(),
      });
      return { noticeId: id };
    },

    async updateDraft(input) {
      const i = notices.findIndex((n) => n.id === input.noticeId);
      if (i < 0) throw new Error('comunicado não encontrado');
      if (notices[i]!.status !== 'draft') throw new Error('a palavra dada não se edita');
      notices[i] = { ...notices[i]!, title: input.title, body: input.body, audience: input.audience };
    },

    async setStatus(input) {
      const i = notices.findIndex((n) => n.id === input.noticeId);
      if (i < 0) throw new Error('comunicado não encontrado');
      if (input.status === 'published' && notices[i]!.body.trim().length === 0) {
        throw new Error('comunicado sem corpo não comunica');
      }
      notices[i] = {
        ...notices[i]!,
        status: input.status,
        publishedAt: input.status === 'published' ? agora() : notices[i]!.publishedAt,
      };
    },

    async ackNotice(input) {
      const n = notices.find((x) => x.id === input.noticeId);
      if (!n) throw new Error('comunicado não encontrado');
      // O mock imita o gatilho: só o publicado recebe ciência, uma vez, do próprio punho.
      if (n.status === 'draft') throw new Error('o rascunho ainda não comunicou');
      if (n.status === 'archived') throw new Error('fora do mural não há ciência nova');
      if (acks.some((a) => a.noticeId === n.id && a.userId === MOCK_USER)) {
        throw new Error('o que foi lido foi lido');
      }
      acks.push({
        id: `mock-ca-${(ackSeq += 1)}`,
        noticeId: n.id,
        userId: MOCK_USER,
        ackedAt: agora(),
      });
    },
  };
}

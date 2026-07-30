'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/**
 * O SISTEMA DE ATMOSFERAS — cada módulo é uma sala da mesma casa.
 *
 * A lei (nascida em The-Bonaparte-Family, "atmosfera única por página"):
 * se removêssemos o texto e o logo e ainda soubéssemos QUAL tela é pela
 * atmosfera, passou. Se todas parecem o mesmo fundo, falhou.
 *
 * Aqui a lei se cumpre **dentro da paleta selada** (IDENTIDADE-VISUAL §1):
 * nenhuma cor nova — a diferenciação é por GEOMETRIA. Cada módulo tem um
 * ornamento-assinatura desenhado a traço fino (0.75px–1px, estilo blueprint,
 * §5.2) e uma posição própria de luz. Tudo SVG/CSS inline: zero rede,
 * zero imagem, a demo roda ao vivo.
 *
 * As camadas (mesh → retícula → ornamento → vinheta) são fixas e ficam em
 * `z-index: -1`, atrás do conteúdo — o body é transparente (globals.css).
 * Nada aqui intercepta clique, leitor de tela (aria-hidden) ou dado.
 */

type Scene = {
  /** Posição do único ponto de ouro (o Sol) no mesh. */
  sun: string;
  /** Posição do corpo frio de profundidade. */
  depth: string;
  /** O ornamento-assinatura do módulo. */
  ornament: ReactNode;
  /** Classes de posição/tamanho do ornamento. */
  ornamentClass: string;
};

// ⚠️ A atmosfera é SÓ traço — decisão do dono em revisão ao vivo (30/07/2026):
// as peças raster geradas competiam com o conteúdo em tela real e saíram.
// A cena se faz inteira em CSS/SVG: mesh de luz + retícula + ornamento + vinheta.

/** Traço padrão dos ornamentos: fino, dourado, quase sussurrado. */
const stroke = {
  stroke: 'currentColor',
  fill: 'none',
  strokeWidth: 1,
} as const;

/* ────────────────────────────────────────────────────────────────────────
 * OS ORNAMENTOS — um por módulo, todos na mesma gramática de traço.
 * ──────────────────────────────────────────────────────────────────────── */

/** Core / Painel — o Sol Único e as órbitas: a plataforma e seus módulos. */
function OrnamentCore() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <circle cx="200" cy="200" r="46" strokeOpacity="0.5" />
      <circle cx="200" cy="200" r="110" strokeOpacity="0.25" strokeDasharray="1 7" />
      <circle cx="200" cy="200" r="170" strokeOpacity="0.16" strokeDasharray="1 10" />
      <circle cx="310" cy="200" r="3" strokeOpacity="0.55" />
      <circle cx="122" cy="122" r="2.5" strokeOpacity="0.4" />
    </svg>
  );
}

/** Store — a prateleira modular: placas de Lego em grid, uma acesa. */
function OrnamentStore() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => (
          <rect
            key={`${r}-${c}`}
            x={70 + c * 92}
            y={70 + r * 92}
            width="72"
            height="72"
            rx="10"
            strokeOpacity={r === 1 && c === 1 ? 0.55 : 0.2}
          />
        )),
      )}
      <circle cx="198" cy="198" r="10" strokeOpacity="0.45" />
    </svg>
  );
}

/** Conciliação — a balança: duas colunas que se encontram num fiel. */
function OrnamentRecon() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <path d="M200 80 v200" strokeOpacity="0.35" />
      <path d="M110 130 h180" strokeOpacity="0.4" />
      <path d="M110 130 l-28 84 h56 z" strokeOpacity="0.28" />
      <path d="M290 130 l-28 84 h56 z" strokeOpacity="0.28" />
      <circle cx="200" cy="300" r="14" strokeOpacity="0.4" />
    </svg>
  );
}

/** Importar — o extrato que desce: linhas de razão entrando no livro. */
function OrnamentImport() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M80 ${100 + i * 34} h240`} strokeOpacity={0.32 - i * 0.05} />
      ))}
      <path d="M200 250 v70 m0 0 l-22 -24 m22 24 l22 -24" strokeOpacity="0.4" />
    </svg>
  );
}

/** Aprovações — a fila com visto: os pontos e o traço da decisão. */
function OrnamentApprove() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={110 + i * 90} cy="160" r="18" strokeOpacity={0.22 + i * 0.1} />
      ))}
      <path d="M272 158 l12 14 l24 -28" strokeOpacity="0.55" />
      <path d="M92 240 h216" strokeOpacity="0.18" strokeDasharray="1 8" />
    </svg>
  );
}

/** Fechamento — o período selado: o anel que se fecha. */
function OrnamentClose() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <circle cx="200" cy="200" r="120" strokeOpacity="0.3" strokeDasharray="640 120" />
      <path d="M292 122 l26 -8 l-8 26" strokeOpacity="0.4" />
      <circle cx="200" cy="200" r="6" strokeOpacity="0.5" />
    </svg>
  );
}

/** Marketing / Campanhas — a transmissão: arcos que irradiam. */
function OrnamentMarketing() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <circle cx="120" cy="280" r="6" strokeOpacity="0.55" />
      {[46, 86, 126, 166].map((r, i) => (
        <path
          key={r}
          d={`M ${120 + r * 0.7071} ${280 - r * 0.7071} A ${r} ${r} 0 0 0 ${120 + r * 0.7071} ${280 + r * 0.2}`}
          strokeOpacity={0.4 - i * 0.08}
        />
      ))}
    </svg>
  );
}

/** CRM / Relacionamentos — o vínculo: dois círculos entrelaçados. */
function OrnamentCrm() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <circle cx="165" cy="200" r="80" strokeOpacity="0.3" />
      <circle cx="235" cy="200" r="80" strokeOpacity="0.3" />
      <circle cx="200" cy="200" r="4" strokeOpacity="0.55" />
    </svg>
  );
}

/** Contas a pagar — a saída: degraus que descem. */
function OrnamentAp() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <path d="M90 120 h60 v50 h60 v50 h60 v50 h60" strokeOpacity="0.35" />
      <path d="M310 250 l20 20 l-20 20" strokeOpacity="0.45" transform="translate(0 -0)" />
    </svg>
  );
}

/** Contas a receber — a entrada: degraus que sobem. */
function OrnamentAr() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <path d="M90 280 h60 v-50 h60 v-50 h60 v-50 h60" strokeOpacity="0.35" />
      <path d="M310 110 l20 20 l-20 20" strokeOpacity="0.45" />
    </svg>
  );
}

/** Cobrança — a régua: os passos marcados no tempo. */
function OrnamentDun() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <path d="M70 200 h260" strokeOpacity="0.35" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <path
          key={i}
          d={`M${90 + i * 40} ${i % 2 === 0 ? 182 : 188} v${i % 2 === 0 ? 36 : 24}`}
          strokeOpacity={0.25 + (i % 2) * 0.12}
        />
      ))}
      <circle cx="290" cy="200" r="8" strokeOpacity="0.5" />
    </svg>
  );
}

/** Compras — o pedido: o caixote aberto, os colchetes do recebimento. */
function OrnamentPo() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <path d="M120 150 v-30 h160 v30" strokeOpacity="0.35" />
      <path d="M120 250 v30 h160 v-30" strokeOpacity="0.35" />
      <path d="M100 200 h60 m80 0 h60" strokeOpacity="0.25" />
      <circle cx="200" cy="200" r="5" strokeOpacity="0.5" />
    </svg>
  );
}

/** Estoque — o livro do físico: estratos empilhados. */
function OrnamentInv() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      {[0, 1, 2, 3].map((i) => (
        <path
          key={i}
          d={`M${110 - i * 8} ${150 + i * 44} h${180 + i * 16}`}
          strokeOpacity={0.42 - i * 0.08}
        />
      ))}
      <path d="M110 150 l90 -34 l90 34" strokeOpacity="0.3" />
    </svg>
  );
}

/** Propostas — o documento e o selo. */
function OrnamentQuote() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <path d="M140 90 h96 l40 40 v180 h-136 z" strokeOpacity="0.3" />
      <path d="M236 90 v40 h40" strokeOpacity="0.3" />
      <path d="M162 180 h92 M162 208 h92 M162 236 h56" strokeOpacity="0.2" />
      <circle cx="246" cy="272" r="18" strokeOpacity="0.45" />
    </svg>
  );
}

/** Funil — as linhas que convergem para o fechamento. */
function OrnamentDeal() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <path d="M100 110 L200 310 M300 110 L200 310" strokeOpacity="0.35" />
      <path d="M124 158 h152 M148 206 h104 M172 254 h56" strokeOpacity="0.22" />
      <circle cx="200" cy="310" r="5" strokeOpacity="0.55" />
    </svg>
  );
}

/** Eventos — o encontro marcado: o círculo do dia. */
function OrnamentEvt() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <rect x="110" y="110" width="180" height="180" rx="14" strokeOpacity="0.28" />
      <path d="M110 156 h180" strokeOpacity="0.28" />
      <path d="M154 110 v-20 M246 110 v-20" strokeOpacity="0.35" />
      <circle cx="236" cy="228" r="16" strokeOpacity="0.5" />
    </svg>
  );
}

/** Esteira — as etapas do tenant: a linha e as estações. */
function OrnamentOps() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <path d="M70 200 h260" strokeOpacity="0.3" />
      {[110, 180, 250, 320].map((x, i) => (
        <circle key={x} cx={x} cy="200" r={i === 2 ? 14 : 9} strokeOpacity={i === 2 ? 0.5 : 0.28} />
      ))}
      <path d="M250 186 v-40 h46" strokeOpacity="0.2" strokeDasharray="1 6" />
    </svg>
  );
}

/** Patrimônio — a etiqueta do bem e o traço do lugar: o livro segue a plaqueta. */
function OrnamentPat() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <path d="M120 140 h120 l40 60 -40 60 h-120 z" strokeOpacity="0.32" />
      <circle cx="152" cy="200" r="7" strokeOpacity="0.45" />
      <path d="M190 182 h60 M190 200 h74 M190 218 h48" strokeOpacity="0.2" />
      <path d="M70 310 h260" strokeOpacity="0.22" strokeDasharray="2 8" />
      <path d="M140 310 v-24 M260 310 v-24" strokeOpacity="0.3" />
    </svg>
  );
}

/** Checklists — a prancheta: os itens e os ticks do traço. */
function OrnamentChk() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <rect x="120" y="90" width="160" height="220" rx="10" strokeOpacity="0.3" />
      <path d="M170 90 v-16 h60 v16" strokeOpacity="0.35" />
      {[0, 1, 2].map((i) => (
        <g key={i} strokeOpacity="0.28">
          <rect x="144" y={140 + i * 52} width="22" height="22" rx="4" />
          <path d="M188 151 h68" transform={`translate(0 ${i * 52})`} strokeOpacity="0.2" />
        </g>
      ))}
      <path d="M148 149 l6 7 l11 -13" strokeOpacity="0.5" />
      <path d="M148 201 l6 7 l11 -13" strokeOpacity="0.5" />
    </svg>
  );
}

/** Espaços — a planta da sala e o arco do período reservado. */
function OrnamentSpc() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <rect x="100" y="110" width="200" height="140" rx="8" strokeOpacity="0.3" />
      <path d="M100 180 h70 M230 180 h70 M170 110 v40 M230 250 v-40" strokeOpacity="0.2" />
      <path d="M120 310 h160" strokeOpacity="0.25" />
      <path d="M150 310 a50 50 0 0 1 100 0" strokeOpacity="0.4" />
      <circle cx="150" cy="310" r="3" strokeOpacity="0.5" />
      <circle cx="250" cy="310" r="3" strokeOpacity="0.5" />
    </svg>
  );
}

/** Visitas — a cancela: a linha da portaria e as duas setas da passagem. */
function OrnamentVis() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <path d="M200 90 v220" strokeOpacity="0.3" strokeDasharray="2 8" />
      <path d="M90 170 h84 m0 0 l-18 -14 m18 14 l-18 14" strokeOpacity="0.42" />
      <path d="M310 230 h-84 m0 0 l18 -14 m-18 14 l18 14" strokeOpacity="0.3" />
      <circle cx="200" cy="200" r="12" strokeOpacity="0.45" />
      <path d="M120 310 h160" strokeOpacity="0.2" />
    </svg>
  );
}

/** Leads — a foz: muitos afluentes, uma fila que corre para o funil. */
function OrnamentLead() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <path d="M90 110 q60 30 110 84 M200 84 v110 M310 110 q-60 30 -110 84" strokeOpacity="0.3" />
      <path d="M200 194 v96" strokeOpacity="0.45" />
      <path d="M200 290 l-14 -16 m14 16 l14 -16" strokeOpacity="0.45" />
      <circle cx="90" cy="110" r="4" strokeOpacity="0.35" />
      <circle cx="200" cy="84" r="4" strokeOpacity="0.35" />
      <circle cx="310" cy="110" r="4" strokeOpacity="0.35" />
    </svg>
  );
}

/** Metas — o alvo e a seta que sobe: o placar da ambição. */
function OrnamentGoal() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <circle cx="240" cy="160" r="70" strokeOpacity="0.3" />
      <circle cx="240" cy="160" r="42" strokeOpacity="0.22" />
      <circle cx="240" cy="160" r="6" strokeOpacity="0.5" />
      <path d="M90 310 L160 250 L200 272 L240 160" strokeOpacity="0.4" />
      <path d="M240 160 l-20 6 m20 -6 l-4 20" strokeOpacity="0.45" />
      <path d="M80 310 h250" strokeOpacity="0.18" strokeDasharray="2 8" />
    </svg>
  );
}

/** Comunicados — o sino do mural: a palavra dada, pendurada para todos. */
function OrnamentComm() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <path d="M200 96 v14" strokeOpacity="0.35" />
      <path d="M148 210 a52 52 0 0 1 104 0 v34 h-104 z" strokeOpacity="0.35" />
      <path d="M132 244 h136" strokeOpacity="0.45" />
      <path d="M188 262 a12 12 0 0 0 24 0" strokeOpacity="0.4" />
      <path d="M120 160 q-16 18 -18 44 M280 160 q16 18 18 44" strokeOpacity="0.2" strokeDasharray="2 7" />
      <path d="M96 316 h208" strokeOpacity="0.18" strokeDasharray="2 8" />
    </svg>
  );
}

/** Calendário Editorial — a grade dos dias e a pena que escreve neles. */
function OrnamentEdcal() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <rect x="100" y="120" width="200" height="170" rx="10" strokeOpacity="0.32" />
      <path d="M100 160 h200" strokeOpacity="0.3" />
      <path d="M140 104 v32 M260 104 v32" strokeOpacity="0.4" />
      <path d="M133 196 h28 M187 196 h28 M241 196 h28 M133 240 h28 M187 240 h28" strokeOpacity="0.2" />
      <path d="M252 300 q34 -44 66 -104 l14 8 q-28 62 -64 104 l-20 10 z" strokeOpacity="0.4" />
      <path d="M318 196 l14 8" strokeOpacity="0.45" />
    </svg>
  );
}

/** Biblioteca de Mídia — a prateleira do acervo: molduras e o rolo de filme. */
function OrnamentMedia() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <path d="M92 150 h216 M92 236 h216" strokeOpacity="0.3" />
      <rect x="110" y="104" width="52" height="40" rx="4" strokeOpacity="0.35" />
      <rect x="178" y="96" width="44" height="48" rx="4" strokeOpacity="0.25" />
      <circle cx="262" cy="122" r="22" strokeOpacity="0.35" />
      <circle cx="262" cy="122" r="8" strokeOpacity="0.25" />
      <rect x="124" y="190" width="60" height="40" rx="4" strokeOpacity="0.3" />
      <rect x="204" y="182" width="48" height="48" rx="4" strokeOpacity="0.22" />
      <path d="M110 300 q90 -34 180 0" strokeOpacity="0.18" strokeDasharray="2 8" />
    </svg>
  );
}

/** Pesquisas — a régua do método e a voz que sobe ao livro. */
function OrnamentNps() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <path d="M84 220 h232" strokeOpacity="0.35" />
      <path d="M84 212 v16 M142 214 v12 M200 214 v12 M258 214 v12 M316 212 v16" strokeOpacity="0.3" />
      <circle cx="287" cy="220" r="9" strokeOpacity="0.5" />
      <path d="M120 300 a12 12 0 1 1 24 0 M186 300 a12 12 0 1 1 24 0 M252 300 a12 12 0 1 1 24 0" strokeOpacity="0.2" />
      <path d="M164 160 q36 -44 72 0" strokeOpacity="0.3" />
      <path d="M176 150 q24 -26 48 0" strokeOpacity="0.2" strokeDasharray="2 6" />
    </svg>
  );
}

/** Centros de Custo — o círculo que se reparte em fatias que fecham o todo. */
function OrnamentCc() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <circle cx="200" cy="200" r="92" strokeOpacity="0.32" />
      <path d="M200 200 L200 108" strokeOpacity="0.4" />
      <path d="M200 200 L280 246" strokeOpacity="0.4" />
      <path d="M200 200 L120 246" strokeOpacity="0.4" />
      <path d="M200 200 m0 -92 a92 92 0 0 1 80 46" strokeOpacity="0.2" strokeDasharray="2 6" />
      <circle cx="200" cy="200" r="6" strokeOpacity="0.5" />
      <path d="M96 320 h208" strokeOpacity="0.18" strokeDasharray="2 8" />
    </svg>
  );
}

/** Ajustes / a marca — o selo do tabelionato modernizado (§5.3). */
function OrnamentSeal() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <circle cx="200" cy="200" r="92" strokeOpacity="0.32" />
      <circle cx="200" cy="200" r="78" strokeOpacity="0.2" strokeDasharray="2 6" />
      <path d="M200 140 l18 36 40 6 -29 28 7 40 -36 -19 -36 19 7 -40 -29 -28 40 -6 z" strokeOpacity="0.3" />
    </svg>
  );
}

/** Login — o horizonte: o Sol nasce sobre a planta da casa. */
function OrnamentLogin() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden {...stroke}>
      <path d="M40 260 h320" strokeOpacity="0.3" />
      <path d="M110 260 a90 90 0 0 1 180 0" strokeOpacity="0.45" />
      <path d="M140 260 a60 60 0 0 1 120 0" strokeOpacity="0.22" strokeDasharray="1 6" />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * O MAPA DAS CENAS — prefixo de rota → sala da casa.
 * Prefixos mais específicos primeiro; '/' é o Painel.
 * ──────────────────────────────────────────────────────────────────────── */

const RIGHT = 'right-[-6rem] top-[-4rem] w-[30rem] opacity-[0.13]';
const LEFT = 'left-[-7rem] top-[10rem] w-[28rem] opacity-[0.12]';
const CENTER_LOW = 'left-1/2 top-[6rem] w-[34rem] -translate-x-1/2 opacity-[0.11]';

/** A cena do Painel — também o fallback de qualquer rota sem sala própria. */
const CORE_SCENE: Scene = {
  sun: '82% 0%',
  depth: '12% 100%',
  ornament: <OrnamentCore />,
  ornamentClass: RIGHT,
};

const SCENES: readonly (readonly [string, Scene])[] = [
  ['/store', { sun: '18% 0%', depth: '90% 100%', ornament: <OrnamentStore />, ornamentClass: RIGHT }],
  ['/conciliacao', { sun: '50% 0%', depth: '8% 100%', ornament: <OrnamentRecon />, ornamentClass: RIGHT }],
  ['/importar', { sun: '80% 0%', depth: '20% 100%', ornament: <OrnamentImport />, ornamentClass: RIGHT }],
  ['/aprovacoes', { sun: '70% 0%', depth: '10% 100%', ornament: <OrnamentApprove />, ornamentClass: RIGHT }],
  ['/fechamento', { sun: '50% 0%', depth: '85% 100%', ornament: <OrnamentClose />, ornamentClass: RIGHT }],
  ['/campanhas', { sun: '12% 60%', depth: '88% 10%', ornament: <OrnamentMarketing />, ornamentClass: LEFT }],
  ['/relacionamentos', { sun: '85% 10%', depth: '10% 90%', ornament: <OrnamentCrm />, ornamentClass: RIGHT }],
  ['/contas-a-pagar', { sun: '90% 20%', depth: '15% 95%', ornament: <OrnamentAp />, ornamentClass: RIGHT }],
  ['/contas-a-receber', { sun: '75% 0%', depth: '20% 100%', ornament: <OrnamentAr />, ornamentClass: RIGHT }],
  ['/cobranca', { sun: '60% 0%', depth: '12% 100%', ornament: <OrnamentDun />, ornamentClass: RIGHT }],
  ['/compras', { sun: '85% 5%', depth: '12% 95%', ornament: <OrnamentPo />, ornamentClass: RIGHT }],
  ['/estoque', { sun: '20% 0%', depth: '85% 100%', ornament: <OrnamentInv />, ornamentClass: RIGHT }],
  ['/propostas', { sun: '78% 0%', depth: '15% 100%', ornament: <OrnamentQuote />, ornamentClass: RIGHT }],
  ['/funil', { sun: '50% 0%', depth: '50% 100%', ornament: <OrnamentDeal />, ornamentClass: RIGHT }],
  ['/eventos', { sun: '82% 8%', depth: '10% 92%', ornament: <OrnamentEvt />, ornamentClass: RIGHT }],
  ['/esteiras', { sun: '30% 0%', depth: '80% 100%', ornament: <OrnamentOps />, ornamentClass: LEFT }],
  ['/esteira', { sun: '70% 0%', depth: '20% 100%', ornament: <OrnamentOps />, ornamentClass: RIGHT }],
  ['/patrimonio', { sun: '88% 4%', depth: '8% 96%', ornament: <OrnamentPat />, ornamentClass: RIGHT }],
  ['/checklists', { sun: '22% 0%', depth: '88% 100%', ornament: <OrnamentChk />, ornamentClass: RIGHT }],
  ['/espacos', { sun: '65% 0%', depth: '18% 100%', ornament: <OrnamentSpc />, ornamentClass: RIGHT }],
  ['/visitas', { sun: '15% 5%', depth: '85% 95%', ornament: <OrnamentVis />, ornamentClass: LEFT }],
  ['/leads', { sun: '50% 0%', depth: '20% 100%', ornament: <OrnamentLead />, ornamentClass: RIGHT }],
  ['/metas', { sun: '80% 0%', depth: '15% 100%', ornament: <OrnamentGoal />, ornamentClass: RIGHT }],
  ['/comunicados', { sun: '25% 0%', depth: '82% 100%', ornament: <OrnamentComm />, ornamentClass: RIGHT }],
  ['/calendario', { sun: '72% 0%', depth: '18% 100%', ornament: <OrnamentEdcal />, ornamentClass: RIGHT }],
  ['/midia', { sun: '18% 0%', depth: '85% 100%', ornament: <OrnamentMedia />, ornamentClass: LEFT }],
  ['/pesquisas', { sun: '78% 0%', depth: '12% 100%', ornament: <OrnamentNps />, ornamentClass: RIGHT }],
  ['/centros-de-custo', { sun: '55% 0%', depth: '20% 100%', ornament: <OrnamentCc />, ornamentClass: RIGHT }],
  ['/ajustes', { sun: '50% 0%', depth: '50% 100%', ornament: <OrnamentSeal />, ornamentClass: RIGHT }],
  ['/login', { sun: '50% 12%', depth: '50% 100%', ornament: <OrnamentLogin />, ornamentClass: CENTER_LOW }],
  ['/', CORE_SCENE],
];

function sceneFor(pathname: string): Scene {
  const found = SCENES.find(([prefix]) =>
    prefix === '/' ? pathname === '/' : pathname.startsWith(prefix),
  );
  return found ? found[1] : CORE_SCENE;
}

/** A atmosfera da tela atual. Montada uma vez, no layout. */
export function Atmosphere() {
  const scene = sceneFor(usePathname());

  return (
    <div
      aria-hidden
      className="bos-atm"
      style={{ '--atm-sun': scene.sun, '--atm-depth': scene.depth } as React.CSSProperties}
    >
      <div className="bos-atm-mesh" />
      <div className="bos-atm-grid" />
      <div className={`bos-atm-ornament ${scene.ornamentClass}`}>{scene.ornament}</div>
      <div className="bos-atm-vignette" />
    </div>
  );
}

/** A película de grão — acima de tudo, dose homeopática (globals.css). */
export function Grain() {
  return <div aria-hidden className="bos-grain" />;
}

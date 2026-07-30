'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * A PRESENÇA DO ENGENHEIRO — o Sol Único que acorda.
 *
 * ⭐ Não é um balão de chat de canto (Intercom/Zendesk). É um ARCO dourado
 * incompleto — o eco do Sol do logo — ancorado num canto fixo de toda página,
 * respirando devagar (opacidade, não "pulse" de notificação). Ao invocar, não
 * abre um modal: abre um PAINEL IMERSIVO, com a "planta antes da obra" (linhas
 * técnicas) se desenhando enquanto o sistema desperta. Easing cinematográfico
 * do canon (`cubic-bezier(0.16,1,0.3,1)`), nunca bounce.
 *
 * ⚖️ A voz é a do canon: precisa, institucional, sem emoji. O motor é ALSHAM —
 * nenhum fornecedor de IA aparece. Fecha com Escape, clique fora ou o botão.
 *
 * ⛔ Zero dependência de animação (three/framer): tudo é CSS/SVG puro, no molde
 * de `atmosphere.tsx`. Custo de bundle desprezível, roda ao vivo na demo.
 */

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  trace?: string[];
}

const EXEMPLOS = [
  'Resuma o que está pendente esta semana.',
  'Quais contas vencem primeiro?',
  'Redija um comunicado curto sobre o fechamento do mês.',
];

export function EngineerPresence() {
  const [aberto, setAberto] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const pathname = usePathname();

  // ⭐ Quem nunca viu PRECISA notar; quem já sabe não é incomodado. As primeiras
  // visitas (por navegador) ganham um destaque maior; depois, o respiro discreto
  // de sempre. Sem badge vermelho, sem "Novo!" — só amplitude e a entrada do
  // rótulo (o anti-brand do §6 continua de pé).
  const [novato, setNovato] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const gatilhoRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      const KEY = 'bos_eng_visitas';
      const n = Number(window.localStorage.getItem(KEY) ?? '0');
      if (n < 3) setNovato(true); // as três primeiras vezes
      window.localStorage.setItem(KEY, String(Number.isFinite(n) ? n + 1 : 1));
    } catch {
      // localStorage indisponível (aba privada): sem destaque, nunca quebra.
    }
  }, []);

  const abrir = useCallback(() => {
    setAberto(true);
    // Abriu = já sabe que é interativo. O destaque se acalma para sempre.
    setNovato(false);
    try {
      window.localStorage.setItem('bos_eng_visitas', '3');
    } catch {
      /* aba privada: tudo bem */
    }
    // Dois quadros para o navegador registrar o estado fechado antes da
    // transição — é o que faz o painel DESLIZAR em vez de aparecer pronto.
    requestAnimationFrame(() => requestAnimationFrame(() => setEntrando(true)));
  }, []);

  const fechar = useCallback(() => {
    setEntrando(false);
    // Espera a transição de saída antes de desmontar (o easing do canon).
    window.setTimeout(() => {
      setAberto(false);
      gatilhoRef.current?.focus();
    }, 480);
  }, []);

  // Escape fecha; foco vai para o campo ao abrir.
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [aberto, fechar]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, pending]);

  const perguntar = useCallback(
    async (texto: string) => {
      const limpo = texto.trim();
      if (!limpo || pending) return;
      const historico = [...turns, { role: 'user' as const, text: limpo }];
      setTurns(historico);
      setInput('');
      setPending(true);
      try {
        const resp = await fetch('/api/engineer', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            messages: historico.map((t) => ({ role: t.role, text: t.text })),
            currentPath: pathname,
          }),
        });
        const dados = (await resp.json()) as {
          answer?: string;
          trace?: string[];
          error?: string;
        };
        const texto =
          dados.answer ?? dados.error ?? 'O Engenheiro não conseguiu responder agora.';
        setTurns((t) => [...t, { role: 'assistant', text: texto, trace: dados.trace }]);
      } catch {
        setTurns((t) => [
          ...t,
          { role: 'assistant', text: 'Falha de conexão com o Engenheiro. Tente de novo.' },
        ]);
      } finally {
        setPending(false);
      }
    },
    [pathname, pending, turns],
  );

  return (
    <>
      {/* Estilos próprios da Presença — prefixo `eng-`, sem tocar o SSOT. */}
      <style>{ENGINEER_CSS}</style>

      {/* O GATILHO — o arco que respira, fixo no canto, com um rótulo SEMPRE
          visível: quem não tem intimidade com tecnologia não precisa adivinhar
          que ali se conversa. */}
      <button
        ref={gatilhoRef}
        type="button"
        onClick={aberto ? fechar : abrir}
        aria-label="Abrir o Engenheiro, assistente do Business OS"
        aria-expanded={aberto}
        className={`eng-launcher ${novato ? 'is-novato' : ''}`}
      >
        <span className="eng-launcher-label">
          <span className="eng-launcher-eyebrow">Assistente</span>
          Fale com o Engenheiro
        </span>
        <ArcoSol className="eng-launcher-arc" />
      </button>

      {aberto ? (
        <div
          className={`eng-scrim ${entrando ? 'is-open' : ''}`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) fechar();
          }}
        >
          <aside
            className={`eng-panel ${entrando ? 'is-open' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label="O Engenheiro do Business OS"
          >
            {/* A "planta antes da obra" desenhando ao acordar. */}
            <Blueprint aceso={entrando} />

            <header className="eng-head">
              <div className="eng-head-mark">
                <ArcoSol className="eng-head-arc" />
                <div>
                  <p className="eng-eyebrow">Inteligência ALSHAM</p>
                  <h2 className="eng-title">O Engenheiro</h2>
                </div>
              </div>
              <button type="button" onClick={fechar} className="eng-close" aria-label="Fechar">
                Fechar
              </button>
            </header>

            <div className="eng-scroll">
              {turns.length === 0 ? (
                <div className="eng-empty">
                  <p className="eng-empty-lead">
                    O sistema sugere; você visa. Pergunte sobre o que a empresa registrou — eu
                    consulto os módulos a que você tem acesso e respondo com o dado, não com
                    suposição.
                  </p>
                  <div className="eng-examples">
                    {EXEMPLOS.map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        className="eng-example"
                        onClick={() => perguntar(ex)}
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <ul className="eng-msgs">
                  {turns.map((t, i) => (
                    <li key={i} className={`eng-msg eng-msg-${t.role}`}>
                      <p className="eng-msg-who">{t.role === 'user' ? 'Você' : 'Engenheiro'}</p>
                      <div className="eng-msg-body">{t.text}</div>
                      {t.trace && t.trace.length > 0 ? (
                        <p className="eng-trace">{t.trace.join(' · ')}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {pending ? (
                <div className="eng-thinking" aria-live="polite">
                  <span className="eng-dot" />
                  <span className="eng-dot" />
                  <span className="eng-dot" />
                </div>
              ) : null}
              <div ref={fimRef} />
            </div>

            <form
              className="eng-composer"
              onSubmit={(e) => {
                e.preventDefault();
                perguntar(input);
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    perguntar(input);
                  }
                }}
                rows={1}
                placeholder="Pergunte ao Engenheiro…"
                className="eng-input"
                disabled={pending}
              />
              <button type="submit" className="eng-send" disabled={pending || !input.trim()}>
                Enviar
              </button>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}

/** O arco do Sol — incompleto, o mesmo gesto do logo, sem o núcleo. */
function ArcoSol({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={className}>
      <circle cx="12" cy="12" r="9" strokeWidth="1" strokeOpacity="0.85" strokeDasharray="40 8" />
      <circle cx="12" cy="12" r="3.4" strokeWidth="1" strokeOpacity="0.5" />
    </svg>
  );
}

/** A retícula técnica que se desenha ao abrir — stroke-dashoffset animado. */
function Blueprint({ aceso }: { aceso: boolean }) {
  return (
    <svg
      className={`eng-blueprint ${aceso ? 'is-drawn' : ''}`}
      viewBox="0 0 400 240"
      fill="none"
      stroke="currentColor"
      aria-hidden
    >
      <path d="M0 40 H400 M0 120 H400 M0 200 H400" strokeWidth="0.5" />
      <path d="M80 0 V240 M200 0 V240 M320 0 V240" strokeWidth="0.5" />
      <circle cx="200" cy="120" r="70" strokeWidth="0.5" />
      <circle cx="200" cy="120" r="34" strokeWidth="0.5" />
      <path d="M130 120 H270 M200 50 V190" strokeWidth="0.5" />
    </svg>
  );
}

/**
 * Toda a pele da Presença. Tokens `--bos-*` só — nenhum HEX. O movimento usa o
 * easing e a duração do canon. O kill-switch global de `prefers-reduced-motion`
 * já zera transição e animação para quem pede.
 */
const ENGINEER_CSS = `
.eng-launcher {
  position: fixed; right: 1.5rem; bottom: 1.5rem; z-index: 60;
  display: inline-flex; align-items: center; gap: 0.7rem;
  padding: 0.5rem 0.6rem 0.5rem 0.95rem; border-radius: 999px;
  cursor: pointer;
  /* Uma superfície discreta para ler como CONTROLE, não como enfeite. */
  background: color-mix(in srgb, var(--bos-midnight-ink) 80%, transparent);
  border: 1px solid var(--bos-border);
  box-shadow: inset 0 1px 0 0 color-mix(in srgb, var(--bos-ivory) 4%, transparent);
  color: var(--bos-accent);
  transition: border-color var(--bos-duration) var(--bos-ease),
    background-color var(--bos-duration) var(--bos-ease);
}
.eng-launcher:hover {
  border-color: color-mix(in srgb, var(--bos-imperial-gold) 45%, transparent);
  background-color: color-mix(in srgb, var(--bos-midnight-ink) 92%, transparent);
}
/* O rótulo SEMPRE visível — legenda sóbria, nunca berrante. */
.eng-launcher-label {
  display: flex; flex-direction: column; align-items: flex-end; line-height: 1.15;
  font-size: 0.82rem; color: var(--bos-text); white-space: nowrap;
}
.eng-launcher-eyebrow {
  font-size: 0.56rem; letter-spacing: 0.22em; text-transform: uppercase;
  color: color-mix(in srgb, var(--bos-imperial-gold) 72%, var(--bos-slate));
}
.eng-launcher-arc { width: 2.25rem; height: 2.25rem; animation: bos-sun 9s var(--bos-ease) infinite; }

/* PRIMEIRAS VISITAS: o arco respira com mais amplitude e o rótulo entra —
   destaque por movimento, jamais por badge de notificação (Anti-Brand §6). */
.eng-launcher.is-novato { border-color: color-mix(in srgb, var(--bos-imperial-gold) 38%, transparent); }
@media (prefers-reduced-motion: no-preference) {
  .eng-launcher.is-novato .eng-launcher-arc { animation: eng-sun-strong 4.5s var(--bos-ease) infinite; }
  .eng-launcher.is-novato .eng-launcher-label { animation: eng-label-in 900ms var(--bos-ease) both; }
}
@keyframes eng-sun-strong {
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.06); }
}
@keyframes eng-label-in {
  from { opacity: 0; transform: translateX(6px); }
  to { opacity: 1; transform: none; }
}
@media (max-width: 480px) {
  /* Em tela estreita, o rótulo curto não empurra a barra: vira só o essencial. */
  .eng-launcher-eyebrow { display: none; }
}

.eng-scrim {
  position: fixed; inset: 0; z-index: 70;
  display: flex; justify-content: flex-end;
  background: color-mix(in srgb, var(--bos-obsidian) 55%, transparent);
  opacity: 0; transition: opacity 460ms var(--bos-ease);
}
.eng-scrim.is-open { opacity: 1; }

.eng-panel {
  position: relative; overflow: hidden;
  width: min(100%, 30rem); height: 100%;
  display: flex; flex-direction: column;
  /* Obsidian sólido: o scrim escurece o resto, então o painel já lê "mais
     profundo" sem precisar de um preto fora do canon. */
  background: var(--bos-obsidian);
  border-left: 1px solid var(--bos-border);
  box-shadow: -24px 0 60px -30px color-mix(in srgb, var(--bos-obsidian) 85%, transparent);
  transform: translateX(24px); opacity: 0;
  transition: transform 620ms var(--bos-ease), opacity 620ms var(--bos-ease);
}
.eng-panel.is-open { transform: none; opacity: 1; }

.eng-blueprint {
  position: absolute; inset: 0; width: 100%; height: 45%;
  color: var(--bos-accent); opacity: 0.14; pointer-events: none;
  mask-image: radial-gradient(ellipse 80% 100% at 50% 0%, black 30%, transparent 80%);
}
.eng-blueprint path, .eng-blueprint circle {
  stroke-dasharray: 1400; stroke-dashoffset: 1400;
  transition: stroke-dashoffset 1400ms var(--bos-ease);
}
.eng-blueprint.is-drawn path, .eng-blueprint.is-drawn circle { stroke-dashoffset: 0; }

.eng-head {
  position: relative; z-index: 1;
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 1.5rem 1.5rem 1rem; border-bottom: 1px solid var(--bos-border);
}
.eng-head-mark { display: flex; align-items: center; gap: 0.75rem; }
.eng-head-arc { width: 2rem; height: 2rem; color: var(--bos-accent); }
.eng-eyebrow {
  font-size: 0.62rem; letter-spacing: 0.28em; text-transform: uppercase;
  color: color-mix(in srgb, var(--bos-imperial-gold) 75%, var(--bos-slate));
}
.eng-title { font-family: var(--bos-font-display); font-size: 1.4rem; color: var(--bos-text); line-height: 1.1; }
.eng-close {
  font-size: 0.75rem; color: var(--bos-muted); background: transparent; border: 0;
  cursor: pointer; padding: 0.25rem 0.5rem;
  transition: color var(--bos-duration) var(--bos-ease);
}
.eng-close:hover { color: var(--bos-text); }

.eng-scroll { position: relative; z-index: 1; flex: 1; overflow-y: auto; padding: 1.25rem 1.5rem; }

.eng-empty { padding-top: 1.5rem; }
.eng-empty-lead {
  font-family: var(--bos-font-display); font-size: 1rem; line-height: 1.55;
  color: color-mix(in srgb, var(--bos-ivory) 82%, transparent);
}
.eng-examples { margin-top: 1.5rem; display: flex; flex-direction: column; gap: 0.5rem; }
.eng-example {
  text-align: left; font-size: 0.82rem; color: var(--bos-text);
  padding: 0.6rem 0.85rem; border-radius: 0.5rem; cursor: pointer;
  background: color-mix(in srgb, var(--bos-midnight-ink) 60%, transparent);
  border: 1px solid var(--bos-border);
  transition: border-color var(--bos-duration) var(--bos-ease), background-color var(--bos-duration) var(--bos-ease);
}
.eng-example:hover { border-color: color-mix(in srgb, var(--bos-imperial-gold) 45%, transparent); }

.eng-msgs { display: flex; flex-direction: column; gap: 1.1rem; }
.eng-msg-who {
  font-size: 0.6rem; letter-spacing: 0.24em; text-transform: uppercase;
  color: var(--bos-muted); margin-bottom: 0.35rem;
}
.eng-msg-body { font-size: 0.9rem; line-height: 1.6; color: var(--bos-text); white-space: pre-wrap; }
.eng-msg-user .eng-msg-body { color: color-mix(in srgb, var(--bos-ivory) 78%, transparent); }
.eng-msg-assistant { border-left: 1px solid var(--bos-border); padding-left: 0.85rem; }
.eng-trace {
  margin-top: 0.5rem; font-family: var(--bos-font-mono); font-size: 0.65rem;
  color: color-mix(in srgb, var(--bos-imperial-gold) 65%, var(--bos-slate));
}

.eng-thinking { display: flex; gap: 0.35rem; padding: 0.85rem 0; }
.eng-dot { width: 5px; height: 5px; border-radius: 999px; background: var(--bos-accent); opacity: 0.4; animation: eng-blink 1.4s var(--bos-ease) infinite; }
.eng-dot:nth-child(2) { animation-delay: 0.2s; }
.eng-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes eng-blink { 0%,100% { opacity: 0.25; } 50% { opacity: 0.9; } }

.eng-composer {
  position: relative; z-index: 1;
  display: flex; gap: 0.5rem; align-items: flex-end;
  padding: 1rem 1.5rem 1.5rem; border-top: 1px solid var(--bos-border);
}
.eng-input {
  flex: 1; resize: none; max-height: 8rem;
  background: color-mix(in srgb, var(--bos-midnight-ink) 70%, transparent);
  border: 1px solid var(--bos-border); border-radius: 0.5rem;
  color: var(--bos-text); font-family: var(--bos-font-ui); font-size: 0.875rem;
  padding: 0.6rem 0.75rem; line-height: 1.5;
}
.eng-input:focus { outline: none; border-color: color-mix(in srgb, var(--bos-imperial-gold) 55%, transparent); }
.eng-send {
  flex-shrink: 0; font-size: 0.8rem; color: var(--bos-text); cursor: pointer;
  padding: 0.55rem 0.9rem; border-radius: 0.5rem;
  background: color-mix(in srgb, var(--bos-imperial-gold) 18%, transparent);
  border: 1px solid color-mix(in srgb, var(--bos-imperial-gold) 45%, transparent);
  transition: background-color var(--bos-duration) var(--bos-ease);
}
.eng-send:hover:not(:disabled) { background: color-mix(in srgb, var(--bos-imperial-gold) 28%, transparent); }
.eng-send:disabled { opacity: 0.4; cursor: default; }

@media (max-width: 640px) { .eng-panel { width: 100%; } }
`;

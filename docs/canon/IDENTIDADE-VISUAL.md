# 🎨 IDENTIDADE VISUAL — ALSHAM BUSINESS OS™
## Direção de Arte "Império Institucional Digital" · v1.0

**Status:** CANON (selo do dono, 27/07/2026) · **Destino:** `docs/canon/IDENTIDADE-VISUAL.md`
**Consumidor técnico:** `packages/ui` (tokens na §7) — nada de UI nasce fora destes tokens.

> **Alinhamento canônico (STYLUS X.1 / Lei dos Planetas):** obsidian + ouro é a PELE DA ALSHAM — e o Business OS, satélite da ALSHAM, herda essa pele com legitimidade. As cores verticais da §3 valem **dentro da UI do Business OS** (identificar tenants/verticais); elas NUNCA sobrescrevem a pele própria de cada mundo do Universo Bonaparte. A marca ALSHAM existente nunca é redesenhada — usa-se o arquivo oficial.

**Sistema em uma frase:**
> **Preto de instituição + Ouro de Sol Único + Serifa de Carta Magna + Grid de App Store.**
> Nada mais entra sem justificar por que a Catedral precisa daquela pedra.

**Referência de postura:** Stripe + Palantir + Linear + Rolls-Royce. Nunca "SaaS colorido de Product Hunt".

---

## 1. PALETA PRIMÁRIA — "Ouro do Império sobre Noite Institucional"

Base escura e densa, com **um único metal quente** como acento — o Sol Único vira literalmente o único ponto de luz da paleta.

| Papel | Nome | HEX | Uso |
|---|---|---|---|
| Preto Fundação | **Obsidian** | `#0A0E1A` | Fundo principal, canvas do produto, hero de landing |
| Azul Carta Magna | **Midnight Ink** | `#111827` | Superfícies elevadas, cards, sidebars |
| Azul Estrutural | **Steel Navy** | `#1E293B` | Bordas suaves, hover states, divisórias |
| Ouro Sol Único ⭐ | **Imperial Gold** | `#C9A24B` | ACENTO ÚNICO — logo, CTAs primários, ícones-chave, linhas de destaque |
| Ouro Luz | **Champagne** | `#E8D9A8` | Hover no ouro, gradiente sutil sobre o dourado |
| Marfim Documento | **Parchment** | `#F5F1E8` | Fundo de "documentos oficiais" (Carta Magna, dossiês) |
| Branco Institucional | **Ivory White** | `#FAFAF7` | Tipografia principal sobre fundos escuros |
| Cinza Silêncio | **Slate 400** | `#94A3B8` | Texto secundário, metadados |

## 2. PALETA FUNCIONAL — Estados do Sistema

Dessaturadas de propósito — nada de verde-fluorescente-Bootstrap.

| Estado | Nome | HEX | Uso |
|---|---|---|---|
| Sucesso | Verde-musgo | `#4A7C59` | RLS ativa, "PROVADO", tenant ativo |
| Alerta | Âmbar velho | `#B8860B` | "DOSSIÊ" — descrito, não provado |
| Erro | Bordô institucional | `#8B2E2E` | "NÃO TEMOS", violação, breach |
| Info | Azul selo | `#3B5B8C` | Notas, tooltips, ajuda |

**Regra de ouro:** os estados NUNCA competem com o Imperial Gold. O ouro é do sistema; verde/âmbar/bordô são operacionais.

## 3. PALETA VERTICAL — Uma cor por OS/Domínio

Cada vertical recebe **uma cor institucional própria**, sempre dessaturada, sempre convivendo com o ouro central. (Ressalva da Lei dos Planetas no topo deste documento.)

| Vertical | HEX | Racional |
|---|---|---|
| Medical OS / Saúde-Governo (Peritus) | `#2C5F5D` verde-hospital sério | Autoridade clínica |
| Casa Bonaparte (referência na UI) | `#7C2D3A` bordô napoleônico | Referência ao nome |
| Kraken (conteúdo/multi-tenant) | `#1E3A5F` azul-abissal | Profundidade técnica |
| Conversion OS (autoridade individual) | `#8B6F47` bronze quente | Elegância consultiva |
| Events OS | `#3D2E5C` roxo-tinta | Cerimônia |
| Cognitive Mirror (IA) | `#4A5568` grafite espelhado | Reflexão/IA |

Verticais futuras (Shopping, Varejo, Energia…) recebem cor por este mesmo critério: dessaturada, institucional, subordinada ao ouro. Nova cor exige registro aqui (Sol Único — sem paleta paralela).

## 4. TIPOGRAFIA — "Documento Oficial + Interface Silenciosa"

- **Display / títulos institucionais:** Fraunces (alternativa: GT Sectra) — serifa moderna com peso de manuscrito imperial. Para "Carta Magna", "Taxonomia", nomes de OS.
- **UI / produto:** Inter (alternativa: Söhne) — grotesque neutra, densidade Stripe/Linear.
- **Código / refs técnicas:** JetBrains Mono (alternativa: Berkeley Mono) — para `tenant_id`, refs, schemas.
- **Numerais:** tabular figures — dashboard e billing alinham coluna a coluna.

**Hierarquia:** título serifa dourada → subtítulo grotesque ivory → corpo grotesque slate → código mono champagne.

## 5. DIREÇÃO GRÁFICA — Elementos recorrentes

1. **O Sol Único** — círculo (ou arco) dourado como assinatura gráfica: logo, loader, favicon, canto dos documentos oficiais. **Nunca dois sóis na mesma peça.**
2. **A Planta antes da Obra** — linhas técnicas finas (0.5px) douradas sobre preto, estilo blueprint arquitetônico. Landing, onboarding, docs.
3. **Selos e brasões** — cabeçalhos de documentos internos ganham selo minimalista dourado, timbrado de tabelionato modernizado.
4. **Grid modular** — grid de 12 colunas, referência ao Lego/App Store. Cards com borda `1px` em Imperial Gold a 15% de alpha (bordas alpha, nunca sólidas).
5. **Fotografia** — preto-e-branco, alto contraste, luz lateral dura. Zero stock colorido. Referência: relatório anual, não site de agência.
6. **Movimento** — animações lentas, easing cinematográfico `cubic-bezier(0.16, 1, 0.3, 1)`, 600–900ms. Nada de bounce, nada de spring divertido.

## 6. ANTI-BRAND — o que a ALSHAM NÃO é

- ❌ Gradientes roxo→rosa→laranja (SaaS genérico 2021)
- ❌ Ilustrações "Corporate Memphis" (bonequinhos coloridos)
- ❌ Emojis dentro do produto (só em documentos internos como este)
- ❌ Neon, glassmorphism vazio, blobs orgânicos
- ❌ Verde-lime, ciano elétrico, magenta
- ❌ Copy "Let's build something amazing 🚀"

**O Teste Bonaparte (STYLUS):** removidos logo, nome e texto, a peça ainda é reconhecível como nossa? Se parecer "mais uma landing SaaS", falhou.

## 7. TOKENS — fonte única para `packages/ui`

```css
:root {
  /* primária */
  --bos-obsidian:      #0A0E1A;
  --bos-midnight-ink:  #111827;
  --bos-steel-navy:    #1E293B;
  --bos-imperial-gold: #C9A24B;
  --bos-champagne:     #E8D9A8;
  --bos-parchment:     #F5F1E8;
  --bos-ivory:         #FAFAF7;
  --bos-slate:         #94A3B8;

  /* estados */
  --bos-success: #4A7C59;
  --bos-warning: #B8860B;
  --bos-danger:  #8B2E2E;
  --bos-info:    #3B5B8C;

  /* verticais */
  --bos-v-medical:    #2C5F5D;
  --bos-v-casa:       #7C2D3A;
  --bos-v-kraken:     #1E3A5F;
  --bos-v-conversion: #8B6F47;
  --bos-v-events:     #3D2E5C;
  --bos-v-mirror:     #4A5568;

  /* superfícies e semântica */
  --bos-bg:           var(--bos-obsidian);
  --bos-surface:      var(--bos-midnight-ink);
  --bos-border:       color-mix(in srgb, var(--bos-imperial-gold) 15%, transparent);
  --bos-text:         var(--bos-ivory);
  --bos-text-muted:   var(--bos-slate);
  --bos-accent:       var(--bos-imperial-gold);
  --bos-accent-hover: var(--bos-champagne);

  /* movimento */
  --bos-ease: cubic-bezier(0.16, 1, 0.3, 1);
  --bos-duration: 700ms;

  /* tipografia */
  --bos-font-display: "Fraunces", serif;
  --bos-font-ui:      "Inter", system-ui, sans-serif;
  --bos-font-mono:    "JetBrains Mono", monospace;
}
```

**Regras de consumo:** nenhum HEX solto em componente — só via token. Estado nunca usa o ouro. Borda sempre alpha. Hierarquia por tamanho+peso+espaço, nunca só por cor.

---

*Base: direção de arte aprovada pelo fundador em 27/07/2026, alinhada ao STYLUS X.1 e à Lei dos Planetas. Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*

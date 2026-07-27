# 🏛 ALSHAM BUSINESS OS™

**Sistema Operacional Empresarial Modular · ALSHAM Global Commerce Ltda**

A empresa não compra "um sistema". Ela monta o sistema dela — Core + módulos, como Lego. Cada cliente novo financia um módulo que vira patrimônio da plataforma para todos os próximos.

> **Status: FUNDAÇÃO (pré-obra).** Este repositório contém, por enquanto, a PLANTA — nenhum código de produto foi escrito ainda. Nada daqui está no ar, nada daqui é promessa pública (Lei 7).

---

## 📐 A planta antes da obra (VERTEX)

Nenhuma linha de código, schema ou configuração nasce neste repo sem antes ler:

1. **[docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md](docs/canon/TAXONOMIA-EMPRESARIAL-ALSHAM.md)** — o mapa canônico: hierarquia oficial, 407 capacidades, 50 categorias, dimensões de Agentes e Integrações. É a ÚNICA taxonomia (Sol Único).
2. **[docs/canon/ROADMAP-TECNICO-V1.md](docs/canon/ROADMAP-TECNICO-V1.md)** — a ordem de engenharia: Core primeiro, fases, regras de arquitetura.
3. A **Carta Magna do ALSHAM Platform Framework™** (repo `alsham-events-os`) — o canon-mãe de que este produto herda a hierarquia Core → Engines → Domains → OS → Tenant.

E, antes de escolher de onde minerar cada peça:

4. **[docs/balancos/BALANCO-DE-TECNOLOGIA-BUSINESS-OS.md](docs/balancos/BALANCO-DE-TECNOLOGIA-BUSINESS-OS.md)** — o que o império já tem para cada peça, com estado PROVADO · DOSSIÊ · NÃO TEMOS.
5. **[docs/balancos/BALANCO-SUPABASE.md](docs/balancos/BALANCO-SUPABASE.md)** — o que cada um dos 12 bancos doa, e o que é pedreira de schema (minerar) versus banco a reutilizar (nunca).

Memória, não canon:

6. **[docs/historico/ALSHAM-STORE-CATALOGO-COMPLETO.md](docs/historico/ALSHAM-STORE-CATALOGO-COMPLETO.md)** — a versão anterior da taxonomia (397 módulos · 49 categorias). Fica como histórico; em qualquer divergência, a Taxonomia canônica vence (Sol Único).

## ⚖️ As 6 Leis do Projeto

1. **Lei 7 (fonte):** nenhum número ou promessa vai ao ar sem estar construído e provado.
2. **Lei anti-viés:** o cliente inaugural decide a ORDEM da fila de módulos, nunca o CONTEÚDO. Teste de todo requisito: *"outra empresa do mesmo setor usaria isso exatamente como está?"* Se não — camada de tenant ou serviço à parte.
3. **Construir × INTEGRAR:** folha (eSocial), fiscal (NF/SPED/SAT) e PDV integram-se por padrão; construir só com decisão de dono explícita.
4. **Lei do Reaproveitamento:** CRM = 360° PRIMA · Saúde = Peritus · Eventos = Events OS · Beleza = Suprema · Agentes = Exército/Santuário · Billing = padrão provado da Casa. Nenhum Domain começa do zero se já existe peça no império.
5. **Propriedade:** IP 100% ALSHAM Global. Cliente usa; nunca detém motor nem chaves-mãe. Cliente inaugural = parceiro de desenvolvimento (banca custo em troca de uso), sem exclusividade de setor. **Identidade de cliente nunca entra neste repositório.**
6. **Sol Único:** uma taxonomia, uma fonte de verdade. Documento que organizar capacidades referencia a Taxonomia, nunca cria outra.

## 🧭 Regras de arquitetura (resumo)

Todo módulo: independente, instalável/removível sem recompilar, comunicação SÓ pelo Core, APIs + eventos, permissões próprias, docs + testes, multi-tenant de nascença, agente de IA embarcado sempre que possível (doutrina da Casa). Nada nasce antes do Core.

## 🗂 Estrutura do repositório

```
docs/
  canon/       taxonomia + roadmap        — leitura obrigatória (VERTEX)
  balancos/    tecnologia + supabase      — de onde minerar cada peça
  historico/   catálogo anterior          — memória, não canon
apps/
  admin/  portal/  store/  api/           — só README, NÃO INICIADO
packages/
  core/ auth/ organizations/ permissions/ workflow/ billing/
  notifications/ documents/ ai/ crm/ finance/ marketing/
  legal/ hr/ analytics/ integrations/ ui/ sdk/ config/
                                          — só README, NÃO INICIADO
CLAUDE.md      instruções permanentes para qualquer agente neste repo
NOTICE.md      propriedade e reserva de direitos
```

Cada `README.md` de app e de package declara: o propósito, a fase do roadmap a que pertence, de onde a peça será minerada (com o estado que o Balanço registrou) e o status atual — hoje, **NÃO INICIADO** em todos.

## 🏗 Estado da fundação (Etapa 0)

O que esta etapa entregou: saneamento da raiz, esqueleto do monorepo, `CLAUDE.md` e governança mínima. **Zero lógica, zero migration, zero client de banco.**

O que esta etapa deliberadamente NÃO fez: a escolha de banco (Linha A recomendada no Balanço de Tecnologia, §4) está **PENDENTE DE SELO DO DONO**. Enquanto não houver selo, nenhuma dependência de banco entra neste repositório.

---

*Universo Bonaparte · Powered by ALSHAM · jul/2026*

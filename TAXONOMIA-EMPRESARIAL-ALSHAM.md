# 🏛 TAXONOMIA EMPRESARIAL ALSHAM™
## O Mapa Canônico das Capacidades — ALSHAM Business OS™ & ALSHAM Store™

**Versão:** 1.0 · **Data:** 27/07/2026 · **Status:** Canônico (merge do dono)
**Natureza:** Este documento é MAPA E LEITURA, não promessa. Nada daqui vai a site, proposta ou anúncio como "temos X módulos" sem estar construído (Lei 7). Ele existe para nunca esquecermos o tamanho do oceano — e para que toda decisão de arquitetura, produto e marketplace obedeça a UMA taxonomia só (Sol Único).

---

## 1. A HIERARQUIA OFICIAL

A taxonomia usa os nomes da **Carta Magna do ALSHAM Platform Framework™** (canon vigente). Nomes alternativos ficam registrados como apelidos, nunca como segunda taxonomia.

```
EMPRESA (ALSHAM Global)
  └── FRAMEWORK (ALSHAM Platform Framework™)
        └── CORE            — a fundação; nunca muda
              └── ENGINES   — serviços compartilhados; usados por todos, NÃO aparecem na Store
                    └── DOMAINS      — módulos universais; toda empresa usa
                          └── CAPACIDADES — as unidades de valor dentro de cada Domain
                                └── OS (VERTICAIS) — pacotes por setor; reutilizam os Domains
                                      └── TENANT — o cliente, com sua configuração
```

**Duas dimensões transversais**, com marketplaces próprios:
- 🧠 **AI Marketplace** — agentes (quem executa). Agente NÃO é módulo.
- 🌎 **Integrações** — pontes externas (infraestrutura). Integração NÃO é módulo.

**Módulo × Capacidade:** capacidade é a unidade do mapa; módulo é a unidade de EMPACOTAMENTO. Quantas capacidades viram um módulo instalável (ou ficam agrupadas num módulo maior) é decisão de produto, tomada caso a caso — o mapa não decide isso.

---

## 2. TOTAIS DO MAPA

**407 capacidades empresariais**, assim distribuídas:

| Camada | Categorias | Capacidades |
|---|---|---|
| Core | 1 | 12 |
| Engines (Serviços Compartilhados) | 1 | 14 |
| Domains Universais | 18 | 171 |
| OS / Verticais | 29 | 198 |
| Integrações | 1 | 12 |
| **Total** | **50** | **407** |
| 🧠 Dimensão de Agentes (à parte) | 1 | 12 iniciais |

*(Nota de honestidade: versões anteriores citavam "397/414 módulos". A reorganização em camadas eliminou duplicações — Documentos contado uma vez, Utilidades absorvida pelos Engines, Core enxuto — e o número correto do mapa é 407 capacidades.)*

---

## 3. 🏛 CORE — a fundação (12)
Nunca muda. Tudo depende dele. Nenhum Domain nasce antes do Core.

Organização · Multiempresa · Usuários · Autenticação · Permissões (RBAC) · Billing · Workflow Engine · IA Base · Motor da Store (Marketplace) · Storage & Arquivos · APIs & Eventos · Auditoria

## 4. ⚙️ ENGINES — Serviços Compartilhados (14)
Usados por qualquer Domain ou Vertical. **Não aparecem na Store** — são encanamento da plataforma.

Notificações · Chat · E-mail · Agenda · Vídeo · Whiteboard · Wiki · Central de Ajuda · Tickets · GED (Documentos) · OCR · Assinaturas Digitais · Busca Inteligente · Analytics & Dashboards

---

## 5. 📦 DOMAINS UNIVERSAIS — 18 domínios · 171 capacidades
Praticamente toda empresa usa. Cada Domain agrupa suas capacidades; o empacotamento em módulos instaláveis é decisão de produto.

**💰 Financeiro (19)**
Contas a pagar · Contas a receber · PIX · Boletos · Fluxo de caixa · Tesouraria · Conciliação bancária · Cobrança · DRE · Balancete · Orçamento · Centro de custo · Rateio · Impostos · Caixa · Bancos · Cartões · Investimentos · Aprovações financeiras

**🤝 Comercial & CRM (12)** — *reaproveita 360° PRIMA*
CRM · Pipeline · Propostas · Orçamentos · Follow-up · Visitas · Clientes · Leads · WhatsApp · Ligações · Comissão · Metas

**👥 RH (14)**
Recrutamento · Seleção · Currículos · Admissão · Demissão · Férias · Ponto · Escalas · Benefícios · Folha · Treinamentos · Avaliação · OKRs · Plano de carreira

**⚖ Jurídico (12)**
Contratos · Procurações · Processos · Compliance · LGPD · Assinaturas · Pareceres · Auditoria jurídica · Licenças · Certidões · Prazos · Intimações

**📢 Marketing (13)**
Campanhas · Eventos · Social media · Calendário · Design · Briefings · Produção · Branding · Influenciadores · Mídia · CRM marketing · E-mail marketing · Landing pages

**📦 Compras (9)**
Solicitações · Cotações · Aprovações · Fornecedores · Pedidos · Recebimento · Contratos de fornecimento · Avaliação de fornecedores · Estoque mínimo

**🏭 Operações (10)**
Ordens de serviço · Checklist · Manutenção · Facilities · Ocorrências · Segurança · Patrimônio · Almoxarifado · Estoque · Inventário

**🔗 Supply Chain (7)** — *separado de Compras*
Planejamento de demanda · S&OP · Distribuição · Centros de distribuição · Cadeia de fornecimento · Abastecimento · Performance logística

**📋 PMO & Projetos (10)** — *mercado bilionário próprio*
Projetos · Cronogramas · Kanban · Scrum · Gantt · Recursos · Custos · Riscos · Timesheet · Portfólio

**🧪 Qualidade (7)**
Não conformidades · Auditorias · ISO · CAPA · Indicadores · Documentos de qualidade · Procedimentos

**💬 Atendimento ao Cliente (CX) (8)**
SAC · Omnichannel · Base de conhecimento · Pesquisas NPS/CSAT · Reclamações · Garantias · Pós-venda · Fidelização

**📊 BI (7)**
Dashboards · KPIs · Indicadores · Metas · Relatórios · Cubos · Data warehouse

**🤖 IA Aplicada (9)** — *reaproveita o Exército ALSHAM*
Agentes · Chat corporativo · Automações · Resumos · Análise de dados · Classificação · OCR IA · Pesquisa inteligente · Copiloto

**🏛 Governança, Riscos & Compliance (GRC) (7)**
Gestão de riscos · Controles internos · Políticas · Auditorias · Canal de denúncias · Compliance corporativo · Matriz de riscos

**🔐 Segurança da Informação (7)**
IAM · Cofre de segredos · Gestão de vulnerabilidades · SIEM/Monitoramento · Backup · Continuidade de negócios · Resposta a incidentes

**🌱 ESG & Sustentabilidade (6)**
Inventário de carbono · Indicadores ESG · Gestão de resíduos · Consumo de água · Consumo de energia · Relatórios ESG

**🔬 Pesquisa & Desenvolvimento (6)**
Ideias · Pipeline de inovação · Projetos de pesquisa · Propriedade intelectual · Patentes · Portfólio tecnológico

**🧾 Contábil & Fiscal (8)** — *fronteira construir × INTEGRAR (ver regra 3)*
NF-e · NFS-e · NFC-e · SPED · eSocial · Apuração de impostos · Integração com contador · Certificado digital

---

## 6. 🏙 OS / VERTICAIS — 29 setores · 198 capacidades
Pacotes por setor. Reutilizam os Domains universais e acrescentam só o que é do ofício.

**🛍 Shopping Centers (9)** — *dor viva do cliente inaugural*
Lojistas · Contratos de locação · Aluguéis · Fundo de promoção · Marketing do mall · Eventos do mall · Segurança · Facilities · Estacionamento

**🛒 Varejo & Supermercados (7)** — *dor viva do cliente inaugural*
PDV · Estoque de varejo · Caixa · Promoções · Fidelidade · Catálogo · Marketplace próprio

**☀️ Energia (8)** — *dor viva do cliente inaugural: fazendas solares*
Usinas · Geração distribuída · Assinatura de energia · Monitoramento de geração · Manutenção de usina · Créditos de compensação · Contratos de energia · Comercialização e leads

**🏥 Saúde (8)** — *vertical viva: Peritus / Medical OS™*
Pacientes · Agenda médica · Prontuário · Convênios · Receitas · Exames · Faturamento TISS · Telemedicina

**🏛 Governo (8)** — *vertical viva: Peritus, 2 prefeituras*
Protocolo · Ouvidoria · Licitações · Convênios · Patrimônio público · Tributos · Obras · Fiscalização

**🎪 Eventos (8)** — *vertical viva: Events OS™*
Ingressos · Credenciamento · Programação/line-up · Fornecedores de evento · Patrocínios · Afiliados · Check-in · Pós-evento

**💇 Beleza & Estética (6)** — *vertical viva: Suprema Beleza*
Agendamento · Profissionais · Comissões · Pacotes · Fidelidade · Estoque de produtos

**🌾 Agro (8)**
Fazendas · Talhões · Safras · Máquinas agrícolas · Pecuária · Irrigação · Clima · Insumos

**🚚 Logística (7)**
Frota · Rotas · Entregas · Rastreamento · Motoristas · Combustível · Pedágios

**🚜 Frota Pesada & Máquinas (7)** — *diferente da Logística*
Máquinas · Tratores · Escavadeiras · Manutenção preventiva · Horímetro · Pneus · Combustível

**⚙ Indústria (7)**
Produção · PCP · Qualidade · Máquinas · OEE · Manutenção industrial · Chão de fábrica

**🏗 Construção Civil (8)**
Obras · Orçamento de obra · Cronograma físico-financeiro · Medições · Diário de obra · Fornecedores de obra · Segurança do trabalho · Incorporação

**🏢 Imóveis (6)**
Locação · Condomínio · IPTU · Vistorias · Carteira de imóveis · Corretores

**🏘 Condomínios (7)**
Unidades · Assembleias · Taxas · Reserva de áreas comuns · Portaria · Encomendas · Comunicados

**🎓 Educação (7)**
Alunos · Professores · Cursos · Aulas · Provas · Biblioteca · Certificados

**🏨 Hotelaria (6)**
Reservas · Hóspedes · Governança/limpeza · Restaurante do hotel · Eventos do hotel · Financeiro hoteleiro

**🍽 Restaurantes (6)**
Mesas · Pedidos · Delivery · Cozinha (KDS) · Estoque de insumos · Cardápio digital

**🏋️ Fitness & Academias (6)**
Matrículas · Planos · Treinos · Avaliação física · Controle de acesso · Cross-sell

**🐾 Pet & Veterinária (6)**
Tutores · Pets · Prontuário veterinário · Banho e tosa · Vacinas · Loja pet

**⛪ Igrejas & ONGs (6)**
Membros · Dízimos e doações · Células/grupos · Eventos · Voluntários · Prestação de contas

**🛒 E-commerce (7)**
Loja virtual · Catálogo · Checkout · Frete · Cupons · Recuperação de carrinho · Assinaturas de produto

**🧪 Laboratórios (7)**
Amostras · Coletas · Laudos · Equipamentos · Qualidade · Reagentes · Rastreabilidade

**🛡 Seguros & Corretoras (6)**
Apólices · Sinistros · Renovações · Comissões · Seguradoras · Clientes

**🤲 Cooperativas (6)**
Cooperados · Rateios · Assembleias · Produção · Distribuição · Sobras

**⛏ Mineração (6)**
Jazidas · Equipamentos · Produção · Meio ambiente · Licenciamento · Segurança

**⚓ Portos & Aeroportos (6)**
Operações · Cargas · Atracações · Pátio · Gate · Segurança

**📡 Telecom (6)**
Clientes · Planos · Faturas · Infraestrutura · Chamados · Cobertura

**🏪 Franquias (7)**
Franqueados · Royalties · Expansão · Auditorias · Marketing cooperado · Suporte · Performance

**🌐 Metaverso Corporativo (6)** — *dossiê arquivado como canon FUTURO, pós-lançamento*
Escritório virtual · Salas privadas · Áudio espacial · Whiteboard colaborativo · Recepção com NPC de IA · Eventos virtuais

---

## 7. 🧠 DIMENSÃO 2 — AI MARKETPLACE (Store de Agentes)

Agente NÃO é módulo. Módulos = o que a empresa faz; agentes = quem executa ou auxilia. Marketplace separado; qualquer módulo pode instalar um ou mais agentes.

**Agentes iniciais (12):**
Agente Financeiro · Agente Jurídico · Agente RH · Agente Comprador · Agente Auditor · Agente Vendedor · Agente Contador · Agente Médico · Agente Engenheiro · Agente de Marketing · Agente CEO · Agente PMO

**Vantagem que só a ALSHAM tem:** esta dimensão não parte do zero. O império já possui o Exército ALSHAM (112+ agentes catalogados, 200 almas fundadoras em resgate para o Santuário) e a doutrina da Casa: *"sempre que puder, implantar um agente dentro do sistema."* Infra candidata construída: Cognitive Mirror (schema de marketplace com preço/assinatura/capabilities) · Cápsula X.2 (formato da alma) · Quantum (motor e limite de uso).

## 8. 🌎 DIMENSÃO 3 — INTEGRAÇÕES (12)

Integração NÃO é módulo. É infraestrutura — pontes com o mundo externo.

WhatsApp · PIX · Bancos (Open Finance) · Receita Federal · Gov.br · Google · Microsoft · Meta · Stripe · Mercado Pago · SAP · TOTVS

---

## 9. REGRAS DE ARQUITETURA

Todo módulo empacotado a partir deste mapa deve:
1. Ser independente — instalável e removível sem recompilar
2. Nunca depender diretamente de outro módulo — toda comunicação passa pelo Core
3. Expor APIs e emitir eventos
4. Ter permissões próprias, documentação e testes
5. Ter IA opcional (doutrina da Casa: agente embarcado sempre que possível)
6. Nascer multi-tenant, com banco desacoplado quando possível
7. Nunca iniciar antes do Core estar pronto

## 10. LEIS DO PROJETO (Business OS)

1. **Lei 7 (fonte):** este mapa é leitura; nenhum número dele vai ao ar como promessa
2. **Lei anti-viés:** o cliente inaugural decide a ORDEM da fila de módulos, nunca o CONTEÚDO. Todo requisito passa pelo teste: *"outra empresa do mesmo setor usaria isso exatamente como está?"* Se não — vira configuração do tenant ou serviço cobrado à parte
3. **Fronteira construir × INTEGRAR:** Folha (eSocial), fiscal (NF/SPED/SAT) e PDV são empresas inteiras. Por padrão, INTEGRA-SE (TOTVS, contabilidade, adquirentes); construir só com decisão de dono explícita
4. **Lei do Reaproveitamento:** CRM = 360° PRIMA · Saúde = Peritus · Eventos = Events OS · Beleza = Suprema · Agentes = Exército/Santuário/Cognitive Mirror · Billing = padrão provado da Casa. Nenhum Domain começa do zero se já existe peça no império
5. **Propriedade:** IP 100% ALSHAM Global. O cliente usa; nunca detém o motor nem as chaves-mãe. Cliente inaugural = parceiro de desenvolvimento (banca custo em troca de uso), sem exclusividade de setor
6. **Sol Único:** esta é a ÚNICA taxonomia. Qualquer documento futuro que organize capacidades referencia esta, nunca cria outra

## 11. 📐 A LEITURA DO OCEANO

Cada categoria deste mapa é hoje um mercado inteiro no Brasil, dominado por um player que vende SÓ ela: TOTVS/SAP (ERP) · Linx (varejo) · RD Station (marketing) · Gupy (RH) · Conta Azul (financeiro) · Sienge (construção) · Superlógica (condomínios) · Zendesk (CX) · Monday/MS Project (PMO). **Nenhum vende tudo plugável numa Store — e nenhum tem a dimensão de agentes.** O comprador brasileiro costura 5 a 10 sistemas que não se falam.

A tese ALSHAM: um Core, uma Store de módulos, uma Store de agentes — e o cliente monta o próprio sistema como quem instala aplicativos. Cada cliente novo financia um módulo que vira patrimônio da plataforma para todos os próximos. **O primeiro shopping paga o módulo Shopping. Para sempre.**

---

## 12. PROVENIÊNCIA
- Base: docs do fundador de 27/07/2026 (ALSHAM OS™ · ALSHAM Store™ · Roadmap Técnico V1.0 · Dossiê Metaverso)
- Expansões: 1ª rodada (11 categorias) e 2ª rodada (14 categorias) — guia + revisão externa
- Reestruturação em camadas + conceito "capacidades": revisão externa de 27/07, absorvida na taxonomia da Carta Magna (nunca como taxonomia paralela)
- Acréscimos da revisão final: PMO & Projetos, Qualidade

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*

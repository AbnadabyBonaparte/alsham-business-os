# MÓDULO 70 — Certificado Digital (`fiscalcert`)

> Domain 🧾 **Contábil & Fiscal** (`accounting`) · Onda Dezessete (Fase 2) · migration `0085_fiscalcert.sql` · pacote `@alsham/fiscalcert`
> **ABRE** o Domain Contábil & Fiscal — o mais restrito do mapa, **por lei**.

---

## 1. O QUE É

O **registro de metadados** dos certificados digitais da empresa: o **tipo**
(e-CNPJ, e-CPF, e-NF-e — texto livre), o **titular** e — o dado que justifica o
módulo — a **validade** (quando vence). É a agenda que avisa "o e-CNPJ vence em
30 dias", **não** o lugar onde o certificado mora.

---

## 2. ⚠️⚠️ A LEI 3 MANDA — 7 das 8 capacidades ficam FORA (assinado)

O Domain Contábil & Fiscal tem 8 capacidades. **Sete não nascem como schema neste
produto**, e não por preguiça: a **Lei 3** (README/CLAUDE.md §2) é explícita —
*"folha (eSocial), fiscal (NF/SPED/SAT) e PDV são empresas inteiras; por padrão,
INTEGRA-SE, construir só com decisão de dono explícita"*.

| Capacidade | Decisão | Por quê |
|---|---|---|
| **NF-e · NFS-e · NFC-e · SPED · eSocial** | **FORA — integração** | documentos/obrigações **emitidos e validados pelo Fisco**: exigem certificado válido, assinatura criptográfica e webservices governamentais homologados (SEFAZ, Receita, eSocial) — na prática, uma biblioteca/parceiro fiscal **certificado**. Construí-los como schema seria fingir competência fiscal que este produto não tem, e expor o cliente a **autuação**. |
| **Apuração de impostos** | **FORA — integração** | cálculo tributário correto depende de regime, NCM, CFOP, substituição tributária: é **motor de cálculo fiscal certificado**, não CRUD de Domain. |
| **Integração com contador** | **FORA** | é, pelo nome, o **ponto de integração**. O contato do contador é o `crm` genérico — não se duplica. |
| **Certificado digital** | ✅ **este módulo** | e mesmo ela, **apenas o registro de metadados**. |

---

## 3. ⭐⭐ UM LEMBRETE DE VALIDADE, NÃO UM COFRE CRIPTOGRÁFICO

`fiscalcert.certificates` guarda **tipo, titular e validade**. O que **NÃO entra,
nem disfarçado** (e há guarda de CI + teste SQL):

- ⛔ o **arquivo** do certificado (`.pfx`/`.p12`) — Storage do Core, NÃO
  construído; e mesmo se existisse, uma credencial privada **jamais** passaria
  pela Store genérica sem uma decisão de segurança à parte;
- ⛔ a **chave privada** — nunca toca este banco;
- ⛔ qualquer **operação de assinatura** — não existe função `*sign*` no schema;
- ⛔ **alerta automático** de vencimento — seria Engine de notificação
  (capacidade futura). Este módulo **guarda** a data; quem avisa é outra frente.
  A camada pura oferece `isExpiredAsOf(cert, asOf)` — mas a data de referência
  vem **por parâmetro**, nunca o relógio.

`valid_until` é **obrigatória** (o coração do módulo). `valid_from` é opcional;
se houver, uma constraint garante `valid_until >= valid_from`.

---

## 4. ⭐ O CICLO — `active ↔ archived` (a física do `vendor`)

O certificado revogado, vencido ou trocado é **arquivado, não apagado**: o
registro histórico continua consultável. E `archived → active` existe — se o
registro voltar a fazer sentido, volta (a física do `vendor`/`dc`, não a do `hr`
terminal). Arquivar/reativar exige a permissão **própria** `certificate.decide`
(separada de `certificate.manage`), e o `ALLOWED_TRANSITIONS` do pacote espelha
`fiscalcert.allowed_transition()` (teste lê os dois). Sem DELETE: o certificado
é história de assinatura.

---

## 5. ESTADO

✅ **CONSTRUÍDO na Onda Dezessete (Fase 2 — ABRE o Domain Contábil & Fiscal).**
**Arquivo, ainda não aplicado** — aplicar é ato do dono (runbook §30).

- `supabase/migrations/0085_fiscalcert.sql` — `fiscalcert.certificates`, RLS,
  ciclo `active ↔ archived` (`allowed_transition` + guardas + `decide`),
  coerência de datas, `valid_until` obrigatória. **Sem** coluna de cofre, **sem**
  função de assinatura.
- `packages/fiscalcert` — manifesto, tipos, motor (`ALLOWED_TRANSITIONS`,
  `isExpiredAsOf` por parâmetro, ordenação por vencimento) e três suítes de teste
  (manifesto × seed + as assertivas anti-cofre; validação; ciclo + o contraste
  com o `vendor`).
- `supabase/tests/75_fiscalcert_isolation.sql` — isolamento, vencimento
  obrigatório, coerência de datas, `active ↔ archived` com `decide`, a prova de
  que não há cofre, cross-tenant, `anon` fora, os fatos no correio.
- Seed: cartão 70 (`domain_key='accounting'`). Catálogo **69 → 70**.
- Portal: página placeholder `/certificados` + item de menu.

⭐ **Ao aplicar (runbook §30):** expor o schema `fiscalcert` na Data API; **sem
redeploy** (`consumes` vazio). Próxima migration livre: **`0086`**.

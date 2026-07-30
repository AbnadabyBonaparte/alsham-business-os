# ⚖️ LEI ANTI-VIÉS & LEI EDUCATIVA
## Duas leis que se sustentam juntas — ALSHAM Business OS™

**Versão:** 1.0 · **Data:** 30/07/2026 · **Status:** Canônico
**Natureza:** Este documento é LEI — rege toda decisão de arquitetura, produto e implantação do ALSHAM Business OS. Nenhum módulo, tela ou contrato de cliente pode contradizê-lo.

---

## 1. O PROBLEMA QUE ESTAS DUAS LEIS RESOLVEM

Todo sistema de gestão enfrenta a mesma tentação: moldar-se ao primeiro cliente grande que aparece. É o caminho mais rápido — e o mais destrutivo. Um sistema que nasce copiando o vocabulário e os vícios de uma única empresa vira, com o tempo, um sistema que só serve àquela empresa.

A ALSHAM decide o oposto, por duas leis que trabalham em conjunto e nunca se contradizem:

- A **Lei Anti-Viés** protege o VOCABULÁRIO — nenhuma empresa impõe seus nomes, suas etapas ou suas categorias como padrão do produto.
- A **Lei Educativa** protege a DISCIPLINA DO PROCESSO — o sistema não se curva aos vícios operacionais que uma empresa carrega por falta de estrutura. Quem entra torto, sai reto.

Uma lei impede que o produto vire refém de um cliente. A outra garante que o produto eleve esse cliente.

---

## 2. LEI ANTI-VIÉS

> Etapa, estágio, categoria, prioridade e gravidade são **DADO DO TENANT** — vivem em tabela própria, de nome livre, nunca em enum fixo no schema.

**O teste que toda decisão de módulo precisa passar:**
*"Outra empresa, de outro setor, usaria isto exatamente como está?"*

Se a resposta é não — o que parecia requisito do produto era, na verdade, o vocabulário de um cliente só. Vira configuração do tenant, nunca schema.

**Exceção argumentada, por escrito:** quando a física do próprio domínio impõe um número fechado de casos — nunca o vocabulário de uma empresa, mas a natureza da operação. Exemplo já construído: manutenção só pode ser corretiva ou preventiva (não há terceira física); nota de pesquisa (NPS) só pode ir de 0 a 10 (é convenção mundial do método, não escolha de cliente). Toda exceção assim é um `CHECK` argumentado no próprio arquivo da migration — nunca decisão silenciosa.

**O que isso garante:** o mesmo Core que atende o Barra Center Shopping atende, sem alterar uma linha de schema, uma clínica médica, uma construtora ou uma cooperativa agrícola. O produto nunca aprende o sotaque de um cliente como se fosse sua língua-mãe.

---

## 3. LEI EDUCATIVA

> O ALSHAM Business OS também é um sistema **educativo**. Ele não existe apenas para registrar como uma empresa já trabalha — existe para elevar como ela deveria trabalhar.

É comum uma empresa crescer sem estrutura desde o início, acumulando processos cheios de vícios: aprovações puladas, cancelamentos sem justificativa registrada, históricos que se apagam, decisões que ninguém sabe quem tomou nem quando. Um sistema que apenas copia esse jeito de operar preserva o vício — e o torna mais rápido de repetir.

O ALSHAM Business OS é construído **100% correto, dentro de normas e esteiras de processo**, seguindo o melhor padrão do mundo, com práticas já validadas por sistemas de gestão consolidados globalmente. Quem se adapta é o cliente — nunca o sistema — e essa adaptação melhora o próprio trabalho da empresa que o instala.

**Isso não é rigidez por rigidez.** É disciplina estrutural, e ela já está construída em várias leis irmãs do canon:

- **Razão obrigatória**, sempre que algo se encerra sem sucesso — cancelar contrato, descartar lead, perder negociação. Ninguém apaga uma decisão em silêncio.
- **Trilha imutável em três camadas** — atendimento, ocorrências, checklists, conversas. O que foi dito e feito não se reescreve depois.
- **Carimbo do servidor**, nunca da entrada do usuário — a hora e a autoria de um ato nunca podem ser digitadas; são capturadas por quem executa o ato.
- **Campos que não deixam pular etapa** — uma inspeção não se conclui pela metade; uma etapa marcada como aprovação não se atravessa sem a permissão certa.
- **Desfecho sempre exigido** — um caso, uma ocorrência, um chamado não se arquiva sem dizer o que aconteceu.

Nenhuma dessas regras veio de um cliente. Vieram do compromisso de que o sistema entrega o padrão certo mesmo quando ninguém pediu por ele.

---

## 4. COMO AS DUAS LEIS CONVIVEM

| | Lei Anti-Viés | Lei Educativa |
|---|---|---|
| **Protege** | O vocabulário — nomes, etapas, categorias | A disciplina — rigor de processo, trilha, prova |
| **Quem decide** | O tenant (dado configurável) | A ALSHAM (arquitetura do produto) |
| **O que impede** | O produto virar espelho de um cliente só | O produto herdar os vícios de um cliente |
| **Exemplo** | Categoria de atendimento tem nome livre por tenant | Todo atendimento fechado exige desfecho, não importa o nome da categoria |

As duas leis nunca competem porque operam em camadas diferentes: uma decide **como se chama**; a outra decide **como se comporta**. Uma empresa pode chamar sua etapa de aprovação do jeito que quiser — mas não pode pular por cima dela sem permissão. Isso é as duas leis, juntas, na mesma migration.

---

## 5. O PADRÃO A SEGUIR

O ALSHAM Business OS não inventa a roda do rigor operacional. Ele segue o que sistemas de gestão já validados no mundo inteiro consolidaram como boa prática — segurança de acesso por papel, trilha de auditoria, imutabilidade de registros financeiros, obrigatoriedade de justificativa em exceções, separação entre quem registra e quem aprova. Isso não é originalidade da ALSHAM; é o piso mínimo de qualquer sistema de gestão sério, e o ALSHAM se recusa a entregar menos que isso a qualquer cliente, grande ou pequeno.

**A régua declarada:** um sistema que não segue esse piso não está pronto para produção — é protótipo. O ALSHAM Business OS só publica um módulo depois que ele prova, em teste real e adversarial (sabotagem intencional de cada regra), que o rigor resiste.

---

## 6. DECLARAÇÃO FINAL

O cliente inaugural — ou qualquer cliente futuro — decide a **ordem** da fila de módulos e o **vocabulário** de suas etapas e categorias. Nunca decide se uma trilha é apagável, se um cancelamento dispensa razão, ou se uma data pode ser digitada em vez de carimbada pelo servidor. Isso é lei, não configuração.

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*

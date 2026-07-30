import type { AllocationRule, CostCenter, Execution } from '@alsham/cost-centers';

export interface CenterRow extends CostCenter {
  readonly createdAt: string;
}

export interface RuleRow extends AllocationRule {
  readonly createdAt: string;
}

export interface ExecutionRow extends Execution {
  readonly executedAt: string;
}

export interface ByCenterRow {
  readonly centerId: string;
  readonly centerName: string;
  readonly currency: string;
  readonly allocatedCents: number;
  readonly allocationCount: number;
}

/**
 * Porta de dados do Módulo 28 — própria (Lei do Lego §5.5.8).
 *
 * Repare no que NÃO existe: apagar centro (arquiva-se), editar a regra ativa
 * (congela), escrever no livro de rateio à mão (quem escreve é
 * `cc.execute_rateio`). Executar é rpc — a função do banco decide e emite.
 */
export interface CcPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadCenters(): Promise<CenterRow[]>;
  loadRules(): Promise<RuleRow[]>;
  loadExecutions(): Promise<ExecutionRow[]>;
  loadByCenter(): Promise<ByCenterRow[]>;
  createCenter(input: { name: string }): Promise<{ centerId: string }>;
  setCenterStatus(input: { centerId: string; status: 'active' | 'archived' }): Promise<void>;
  createRule(input: { name: string }): Promise<{ ruleId: string }>;
  addRuleLine(input: { ruleId: string; centerId: string; basisPoints: number }): Promise<void>;
  removeRuleLine(input: { ruleId: string; centerId: string }): Promise<void>;
  setRuleStatus(input: { ruleId: string; status: 'active' | 'archived' }): Promise<void>;
  executeRateio(input: {
    ruleId: string;
    sourceKind: string;
    sourceName: string;
    totalCents: number;
    currency: string;
    competenceOn: string;
    note: string;
    reason: string;
  }): Promise<void>;
}

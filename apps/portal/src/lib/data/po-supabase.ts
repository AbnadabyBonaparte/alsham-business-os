import type { SupabaseClient } from '@supabase/supabase-js';

import type { OrderStatus, PurchaseOrder } from '@alsham/purchase-orders';

import { DataPortError } from './port';
import type { OrderRow, PoPort } from './po-port';

const PO = 'po';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface OrderDb {
  id: string;
  external_ref: string;
  currency: string;
  supplier_name: string | null;
  counterparty_tax_id: string | null;
  description: string | null;
  total_cents: number;
  status: OrderStatus;
  created_at: string;
}

interface ItemDb {
  line_no: number;
  description: string;
  quantity: number;
  unit_amount_cents: number;
  qty_received: number;
  line_total_cents: number;
}

export function createPoSupabasePort(db: SupabaseClient, tenantId: string): PoPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'po.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadOrders() {
      const { data: orders, error } = await db
        .schema(PO)
        .from('orders')
        .select(
          'id, external_ref, currency, supplier_name, counterparty_tax_id, description, total_cents, status, created_at',
        )
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) fail('carregar pedidos', error);

      const rows = (orders ?? []) as OrderDb[];
      if (rows.length === 0) return [];

      const ids = rows.map((o) => o.id);
      const { data: items, error: itemsErr } = await db
        .schema(PO)
        .from('order_items')
        .select(
          'order_id, line_no, description, quantity, unit_amount_cents, qty_received, line_total_cents',
        )
        .in('order_id', ids);
      if (itemsErr) fail('carregar itens dos pedidos', itemsErr);

      const byOrder = new Map<string, ItemDb[]>();
      for (const raw of items ?? []) {
        const r = raw as ItemDb & { order_id: string };
        const list = byOrder.get(r.order_id) ?? [];
        list.push(r);
        byOrder.set(r.order_id, list);
      }

      return rows.map((o): OrderRow => {
        const its = (byOrder.get(o.id) ?? []).sort((a, b) => a.line_no - b.line_no);
        return {
          id: o.id,
          externalRef: o.external_ref,
          currency: o.currency,
          supplierName: o.supplier_name,
          counterpartyTaxId: o.counterparty_tax_id,
          description: o.description ?? '',
          totalCents: Number(o.total_cents),
          status: o.status,
          createdAt: o.created_at,
          items: its.map((i) => ({
            lineNo: i.line_no,
            description: i.description,
            quantity: Number(i.quantity),
            unitAmountCents: Number(i.unit_amount_cents),
            qtyReceived: Number(i.qty_received),
            lineTotalCents: Number(i.line_total_cents),
          })),
        };
      });
    },

    async createOrder(order: PurchaseOrder) {
      const { data, error } = await db
        .schema(PO)
        .from('orders')
        .insert({
          tenant_id: tenantId,
          external_ref: order.externalRef,
          currency: order.currency,
          supplier_name: order.supplierName,
          counterparty_tax_id: order.counterpartyTaxId,
          description: order.description,
          status: 'draft',
        })
        .select('id')
        .single();
      if (error) fail('registrar o pedido', error);
      const orderId = (data as { id: string }).id;

      const { error: itemsErr } = await db.schema(PO).from('order_items').insert(
        order.items.map((i) => ({
          tenant_id: tenantId,
          order_id: orderId,
          line_no: i.lineNo,
          description: i.description,
          quantity: i.quantity,
          unit_amount_cents: i.unitAmountCents,
        })),
      );
      if (itemsErr) fail('registrar os itens do pedido', itemsErr);

      return { orderId };
    },

    async updateStatus(input: { orderId: string; status: OrderStatus }) {
      const { error } = await db
        .schema(PO)
        .from('orders')
        .update({ status: input.status })
        .eq('id', input.orderId)
        .eq('tenant_id', tenantId);
      if (error) fail('atualizar o status do pedido', error);
    },

    async receiveLine(input: { orderId: string; lineNo: number; qtyReceived: number }) {
      const { error } = await db
        .schema(PO)
        .from('order_items')
        .update({ qty_received: input.qtyReceived })
        .eq('order_id', input.orderId)
        .eq('line_no', input.lineNo)
        .eq('tenant_id', tenantId);
      if (error) fail('registrar o recebimento', error);
    },
  };
}

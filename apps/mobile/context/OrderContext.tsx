import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiGet, apiPatch, apiPost, getUserHeaders } from "@/constants/api";
import { useAuth } from "./AuthContext";

export type OrderStatus = "pending" | "confirmed" | "out_for_delivery" | "delivered" | "cancelled";

export interface OrderItem {
  name: string;
  nameTe?: string;
  nameHi?: string;
  sourceLanguage?: "en" | "te" | "hi" | null;
  quantity: string;
  available: boolean;
}

export interface Order {
  id: string;
  kiranaPhone: string;
  kiranaName: string;
  shopName: string;
  wholesalerId: string;
  items: OrderItem[];
  status: OrderStatus;
  totalAmount?: number;
  subtotalAmount?: number;
  tax?: number;
  discount?: number;
  invoiceNumber?: string;
  paymentStatus?: string;
  fromAddress?: string;
  toAddress?: string;
  deliveryTime?: string;
  deliveryAddress?: string;
  invoiceImageUrl?: string;
  invoiceNote?: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

interface OrderContextType {
  orders: Order[];
  isLoading: boolean;
  createOrder: (order: Omit<Order, "id" | "createdAt" | "updatedAt">) => Promise<Order>;
  updateOrder: (id: string, updates: Partial<Order>) => Promise<void>;
  getOrdersByKirana: (phone: string) => Order[];
  getOrdersByWholesaler: (id: string) => Order[];
  refreshOrders: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  submitOrderRating: (id: string, rating: number) => Promise<void>;
}

const OrderContext = createContext<OrderContextType | null>(null);

// Pre-supplier availability is unknown — we defer the real check to the
// wholesaler-catalog lookup in WholesalersContext.isAvailableFor() once
// the kirana has picked a supplier. We default to true here so newly-scanned
// items show neutral until reconciled; the review screen overrides each item
// with the real availability against the selected wholesaler's live catalog.
export function checkInventoryAvailability(_itemName: string): boolean {
  return true;
}

function normalizeOrder(raw: any): Order {
  return {
    id: raw.id,
    kiranaPhone: raw.kiranaPhone ?? raw.kirana_phone,
    kiranaName: raw.kiranaName ?? raw.kirana_name,
    shopName: raw.shopName ?? raw.shop_name,
    wholesalerId: raw.wholesalerId ?? raw.wholesaler_id,
    items: ((raw.items ?? []) as any[]).map((i) => ({
      name: i.name,
      nameTe: i.nameTe ?? i.name_te ?? "",
      nameHi: i.nameHi ?? i.name_hi ?? "",
      sourceLanguage: i.sourceLanguage ?? i.source_language ?? null,
      quantity: i.quantity,
      available: !!i.available,
    })) as OrderItem[],
    status: raw.status,
    totalAmount: raw.totalAmount ?? raw.total_amount ?? undefined,
    subtotalAmount: raw.subtotalAmount ?? raw.subtotal_amount ?? undefined,
    tax: raw.tax ?? undefined,
    discount: raw.discount ?? undefined,
    invoiceNumber: raw.invoiceNumber ?? raw.invoice_number ?? undefined,
    paymentStatus: raw.paymentStatus ?? raw.payment_status ?? undefined,
    fromAddress: raw.fromAddress ?? raw.from_address ?? undefined,
    toAddress: raw.toAddress ?? raw.to_address ?? undefined,
    deliveryTime: raw.deliveryTime ?? raw.delivery_time ?? undefined,
    deliveryAddress: raw.deliveryAddress ?? raw.delivery_address ?? undefined,
    invoiceImageUrl: raw.invoiceImageUrl ?? raw.invoice_image_url ?? undefined,
    invoiceNote: raw.invoiceNote ?? raw.invoice_note ?? undefined,
    notes: raw.notes ?? undefined,
    createdAt: raw.createdAt ?? raw.created_at,
    updatedAt: raw.updatedAt ?? raw.updated_at,
  };
}

export function OrderProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadOrders = useCallback(async () => {
    if (!user) { setOrders([]); setIsLoading(false); return; }
    try {
      let path = "";
      if (user.role === "wholesaler") {
        const id = user.wholesalerId;
        if (!id) {
          setOrders([]);
          setIsLoading(false);
          return;
        }
        path = `/api/orders/by-wholesaler/${encodeURIComponent(id)}`;
      } else {
        path = `/api/orders/by-kirana/${encodeURIComponent(user.phone)}`;
      }
      const { orders: raw } = await apiGet<{ orders: any[] }>(path, getUserHeaders(user));
      setOrders(raw.map(normalizeOrder));
    } catch (err) {
      console.warn("Failed to load orders:", (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(() => { loadOrders(); }, 5000);
  }, [loadOrders]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, [user]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const createOrder = useCallback(async (order: Omit<Order, "id" | "createdAt" | "updatedAt">) => {
    const { order: row } = await apiPost<{ order: any }>("/api/orders", {
      kiranaPhone: order.kiranaPhone,
      kiranaName: order.kiranaName,
      shopName: order.shopName,
      wholesalerId: order.wholesalerId,
      items: order.items.map(i => ({
        name: i.name,
        nameTe: i.nameTe ?? "",
        nameHi: i.nameHi ?? "",
        sourceLanguage: i.sourceLanguage ?? null,
        quantity: i.quantity,
        available: i.available,
      })),
      notes: order.notes,
      deliveryAddress: order.deliveryAddress,
    }, getUserHeaders(user));
    const normalized = normalizeOrder(row);
    setOrders(prev => [normalized, ...prev]);
    return normalized;
  }, [user]);

  const updateOrder = useCallback(async (id: string, updates: Partial<Order>) => {
    const { order: row } = await apiPatch<{ order: any }>(`/api/orders/${encodeURIComponent(id)}`, {
      status: updates.status,
      totalAmount: updates.totalAmount,
      subtotalAmount: updates.subtotalAmount,
      tax: updates.tax,
      discount: updates.discount,
      invoiceNumber: updates.invoiceNumber,
      paymentStatus: updates.paymentStatus,
      fromAddress: updates.fromAddress,
      toAddress: updates.toAddress,
      deliveryTime: updates.deliveryTime,
      deliveryAddress: updates.deliveryAddress,
      invoiceImageUrl: updates.invoiceImageUrl,
      invoiceNote: updates.invoiceNote,
    }, getUserHeaders(user));
    const normalized = normalizeOrder(row);
    setOrders(prev => prev.map(o => (o.id === id ? normalized : o)));
  }, [user]);

  const submitOrderRating = useCallback(async (id: string, rating: number) => {
    await apiPost(`/api/orders/${encodeURIComponent(id)}/rating`, { rating }, getUserHeaders(user));
    await loadOrders();
  }, [user, loadOrders]);

  const getOrdersByKirana = useCallback((phone: string) =>
    orders.filter(o => o.kiranaPhone === phone), [orders]);

  const getOrdersByWholesaler = useCallback((id: string) => {
    // For wholesaler dashboard, loaded orders already come from wholesaler-scoped API.
    // Returning all loaded rows avoids alias-id mismatch drops (admin id vs auto id).
    if (user?.role === "wholesaler") return orders;
    return orders.filter(o => o.wholesalerId === id);
  }, [orders, user?.role]);

  return (
    <OrderContext.Provider value={{
      orders, isLoading,
      createOrder, updateOrder,
      getOrdersByKirana, getOrdersByWholesaler,
      refreshOrders: loadOrders,
      startPolling, stopPolling,
      submitOrderRating,
    }}>
      {children}
    </OrderContext.Provider>
  );
}

export function useOrders() {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error("useOrders must be inside OrderProvider");
  return ctx;
}

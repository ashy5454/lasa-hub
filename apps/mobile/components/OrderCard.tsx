import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import type { Order, OrderItem, OrderStatus } from "@/context/OrderContext";
import type { TranslationKey } from "@/constants/translations";

interface Props {
  order: Order;
  onPress: () => void;
  variant?: "kirana" | "wholesaler";
  language?: (key: TranslationKey) => string;
}

const STATUS_KEYS: Record<OrderStatus, TranslationKey> = {
  pending: "statusPending",
  confirmed: "statusConfirmed",
  out_for_delivery: "statusOutForDelivery",
  delivered: "statusDelivered",
  cancelled: "statusCancelled",
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "#D97706",
  confirmed: "#2563EB",
  out_for_delivery: "#7C3AED",
  delivered: "#16A34A",
  cancelled: "#DC2626",
};

function getAgeMinutes(createdAt: string | number): number {
  return (Date.now() - new Date(createdAt).getTime()) / 60000;
}

function relativeTime(createdAt: string | number): string {
  const mins = getAgeMinutes(createdAt);
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.floor(mins)}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

function urgencyColor(order: Order): string | null {
  if (order.status !== "pending") return null;
  const mins = getAgeMinutes(order.createdAt);
  if (mins >= 120) return "#DC2626";
  if (mins >= 60)  return "#D97706";
  return null;
}

const MAX_VISIBLE = 5;

export function OrderCard({ order, onPress, variant = "kirana", language }: Props) {
  const colors = useColors();
  const statusColor = STATUS_COLORS[order.status];
  const statusLabel = language ? language(STATUS_KEYS[order.status]) : STATUS_KEYS[order.status];
  const urgent = variant === "wholesaler" ? urgencyColor(order) : null;

  const visibleItems = order.items.slice(0, MAX_VISIBLE);
  const overflow = order.items.length - MAX_VISIBLE;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: urgent ?? colors.border },
        urgent ? styles.urgentCard : null,
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Header row */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.shopName, { color: colors.foreground }]} numberOfLines={1}>
            {variant === "wholesaler" ? order.shopName : `Order #${order.id.slice(-4)}`}
          </Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {relativeTime(order.createdAt)}
            {urgent ? "  ·  ⚠ waiting" : ""}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Item rows */}
      <View style={styles.itemList}>
        {visibleItems.map((item: OrderItem, i: number) => (
          <View
            key={i}
            style={[
              styles.itemRow,
              i < visibleItems.length - 1 || overflow > 0
                ? { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }
                : null,
            ]}
          >
            <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={[styles.qtyPill, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.qtyText, { color: colors.mutedForeground }]}>{item.quantity}</Text>
            </View>
          </View>
        ))}
        {overflow > 0 && (
          <View style={styles.itemRow}>
            <Text style={[styles.moreText, { color: colors.mutedForeground }]}>
              +{overflow} more item{overflow > 1 ? "s" : ""}
            </Text>
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Text style={[styles.footerCount, { color: colors.mutedForeground }]}>
          {order.items.length} item{order.items.length !== 1 ? "s" : ""}
        </Text>
        {order.totalAmount ? (
          <Text style={[styles.amount, { color: colors.foreground }]}>
            ₹{order.totalAmount.toLocaleString("en-IN")}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
    overflow: "hidden",
  },
  urgentCard: {
    borderLeftWidth: 3,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  shopName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, alignSelf: "flex-start", flexShrink: 0 },
  statusText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  // Items
  itemList: { paddingVertical: 2 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 10,
  },
  itemName: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  qtyPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  qtyText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  moreText: { fontSize: 13, fontFamily: "Inter_400Regular" },

  // Footer
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  amount: { fontSize: 18, fontFamily: "Inter_700Bold" },
});

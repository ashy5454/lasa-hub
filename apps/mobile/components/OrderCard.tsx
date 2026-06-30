import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import type { Order, OrderStatus } from "@/context/OrderContext";
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
  if (mins >= 120) return "#DC2626"; // red — >2h
  if (mins >= 60)  return "#D97706"; // amber — >1h
  return null;
}

export function OrderCard({ order, onPress, variant = "kirana", language }: Props) {
  const colors = useColors();
  const statusColor = STATUS_COLORS[order.status];
  const statusLabel = language ? language(STATUS_KEYS[order.status]) : STATUS_KEYS[order.status];
  const urgent = variant === "wholesaler" ? urgencyColor(order) : null;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: urgent ?? colors.border },
        urgent ? { borderLeftWidth: 3, borderLeftColor: urgent } : null,
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.top}>
        <View style={styles.titleRow}>
          <View style={[styles.iconBox, { backgroundColor: (urgent ?? colors.primary) + "15" }]}>
            <Feather name="shopping-bag" size={18} color={urgent ?? colors.primary} />
          </View>
          <View style={styles.titleText}>
            <Text style={[styles.shopName, { color: colors.foreground }]} numberOfLines={1}>
              {variant === "wholesaler" ? order.shopName : `Order #${order.id.slice(-4)}`}
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {order.items.length} items  •  {relativeTime(order.createdAt)}
            </Text>
          </View>
        </View>
        <View style={styles.rightCol}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          {urgent && (
            <View style={[styles.urgentBadge, { backgroundColor: urgent + "18" }]}>
              <Feather name="clock" size={10} color={urgent} />
              <Text style={[styles.urgentText, { color: urgent }]}>{relativeTime(order.createdAt)}</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.bottom}>
        <Text style={[styles.itemPreview, { color: colors.mutedForeground }]} numberOfLines={1}>
          {order.items.map(i => i.name).join(", ")}
        </Text>
        {order.totalAmount ? (
          <Text style={[styles.amount, { color: colors.foreground }]}>₹{order.totalAmount}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, gap: 10 },
  top: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  titleText: { flex: 1 },
  shopName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  rightCol: { alignItems: "flex-end", gap: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  urgentBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  urgentText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  bottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemPreview: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  amount: { fontSize: 15, fontFamily: "Inter_700Bold" },
});

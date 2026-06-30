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

export function OrderCard({ order, onPress, variant = "kirana", language }: Props) {
  const colors = useColors();
  const statusColor = STATUS_COLORS[order.status];
  const statusLabel = language ? language(STATUS_KEYS[order.status]) : STATUS_KEYS[order.status];
  const date = new Date(order.createdAt);
  const timeStr = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const dateStr = date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.top}>
        <View style={styles.titleRow}>
          <View style={[styles.iconBox, { backgroundColor: colors.primary + "15" }]}>
            <Feather name="shopping-bag" size={18} color={colors.primary} />
          </View>
          <View style={styles.titleText}>
            <Text style={[styles.shopName, { color: colors.foreground }]} numberOfLines={1}>
              {variant === "wholesaler" ? order.shopName : `Order #${order.id.slice(-4)}`}
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {order.items.length} items  •  {dateStr} {timeStr}
            </Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
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
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  bottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemPreview: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  amount: { fontSize: 15, fontFamily: "Inter_700Bold" },
});

import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StockIndicator } from "@/components/StockIndicator";
import { OrderTracker } from "@/components/OrderTracker";
import { useLanguage } from "@/context/LanguageContext";
import { useOrders, type OrderStatus } from "@/context/OrderContext";
import { useColors } from "@/hooks/useColors";
import type { TranslationKey } from "@/constants/translations";
import { LasaLogo } from "@/components/LasaLogo";

const STATUS_KEYS: Record<OrderStatus, TranslationKey> = {
  pending: "statusPending",
  confirmed: "statusConfirmed",
  packed: "statusConfirmed",
  out_for_delivery: "statusOutForDelivery",
  delivered: "statusDelivered",
  cancelled: "statusCancelled",
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "#D97706",
  confirmed: "#2563EB",
  packed: "#0EA5E9",
  out_for_delivery: "#7C3AED",
  delivered: "#16A34A",
  cancelled: "#DC2626",
};

const STATUS_ICONS: Record<OrderStatus, string> = {
  pending: "clock",
  confirmed: "check-circle",
  packed: "package",
  out_for_delivery: "truck",
  delivered: "check-square",
  cancelled: "x-circle",
};

export default function OrderDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders, submitOrderRating } = useOrders();
  const order = orders.find(o => o.id === id);

  if (!order) return (
    <View style={[styles.root, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
      <Text style={[styles.errorText, { color: colors.mutedForeground }]}>{t("noOrders")}</Text>
    </View>
  );

  const statusColor = STATUS_COLORS[order.status];
  const date = new Date(order.createdAt);
  const hasRating = /\[rating:(\d)\]/i.test(order.notes ?? "");
  const onRate = async (rating: number) => {
    try {
      await submitOrderRating(order.id, rating);
      Alert.alert("", "Thanks! Your rating has been saved.");
    } catch (err) {
      Alert.alert("", "Could not submit rating right now. Please try again.");
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Animated.View
        entering={FadeInDown.delay(50).springify()}
        style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), borderBottomColor: colors.border }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("orderDetail")}</Text>
        <LasaLogo size={28} /* logo in top-right keeps brand on every screen */ />
      </Animated.View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Banner */}
        <Animated.View
          entering={FadeInDown.delay(100).springify()}
          style={[styles.statusBanner, { backgroundColor: statusColor + "18", borderColor: statusColor + "40" }]}
        >
          <Feather name={STATUS_ICONS[order.status] as any} size={24} color={statusColor} />
          <View style={styles.statusTextBlock}>
            <Text style={[styles.statusMain, { color: statusColor }]}>{t(STATUS_KEYS[order.status])}</Text>
            <Text style={[styles.statusDate, { color: colors.mutedForeground }]}>
              {date.toLocaleDateString("en-IN", { day: "numeric", month: "long" })} • {date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>
        </Animated.View>

        {/* Order Tracker */}
        {order.status !== "cancelled" && (
          <Animated.View
            entering={FadeInDown.delay(120).springify()}
            style={[styles.trackerCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>Order progress</Text>
            <OrderTracker status={order.status} language={language} />
            {order.status === "pending" && (
              <Text style={[styles.trackerHint, { color: colors.mutedForeground }]}>
                Waiting for wholesaler to confirm your order
              </Text>
            )}
          </Animated.View>
        )}

        {/* Delivery & Amount */}
        {(order.deliveryTime || order.totalAmount) && (
          <Animated.View
            entering={FadeInDown.delay(150).springify()}
            style={[styles.infoRow, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            {order.deliveryTime && (
              <View style={styles.infoItem}>
                <Feather name="clock" size={16} color={colors.mutedForeground} />
                <View>
                  <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{t("deliveryTime")}</Text>
                  <Text style={[styles.infoValue, { color: colors.foreground }]}>{order.deliveryTime}</Text>
                </View>
              </View>
            )}
            {order.totalAmount && (
              <View style={styles.infoItem}>
                <Feather name="tag" size={16} color={colors.mutedForeground} />
                <View>
                  <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{t("totalAmount")}</Text>
                  <Text style={[styles.infoValue, { color: colors.foreground }]}>
                    ₹{order.totalAmount}{order.discount ? ` (₹${order.discount} off)` : ""}{order.tax ? ` + tax ₹${order.tax}` : ""}
                  </Text>
                </View>
              </View>
            )}
          </Animated.View>
        )}
        {order.deliveryAddress ? (
          <View style={[styles.noteBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Feather name="map-pin" size={15} color={colors.mutedForeground} />
            <Text style={[styles.noteText, { color: colors.foreground }]}>{order.deliveryAddress}</Text>
          </View>
        ) : null}

        {/* Supplier Note */}
        {order.invoiceNote && (
          <Animated.View
            entering={FadeInDown.delay(180).springify()}
            style={[styles.noteBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}
          >
            <Feather name="file-text" size={16} color={colors.accent} />
            <Text style={[styles.noteText, { color: colors.foreground }]}>{order.invoiceNote}</Text>
          </Animated.View>
        )}

        {/* Items */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          {t("itemsFound")} ({order.items.length})
        </Text>
        {order.items.map((item, i) => (
          <Animated.View
            key={i}
            entering={FadeInDown.delay(200 + i * 40).springify()}
            style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.itemInfo}>
              <Text style={[styles.itemName, { color: colors.foreground }]}>{item.name}</Text>
              <Text style={[styles.itemQty, { color: colors.mutedForeground }]}>{item.quantity}</Text>
            </View>
            <StockIndicator available={item.available} size="sm" />
          </Animated.View>
        ))}

        {order.notes && (
          <View style={[styles.noteBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Feather name="message-circle" size={15} color={colors.mutedForeground} />
            <Text style={[styles.noteText, { color: colors.foreground }]}>{order.notes}</Text>
          </View>
        )}
        {order.status === "delivered" && !hasRating && (
          <View style={[styles.ratingBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.ratingTitle, { color: colors.foreground }]}>Rate this wholesaler</Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((value) => (
                <TouchableOpacity key={value} style={styles.ratingBtn} onPress={() => onRate(value)}>
                  <Feather name="star" size={22} color="#F59E0B" />
                  <Text style={[styles.ratingValue, { color: colors.mutedForeground }]}>{value}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  scroll: { flex: 1 },
  trackerCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 4 },
  trackerHint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", paddingBottom: 4 },
  content: { padding: 20, gap: 12 },
  statusBanner: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1, padding: 16 },
  statusTextBlock: { flex: 1 },
  statusMain: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  statusDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  infoRow: { flexDirection: "row", gap: 16, borderRadius: 14, borderWidth: 1, padding: 16 },
  infoItem: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  infoLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_700Bold", marginTop: 4 },
  itemCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, padding: 14 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  itemQty: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  noteBox: { borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  noteText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  ratingBox: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 10 },
  ratingTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  ratingRow: { flexDirection: "row", justifyContent: "space-between" },
  ratingBtn: { alignItems: "center", gap: 4, paddingVertical: 4, minWidth: 40 },
  ratingValue: { fontSize: 12, fontFamily: "Inter_500Medium" },
  errorText: { fontSize: 16, fontFamily: "Inter_400Regular" },
});

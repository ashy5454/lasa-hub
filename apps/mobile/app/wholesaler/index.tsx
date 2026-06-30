import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OrderCard } from "@/components/OrderCard";
import { WholesalerTabBar } from "@/components/WholesalerTabBar";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { type Order, useOrders } from "@/context/OrderContext";
import { useColors } from "@/hooks/useColors";
import { LasaLogo } from "@/components/LasaLogo";
import { apiGet, getUserHeaders } from "@/constants/api";

const STATUS_TABS = ["all", "pending", "confirmed", "out_for_delivery", "delivered"] as const;

interface LowStockItem { id: string; name: string; stockQuantity: number | null; unit: string; }

export default function WholesalerDashboard() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout, refreshUser } = useAuth();
  useFocusEffect(useCallback(() => { refreshUser(); }, [refreshUser]));
  const { t } = useLanguage();
  const { getOrdersByWholesaler, isLoading, refreshOrders, startPolling, stopPolling } = useOrders();
  const [activeTab, setActiveTab] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);

  useEffect(() => { startPolling(); return () => stopPolling(); }, [startPolling, stopPolling]);

  // Fetch low-stock items
  useFocusEffect(useCallback(() => {
    if (!user?.wholesalerId) return;
    (async () => {
      try {
        const headers = getUserHeaders(user);
        const { inventory } = await apiGet<{ inventory: any[] }>("/api/wholesaler/inventory", headers);
        const low = (inventory ?? []).filter(
          (i: any) => i.stockQuantity !== null && i.stockQuantity !== undefined && i.stockQuantity <= (i.minOrderQty ?? 3)
        );
        setLowStock(low);
      } catch (e) {
        console.warn("[wholesaler] lowStock fetch failed", e);
      }
    })();
  }, [user]));

  const wholesalerId = user?.wholesalerId ?? "";
  const allOrders = getOrdersByWholesaler(wholesalerId);
  const filtered: Order[] = activeTab === "all" ? allOrders : allOrders.filter(o => o.status === activeTab);
  const pendingCount = allOrders.filter(o => o.status === "pending").length;
  const deliveredToday = allOrders.filter(o => {
    if (o.status !== "delivered") return false;
    const d = new Date(o.createdAt);
    const now = new Date();
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const todayRevenue = deliveredToday.reduce((sum, o) => sum + (o.totalAmount ?? 0), 0);

  const STATUS_LABELS: Record<string, string> = {
    all: t("allOrders"),
    pending: t("newOrders"),
    confirmed: t("confirmed"),
    out_for_delivery: t("delivery"),
    delivered: t("complete"),
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshOrders();
    setRefreshing(false);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <Animated.View
        entering={FadeInDown.delay(50).springify()}
        style={[styles.header, { backgroundColor: colors.accent, paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}
      >
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerLabel}>{t("wholesaleTitle")}</Text>
            <Text style={styles.headerShop}>{user?.shopName ?? "Aapki Dukaan"}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <LasaLogo size={36} outline />
            <TouchableOpacity onPress={async () => { await logout(); }} style={styles.logoutBtn}>
              <Feather name="log-out" size={20} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Live stat chips */}
        <View style={styles.statsRow}>
          <View style={styles.statChip}>
            <Text style={styles.statVal}>₹{todayRevenue.toLocaleString("en-IN")}</Text>
            <Text style={styles.statLabel}>Today</Text>
          </View>
          <View style={[styles.statChip, pendingCount > 0 && styles.statChipAlert]}>
            <Text style={[styles.statVal, pendingCount > 0 && { color: "#DC2626" }]}>{pendingCount}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statChip}>
            <Text style={styles.statVal}>{deliveredToday.length}</Text>
            <Text style={styles.statLabel}>Delivered</Text>
          </View>
          <View style={styles.statChip}>
            <Text style={styles.statVal}>{allOrders.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
        </View>
      </Animated.View>

      {/* Low stock strip */}
      {lowStock.length > 0 && (
        <View style={[styles.lowStockBar, { borderBottomColor: colors.border }]}>
          <Feather name="alert-triangle" size={13} color="#D97706" />
          <Text style={styles.lowStockLabel}>Low stock:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 6 }}>
            {lowStock.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.lowStockChip, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B55" }]}
                onPress={() => router.replace("/wholesaler/inventory" as any)}
              >
                <Text style={styles.lowStockChipText}>{item.name} · {item.stockQuantity ?? 0} {item.unit}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Order status tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.tabs, { borderBottomColor: colors.border }]}
        style={{ flexGrow: 0 }}
      >
        {STATUS_TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, { borderBottomColor: activeTab === tab ? colors.primary : "transparent" }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.mutedForeground }]}>
              {STATUS_LABELS[tab]}
            </Text>
            {tab !== "all" && (
              <Text style={[styles.tabCount, { color: activeTab === tab ? colors.primary : colors.mutedForeground }]}>
                {allOrders.filter(o => o.status === tab).length}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Order list */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Feather name="inbox" size={52} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("noOrdersWholesale")}</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>{t("noOrdersWholesaleSub")}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        >
          {filtered.map((order, i) => (
            <Animated.View key={order.id} entering={FadeInDown.delay(i * 50).springify()}>
              <OrderCard
                order={order}
                onPress={() => router.push(`/wholesaler/order/${order.id}` as any)}
                variant="wholesaler"
                language={t}
              />
            </Animated.View>
          ))}
        </ScrollView>
      )}

      {/* Bottom nav */}
      <WholesalerTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  headerLabel: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontFamily: "Inter_400Regular" },
  headerShop: { color: "#FFF", fontSize: 22, fontFamily: "Inter_700Bold", marginTop: 2 },
  logoutBtn: { padding: 8 },
  statsRow: { flexDirection: "row", gap: 8 },
  statChip: { flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10, paddingVertical: 8, alignItems: "center" },
  statChipAlert: { backgroundColor: "rgba(220,38,38,0.15)" },
  statVal: { color: "#FFF", fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel: { color: "rgba(255,255,255,0.7)", fontSize: 10, fontFamily: "Inter_500Medium", marginTop: 1 },
  lowStockBar: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1 },
  lowStockLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#D97706" },
  lowStockChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  lowStockChipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#92400E" },
  tabs: { paddingHorizontal: 16, borderBottomWidth: 1, gap: 4 },
  tab: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 2.5, flexDirection: "row", alignItems: "center", gap: 6 },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  tabCount: { fontSize: 12, fontFamily: "Inter_500Medium" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginTop: 8 },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  list: { flex: 1 },
  listContent: { padding: 20, paddingBottom: 100 },
});

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

const STATUS_TABS = ["all", "pending", "confirmed", "out_for_delivery", "delivered"] as const;

export default function WholesalerDashboard() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout, refreshUser } = useAuth();
  useFocusEffect(useCallback(() => { refreshUser(); }, [refreshUser]));
  const { t } = useLanguage();
  const { getOrdersByWholesaler, isLoading, refreshOrders, startPolling, stopPolling } = useOrders();
  const [activeTab, setActiveTab] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { startPolling(); return () => stopPolling(); }, [startPolling, stopPolling]);

  const wholesalerId = user?.wholesalerId ?? "";
  const allOrders = getOrdersByWholesaler(wholesalerId);
  const filtered: Order[] = activeTab === "all" ? allOrders : allOrders.filter(o => o.status === activeTab);
  const pendingCount = allOrders.filter(o => o.status === "pending").length;

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
      <Animated.View
        entering={FadeInDown.delay(50).springify()}
        style={[styles.header, { backgroundColor: colors.accent, paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}
      >
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerLabel}>{t("wholesaleTitle")}</Text>
            <Text style={styles.headerShop}>{user?.shopName ?? "Aapki Dukaan"}</Text>
          </View>
          {/* Brand mark + logout, grouped on the right edge. Outline ring
              so the red circle reads against the accent-colored bg. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <LasaLogo size={36} outline />
            <TouchableOpacity onPress={async () => { await logout(); }} style={styles.logoutBtn}>
              <Feather name="log-out" size={20} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </View>
        </View>
        {pendingCount > 0 && (
          <View style={styles.alertBanner}>
            <Feather name="bell" size={14} color={colors.primary} />
            <Text style={[styles.alertText, { color: colors.primary }]}>
              {pendingCount} {t("newAlert")}
            </Text>
          </View>
        )}
      </Animated.View>

      <WholesalerTabBar />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.tabs, { borderBottomColor: colors.border }]}
        style={{ flexGrow: 0 }}
      >
        {STATUS_TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tab,
              { borderBottomColor: activeTab === tab ? colors.primary : "transparent" }
            ]}
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
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 40 }]}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerLabel: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontFamily: "Inter_400Regular" },
  headerShop: { color: "#FFF", fontSize: 22, fontFamily: "Inter_700Bold", marginTop: 2 },
  logoutBtn: { padding: 8 },
  alertBanner: { backgroundColor: "#FFF3E0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  alertText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tabs: { paddingHorizontal: 16, borderBottomWidth: 1, gap: 4 },
  tab: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 2.5, flexDirection: "row", alignItems: "center", gap: 6 },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  tabCount: { fontSize: 12, fontFamily: "Inter_500Medium" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginTop: 8 },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  list: { flex: 1 },
  listContent: { padding: 20 },
});

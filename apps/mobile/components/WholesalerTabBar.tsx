import { Feather } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useWholesalerStrings } from "@/hooks/useWholesalerStrings";
import { useOrders } from "@/context/OrderContext";
import { useAuth } from "@/context/AuthContext";

type Tab = { key: "orders" | "inventory" | "insights" | "settings"; icon: keyof typeof Feather.glyphMap; route: string };

const TABS: Tab[] = [
  { key: "orders",    icon: "inbox",        route: "/wholesaler" },
  { key: "inventory", icon: "archive",      route: "/wholesaler/inventory" },
  { key: "insights",  icon: "trending-up",  route: "/wholesaler/insights" },
  { key: "settings",  icon: "settings",     route: "/wholesaler/settings" },
];

const LABEL_KEY = {
  orders: "tabOrders",
  inventory: "tabMyStock",
  insights: "tabInsights",
  settings: "tabSettings",
} as const;

export function WholesalerTabBar() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const s = useWholesalerStrings();
  const { user } = useAuth();
  const { getOrdersByWholesaler } = useOrders();

  const pendingCount = user?.wholesalerId
    ? getOrdersByWholesaler(user.wholesalerId).filter(o => o.status === "pending").length
    : 0;

  const active: Tab["key"] =
    pathname?.startsWith("/wholesaler/inventory") ? "inventory" :
    pathname?.startsWith("/wholesaler/insights")  ? "insights"  :
    pathname?.startsWith("/wholesaler/settings")  ? "settings"  :
    "orders";

  return (
    <View style={[
      styles.bar,
      {
        backgroundColor: colors.card,
        borderTopColor: colors.border,
        paddingBottom: Platform.OS === "web" ? 8 : insets.bottom || 8,
      }
    ]}>
      {TABS.map((t) => {
        const isActive = active === t.key;
        return (
          <TouchableOpacity
            key={t.key}
            style={styles.tab}
            onPress={() => { if (!isActive) router.replace(t.route as any); }}
            activeOpacity={0.7}
          >
            <View style={styles.iconWrap}>
              <Feather name={t.icon} size={22} color={isActive ? colors.primary : colors.mutedForeground} />
              {t.key === "orders" && pendingCount > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.badgeText}>{pendingCount > 9 ? "9+" : pendingCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabLabel, { color: isActive ? colors.primary : colors.mutedForeground }]}>
              {s(LABEL_KEY[t.key])}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", borderTopWidth: 1 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 10, paddingBottom: 4, gap: 3 },
  iconWrap: { position: "relative" },
  badge: { position: "absolute", top: -4, right: -8, minWidth: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  badgeText: { color: "#FFF", fontSize: 9, fontFamily: "Inter_700Bold" },
  tabLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});

import { Feather } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useWholesalerStrings } from "@/hooks/useWholesalerStrings";

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
  const pathname = usePathname();
  const s = useWholesalerStrings();
  const active: Tab["key"] =
    pathname?.startsWith("/wholesaler/inventory") ? "inventory" :
    pathname?.startsWith("/wholesaler/insights")  ? "insights"  :
    pathname?.startsWith("/wholesaler/settings")  ? "settings"  :
    "orders";

  return (
    <View style={[styles.bar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      {TABS.map((t) => {
        const isActive = active === t.key;
        return (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, isActive && { borderBottomColor: colors.primary }]}
            onPress={() => { if (!isActive) router.replace(t.route as any); }}
          >
            <Feather name={t.icon} size={16} color={isActive ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.tabLabel, { color: isActive ? colors.primary : colors.mutedForeground }]}>{s(LABEL_KEY[t.key])}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", borderBottomWidth: 1 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderBottomWidth: 2.5, borderBottomColor: "transparent" },
  tabLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});

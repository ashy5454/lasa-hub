import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, getUserHeaders } from "@/constants/api";
import { WholesalerTabBar } from "@/components/WholesalerTabBar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useWholesalerStrings } from "@/hooks/useWholesalerStrings";

type Insights = {
  windowDays: number;
  summary: {
    totalCatalogItems: number;
    recentOrderCount: number;
    lowStockCount: number;
    outOfStockCount: number;
  };
  lowStock: { name: string; stock: number; unit: string; pricePerUnit: number }[];
  outOfStock: { name: string; unit: string }[];
  hotSellers: { name: string; orderedTimes: number; currentStock: number | null; unit: string }[];
  slowMovers: { name: string; unit: string; stock: number | null; orderedTimes: number }[];
  missedDemand: { name: string; askedTimes: number }[];
};

export default function WholesalerInsights() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const s = useWholesalerStrings();
  const headers = useMemo(() => getUserHeaders(user), [user?.phone, user?.role, user?.wholesalerId]);

  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const load = useCallback(async () => {
    if (!headers || user?.role !== "wholesaler") {
      setLoading(false);
      setError("Please login as a wholesaler.");
      return;
    }
    try {
      setLoading(true); setError("");
      const json = await apiGet<Insights>("/api/wholesaler/insights", headers);
      setData(json);
    } catch (err: any) {
      setError(err?.message || "Failed to load insights");
    } finally {
      setLoading(false);
    }
  }, [headers, user?.role]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.replace("/wholesaler" as any)} style={{ padding: 8 }}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{s("insightsTitle")}</Text>
        <TouchableOpacity onPress={load} style={{ padding: 8 }}>
          <Feather name="refresh-cw" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <WholesalerTabBar />

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={{ padding: 16 }}>
          <Text style={{ color: colors.destructive }}>{error}</Text>
        </View>
      ) : data ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
          {/* Headline numbers */}
          <View style={styles.summaryRow}>
            <Tile color={colors.primary}      value={data.summary.totalCatalogItems} label={s("itemsInCatalog")} colors={colors} />
            <Tile color={colors.accent}       value={data.summary.recentOrderCount}  label={s("ordersInWindow")} colors={colors} />
            <Tile color="#92400E"             value={data.summary.lowStockCount}     label={s("runningLow")} colors={colors} />
            <Tile color={colors.unavailable}  value={data.summary.outOfStockCount}   label={s("finished")} colors={colors} />
          </View>

          {/* Restock alerts */}
          {(data.outOfStock.length + data.lowStock.length) > 0 && (
            <Section
              title={s("restockSoon")}
              hint={s("restockHint")}
              colors={colors}
              icon="alert-triangle"
              iconColor="#92400E"
            >
              {data.outOfStock.map((i, idx) => (
                <Row key={`out-${idx}`} colors={colors} tone="bad" left={i.name} right={`finished (${i.unit})`} />
              ))}
              {data.lowStock.map((i, idx) => (
                <Row key={`low-${idx}`} colors={colors} tone="warn" left={i.name} right={`${i.stock} ${i.unit} left  ·  ₹${i.pricePerUnit}/${i.unit}`} />
              ))}
            </Section>
          )}

          {/* Missed demand */}
          {data.missedDemand.length > 0 && (
            <Section
              title={s("askedForThese")}
              hint={s("askedHint")}
              colors={colors}
              icon="plus-circle"
              iconColor={colors.primary}
            >
              {data.missedDemand.map((i, idx) => (
                <Row
                  key={`miss-${idx}`}
                  colors={colors}
                  tone="info"
                  left={i.name}
                  right={`${s("asked")} ${i.askedTimes}×`}
                />
              ))}
              <TouchableOpacity
                style={[styles.cta, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "44" }]}
                onPress={() => router.push("/wholesaler/inventory" as any)}
              >
                <Feather name="archive" size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{s("addItemsCta")}</Text>
              </TouchableOpacity>
            </Section>
          )}

          {/* Top sellers */}
          {data.hotSellers.length > 0 && (
            <Section
              title={s("topSellers")}
              hint={s("topSellersHint")}
              colors={colors}
              icon="trending-up"
              iconColor={colors.available}
            >
              {data.hotSellers.map((i, idx) => (
                <Row
                  key={`hot-${idx}`}
                  colors={colors}
                  tone="good"
                  left={i.name}
                  right={`${i.orderedTimes} ${s("orders")}  ·  ${i.currentStock ?? "?"} ${i.unit} ${s("left")}`}
                />
              ))}
            </Section>
          )}

          {/* Slow movers */}
          {data.slowMovers.length > 0 && (
            <Section
              title={s("slowMovers")}
              hint={s("slowHint")}
              colors={colors}
              icon="clock"
              iconColor={colors.mutedForeground}
            >
              {data.slowMovers.map((i, idx) => (
                <Row
                  key={`slow-${idx}`}
                  colors={colors}
                  tone="neutral"
                  left={i.name}
                  right={`${i.stock ?? 0} ${i.unit} ${s("sitting")}  ·  0 ${s("orders")}`}
                />
              ))}
            </Section>
          )}

          {/* Empty / quiet state */}
          {data.outOfStock.length === 0 &&
            data.lowStock.length === 0 &&
            data.missedDemand.length === 0 &&
            data.hotSellers.length === 0 &&
            data.slowMovers.length === 0 && (
              <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="coffee" size={28} color={colors.mutedForeground} />
                <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{s("nothingToFlag")}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: "center" }}>
                  {s("insightsEmptyHint")}
                </Text>
              </View>
            )}
        </ScrollView>
      ) : null}
    </View>
  );
}

function Tile({ value, label, color, colors }: { value: number | string; label: string; color: string; colors: any }) {
  return (
    <View style={[styles.tile, { backgroundColor: color + "11", borderColor: color + "44" }]}>
      <Text style={[styles.tileVal, { color }]}>{value}</Text>
      <Text style={[styles.tileLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function Section({ title, hint, children, colors, icon, iconColor }: { title: string; hint?: string; children: React.ReactNode; colors: any; icon: any; iconColor: string }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Feather name={icon} size={15} color={iconColor} />
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      </View>
      {hint && <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>{hint}</Text>}
      <View style={{ gap: 6, marginTop: 4 }}>{children}</View>
    </View>
  );
}

function Row({ left, right, colors, tone }: { left: string; right: string; colors: any; tone: "good" | "warn" | "bad" | "info" | "neutral" }) {
  const bg =
    tone === "good" ? colors.available + "0e" :
    tone === "warn" ? "#FEF3C7" :
    tone === "bad" ? colors.unavailable + "0e" :
    tone === "info" ? colors.primary + "0e" :
    colors.card;
  const border =
    tone === "good" ? colors.available + "44" :
    tone === "warn" ? "#F59E0B55" :
    tone === "bad" ? colors.unavailable + "44" :
    tone === "info" ? colors.primary + "44" :
    colors.border;
  return (
    <View style={[styles.row, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.rowLeft, { color: colors.foreground }]} numberOfLines={1}>{left}</Text>
      <Text style={[styles.rowRight, { color: colors.mutedForeground }]}>{right}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  content: { padding: 16, gap: 18 },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { flexBasis: "47%", flexGrow: 1, borderRadius: 14, borderWidth: 1, padding: 12, gap: 2 },
  tileVal: { fontSize: 22, fontFamily: "Inter_700Bold" },
  tileLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  sectionHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginLeft: 23 },
  row: { borderWidth: 1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  rowLeft: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  rowRight: { fontSize: 12, fontFamily: "Inter_500Medium" },
  cta: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginTop: 6 },
  empty: { borderWidth: 1, borderRadius: 16, padding: 24, gap: 8, alignItems: "center" },
});

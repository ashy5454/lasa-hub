import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OrderCard } from "@/components/OrderCard";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useOrders } from "@/context/OrderContext";
import { useColors } from "@/hooks/useColors";

export default function OrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { getOrdersByKirana, isLoading, refreshOrders } = useOrders();
  const [refreshing, setRefreshing] = React.useState(false);

  const orders = user ? getOrdersByKirana(user.phone) : [];

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshOrders();
    setRefreshing(false);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Animated.View
        entering={FadeInDown.delay(50).springify()}
        style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), borderBottomColor: colors.border }]}
      >
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("myOrders")}</Text>
        <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{orders.length} orders</Text>
      </Animated.View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.centered}>
          <Feather name="shopping-bag" size={56} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("noOrders")}</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>{t("noOrdersSub")}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        >
          {orders.map((order, i) => (
            <Animated.View key={order.id} entering={FadeInDown.delay(i * 60).springify()}>
              <OrderCard
                order={order}
                onPress={() => router.push(`/order-detail?id=${order.id}` as any)}
                variant="kirana"
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
  header: { paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 26, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginTop: 8 },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  list: { flex: 1 },
  listContent: { padding: 20 },
});

import { Stack } from "expo-router";
import { router } from "expo-router";
import React from "react";
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

export default function WholesalerLayout() {
  const { user, isLoading } = useAuth();
  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (user.role !== "wholesaler") {
      router.replace("/(tabs)");
    }
  }, [user, isLoading]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="inventory" options={{ headerShown: false }} />
      <Stack.Screen name="order/[id]" options={{ headerShown: false }} />
    </Stack>
  );
}

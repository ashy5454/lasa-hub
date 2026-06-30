import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, router, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { LanguageProvider, useLanguage } from "@/context/LanguageContext";
import { OrderProvider } from "@/context/OrderContext";
import { WholesalersProvider } from "@/context/WholesalersContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { user, isLoading } = useAuth();
  const { languageReady } = useLanguage();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading || !languageReady) return;
    // Never auto-redirect away from /admin — admin has its own auth.
    if (pathname?.startsWith("/admin")) return;
    if (!user) {
      if (pathname !== "/") router.replace("/");
    } else {
      // User is logged in. Only redirect if they are still on the login screen.
      if (pathname === "/") {
        if (user.role === "wholesaler") {
          router.replace("/wholesaler" as any);
        } else {
          router.replace("/(tabs)");
        }
      }
    }
  }, [user, isLoading, languageReady, pathname]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="scan-order" />
      <Stack.Screen name="voice-order" />
      <Stack.Screen name="review" />
      <Stack.Screen name="order-sent" />
      <Stack.Screen name="order-detail" />
      <Stack.Screen name="wholesaler" />
      <Stack.Screen name="admin" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <LanguageProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <WholesalersProvider>
              <OrderProvider>
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <KeyboardProvider>
                    {/* Desktop centering wrapper */}
                    {Platform.OS === "web" ? (
                      <View style={styles.desktopOuter}>
                        <View style={styles.desktopInner}>
                          <RootLayoutNav />
                        </View>
                      </View>
                    ) : (
                      <RootLayoutNav />
                    )}
                  </KeyboardProvider>
                </GestureHandlerRootView>
              </OrderProvider>
              </WholesalersProvider>
            </AuthProvider>
          </QueryClientProvider>
        </LanguageProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  desktopOuter: {
    flex: 1,
    backgroundColor: "#F3F0EC",
    alignItems: "center",
    justifyContent: "center",
  },
  desktopInner: {
    width: "100%",
    maxWidth: 480,
    flex: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    borderRadius: Platform.OS === "web" ? 24 : 0,
  },
});

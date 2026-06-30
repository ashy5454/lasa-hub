import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

interface Props {
  available: boolean;
  size?: "sm" | "md";
}

// Plain-English label first, with native-script equivalents per locale.
// Whatever language the user picks is honored — no more Hinglish leak.
const LABELS: Record<string, { yes: string; no: string }> = {
  en: { yes: "in stock",     no: "out of stock" },
  hi: { yes: "स्टॉक में है", no: "स्टॉक में नहीं है" },
  te: { yes: "స్టాక్ ఉంది",   no: "స్టాక్ లేదు" },
};

export function StockIndicator({ available, size = "md" }: Props) {
  const colors = useColors();
  const { language } = useLanguage();
  const dotSize = size === "sm" ? 8 : 11;
  const fontSize = size === "sm" ? 11 : 13;

  const labels = LABELS[language] ?? LABELS.en;
  const text = available ? labels.yes : labels.no;

  return (
    <View style={styles.row}>
      <View style={[
        styles.dot,
        { width: dotSize, height: dotSize, borderRadius: dotSize / 2 },
        { backgroundColor: available ? colors.available : colors.unavailable }
      ]} />
      <Text style={[styles.label, { fontSize, color: available ? colors.available : colors.unavailable }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { },
  label: { fontFamily: "Inter_500Medium" },
});

import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

type Lang = "en" | "te" | "hi";

const STAGE_LABELS: Record<Lang, [string, string, string, string]> = {
  en: ["Accepted", "Packed", "Dispatched", "Delivered"],
  hi: ["स्वीकार", "पैक्ड", "भेजा", "मिल गया"],
  te: ["అంగీకరించబడింది", "ప్యాక్", "పంపబడింది", "డెలివరీ"],
};

const STATUS_TO_STEP: Record<string, number> = {
  pending: 0,
  confirmed: 1,
  packed: 2,
  out_for_delivery: 3,
  delivered: 4,
  cancelled: -1,
};

export function prettyStatus(status: string, language: string): string {
  const lang: Lang = (language as Lang) ?? "en";
  if (status === "pending") {
    return lang === "te" ? "వేచి ఉంది" : lang === "hi" ? "इंतज़ार में" : "Waiting";
  }
  if (status === "cancelled") {
    return lang === "te" ? "రద్దు" : lang === "hi" ? "रद्द" : "Cancelled";
  }
  const stepIdx = (STATUS_TO_STEP[status] ?? 0) - 1;
  if (stepIdx < 0 || stepIdx >= 4) return status;
  return STAGE_LABELS[lang][stepIdx];
}

export function OrderTracker({
  status,
  language = "en",
  compact = false,
}: {
  status: string;
  language?: string;
  compact?: boolean;
}) {
  const colors = useColors();
  const step = STATUS_TO_STEP[status] ?? 0;
  const lang: Lang = (language as Lang) ?? "en";
  const labels = STAGE_LABELS[lang];

  if (step < 0) return null;

  const dotSize = compact ? 22 : 28;

  return (
    <View style={[styles.wrap, compact && { paddingVertical: 8 }]}>
      {labels.map((label, i) => {
        const stageNum = i + 1;
        const isDone = stageNum < step;
        const isCurrent = stageNum === step;
        const isFuture = stageNum > step;
        const color = isFuture ? colors.border : colors.available;
        return (
          <React.Fragment key={i}>
            <View style={styles.col}>
              <View
                style={[
                  styles.dot,
                  {
                    width: dotSize,
                    height: dotSize,
                    borderRadius: dotSize / 2,
                    backgroundColor: isFuture ? colors.card : colors.available,
                    borderColor: color,
                  },
                ]}
              >
                {isDone && <Feather name="check" size={dotSize * 0.55} color="#FFF" />}
                {isCurrent && <View style={[styles.pulse, { backgroundColor: "#FFF" }]} />}
              </View>
              <Text
                style={[
                  styles.label,
                  {
                    color: isFuture ? colors.mutedForeground : colors.foreground,
                    fontFamily: isCurrent ? "Inter_700Bold" : "Inter_500Medium",
                    fontSize: compact ? 10 : 11,
                  },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
            {i < labels.length - 1 && (
              <View
                style={[
                  styles.line,
                  {
                    backgroundColor: stageNum < step ? colors.available : colors.border,
                    marginTop: dotSize / 2,
                  },
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 14,
    paddingHorizontal: 4,
    width: "100%",
  },
  col: { alignItems: "center", width: 64 },
  dot: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  pulse: { width: 8, height: 8, borderRadius: 4 },
  label: { marginTop: 6, textAlign: "center" },
  line: { flex: 1, height: 2, marginHorizontal: -10 },
});

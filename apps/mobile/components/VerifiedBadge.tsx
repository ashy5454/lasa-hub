import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Alert } from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  verified?: boolean | null;
  size?: "xs" | "sm" | "md";
  label?: boolean; // also render the word "Verified" next to the shield
  onMissingPress?: () => void; // optional: what happens when user taps the
                               // amber unverified pill (e.g. open settings)
}

/**
 * Shield badge that appears next to a user/wholesaler name across the app.
 * Single source of truth so the verified status looks identical wherever it
 * shows up. Use after admin marks a record verified=true.
 *
 * Sizes:
 *  - xs: bare icon, no label, fits inline with a small name
 *  - sm: icon + small label
 *  - md: icon + label, suitable for headers
 */
export function VerifiedBadge({ verified, size = "sm", label = false, onMissingPress }: Props) {
  const colors = useColors();

  if (verified) {
    const iconSize = size === "xs" ? 11 : size === "sm" ? 13 : 16;
    const fontSize = size === "xs" ? 10 : size === "sm" ? 11 : 13;
    return (
      <View style={[styles.row, { backgroundColor: colors.available + "1f", borderColor: colors.available + "66" }]}>
        <Feather name="shield" size={iconSize} color={colors.available} />
        {label && (
          <Text style={[styles.lbl, { color: colors.available, fontSize }]}>Verified</Text>
        )}
      </View>
    );
  }

  // Unverified rendering — only shown when explicitly asked (most call
  // sites just want to hide the badge for unverified records).
  if (label) {
    const iconSize = size === "xs" ? 11 : size === "sm" ? 13 : 16;
    const fontSize = size === "xs" ? 10 : size === "sm" ? 11 : 13;
    const content = (
      <View style={[styles.row, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B66" }]}>
        <Feather name="alert-triangle" size={iconSize} color="#92400E" />
        <Text style={[styles.lbl, { color: "#92400E", fontSize }]}>Not verified</Text>
      </View>
    );
    if (onMissingPress) {
      return (
        <Pressable onPress={onMissingPress} hitSlop={6}>
          {content}
        </Pressable>
      );
    }
    return content;
  }
  return null;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 4,
  },
  lbl: { fontFamily: "Inter_700Bold" },
});

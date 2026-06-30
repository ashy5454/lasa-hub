import { Alert, Platform } from "react-native";

/**
 * Cross-platform yes/no confirm.
 *
 * React Native Web's Alert.alert renders only ONE button and discards the
 * rest, so the destructive callback never fires. This helper falls back to
 * window.confirm on web while keeping the native Alert.alert flow on iOS/Android.
 */
export async function confirm(
  title: string,
  message?: string,
  opts?: { okLabel?: string; cancelLabel?: string; destructive?: boolean },
): Promise<boolean> {
  const okLabel = opts?.okLabel ?? "OK";
  const cancelLabel = opts?.cancelLabel ?? "Cancel";

  if (Platform.OS === "web") {
    // window.confirm is the only reliable yes/no on RNWeb.
    const text = message ? `${title}\n\n${message}` : title;
    // eslint-disable-next-line no-alert
    return typeof window !== "undefined" && window.confirm(text);
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: "cancel", onPress: () => resolve(false) },
      {
        text: okLabel,
        style: opts?.destructive ? "destructive" : "default",
        onPress: () => resolve(true),
      },
    ]);
  });
}

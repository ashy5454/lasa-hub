import "./lib/env";
import { onRequest } from "firebase-functions/v2/https";
import app from "./app";

export const api = onRequest({ invoker: "public", timeoutSeconds: 60, memory: "512MiB" }, app as any);

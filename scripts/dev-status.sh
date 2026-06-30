#!/usr/bin/env bash
# Lasa Hub — quick status check.

api=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/wholesalers 2>/dev/null || echo "000")
web=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/ 2>/dev/null || echo "000")

if [ "$api" = "200" ]; then echo "  ✓ API :8080  (HTTP 200)"; else echo "  ✗ API :8080  (HTTP $api — not running)"; fi
if [ "$web" = "200" ]; then echo "  ✓ Web :8081  (HTTP 200)"; else echo "  ✗ Web :8081  (HTTP $web — not running)"; fi

if [ "$api" != "200" ] || [ "$web" != "200" ]; then
    echo ""
    echo "Start them with:"
    echo "  bash $(cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" && pwd)/dev-start.sh"
fi

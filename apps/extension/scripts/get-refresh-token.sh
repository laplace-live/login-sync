#!/bin/bash

# Script to obtain a new Refresh Token for the Chrome Web Store Publish API.
#
# Mirrors the working flow from `chrome-webstore-upload-keys`:
# https://github.com/fregante/chrome-webstore-upload-keys
#
# Why a loopback HTTP server?
#   Google's "Desktop app" OAuth client requires the redirect URI to be a
#   loopback address (e.g. http://127.0.0.1:PORT). The same URI must be used
#   for both the authorization request and the token exchange, otherwise
#   Google returns `invalid_grant` / `redirect_uri_mismatch`. Bare
#   `http://localhost` (no port) no longer works reliably.
#
# Requires: bash, curl, python3
#
# Usage:
#   ./scripts/get-refresh-token.sh [CLIENT_ID] [CLIENT_SECRET]

set -u

echo "🔑 Chrome Web Store - Refresh Token Generator"
echo "=============================================="
echo ""

if ! command -v python3 >/dev/null 2>&1; then
	echo "❌ python3 is required (used for the local OAuth callback server)."
	echo "   Install Python 3 from https://www.python.org/ or via your package manager."
	exit 1
fi

if [ $# -ge 2 ]; then
	CLIENT_ID=$1
	CLIENT_SECRET=$2
else
	echo "📝 Enter your Google Cloud OAuth credentials"
	echo "   (See https://github.com/fregante/chrome-webstore-upload-keys for setup)"
	echo ""
	read -p "Client ID: " CLIENT_ID
	read -rsp "Client Secret: " CLIENT_SECRET
	echo ""
fi

if [ -z "${CLIENT_ID}" ] || [ -z "${CLIENT_SECRET}" ]; then
	echo "❌ Client ID and Client Secret are required."
	exit 1
fi

echo ""

# Pick a free local port so multiple runs (or other dev tools) don't collide.
PORT=$(python3 -c 'import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()')
REDIRECT_URI="http://127.0.0.1:${PORT}"

# URL-encoded scope + redirect_uri (kept inline so we don't shell-out twice).
SCOPE_ENCODED="https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fchromewebstore"
REDIRECT_ENCODED="http%3A%2F%2F127.0.0.1%3A${PORT}"

# `prompt=consent` forces Google to return a refresh_token even if the user
# previously authorized this client (otherwise re-runs only get an access_token).
AUTH_URL="https://accounts.google.com/o/oauth2/auth?response_type=code&access_type=offline&prompt=consent&client_id=${CLIENT_ID}&scope=${SCOPE_ENCODED}&redirect_uri=${REDIRECT_ENCODED}"

echo "📋 STEP 1: Authenticate"
echo "======================="
echo ""
echo "Open this URL in your browser to grant access:"
echo ""
echo "${AUTH_URL}"
echo ""

if command -v open >/dev/null 2>&1; then
	open "${AUTH_URL}" 2>/dev/null || true
elif command -v xdg-open >/dev/null 2>&1; then
	xdg-open "${AUTH_URL}" 2>/dev/null || true
fi

echo "⏳ Waiting for OAuth callback at ${REDIRECT_URI} ..."
echo ""

# One-shot HTTP listener: prints the captured `code` to stdout, then exits.
AUTH_CODE=$(
	PORT="${PORT}" python3 - <<'PY'
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs


class Handler(BaseHTTPRequestHandler):
	captured = None

	def do_GET(self):
		params = parse_qs(urlparse(self.path).query)
		code = params.get("code", [None])[0]
		err = params.get("error", [None])[0]

		if code:
			Handler.captured = code
			self.send_response(200)
			self.send_header("Content-Type", "text/html; charset=utf-8")
			self.end_headers()
			self.wfile.write(
				b"<html><body style='font-family:sans-serif;text-align:center;padding:2em'>"
				b"<h2>You can close this tab now.</h2>"
				b"<script>window.close()</script>"
				b"</body></html>"
			)
		else:
			self.send_response(400)
			self.send_header("Content-Type", "text/plain")
			self.end_headers()
			msg = f"OAuth error: {err}".encode() if err else b"No `code` parameter in redirect URL."
			self.wfile.write(msg)

	def log_message(self, *_args, **_kwargs):
		pass


port = int(os.environ["PORT"])
server = HTTPServer(("127.0.0.1", port), Handler)
while Handler.captured is None:
	server.handle_request()
print(Handler.captured)
PY
)

if [ -z "${AUTH_CODE}" ]; then
	echo "❌ Did not receive an authorization code."
	exit 1
fi

echo "✅ Received authorization code"
echo ""
echo "⏳ Exchanging code for refresh token..."
echo ""

# `--data-urlencode` is critical: the auth code returned by Google contains
# `/` characters that must be percent-encoded in the request body.
# Endpoint matches the working `chrome-webstore-upload-keys` CLI.
RESPONSE=$(curl -sS -X POST https://accounts.google.com/o/oauth2/token \
	--data-urlencode "client_id=${CLIENT_ID}" \
	--data-urlencode "client_secret=${CLIENT_SECRET}" \
	--data-urlencode "code=${AUTH_CODE}" \
	--data-urlencode "grant_type=authorization_code" \
	--data-urlencode "redirect_uri=${REDIRECT_URI}")

if echo "${RESPONSE}" | grep -q '"error"'; then
	echo "❌ Error getting refresh token:"
	echo "${RESPONSE}" | (jq '.' 2>/dev/null || cat)
	echo ""
	echo "💡 Possible causes:"
	echo "   - The Client ID / Secret don't belong to a Desktop OAuth client"
	echo "   - The Chrome Web Store API is not enabled in the Google Cloud project"
	echo "   - You denied access on the consent screen"
	exit 1
fi

REFRESH_TOKEN=$(echo "${RESPONSE}" | python3 -c 'import sys, json; print(json.load(sys.stdin).get("refresh_token", ""))')

if [ -z "${REFRESH_TOKEN}" ]; then
	echo "⚠️  No refresh_token in the response:"
	echo "${RESPONSE}" | (jq '.' 2>/dev/null || cat)
	echo ""
	echo "💡 Re-run this script — the auth URL forces \`prompt=consent\` so"
	echo "   Google should return a refresh_token on every fresh authorization."
	exit 1
fi

echo "✅ Refresh Token obtained successfully!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 SECRETS TO ADD IN GITHUB:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "CHROME_CLIENT_ID:"
echo "${CLIENT_ID}"
echo ""
echo "CHROME_CLIENT_SECRET:"
echo "${CLIENT_SECRET}"
echo ""
echo "CHROME_REFRESH_TOKEN:"
echo "${REFRESH_TOKEN}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 To update in GitHub:"
echo "   1. Go to Settings → Secrets and variables → Actions"
echo "   2. Update the CHROME_REFRESH_TOKEN secret with the value above"
echo ""
echo "✨ Done!"

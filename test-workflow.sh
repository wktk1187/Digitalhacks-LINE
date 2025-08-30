#!/bin/bash

# .envファイルから環境変数を読み込み
export $(grep -v '^#' .env | xargs)

echo "🔄 ワークフローのテスト開始..."

# URLを確認
if [ -z "$SUPABASE_URL" ]; then
  echo "❌ SUPABASE_URL is not set"
  exit 1
fi

FULL_URL="${SUPABASE_URL}/functions/v1/line-auto-message-sender"
echo "📡 URL: $FULL_URL"

# curlでEdge Functionを呼び出し（エラーハンドリング強化）
response=$(curl -s -w "\nHTTPSTATUS:%{http_code}" -X POST \
  "$FULL_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  2>&1) || curl_exit_code=$?

# curlのexit codeをチェック
if [ ! -z "$curl_exit_code" ] && [ "$curl_exit_code" != "0" ]; then
  echo "❌ curl failed with exit code: $curl_exit_code"
  echo "📝 Response: $response"
  exit 1
fi

# HTTPステータスコードとレスポンスボディを分離
http_code=$(echo "$response" | tail -n 1 | sed 's/HTTPSTATUS://')
response_body=$(echo "$response" | sed '$d')

echo "📊 HTTP Status: $http_code"
echo "📄 Response: $response_body"

if [ "$http_code" = "200" ] || [ "$http_code" = "204" ]; then
  echo "✅ Edge Function実行成功"
  echo "📨 メッセージ送信処理完了"
else
  echo "❌ Edge Function実行失敗: HTTP $http_code"
  echo "🔍 レスポンス詳細: $response_body"
  exit 1
fi
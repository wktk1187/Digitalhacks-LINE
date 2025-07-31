# DigitalHacks LINE Bot

LINE公式アカウントで友達追加から180日まで自動メッセージを送信するシステム

## システム構成

- **GitHub Actions**: 自動メッセージ送信（Cron）
- **Supabase**: PostgreSQLデータベース + Webhook処理
- **LINE Messaging API**: メッセージ送信

## 機能

- 友達追加時の自動ユーザー登録・歓迎メッセージ
- 30日〜180日の各タイミングでの自動メッセージ送信（GitHub Actions）
- Supabaseデータベースでユーザー管理

## 設定

### 1. GitHub Secrets

リポジトリの Settings > Secrets and variables > Actions で以下を設定：

```
SUPABASE_URL=https://jbcctuhimeyreagluevn.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
LINE_CHANNEL_ACCESS_TOKEN=your_line_access_token
```

### 2. LINE Webhook URL

Supabase Edge Functionsまたは別のWebhookサービスを使用

### 3. 自動実行

GitHub Actionsが毎日午前9時（JST）に自動実行

## 手動実行

GitHub ActionsのワークフローはActions > Send Daily LINE Messages > Run workflowで手動実行可能
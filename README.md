# DigitalHacks LINE Bot

LINE公式アカウントで友達追加から180日まで自動メッセージを送信するシステム

## 機能

- 友達追加時の自動ユーザー登録・歓迎メッセージ
- 30日〜180日の各タイミングでの自動メッセージ送信
- Supabaseデータベースでユーザー管理
- Vercel Cron Jobsで自動実行

## システム構成

- **Vercel**: API Functions + Cron Jobs
- **Supabase**: PostgreSQLデータベース
- **LINE Messaging API**: メッセージ送信

## API エンドポイント

- `/api/webhook` - LINE Webhook受信
- `/api/send-messages` - 自動メッセージ送信（Cron実行）

## デプロイ

1. Vercelプロジェクト作成
2. 環境変数設定
3. LINE ConsoleのWebhook URL設定
4. 自動実行開始

## 環境変数

`.env.example`を参考に設定してください。
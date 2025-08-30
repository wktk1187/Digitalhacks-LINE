# GitHub Secrets 設定手順

## 必要なSecrets

以下の4つのSecretsをGitHubリポジトリに設定する必要があります：

1. **SUPABASE_URL**
   - 値: `https://jbcctuhimeyreagluevn.supabase.co`
   - 注意: 末尾にスラッシュ(/)を付けない
   - 改行や空白が入らないように注意

2. **SUPABASE_ANON_KEY**
   - 値: Supabaseプロジェクトのanon key
   - .envファイルから取得

3. **LINE_CHANNEL_ACCESS_TOKEN**
   - 値: LINE Messaging APIのチャンネルアクセストークン
   - LINE Developersコンソールから取得

4. **LINE_CHANNEL_SECRET**
   - 値: LINE Messaging APIのチャンネルシークレット
   - LINE Developersコンソールから取得

## 設定方法

1. GitHubリポジトリのページを開く
2. Settings → Secrets and variables → Actions を選択
3. 「New repository secret」ボタンをクリック
4. 各Secretを追加：
   - Name: 上記のSecret名（例: SUPABASE_URL）
   - Secret: 対応する値をペースト
   - 「Add secret」をクリック

## 重要な注意事項

⚠️ **SUPABASE_URLの設定時の注意**：
- コピー&ペースト時に改行が入らないよう注意
- 値の前後に空白が入らないよう注意
- 正しい例: `https://jbcctuhimeyreagluevn.supabase.co`
- 間違い例: `https://jbcctuhimeyreagluevn.supabase.co/` (末尾スラッシュ)
- 間違い例: `https://jbcctuhimeyreagluevn.supabase.co ` (末尾空白)

## 確認方法

設定後、GitHub Actionsを手動実行して動作確認：
1. Actions タブを開く
2. 「Send Daily LINE Messages」ワークフローを選択
3. 「Run workflow」ボタンをクリック
4. 実行結果を確認
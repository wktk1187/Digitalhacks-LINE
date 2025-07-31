import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// LINE Webhook署名を検証する関数
function verifySignature(body, signature) {
  try {
    const hash = createHmac('sha256', process.env.LINE_CHANNEL_SECRET)
      .update(body, 'utf8')
      .digest('base64');
    return hash === signature;
  } catch (error) {
    console.error('署名検証エラー:', error);
    return false;
  }
}

// LINEユーザーのプロフィールを取得する関数
async function getLineUserProfile(userId) {
  try {
    const response = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    });

    if (response.ok) {
      return await response.json();
    } else {
      console.error('LINEプロフィール取得エラー:', response.status, response.statusText);
      return null;
    }
  } catch (error) {
    console.error('LINEプロフィール取得例外:', error);
    return null;
  }
}

export default async function handler(req, res) {
  console.log('Webhook受信:', req.method, req.url);

  // CORS対応
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Line-Signature');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POSTメソッドのみ受け付けます' });
  }

  try {
    const body = JSON.stringify(req.body);
    const signature = req.headers['x-line-signature'];

    console.log('受信データ:', {
      bodyLength: body.length,
      hasSignature: !!signature,
      method: req.method
    });

    // 環境変数の確認
    if (!process.env.LINE_CHANNEL_SECRET || !process.env.LINE_CHANNEL_ACCESS_TOKEN) {
      console.error('環境変数が設定されていません');
      return res.status(500).json({ error: '環境変数が設定されていません' });
    }

    // Webhook署名検証
    if (!signature || !verifySignature(body, signature)) {
      console.error('署名検証に失敗しました');
      return res.status(403).json({ error: '不正なリクエスト' });
    }

    const events = req.body.events;

    if (!events || !Array.isArray(events)) {
      return res.status(200).json({ message: 'イベントがありません' });
    }

    const results = [];

    for (const event of events) {
      try {
        console.log('イベント処理:', event.type, event.source?.userId);
        
        // 友達追加イベントの場合
        if (event.type === 'follow') {
          const userId = event.source.userId;
          console.log(`新しい友達追加: ${userId}`);

          // LINEユーザーのプロフィールを取得
          const profile = await getLineUserProfile(userId);
          let displayName = 'ユーザー'; // デフォルト名

          if (profile && profile.displayName) {
            displayName = profile.displayName;
          }

          console.log('プロフィール取得完了:', { userId, displayName });

          // データベースにユーザーを登録
          const { data: userData, error: insertError } = await supabase
            .rpc('add_line_friend', {
              input_user_id: userId,
              input_display_name: displayName,
              input_added_date: new Date().toISOString().split('T')[0] // YYYY-MM-DD形式
            });

          if (insertError) {
            console.error('ユーザー登録エラー:', insertError);
            results.push({
              type: 'follow',
              user_id: userId,
              display_name: displayName,
              status: 'error',
              error: insertError.message
            });
          } else {
            console.log('ユーザー登録成功:', userData);
            results.push({
              type: 'follow',
              user_id: userId,
              display_name: displayName,
              status: 'success',
              data: userData
            });

            // 友達追加時の挨拶メッセージを送信
            try {
              const welcomeMessage = {
                type: 'text',
                text: `${displayName}さん、デジハクの友達追加ありがとうございます！\n\nこれから、学習の進捗に合わせて役立つ情報をお送りします。\n一緒に頑張りましょう！💪`
              };

              const lineResponse = await fetch('https://api.line.me/v2/bot/message/push', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
                },
                body: JSON.stringify({
                  to: userId,
                  messages: [welcomeMessage]
                }),
              });

              if (lineResponse.ok) {
                console.log('歓迎メッセージ送信成功');
              } else {
                console.error('歓迎メッセージ送信失敗:', await lineResponse.text());
              }
            } catch (messageError) {
              console.error('歓迎メッセージ送信エラー:', messageError);
            }
          }
        }
        // ブロック解除イベントの場合
        else if (event.type === 'unfollow') {
          const userId = event.source.userId;
          console.log(`ブロック: ${userId}`);
          
          results.push({
            type: 'unfollow',
            user_id: userId,
            status: 'noted'
          });
        }
        // テキストメッセージの場合
        else if (event.type === 'message' && event.message?.type === 'text') {
          const userId = event.source.userId;
          const messageText = event.message.text;
          
          console.log(`メッセージ受信: ${userId} - ${messageText}`);
          
          results.push({
            type: 'message',
            user_id: userId,
            message: messageText,
            status: 'received'
          });
        }
      } catch (eventError) {
        console.error('イベント処理エラー:', eventError);
        results.push({
          type: event.type,
          status: 'error',
          error: eventError.message
        });
      }
    }

    console.log('Webhook処理完了:', results);

    return res.status(200).json({
      message: 'Webhook処理完了',
      processed_events: results.length,
      results: results
    });

  } catch (error) {
    console.error('Webhook処理エラー:', error);
    return res.status(500).json({ 
      error: 'Webhook処理中にエラーが発生しました', 
      details: error.message 
    });
  }
}
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createHmac } from "node:crypto";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LINE_CHANNEL_SECRET = Deno.env.get('LINE_CHANNEL_SECRET')!;
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// LINE Webhook署名を検証する関数
function verifySignature(body: string, signature: string): boolean {
  const hash = createHmac('sha256', LINE_CHANNEL_SECRET)
    .update(body, 'utf8')
    .digest('base64');
  return hash === signature;
}

// LINEユーザーのプロフィールを取得する関数
async function getLineUserProfile(userId: string) {
  try {
    const response = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: {
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
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

Deno.serve(async (req: Request) => {
  try {
    // CORS対応
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Line-Signature',
        },
      });
    }

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'POSTメソッドのみ受け付けます' }),
        { status: 405, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.text();
    const signature = req.headers.get('X-Line-Signature');

    // Webhook署名検証
    if (!signature || !verifySignature(body, signature)) {
      console.error('署名検証に失敗しました');
      return new Response(
        JSON.stringify({ error: '不正なリクエスト' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const webhookBody = JSON.parse(body);
    const events = webhookBody.events;

    if (!events || !Array.isArray(events)) {
      return new Response(
        JSON.stringify({ message: 'イベントがありません' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const results = [];

    for (const event of events) {
      try {
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
                  'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
                },
                body: JSON.stringify({
                  to: userId,
                  messages: [welcomeMessage]
                }),
              });

              if (!lineResponse.ok) {
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
        else if (event.type === 'message' && event.message.type === 'text') {
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

    return new Response(
      JSON.stringify({
        message: 'Webhook処理完了',
        processed_events: results.length,
        results: results
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );

  } catch (error) {
    console.error('Webhook処理エラー:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Webhook処理中にエラーが発生しました', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        } 
      }
    );
  }
});
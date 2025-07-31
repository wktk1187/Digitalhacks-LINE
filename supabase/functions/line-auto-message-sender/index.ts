import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface LineMessage {
  type: string;
  text?: string;
  originalContentUrl?: string;
  previewImageUrl?: string;
}

interface ScheduledMessage {
  user_id: string;
  display_name: string;
  day_number: number;
  title: string;
  message_text: string;
  image_url: string | null;
  template_id: number;
  scheduled_date: string;
}

Deno.serve(async (req: Request) => {
  try {
    // CORS対応
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // 今日送信すべきメッセージを取得
    const { data: scheduledMessages, error: fetchError } = await supabase
      .rpc('get_scheduled_messages_for_today');

    if (fetchError) {
      console.error('メッセージ取得エラー:', fetchError);
      return new Response(
        JSON.stringify({ error: 'メッセージ取得に失敗しました', details: fetchError }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!scheduledMessages || scheduledMessages.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: '今日送信すべきメッセージはありません',
          sent_count: 0
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // 各メッセージを送信
    for (const msg of scheduledMessages as ScheduledMessage[]) {
      try {
        // メッセージ内容を動的に置換（ユーザー名など）
        const personalizedMessage = msg.message_text.replace(/○○/g, msg.display_name);

        // LINEメッセージを構築
        const lineMessages: LineMessage[] = [];
        
        // 画像がある場合は画像メッセージを追加
        if (msg.image_url) {
          lineMessages.push({
            type: "image",
            originalContentUrl: msg.image_url,
            previewImageUrl: msg.image_url
          });
        }
        
        // テキストメッセージを追加
        lineMessages.push({
          type: "text",
          text: personalizedMessage
        });

        // LINE APIでメッセージ送信
        const lineResponse = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
          },
          body: JSON.stringify({
            to: msg.user_id,
            messages: lineMessages
          }),
        });

        if (lineResponse.ok) {
          // 送信成功ログを記録
          await supabase.rpc('log_message_send', {
            p_user_id: msg.user_id,
            p_day_number: msg.day_number,
            p_template_id: msg.template_id,
            p_success: true,
            p_error_message: null,
            p_line_message_id: null
          });

          results.push({
            user_id: msg.user_id,
            display_name: msg.display_name,
            day_number: msg.day_number,
            title: msg.title,
            status: 'success'
          });
          successCount++;
        } else {
          const errorText = await lineResponse.text();
          
          // 送信失敗ログを記録
          await supabase.rpc('log_message_send', {
            p_user_id: msg.user_id,
            p_day_number: msg.day_number,
            p_template_id: msg.template_id,
            p_success: false,
            p_error_message: `LINE API Error: ${lineResponse.status} - ${errorText}`,
            p_line_message_id: null
          });

          results.push({
            user_id: msg.user_id,
            display_name: msg.display_name,
            day_number: msg.day_number,
            title: msg.title,
            status: 'error',
            error: errorText
          });
          errorCount++;
        }
      } catch (sendError) {
        console.error(`メッセージ送信エラー (${msg.user_id}):`, sendError);
        
        // エラーログを記録
        await supabase.rpc('log_message_send', {
          p_user_id: msg.user_id,
          p_day_number: msg.day_number,
          p_template_id: msg.template_id,
          p_success: false,
          p_error_message: `送信処理エラー: ${sendError.message}`,
          p_line_message_id: null
        });

        results.push({
          user_id: msg.user_id,
          display_name: msg.display_name,
          day_number: msg.day_number,
          title: msg.title,
          status: 'error',
          error: sendError.message
        });
        errorCount++;
      }

      // API制限を避けるため少し待機
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return new Response(
      JSON.stringify({
        message: 'メッセージ送信処理完了',
        total_messages: scheduledMessages.length,
        success_count: successCount,
        error_count: errorCount,
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
    console.error('関数実行エラー:', error);
    return new Response(
      JSON.stringify({ 
        error: '関数実行中にエラーが発生しました', 
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
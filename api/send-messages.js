import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  console.log('自動メッセージ送信開始:', new Date().toISOString());

  // CORS対応
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 今日送信すべきメッセージを取得
    const { data: scheduledMessages, error: fetchError } = await supabase
      .rpc('get_scheduled_messages_for_today');

    if (fetchError) {
      console.error('メッセージ取得エラー:', fetchError);
      return res.status(500).json({ 
        error: 'メッセージ取得に失敗しました', 
        details: fetchError 
      });
    }

    if (!scheduledMessages || scheduledMessages.length === 0) {
      console.log('今日送信すべきメッセージはありません');
      return res.status(200).json({ 
        message: '今日送信すべきメッセージはありません',
        sent_count: 0
      });
    }

    console.log(`送信予定メッセージ数: ${scheduledMessages.length}`);

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // 各メッセージを送信
    for (const msg of scheduledMessages) {
      try {
        // メッセージ内容を動的に置換（ユーザー名など）
        const personalizedMessage = msg.message_text.replace(/○○/g, msg.display_name);

        // LINEメッセージを構築
        const lineMessages = [];
        
        // 画像がある場合は画像メッセージを追加
        if (msg.image_url && msg.image_url.startsWith('http')) {
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

        console.log(`メッセージ送信準備: ${msg.user_id} (${msg.display_name}) - ${msg.day_number}日目`);

        // LINE APIでメッセージ送信
        const lineResponse = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
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

          console.log(`送信成功: ${msg.user_id} - ${msg.day_number}日目`);

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
          console.error(`送信失敗: ${msg.user_id} -`, errorText);
          
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

    console.log('メッセージ送信処理完了:', { successCount, errorCount });

    return res.status(200).json({
      message: 'メッセージ送信処理完了',
      total_messages: scheduledMessages.length,
      success_count: successCount,
      error_count: errorCount,
      results: results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('関数実行エラー:', error);
    return res.status(500).json({ 
      error: '関数実行中にエラーが発生しました', 
      details: error.message 
    });
  }
}
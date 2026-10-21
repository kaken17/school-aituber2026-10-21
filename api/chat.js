
const SCHOOL_INFO = `
【学校紹介情報】
学校名：まだ設定されていません。
学科、部活動、学校行事、入試、学費については、
学校の公式資料で確認できた情報を使用してください。
資料にない情報は推測せず、不明であると伝えてください。
`;

const SYSTEM_PROMPT = `
あなたは学校を紹介する親しみやすいAI案内係です。
中学生や保護者にも分かりやすい日本語で回答してください。

ルール：
1. 学校紹介情報を優先して回答する。
2. 情報がない場合は、事実を作らず「手元の資料では確認できません」と伝える。
3. 入試日程や学費などは、最新の公式情報の確認を勧める。
4. 丁寧で親しみやすい口調にする。
5. 個人情報や非公開情報を推測して回答しない。

学校紹介情報：
${SCHOOL_INFO}
`;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "POSTで質問を送信してください。"
    });
  }

  const token = process.env.HF_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: "HF_TOKENが設定されていません。"
    });
  }

  try {
    const body = req.body || {};
    const incoming = body.messages;

    if (!Array.isArray(incoming) || incoming.length === 0) {
      return res.status(400).json({
        error: "質問を入力してください。"
      });
    }

    const messages = incoming
      .filter(
        (m) =>
          m &&
          ["user", "assistant"].includes(m.role) &&
          typeof m.content === "string"
      )
      .slice(-12)
      .map((m) => ({
        role: m.role,
        content: m.content.slice(0, 3000)
      }));

    if (
      messages.length === 0 ||
      messages[messages.length - 1].role !== "user"
    ) {
      return res.status(400).json({
        error: "有効な質問が見つかりません。"
      });
    }

    const response = await fetch(
      "https://router.huggingface.co/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "Qwen/Qwen2.5-7B-Instruct-1M:fastest",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages
          ],
          max_tokens: 600,
          temperature: 0.3
        })
      }
    );

    if (!response.ok) {
      const details = await response.text();

      console.error(
        "Hugging Face error:",
        response.status,
        details.slice(0, 500)
      );

      return res.status(502).json({
        error:
          "AIサービスに接続できませんでした。Hugging Faceのトークン、モデルの利用可否、利用枠を確認してください。"
      });
    }

    const result = await response.json();
    const answer = result.choices?.[0]?.message?.content;

    if (typeof answer !== "string" || !answer.trim()) {
      return res.status(502).json({
        error: "AIから回答を取得できませんでした。"
      });
    }

    return res.status(200).json({
      answer: answer.trim()
    });
  } catch (error) {
    console.error("Chat API error:", error);

    return res.status(500).json({
      error: "サーバーでエラーが発生しました。"
    });
  }
}

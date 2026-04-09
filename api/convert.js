export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, type } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: '변환할 내용이 없습니다.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API 키가 서버에 설정되지 않았습니다.' });
  }

  const isMessenger = type === 'messenger';

  const prompt = isMessenger
    ? `당신은 한국 직장인을 위한 업무 메신저 메시지 작성 전문가입니다.
아래의 내용을 업무용 메신저(카카오톡, 슬랙 등)에 어울리는 부드럽고 친절한 한국어 메시지로 3가지 다른 버전으로 변환해주세요.

[규칙]
- 메일보다 가볍고 친근한 톤, 하지만 예의 바르게
- 짧고 간결하게, 자연스러운 구어체 존댓말 사용
- 딱딱한 격식체 표현 지양, 따뜻하고 배려 있는 말투
- 각 버전은 톤이나 표현 방식이 서로 달라야 함
- 반드시 아래 JSON 형식으로만 응답할 것 (다른 텍스트 없이)

[응답 형식]
{
  "results": [
    { "body": "메시지 내용 1" },
    { "body": "메시지 내용 2" },
    { "body": "메시지 내용 3" }
  ]
}

[변환할 내용]
${text.trim()}`
    : `당신은 한국 직장인을 위한 비즈니스 메일 작성 전문가입니다.
아래의 내용을 정중하고 격식 있는 한국어 업무 메일로 3가지 다른 버전으로 변환해주세요.

[규칙]
- 인사말로 시작하고 마무리 인사로 끝낼 것
- 존댓말 사용, 정중하고 전문적인 톤 유지
- 각 버전은 제목이나 표현 방식이 서로 달라야 함
- 반드시 아래 JSON 형식으로만 응답할 것 (다른 텍스트 없이)

[응답 형식]
{
  "results": [
    { "subject": "메일 제목 1", "body": "메일 본문 1" },
    { "subject": "메일 제목 2", "body": "메일 본문 2" },
    { "subject": "메일 제목 3", "body": "메일 본문 3" }
  ]
}

[변환할 내용]
${text.trim()}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 2048 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errData = await geminiRes.json().catch(() => ({}));
      return res.status(502).json({ error: errData?.error?.message || 'Gemini API 오류' });
    }

    const data = await geminiRes.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    console.log('Gemini raw response:', raw);

    // 마크다운 코드블록 제거 후 JSON 추출
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(502).json({ error: '응답 파싱 실패', raw });

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return res.status(502).json({ error: 'JSON 파싱 오류', raw });
    }
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

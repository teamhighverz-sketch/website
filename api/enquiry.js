export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const incomingPayload = req.body || {};
  const payload = {
    ...incomingPayload,
    position: String(incomingPayload.position || '').trim(),
    otherPosition: String(incomingPayload.otherPosition || '').trim()
  };
  const isJoinUsApplication = ['Join Us Application', 'Editor Application'].includes(payload.type);

  if (isJoinUsApplication && !payload.position) {
    return res.status(400).json({ error: 'A position is required for Join Us applications.' });
  }
  if (isJoinUsApplication && payload.position === 'Other' && !payload.otherPosition) {
    return res.status(400).json({ error: 'Please specify the role when selecting Other.' });
  }
  const googleSheetsUrl = (payload.googleSheetsUrl && payload.googleSheetsUrl.trim()) ||
    process.env.GOOGLE_SHEETS_URL ||
    'https://script.google.com/macros/s/AKfycbzJnIoBHmIqo8JnNz9TYHjFszW1d9mdCNIXuCsYV3g-SFLMxOs19-cijUJfaQwPK1Pvsw/exec';

  try {
    const response = await fetch(googleSheetsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    const responseText = await response.text();

    return res.status(200).json({
      success: true,
      sheetSynced: response.ok,
      status: response.status
    });
  } catch (error) {
    console.error('Vercel Serverless Function Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

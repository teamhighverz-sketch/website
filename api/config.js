export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const googleSheetsUrl = process.env.GOOGLE_SHEETS_URL || 'https://script.google.com/macros/s/AKfycbwRD7SSH0Bcw8QSwdz-7beV0p3Go4EPjyRP2Jqo5rCEjRQoeR1EnR37ovDRD9WbCBoVjg/exec';
  res.status(200).json({ googleSheetsUrl });
}


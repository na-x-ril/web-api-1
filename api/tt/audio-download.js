import { getDesktopUrl } from '../../utils.js';

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Audio URL is required' });

  try {
    const finalUrl = await getDesktopUrl(url);
    const apiUrl = `https://www.tikwm.com/api/music/info?url=${finalUrl}`;
    const response = await fetch(apiUrl, { timeout: 10000 });
    const data = await response.json();

    if (!data.data) {
      return res.status(404).json({ error: 'Audio not found' });
    }

    const audioId = data.data.id || 'unknown';
    let audioTitle = data.data.title || 'unknown';
    audioTitle = audioTitle.replace(/^original sound - /, '');
    const filename = `${audioTitle}-${audioId}.mp3`;

    const audioUrl = data.data.play;

    res.setHeader('Content-Disposition', `attachment; filename=\"${filename}\"`);
    res.setHeader('Content-Type', 'audio/mpeg');

    const audioResponse = await fetch(audioUrl);
    audioResponse.body.pipe(res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

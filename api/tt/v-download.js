import { getDesktopUrl } from '../../utils.js';

export default async function handler(req, res) {
  const { url, quality } = req.query;
  if (!url) return res.status(400).json({ error: 'Video URL is required' });

  try {
    const finalUrl = await getDesktopUrl(url);
    const tiktokApiUrl = `https://tikwm.com/api/?url=${encodeURIComponent(finalUrl)}&hd=1`;
    const response = await fetch(tiktokApiUrl);
    const data = await response.json();

    if (!data.data) return res.status(404).json({ error: 'Video not found' });

    const username = data.data.author?.unique_id || 'unknown';
    const videoID = data.data.id || 'unknown';
    const filename = `TikTok_${username}_${videoID}.mp4`;

    const videoUrl = quality === 'hd' ? data.data.hdplay : data.data.play;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'video/mp4');

    const videoResponse = await fetch(videoUrl);
    videoResponse.body.pipe(res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

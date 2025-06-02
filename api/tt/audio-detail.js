import { getDesktopUrl, formatDuration, formatNumber } from '../../utils.js';

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Audio URL is required' });

  try {
    const finalUrl = await getDesktopUrl(url);
    const apiUrl = `https://www.tikwm.com/api/music/info?url=${encodeURIComponent(finalUrl)}`;
    const response = await fetch(apiUrl, { timeout: 10000 });
    const data = await response.json();

    if (!data.data) {
      return res.status(404).json({ error: 'Audio not found' });
    }

    const formattedData = {
      ...data,
      data: {
        ...data.data,
        formatted: {
          duration: formatDuration(data.data.duration),
          video_count: formatNumber(data.data.video_count),
        },
      },
    };

    res.status(200).json(formattedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

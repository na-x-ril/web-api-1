import { getDesktopUrl, formatDuration, formatBytes, formatNumber, formatTime, formatRegion, shortenUrl } from '../../utils.js';
import countries from '../../countries.js';

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Video URL is required' });

  try {
    const finalUrl = await getDesktopUrl(url);
    const tiktokApiUrl = `https://tikwm.com/api/?url=${encodeURIComponent(finalUrl)}&hd=1`;
    const response = await fetch(tiktokApiUrl);
    const data = await response.json();

    if (!data.data) return res.status(404).json({ error: 'Video not found' });

    let shortenedImages = [];
    if (data.data.images && Array.isArray(data.data.images)) {
      shortenedImages = await Promise.all(
        data.data.images.map(async (imageUrl) => await shortenUrl(imageUrl))
      );
    }

    let formattedDuration;
    if (data.data.duration > 0) {
      formattedDuration = formatDuration(data.data.duration);
    } else if (data.data.music_info?.duration) {
      formattedDuration = formatDuration(data.data.music_info.duration);
    } else {
      formattedDuration = "0:00";
    }

    const formattedData = {
      ...data,
      data: {
        ...data.data,
        shortened_images: shortenedImages,
        formatted: {
          duration: formattedDuration,
          size: formatBytes(data.data.size),
          hd_size: formatBytes(data.data.hd_size),
          play_count: formatNumber(data.data.play_count),
          digg_count: formatNumber(data.data.digg_count),
          comment_count: formatNumber(data.data.comment_count),
          collect_count: formatNumber(data.data.collect_count),
          create_time: formatTime(data.data.create_time),
          region: formatRegion(data.data.region, countries),
        },
      },
    };

    res.status(200).json(formattedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

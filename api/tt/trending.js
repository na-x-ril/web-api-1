import { formatNumber, formatTime, shortenUrl } from '../../utils.js';
import countries from '../../countries.js';

export default async function handler(req, res) {
  const { region } = req.query;

  try {
    const regionData = countries.find((c) => c.name.toLowerCase() === region.toLowerCase());
    const apiUrl = `https://www.tikwm.com/api/feed/list?region=${regionData.id.toLowerCase()}`;
    const response = await fetch(apiUrl, { timeout: 10000 });
    const data = await response.json();

    if (!data?.data?.length) {
      return res.status(404).json({ error: 'No trending videos found for this region' });
    }

    const formattedVideos = await Promise.all(
      data.data.map(async (video) => {
        const shortenedPlay = await shortenUrl(video.play);
        return {
          ...video,
          shortened_play: shortenedPlay,
          formatted: {
            play_count: formatNumber(video.play_count),
            digg_count: formatNumber(video.digg_count),
            comment_count: formatNumber(video.comment_count),
            create_time: formatTime(video.create_time),
          },
        };
      })
    );

    const formattedData = {
      data: {
        region: regionData.name,
        formattedVideos,
      },
    };

    res.status(200).json(formattedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

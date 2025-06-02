import { formatNumber, formatTime, formatRegion, shortenUrl } from '../../utils.js';
import countries from '../../countries.js';

export default async function handler(req, res) {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'Username is required' });

  try {
    const apiUrl = `https://www.tikwm.com/api/user/favorite?unique_id=${encodeURIComponent(username)}`;
    const response = await fetch(apiUrl, { timeout: 10000 });
    const data = await response.json();

    if (!data?.data?.videos?.length) {
      return res.status(404).json({ error: 'No favorite videos found for this user' });
    }

    const videos = await Promise.all(
      data.data.videos.map(async (video) => {
        const shortenedPlay = await shortenUrl(video.play);
        return {
          ...video,
          shortened_play: shortenedPlay,
          formatted: {
            play_count: formatNumber(video.play_count),
            digg_count: formatNumber(video.digg_count),
            comment_count: formatNumber(video.comment_count),
            share_count: formatNumber(video.share_count),
            collect_count: formatNumber(video.collect_count || 0),
            create_time: formatTime(video.create_time),
            region: formatRegion(video.region, countries)
          },
        };
      })
    );

    const formattedData = {
      ...data,
      data: {
        ...data.data,
        videos,
      },
    };

    res.status(200).json(formattedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

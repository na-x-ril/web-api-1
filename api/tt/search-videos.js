import { formatNumber, formatTime, shortenUrl } from '../../utils.js';

export default async function handler(req, res) {
  const { keywords, cursor = 0, count = 10 } = req.query;
  if (!keywords) return res.status(400).json({ error: 'Keywords parameter is required' });

  try {
    const tiktokApiUrl = `https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(keywords)}&cursor=${cursor}&count=${count}`;
    const response = await fetch(tiktokApiUrl);
    const data = await response.json();

    if (!data.data || !data.data.videos) {
      return res.status(404).json({ error: 'No videos found' });
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
            collect_count: formatNumber(video.collect_count || 0),
            create_time: formatTime(video.create_time),
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

import { getDesktopUrl, formatNumber, formatTime } from '../../utils.js';

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Video URL is required' });

  try {
    const finalUrl = await getDesktopUrl(url);
    const videoResponse = await fetch(
      `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3000'}/api/tt/v-get?url=${encodeURIComponent(finalUrl)}`
    );
    const videoData = await videoResponse.json();

    if (!videoData.data) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const uniqueId = videoData.data.author?.unique_id || 'unknown';
    const userId = videoData.data.author?.id || 'unknown';

    const apiUrl = `https://www.tikwm.com/api/comment/list?url=${encodeURIComponent(finalUrl)}`;
    const response = await fetch(apiUrl, { timeout: 10000 });
    const data = await response.json();
    const comments = data.data.comments;

    if (!comments?.length) {
      return res.status(404).json({ error: 'No comments found for this video' });
    }

    const formattedComments = comments.map((comment) => ({
      ...comment,
      formatted: {
        create_time: formatTime(comment.create_time),
        digg_count: formatNumber(comment.digg_count || 0),
      },
    }));

    res.status(200).json({
      data: {
        comments: formattedComments,
        unique_id: uniqueId,
        user_id: userId,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

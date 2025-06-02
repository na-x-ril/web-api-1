import { formatNumber, formatTime, shortenUrl } from '../../utils.js';

export default async function handler(req, res) {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'Username is required' });

  try {
    const userResponse = await fetch(
      `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3000'}/api/tt/user-get?username=${encodeURIComponent(username)}`
    );
    const userData = await userResponse.json();

    if (userData.msg !== 'success' || !userData.user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const apiUrl = `https://www.tikwm.com/api/user/posts?unique_id=${encodeURIComponent(username)}`;
    const response = await fetch(apiUrl, { timeout: 10000 });
    const data = await response.json();
    const videos = data.data.videos;

    if (!videos?.length) {
      return res.status(404).json({ error: 'No videos found for this user' });
    }

    const formattedVideos = await Promise.all(
      videos.map(async (video) => {
        const shortened_play = await shortenUrl(video.play);
        return {
          ...video,
          shortened_play,
          formatted: {
            play_count: formatNumber(video.play_count || 0),
            digg_count: formatNumber(video.digg_count || 0),
            comment_count: formatNumber(video.comment_count || 0),
            share_count: formatNumber(video.share_count || 0),
            download_count: formatNumber(video.download_count || 0),
            collect_count: formatNumber(video.collect_count || 0),
            create_time: formatTime(video.create_time),
          },
        };
      })
    );

    const formattedUserStats = {
      aweme_count: formatNumber(userData.stats.videoCount || 0),
      following_count: formatNumber(userData.stats.followingCount || 0),
      follower_count: formatNumber(userData.stats.followerCount || 0),
      favoriting_count: formatNumber(userData.stats.diggCount || 0),
      total_favorited: formatNumber(userData.stats.heartCount || 0),
    };

    res.status(200).json({
      data: {
        videos: formattedVideos,
        user_stats: formattedUserStats,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

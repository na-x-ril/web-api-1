require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { fetch } = require('undici');
const cheerio = require('cheerio');
const path = require('path');
const countries = require('./countries');
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);

const app = express();
const port = process.env.PORT || 4000;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

app.use(cors());
app.set('json spaces', 2);

// TikTok API configuration (from api.js)
const API_CONFIG = {
  host: "https://www.tikwm.com",
  endpoints: {
    searchVideos: "api/feed/search",
    userLiked: "api/user/favorite",
    videoComments: "api/comment/list",
    trendingVideos: "api/feed/list",
    musicDetail: "api/music/info",
    userFollowing: "api/user/following",
    userFeed: "api/user/posts"
  }
};

// Helper function for time ago formatting (unchanged)
const fromNow = (dateString, isLive) => {
  const now = new Date();
  const targetDate = new Date(dateString);
  const diffInSeconds = Math.floor((now - targetDate) / 1000);
  let result = "";

  const units = [
    { singular: "year", plural: "years", value: 365 * 24 * 60 * 60 },
    { singular: "month", plural: "months", value: 30 * 24 * 60 * 60 },
    { singular: "week", plural: "weeks", value: 7 * 24 * 60 * 60 },
    { singular: "day", plural: "days", value: 24 * 60 * 60 },
    { singular: "hour", plural: "hours", value: 60 * 60 },
    { singular: "min", plural: "mins", value: 60 },
    { singular: "sec", plural: "secs", value: 1 },
  ];

  const minuteThreshold = isLive ? 119 : 59;

  if (diffInSeconds < minuteThreshold * 60) {
    const minutes = Math.floor(diffInSeconds / 60);
    result = `${minutes} ${minutes === 1 ? 'min' : 'mins'}`;
  } else {
    for (const { singular, plural, value } of units) {
      if (diffInSeconds >= value) {
        const count = Math.floor(diffInSeconds / value);
        result = `${count} ${count === 1 ? singular : plural}`;
        break;
      }
    }
  }

  const prefix = isLive ? "Stream started " : "Published ";
  const suffix = diffInSeconds >= 0 ? " ago" : " later";

  return `${prefix}${result}${suffix}`;
};

// TikTok formatting functions (moved from index.js and tiktok.js)
const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' + secs : secs}`;
};

const formatBytes = (bytes) => (bytes / (1024 * 1024)).toFixed(2);

const formatNumber = (num) => {
  num = parseInt(num, 10);
  const formattedNum = num.toLocaleString('id-ID');
  const units = [
    { value: 1e12, suffix: 'T' },
    { value: 1e9, suffix: 'M' },
    { value: 1e6, suffix: 'jt' },
    { value: 1e3, suffix: 'rb' },
  ];

  let displayNum = formattedNum;
  for (const { value, suffix } of units) {
    if (num >= value) {
      let count = Math.floor((num / value) * 10) / 10;
      count = count.toString().replace('.', ',');
      displayNum += ` (${count.replace(/,0$/, '')}${suffix})`;
      break;
    }
  }
  return displayNum;
};

const formatTime = (timestamp) => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatRegion = (countryCode, countries) => {
  if (!countryCode)
    return {
      name: 'Tidak diketahui',
      flag: '',
      continent: '',
      phoneCode: '',
    };

  const country = countries.find((c) => c.id === countryCode.toUpperCase());
  if (!country)
    return {
      name: countryCode,
      flag: '',
      continent: '',
      phoneCode: '',
    };

  return {
    name: country.name,
    flag: country.flag,
    continent: country.continent,
    phoneCode: country.phoneCode,
    currencyId: country.currencyId,
  };
};

// YouTube endpoint (modified for undici)
app.get('/yt/v-get', async (req, res) => {
  const videoId = req.query.id;
  let parts = req.query.parts ? req.query.parts.split(',') : [];

  if (!videoId) {
    return res.status(400).json({ error: 'id parameter is required' });
  }

  const validParts = [
    'snippet',
    'contentDetails',
    'statistics',
    'status',
    'liveStreamingDetails',
    'player',
    'topicDetails',
  ];

  if (parts.includes('all')) {
    parts = validParts;
  } else {
    parts = parts.filter((part) => validParts.includes(part));
  }

  if (parts.length === 0) {
    return res.status(400).json({ error: 'Valid parts or "all" parameter is required' });
  }

  const youtubeApiUrl = `https://www.googleapis.com/youtube/v3/videos?part=${parts.join(
    ','
  )}&id=${videoId}&key=${YOUTUBE_API_KEY}`;
  const dislikeApiUrl = `https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`;

  try {
    const [youtubeResponse, dislikeResponse] = await Promise.all([
      fetch(youtubeApiUrl).then(res => res.json()),
      fetch(dislikeApiUrl).then(res => res.json()),
    ]);

    const videoData = youtubeResponse;
    const dislikeData = dislikeResponse;

    if (videoData.items?.length > 0) {
      const videoItem = videoData.items[0];
      const statistics = videoItem.statistics || {};

      statistics.dislikeCount = dislikeData.dislikes;
      statistics.rating = dislikeData.rating;

      const isLive = videoItem.snippet?.liveBroadcastContent === 'live';
      const formattedDate = fromNow(
        isLive ? videoItem.liveStreamingDetails?.actualStartTime : videoItem.snippet?.publishedAt,
        isLive
      );

      if (isLive && videoItem.liveStreamingDetails) {
        videoItem.liveStreamingDetails.formattedDate = formattedDate;
      } else if (videoItem.snippet) {
        videoItem.snippet.formattedDate = formattedDate;
      }

      videoItem.statistics = {
        viewCount: statistics.viewCount,
        likeCount: statistics.likeCount,
        dislikeCount: statistics.dislikeCount,
        rating: statistics.rating,
        favoriteCount: statistics.favoriteCount,
        commentCount: statistics.commentCount,
      };
    }

    res.json(videoData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to convert mobile to desktop URL
const isMobile = (url) => {
  const mobileUrlRegex = /^https:\/\/(vt|m)\.tiktok\.com\/[a-zA-Z0-9]+\/?/;
  return mobileUrlRegex.test(url);
};

const getDesktopUrl = async (url) => {
  try {
    if (isMobile(url)) {
      const response = await fetch(url, {
        redirect: 'manual'
      });
      return response.headers.get('location') || url;
    }
    return url;
  } catch (error) {
    console.error('Error converting to desktop URL:', error);
    return url;
  }
};

// TikTok video data endpoint
app.get('/tt/v-get', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Video URL is required' });
  }

  try {
    const finalUrl = await getDesktopUrl(url);
    const tiktokApiUrl = `https://tikwm.com/api/?url=${encodeURIComponent(finalUrl)}&hd=1`;
    const response = await fetch(tiktokApiUrl);
    const data = await response.json();

    if (!data.data) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const formattedData = {
      ...data,
      data: {
        ...data.data,
        formatted: {
          duration: formatDuration(data.data.duration),
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

    res.json(formattedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// TikTok user data endpoint
app.get('/tt/user-get', async (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const startTime = Date.now();

  try {
    const url = `https://www.tiktok.com/@${username}`;
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    };

    const response = await fetch(url, { headers });
    const html = await response.text();

    const $ = cheerio.load(html);
    const scriptElement = $('#__UNIVERSAL_DATA_FOR_REHYDRATION__');

    if (scriptElement.length === 0) {
      return res.status(404).json({ error: 'User data not found or script element missing' });
    }

    const jsonData = JSON.parse(scriptElement.html());
    const userData = jsonData?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo || {};

    if (!userData.user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const formattedData = {
      ...userData,
      user: {
        ...userData.user,
        createTime: formatTime(userData.user.createTime),
        nickNameModifyTime: formatTime(userData.user.nickNameModifyTime),
        formattedStats: {
          followerCount: formatNumber(userData.stats.followerCount),
          heartCount: formatNumber(userData.stats.heartCount),
          videoCount: formatNumber(userData.stats.videoCount),
          followingCount: formatNumber(userData.stats.followingCount),
        },
        formattedRegion: formatRegion(userData.user.region, countries),
      },
      processTime: Date.now() - startTime,
    };

    res.json({ msg: 'success', ...formattedData });
  } catch (error) {
    res.status(500).json({ msg: 'error', error: error.message });
  }
});

// TikTok video download endpoint
app.get('/tt/v-download', async (req, res) => {
  const { url, quality } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Video URL is required' });
  }

  try {
    const finalUrl = await getDesktopUrl(url);
    const tiktokApiUrl = `https://tikwm.com/api/?url=${encodeURIComponent(finalUrl)}&hd=1`;
    const response = await fetch(tiktokApiUrl);
    const data = await response.json();

    if (!data.data) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const username = data.data.author?.unique_id || 'unknown';
    const videoID = data.data.id || 'unknown';
    const filename = `TikTok_${username}_${videoID}.mp4`;

    const videoUrl = quality === 'hd' ? data.data.hdplay : data.data.play;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'video/mp4');

    const videoResponse = await fetch(videoUrl);
    await streamPipeline(videoResponse.body, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// TikTok search videos endpoint
app.get('/tt/search-videos', async (req, res) => {
  const { keywords } = req.query;

  if (!keywords) {
    return res.status(400).json({ error: 'Keywords are required' });
  }

  try {
    const apiUrl = `${API_CONFIG.host}/${API_CONFIG.endpoints.searchVideos}?keywords=${encodeURIComponent(
      keywords
    )}`;
    const response = await fetch(apiUrl, { timeout: 10000 });
    const data = await response.json();
    const videos = data.data.videos;

    if (!videos?.length) {
      return res.status(404).json({ error: 'No videos found for this keyword' });
    }

    const formattedVideos = videos.map((video) => ({
      ...video,
      formatted: {
        play_count: formatNumber(video.play_count || 0),
        digg_count: formatNumber(video.digg_count || 0),
        comment_count: formatNumber(video.comment_count || 0),
        collect_count: formatNumber(video.collect_count || 0),
        create_time: formatTime(video.create_time),
      },
    }));

    res.json({ data: { videos: formattedVideos } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// TikTok user favorites endpoint
app.get('/tt/user-favorites', async (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    const apiUrl = `${API_CONFIG.host}/${API_CONFIG.endpoints.userLiked}?unique_id=${encodeURIComponent(
      username
    )}`;
    const response = await fetch(apiUrl, { timeout: 10000 });
    const data = await response.json();
    const videos = data.data.videos;

    if (!videos?.length) {
      return res.status(404).json({ error: 'No favorite videos found for this user' });
    }

    const formattedVideos = videos.map((video) => ({
      ...video,
      formatted: {
        play_count: formatNumber(video.play_count || 0),
        digg_count: formatNumber(video.digg_count || 0),
        comment_count: formatNumber(video.comment_count || 0),
        share_count: formatNumber(video.share_count || 0),
        collect_count: formatNumber(video.collect_count || 0),
        create_time: formatTime(video.create_time),
        region: formatRegion(video.region, countries)
      },
    }));

    res.json({ data: { videos: formattedVideos } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// TikTok video comments endpoint
app.get('/tt/video-comments', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Video URL is required' });
  }

  try {
    const finalUrl = await getDesktopUrl(url);
    // Fetch video metadata to get unique_id and user_id
    const videoResponse = await fetch(
      `http://localhost:${port}/tt/v-get?url=${encodeURIComponent(finalUrl)}`
    );
    const videoData = await videoResponse.json();

    if (!videoData.data) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const uniqueId = videoData.data.author?.unique_id || 'unknown';
    const userId = videoData.data.author?.id || 'unknown';

    const apiUrl = `${API_CONFIG.host}/${API_CONFIG.endpoints.videoComments}?url=${encodeURIComponent(
      finalUrl
    )}`;
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

    res.json({
      data: {
        comments: formattedComments,
        unique_id: uniqueId,
        user_id: userId,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// TikTok trending videos endpoint
app.get('/tt/trending', async (req, res) => {
  const { region } = req.query;

  if (!region) {
    return res.status(400).json({ error: 'region is required' });
  }

  try {
    const regionData = countries.find((c) => c.name.toLowerCase() === region.toLowerCase());
    if (!regionData) {
      return res.status(404).json({ error: `region "${region}" not found` });
    }

    const apiUrl = `${API_CONFIG.host}/${API_CONFIG.endpoints.trendingVideos}?region=${regionData.id.toLowerCase()}`;
    const response = await fetch(apiUrl, { timeout: 10000 });
    const data = await response.json();
    const videos = data.data;

    if (!videos?.length) {
      return res.status(404).json({ error: 'No trending videos found for this region' });
    }

    const formattedVideos = videos.map((video) => ({
      ...video,
      formatted: {
        play_count: formatNumber(video.play_count || 0),
        digg_count: formatNumber(video.digg_count || 0),
        comment_count: formatNumber(video.comment_count || 0),
        create_time: formatTime(video.create_time),
      },
    }));

    res.json({ data: { region: regionData.name, formattedVideos } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// TikTok user following endpoint
app.get('/tt/user-following', async (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    const userResponse = await fetch(
      `http://localhost:${port}/tt/user-get?username=${encodeURIComponent(username)}`
    );
    const userData = await userResponse.json();
    if (userData.msg !== 'success' || !userData.user?.id) {
      return res.status(404).json({ error: 'Failed to get user ID' });
    }
    const userId = userData.user.id;

    const apiUrl = `${API_CONFIG.host}/${API_CONFIG.endpoints.userFollowing}?unique_id=${encodeURIComponent(username)}&user_id=${userId}`;
    const response = await fetch(apiUrl, { timeout: 10000 });
    const data = await response.json();
    const followings = data.data.followings;

    if (!followings?.length) {
      return res.status(404).json({ error: 'No following accounts found' });
    }

    const formattedFollowings = followings.map((user) => ({
      ...user,
      formatted: {
        follower_count: formatNumber(user.follower_count || 0),
        aweme_count: formatNumber(user.aweme_count || 0),
        region: formatRegion(user.region, countries),
      },
    }));

    res.json({ data: { followings: formattedFollowings } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// TikTok user posts endpoint
app.get('/tt/user-posts', async (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    // Fetch user data to get statistics
    const userResponse = await fetch(
      `http://localhost:${port}/tt/user-get?username=${encodeURIComponent(username)}`
    );
    const userData = await userResponse.json();

    if (userData.msg !== 'success' || !userData.user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Fetch user posts
    const apiUrl = `${API_CONFIG.host}/${API_CONFIG.endpoints.userFeed}?unique_id=${encodeURIComponent(
      username
    )}`;
    const response = await fetch(apiUrl, { timeout: 10000 });
    const data = await response.json();
    const videos = data.data.videos;

    if (!videos?.length) {
      return res.status(404).json({ error: 'No videos found for this user' });
    }

    // Format videos
    const formattedVideos = videos.map((video) => ({
      ...video,
      formatted: {
        play_count: formatNumber(video.play_count || 0),
        digg_count: formatNumber(video.digg_count || 0),
        comment_count: formatNumber(video.comment_count || 0),
        share_count: formatNumber(video.share_count || 0),
        download_count: formatNumber(video.download_count || 0),
        collect_count: formatNumber(video.collect_count || 0),
        create_time: formatTime(video.create_time),
      },
    }));

    // Format user statistics
    const formattedUserStats = {
      aweme_count: formatNumber(userData.stats.videoCount || 0),
      following_count: formatNumber(userData.stats.followingCount || 0),
      follower_count: formatNumber(userData.stats.followerCount || 0),
      favoriting_count: formatNumber(userData.stats.diggCount || 0), // Likes given (may be unavailable)
      total_favorited: formatNumber(userData.stats.heartCount || 0), // Total likes received
    };

    res.json({
      data: {
        videos: formattedVideos,
        user_stats: formattedUserStats,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// TikTok audio detail endpoint
app.get('/tt/audio-detail', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Audio URL is required' });
  }

  try {
    // Konversi URL mobile ke desktop jika perlu
    const finalUrl = await getDesktopUrl(url);

    // Panggil API TikTok untuk mendapatkan detail audio
    const apiUrl = `${API_CONFIG.host}/${API_CONFIG.endpoints.musicDetail}?url=${encodeURIComponent(finalUrl)}`;
    const response = await fetch(apiUrl, { timeout: 10000 });
    const data = await response.json();

    if (!data.data) {
      return res.status(404).json({ error: 'Audio not found' });
    }

    // Format data audio
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

    res.json(formattedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// TikTok audio download endpoint
app.get('/tt/audio-download', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Audio URL is required' });
  }

  try {
    // Convert mobile URL to desktop if necessary
    const finalUrl = await getDesktopUrl(url);

    // Fetch audio metadata from TikTok API
    const apiUrl = `${API_CONFIG.host}/${API_CONFIG.endpoints.musicDetail}?url=${finalUrl}`;
    const response = await fetch(apiUrl, { timeout: 10000 });
    const data = await response.json();

    if (!data.data) {
      return res.status(404).json({ error: 'Audio not found' });
    }

    // Extract id and title for filename
    const audioId = data.data.id || 'unknown';
    let audioTitle = data.data.title || 'unknown';
    audioTitle = audioTitle.replace(/^original sound - /, '');
    const filename = `${audioTitle}-${audioId}.mp3`;

    // Get the audio stream URL
    const audioUrl = data.data.play;

    // Set headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'audio/mpeg');

    // Stream the audio file
    const audioResponse = await fetch(audioUrl);
    await streamPipeline(audioResponse.body, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 404 Not Found
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// 500 Internal Server Error
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).sendFile(path.join(__dirname, 'public', '500.html'));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
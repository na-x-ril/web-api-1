require('dotenv').config();

const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 4000;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
app.set('json spaces', 2);

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

// YouTube endpoint
app.get('/yt/v-get', async (req, res) => {
  const videoId = req.query.id;
  const parts = req.query.parts ? req.query.parts.split(',') : [];

  if (!videoId) {
    return res.status(400).json({ error: 'id parameter is required' });
  }

  if (parts.length === 0) {
    return res.status(400).json({ error: 'parts parameter is required' });
  }

  // Filter hanya parts yang valid
  const validParts = [
    'snippet',
    'contentDetails',
    'statistics',
    'status',
    'liveStreamingDetails',
    'player',
    'topicDetails',
  ];

  const filteredParts = parts.filter(part => validParts.includes(part));
  if (filteredParts.length === 0) {
    return res.status(400).json({ error: 'Invalid parts parameter' });
  }

  const youtubeApiUrl = `https://www.googleapis.com/youtube/v3/videos?part=${filteredParts.join(',')}&id=${videoId}&key=${YOUTUBE_API_KEY}`;
  const dislikeApiUrl = `https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`;

  try {
    const [youtubeResponse, dislikeResponse] = await Promise.all([
      axios.get(youtubeApiUrl),
      axios.get(dislikeApiUrl)
    ]);

    const videoData = youtubeResponse.data;
    const dislikeData = dislikeResponse.data;

    if (videoData.items?.length > 0) {
      const videoItem = videoData.items[0];
      const statistics = videoItem.statistics || {};

      // Tambahkan dislike dan rating
      statistics.dislikeCount = dislikeData.dislikes;
      statistics.rating = dislikeData.rating;

      // Format tanggal
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

      // Susun ulang statistics
      videoItem.statistics = {
        viewCount: statistics.viewCount,
        likeCount: statistics.likeCount,
        dislikeCount: statistics.dislikeCount,
        rating: statistics.rating,
        favoriteCount: statistics.favoriteCount,
        commentCount: statistics.commentCount
      };
    }

    res.json(videoData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// TikTok endpoint
app.get('/tt/v-get', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Video URL is required' });
  }

  try {
    const tiktokApiUrl = `https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`;
    const response = await axios.get(tiktokApiUrl);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

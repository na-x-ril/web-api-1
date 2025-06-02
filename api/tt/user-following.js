import { formatNumber, formatRegion } from '../../utils.js';
import countries from '../../countries.js';

export default async function handler(req, res) {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'Username is required' });

  try {
    // Ambil userId dari API tikwm
    const userInfoUrl = `https://www.tikwm.com/api/user/info?unique_id=${encodeURIComponent(username)}`;
    const userInfoResponse = await fetch(userInfoUrl);
    const userInfoData = await userInfoResponse.json();
    const userId = userInfoData?.data?.user?.id;
    if (!userId) {
      return res.status(404).json({ error: 'Failed to get user ID' });
    }

    const apiUrl = `https://www.tikwm.com/api/user/following?unique_id=${encodeURIComponent(username)}&user_id=${userId}`;
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

    res.status(200).json({ data: { followings: formattedFollowings } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

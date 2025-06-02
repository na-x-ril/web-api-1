import { fetch } from 'undici';
import countries from './countries.js';

export function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' + secs : secs}`;
}

export function formatBytes(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

export function formatNumber(num) {
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
}

export function formatTime(timestamp) {
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
}

export function formatRegion(countryCode, countriesList = countries) {
  if (!countryCode)
    return {
      name: 'Tidak diketahui',
      flag: '',
      continent: '',
      phoneCode: '',
    };
  const country = countriesList.find((c) => c.id === countryCode.toUpperCase());
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
}

export async function shortenUrl(longUrl) {
  try {
    const response = await fetch(`http://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`);
    return await response.text();
  } catch (error) {
    console.error('Error shortening URL:', error);
    return longUrl;
  }
}

export function fromNow(dateString, isLive) {
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
}

export function isMobile(url) {
  const mobileUrlRegex = /^https:\/\/(vt|m)\.tiktok\.com\/[a-zA-Z0-9]+\/?/;
  return mobileUrlRegex.test(url);
}

export async function getDesktopUrl(url) {
  try {
    if (isMobile(url)) {
      const response = await fetch(url, { redirect: 'manual' });
      return response.headers.get('location') || url;
    }
    return url;
  } catch (error) {
    console.error('Error converting to desktop URL:', error);
    return url;
  }
}

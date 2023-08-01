import crypto from 'crypto';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const getAccessToken = async function() {
  const response = await axios({
    method: 'post',
    url: 'https://accounts.spotify.com/api/token',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    auth: {
      username: process.env.SPOTIFY_CLIENT_ID,
      password: process.env.SPOTIFY_CLIENT_SECRET,
    },
    data: {
      grant_type: 'refresh_token',
      refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
    },
  });

  return response.data.access_token;
};

let spotifyAccessToken = await getAccessToken();

const getRecentPlaysPage = async function(params) {
  let response;

  try {
    response = await axios({
      url: 'https://api.spotify.com/v1/me/player/recently-played',
      params,
      headers: {
        Authorization: `Bearer ${spotifyAccessToken}`,
      },
    });
  }
  catch (error) {
    if (error.response?.status !== 401) {
      throw error;
    }

    spotifyAccessToken = await getAccessToken();

    response = await axios({
      url: 'https://api.spotify.com/v1/me/player/recently-played',
      params,
      headers: {
        Authorization: `Bearer ${spotifyAccessToken}`,
      },
    });
  }

  return response.data;
};

const getRecentPlays = async function({
  limit = 50,
  after = new Date(0),
} = {}) {
  const tracks = [];
  let prevPage;

  do {
    const page = await getRecentPlaysPage({
      limit,
      before: prevPage?.cursors?.before,
    });

    const tracksAfterAfter = page.items.filter(
      (item) => new Date(item.played_at) > after,
    );

    tracks.push(...tracksAfterAfter);

    prevPage = page;
  }
  while (prevPage.cursors && Number(prevPage.cursors.before) > after);

  return tracks;
};

const getCurrentlyPlayingTrack = async function(params) {
  let response;

  try {
    response = await axios({
      url: 'https://api.spotify.com/v1/me/player/currently-playing',
      params,
      headers: {
        Authorization: `Bearer ${spotifyAccessToken}`,
      },
    });
  }
  catch (error) {
    if (error.response?.status !== 401) {
      throw error;
    }

    spotifyAccessToken = await getAccessToken();

    response = await axios({
      url: 'https://api.spotify.com/v1/me/player/currently-playing',
      params,
      headers: {
        Authorization: `Bearer ${spotifyAccessToken}`,
      },
    });
  }

  return response.data;
};

const getApiSig = function(params) {
  const apiSigHashInput = Array
    .from(params.entries())
    .sort(([keyA], [keyB]) => {
      for (let i = 0; i < keyA.length || i < keyB.length; i++) {
        const charCodeA = keyA.charCodeAt(i);
        const charCodeB = keyB.charCodeAt(i);

        if (charCodeA - charCodeB) {
          return charCodeA - charCodeB;
        }
      }

      return 0;
    })
    .flat()
    .join('')
    + process.env.LASTFM_SHARED_SECRET;

  const apiSig = crypto
    .createHash('md5')
    .update(apiSigHashInput)
    .digest('hex');

  return apiSig;
};

const updateNowPlaying = async function(params) {
  const bodyParams = new URLSearchParams({
    method: 'track.updatenowplaying',
    api_key: process.env.LASTFM_API_KEY,
    sk: process.env.LASTFM_SESSION_KEY,
    ...params,
  });

  const apiSig = getApiSig(bodyParams);

  bodyParams.append('api_sig', apiSig);
  bodyParams.append('format', 'json');

  const response = await axios({
    method: 'post',
    url: 'http://ws.audioscrobbler.com/2.0/',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    data: bodyParams,
  });

  return response.data;
};

const sendScrobbles = async function(scrobbles) {
  const bodyParams = new URLSearchParams({
    method: 'track.scrobble',
    api_key: process.env.LASTFM_API_KEY,
    sk: process.env.LASTFM_SESSION_KEY,
  });

  for (let i = 0; i < scrobbles.length; i++) {
    const scrobble = scrobbles[i];

    for (const [key, value] of Object.entries(scrobble)) {
      bodyParams.append(`${key}[${i}]`, value);
    }
  }

  const apiSig = getApiSig(bodyParams);

  bodyParams.append('api_sig', apiSig);
  bodyParams.append('format', 'json');

  const response = await axios({
    method: 'post',
    url: 'http://ws.audioscrobbler.com/2.0/',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    data: bodyParams,
  });

  return response.data;
};

const spotifyTrackToLastFmTrack = (track) => ({
  track: track.name,
  artist: track.artists[0].name,
  album: track.album.name,
  albumArtist: track.album.artists[0].name,
  duration: Math.floor(track.duration_ms / 1000),
});

const MAX_TIMEOUT = 10 * 60 * 1000;
const MIN_TIMEOUT = 2 * 1000;
const TIMEOUT_INCREASE_RATE = 2;

const spotifyPlayToLastFmScrobble = (play) => {
  const lastFmTrack = spotifyTrackToLastFmTrack(play.track);

  return {
    ...lastFmTrack,
    timestamp: Math.floor((Date.parse(play.played_at) - play.track.duration_ms) / 1000),
  };
};

let prevTrackPlayedAt = new Date().valueOf();
let currTrackLikelyPlayedAt = Infinity;
let prevTrackLikelyPlayedAt = prevTrackPlayedAt;

const syncLastFmWithSpotify = async function() {
  const currTime = new Date().valueOf();

  console.log('Syncing Last.Fm with Spotify...');
  console.log(`Requesting tracks played on Spotify since ${new Date(prevTrackPlayedAt).toISOString()}...`);

  const recentPlays = await getRecentPlays({after: prevTrackPlayedAt});

  console.log(`Recieved ${recentPlays.length} track${recentPlays.length !== 1 ? 's' : ''}${recentPlays.length ? ':' : ''}`);

  for (const play of recentPlays) {
    console.log(`${Date.parse(play.played_at) - play.track.duration_ms} [${new Date(Date.parse(play.played_at) - play.track.duration_ms).toISOString()}] ${play.track.artists[0].name} - ${play.track.album.name} (${play.track.album.artists[0].name}) - ${play.track.name}`);
  }

  if (recentPlays.length) {
    prevTrackPlayedAt = Date.parse(recentPlays[0].played_at);

    const scrobbles = recentPlays.map((play) => spotifyPlayToLastFmScrobble(play));
    const scrobbleBatches = [];

    for (let i = 0; i < scrobbles.length; i += 50) {
      const scrobbleBatch = scrobbles.slice(i, i + 50);

      scrobbleBatches.push(scrobbleBatch);
    }

    console.log(`Submitting ${scrobbles.length} scrobble${scrobbles.length !== 1 ? 's' : ''}${scrobbleBatches.length > 1 ? ` in ${scrobbleBatches.length} batches` : ''}...`);

    for (let i = 0; i < scrobbleBatches.length; i++) {
      if (scrobbleBatches.length > 1) {
        console.log(`Submitting scrobble batch ${i + 1} of ${scrobbleBatches.length}...`);
      }

      const scrobbleBatch = scrobbleBatches[i];

      for (const scrobble of scrobbleBatch) {
        console.log(`${scrobble.timestamp * 1000} [${new Date(scrobble.timestamp * 1000).toISOString()}] ${scrobble.artist} - ${scrobble.album} (${scrobble.albumArtist}) - ${scrobble.track}`);
      }

      const response = await sendScrobbles(scrobbleBatch);

      const {
        scrobbles: {
          '@attr': {
            accepted,
          },
        },
      } = response;

      console.log(`${accepted} of ${scrobbleBatch.length} scrobble${scrobbles.length !== 1 ? 's' : ''} accepted`);
    }
  }

  let timeUntilCurrTrackLikelyPlayed = currTrackLikelyPlayedAt - currTime;

  if (timeUntilCurrTrackLikelyPlayed <= 0) {
    prevTrackLikelyPlayedAt = currTrackLikelyPlayedAt;
    currTrackLikelyPlayedAt = Infinity;
  }

  const timeSincePrevTrackLikelyPlayed = currTime - prevTrackLikelyPlayedAt;

  console.log('Requesting currently playing tack on Spotify...');

  const currentlyPlayingTrack = await getCurrentlyPlayingTrack();

  if (
    currentlyPlayingTrack
    && currentlyPlayingTrack.currently_playing_type === 'track'
    && currentlyPlayingTrack.is_playing
    && currentlyPlayingTrack.item
  ) {
    const spotifyTrack = currentlyPlayingTrack.item;
    const lastFmTrack = spotifyTrackToLastFmTrack(spotifyTrack);

    console.log(`Recieved track:\n${spotifyTrack.artists[0].name} - ${spotifyTrack.album.name} (${spotifyTrack.album.artists[0].name}) - ${spotifyTrack.name}`);
    console.log(`Submitting now playing update:\n${lastFmTrack.artist} - ${lastFmTrack.album} (${lastFmTrack.albumArtist}) - ${lastFmTrack.track}`);

    const response = await updateNowPlaying(lastFmTrack);

    const {
      nowplaying: {
        ignoredMessage: {
          code: ignoredMessageCode,
        },
      },
    } = response;

    if (ignoredMessageCode === '0') {
      console.log('Now playing update accepted');
    }
    else {
      console.log('Now playing update ignored');
    }

    const trackTimeRemaining = currentlyPlayingTrack.item.duration_ms - currentlyPlayingTrack.progress_ms;

    currTrackLikelyPlayedAt = currTime + trackTimeRemaining;
  }
  else {
    console.log('No currently playing track');
  }

  timeUntilCurrTrackLikelyPlayed = currTrackLikelyPlayedAt - currTime;

  console.log(`${timeSincePrevTrackLikelyPlayed}ms since previous track likely played`);
  console.log(`${timeUntilCurrTrackLikelyPlayed === Infinity ? 'Infinite ' : timeUntilCurrTrackLikelyPlayed}ms until next track likely played`);

  const timeoutDuration = Math.max(Math.min(timeSincePrevTrackLikelyPlayed * TIMEOUT_INCREASE_RATE, timeUntilCurrTrackLikelyPlayed, MAX_TIMEOUT), MIN_TIMEOUT);

  console.log(`Sleeping for ${timeoutDuration}ms`);

  setTimeout(syncLastFmWithSpotify, timeoutDuration);
};

await syncLastFmWithSpotify();

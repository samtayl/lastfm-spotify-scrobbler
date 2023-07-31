# Last.fm Spotify Scrobbler

A script to poll the Spotify Web API and update last.fm.

## Rationale

Last.fm's own Spotify scrobbler annoyed me sometimes, so I wrote my own. However, I found the limitations of the Spotify Web API so great that no greater alternative could be developed.

These limitations are:

* No real-time updates of the currently playing track.
* No information on when a track was started, only when a track was finished.
* Missing tracks in the list of recently played tracks.

## Prerequisites

You will need a Spotify Web API app, the client ID, client secret, and refresh token. Read more at [Spotify's API docs](https://developer.spotify.com/documentation/web-api).

And you will need a Last.fm API app, the API key, shared secret, and a session key. Read more at [Last.fm's API docs](https://www.last.fm/api).

## Features

* Exponentially backs off from making requests when no new tracks have been played
* Anticipates when a new track is likely to have been played
* Batches requests

## Caveats

Tracks will be missed if they are not included in the list of recently played tracks. This is likely due to a track being changed part way through.

The timestamp of the scrobble is calculated by the time the track was finished minus the duration of the track. This means the timestamp will be earlier than expected if the track is changed part way through or started part way through, and will be later than expected if the track is paused then later resumed.

Because the time between requests increases exponentially when no new tracks have been played, if a track is changed part way through, started part way through, or paused then later resumed, it will take up to ten minutes for the currently playing track to appear on last.fm and for any new tracks played during that interval to be scrobbled.

const express = require("express");
const app = express();
require('express-ws')(app);
const axios = require("axios");
const os = require("os");
const fs = require("fs");
const Events = require("events");
const agents = require('user-agent-array');
const events = new Events();
const SpotifyWebApi = require('spotify-web-api-node');

console.log("Welcome, starting...");

var config;
if (fs.existsSync("./config.json")) {
    config = JSON.parse(fs.readFileSync("./config.json"));
    if (!config.port) {
        console.log("Please edit the config.json file with proper credentials.");
        process.exit();
    }
} else {
    console.log("Please edit the config.json file with proper credentials.");
    fs.writeFileSync("./config.json", `
{
    "spotify": {
        "client_id": "client id here",
        "client_secret": "client secret here"
    },
    "port": 3000
}`)
    process.exit();
}
if (!fs.existsSync("./spotify.json")) {
    console.log("Please login to spotify!");
}

var current = {
    id: "",
    is_playing: false,
    playback: {},
    lyrics: null,
    queue: new Map()
}

var spotify = new SpotifyWebApi({
  clientId: config.spotify.client_id,
  clientSecret: config.spotify.client_secret,
  redirectUri: `http://localhost:${config.port}/oauth`
});

if (!fs.existsSync("./config.json")) {
    console.log("Please fill the config.json file.");
    process.exit();
}

function refreshToken() {
    if (fs.existsSync("./spotify.json")) {
        let spotifyData = JSON.parse(fs.readFileSync("./spotify.json"));
        spotify.setAccessToken(spotifyData['access_token']);
        spotify.setRefreshToken(spotifyData['refresh_token']);
        if (new Date().getTime() > spotifyData.refreshed+3300000) {
            spotify.refreshAccessToken().then((data) => {
                spotify.setAccessToken(data.body['access_token']);
                fs.writeFileSync("./spotify.json", JSON.stringify({
                    access_token: data.body.access_token,
                    refresh_token: spotifyData.refresh_token,
                    refreshed: new Date().getTime()
                }))
                console.log("Refreshed Token");
            })
            .catch((e) => {
                console.log("Authentication Error, Please login again.");
                process.exit();
            })
        }
    }
}

function trackPlayback() {
    spotify.getMyCurrentPlaybackState()
    .then(async playback => {
        playback = playback.body;
        if (playback.item && playback.is_playing) {
            let progress = current.playback.progress_ms;
            current.playback = playback;
            if (current.id !== playback.item.id || !current.is_playing) {
                //new song
                current.is_playing = true;
                current.id = playback.item.id;
                current.queue.delete(current.id);
                current.lyrics = null;
                events.emit("data", {
                    return: "spotify/playback",
                    payload: playback
                });

                events.emit("data", {
                    return: "spotify/lyrics",
                    payload: await getLyrics(playback.item)
                })

                events.emit("data", {
                    return: "karaoke/queue",
                    payload: Object.fromEntries(current.queue)
                })

                spotify.getMyRecentlyPlayedTracks({
                    limit: 6
                })
                .then(({body}) => {
                    events.emit("data", {
                        return: "spotify/history",
                        payload: body.items
                    })
                })
            } else if ((progress + 1000) < playback.progress_ms || (progress - 1000) > playback.progress_ms) {
                events.emit("data", {
                    return: "spotify/time",
                    payload: playback.progress_ms
                });
            }
        } else if (current.is_playing == true) {
            current.is_playing = false;
            events.emit("data", {
                return: "spotify/pause"
            });
        }
    })
    .catch((e) => {
        console.log(e);
        process.exit();
    })
}
setInterval(refreshToken, 120000);
refreshToken()
if (fs.existsSync("./spotify.json")) {
    setInterval(trackPlayback, 500);
}

function getLyrics(track) {
    console.log("Getting Lyrics");
    return new Promise((resolve) => {
        //resolve([]);
        //return;

        if (current.lyrics) {
            console.log("Returned Cached Lyrics");
            resolve(current.lyrics);
            return;
        }

        console.log("Returning Lyrics");
        let artists = "";
        track.artists.forEach((item) => (artists += `${item.name}, `));
        artists = artists.substring(0, artists.length - 2);
        let lyricURL = `https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get?format=json&q_track=${track.name}&q_artist=${track.artists[0].name}&q_artists=${artists}&q_album=${track.album.name}&user_language=en&f_subtitle_length=${(track.duration_ms / 1000).toFixed(0)}&q_duration=${track.duration_ms / 1000}&tags=nowplaying&userblob_id=eW91J3ZlIGRvbmUgZW5vdWdoX2dvcmdvbiBjaXR5XzIxMy41NDY&namespace=lyrics_synched&track_spotify_id=spotify:track:${track.id}&f_subtitle_length_max_deviation=1&subtitle_format=mxm&app_id=web-desktop-app-v1.0&usertoken=${config.musixmatch_usertoken}`;
        let agent = agents[Math.floor(Math.random() * agents.length)];
        axios.get(lyricURL, {
            headers: {
                "User-Agent": agent,
                "Cookie": `x-mxm-user-id=g2:107362761377830766775; x-mxm-token-guid=a720c3aa-45f3-4c8d-9de8-0419ed153ac3`
            }
        })
        .then(({data}) => {
            let lyrics = data.message.body.macro_calls['track.subtitles.get'];
            if (lyrics.message.body && lyrics.message.body.subtitle_list.length) {
                let subtitle = lyrics.message.body.subtitle_list[0].subtitle;
                if (!subtitle.restricted) {
                    resolve(JSON.parse(subtitle.subtitle_body));
                    current.lyrics = JSON.parse(subtitle.subtitle_body);
                } else {
                    resolve(false)
                }
            } else {
                console.log(lyricURL);
                resolve(false)
            }
        })
        .catch((e) => {
            console.log(lyricURL);
            resolve(false)
        })
    })
}

app.use('/assets', express.static('public_assets'));
app.use('/screen', express.static('public_screen'));
app.use('/', express.static('public_chooser'));

app.ws("/", async (ws, req) => {
    let listen = (json) => {
        ws.send(JSON.stringify(json));
    }
    events.on("data", listen);

    ws.send(JSON.stringify({return: "connection/success"}))

    if (current.playback.item) {
        ws.send(JSON.stringify({
            return: "spotify/playback",
            payload: current.playback
        }))
    
        ws.send(JSON.stringify({
            return: "spotify/lyrics",
            payload: await getLyrics(current.playback.item)
        }))
    }
    
    spotify.getMyRecentlyPlayedTracks({
        limit: 6
    })
    .then(({body}) => {
        events.emit("data", {
            return: "spotify/history",
            payload: body.items
        })
    })

    ws.send(JSON.stringify({
        return: "karaoke/queue",
        payload: Object.fromEntries(current.queue)
    }))

    ws.on("message", (msg) => {
        let data;
        try {
            data = JSON.parse(msg);
        } catch (e) {
            ws.close();
        }
        if (data.method == "search") {
            if (data.value) {
                spotify.search(data.value, ["track"], {limit: 12})
                .then((data) => {
                    ws.send(JSON.stringify({
                        return: "spotify/search",
                        payload: data.body.tracks.items
                    }))
                })
            }
        } else if (data.method == "queue") {
            if (data.isrc && data.uri) {
                axios.get(`https://api.musixmatch.com/ws/1.1/track.get?track_isrc=${data.isrc}&apikey=86141b48c8ba2f0bce3feb4a5f728a59`)
                .then(async (musixmatch) => {
                    musixmatch = musixmatch.data.message.body.track;
                    if (musixmatch.has_lyrics && musixmatch.has_subtitles && !musixmatch.instrumental && !musixmatch.restricted) {
                        spotify.addToQueue(data.uri, {device_id: current.playback.device.id})
                        .catch((e) => {
                            ws.send(JSON.stringify({
                                return: "karaoke/error",
                                payload: "Error contacting services.",
                                uri: data.uri
                            }))
                        })
                        
                        ws.send(JSON.stringify({
                            return: "karaoke/queued",
                            uri: data.uri
                        }))

                        let id = data.uri.replace("spotify:track:", "");
                        spotify.getTrack(id)
                        .then(({body}) => {
                            current.queue.set(id, body);
                            events.emit("data", {
                                return: "karaoke/queue",
                                payload: Object.fromEntries(current.queue)
                            })
                        })
                    } else {
                        ws.send(JSON.stringify({
                            return: "karaoke/error",
                            payload: "That track isn't available on our library or may not have lyrics.",
                            uri: data.uri
                        }))
                    }
                })
                .catch(() => {
                    ws.send(JSON.stringify({
                        return: "karaoke/error",
                        payload: "That track isn't available on our library."
                    }))
                })
            }
        } else if (data.method == "catalouge") {
            spotify.getRecommendations({
                min_energy: 0.4,
                seed_artists: [
                    '0PFtn5NtBbbUNbU9EAmIWF', 
                    '6zFYqv1mOsgBRQbae3JJ9e', 
                    '5bYfbDXaMVCxEt7hOAvEWc', 
                    '6qqNVTkY8uBg9cP3Jd7DAH',
                    '21UJ7PRWb3Etgsu99f8yo8'
                ],
                min_popularity: 75
            })
            .then((data) => {
                ws.send(JSON.stringify({
                    return: "spotify/catalouge",
                    payload: data.body.tracks
                }));
            })
        }
    })

    ws.on("close", () => {
        events.off("data", listen)
    })
})

app.get("/login", (req, res) => {
    var scopes = ['user-read-email', 'user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing', 'user-read-recently-played'],
    state = 'iu45nyg9w458yn54ep98y45';

    var authorizeURL = spotify.createAuthorizeURL(scopes, state);

    res.redirect(authorizeURL);
})

app.get("/oauth", (req, res) => {
    spotify.authorizationCodeGrant(req.query.code).then(
        function(data) {
            spotify.setAccessToken(data.body['access_token']);
            spotify.setRefreshToken(data.body['refresh_token']);
            fs.writeFileSync("./spotify.json", JSON.stringify({
                access_token: data.body.access_token,
                refresh_token: data.body.refresh_token,
                refreshed: new Date().getTime()
            }))
            console.log("Logged into Spotify");
            setInterval(trackPlayback, 500);
        },
        function(err) {
          console.log('Something went wrong!', err);
        }
    )
    .catch((e) => {
        console.log("Authentication Error, Please login again.");
        process.exit();
    })
    res.redirect("/");
})

app.listen(config.port, () => {
    let interface = os.networkInterfaces()['Wi-Fi'] || os.networkInterfaces()['Ethernet']
    let ip = interface.find((i) => {return (i.family == "IPv4")}).address;
    console.log(`
Started Karaoke: 
    
Chooser URL:        http://${ip}:${config.port}/
Screen URL:         http://${ip}:${config.port}/screen/
Spotify OAuth URL:  http://${ip}:${config.port}/login
`);
refreshToken();
})
const express = require("express");
const app = express();
require('express-ws')(app);
const axios = require("axios");
const os = require("os");
const fs = require("fs");
const Events = require("events");
const events = new Events();
const SpotifyWebApi = require('spotify-web-api-node');

console.log("Welcome, starting...");

var config = JSON.parse(fs.readFileSync("./config.json"));
var spotifyConfig = JSON.parse(fs.readFileSync("./spotify.json"));

var current = {
    id: "",
    is_playing: false,
    playback: {}
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
            current.playback = playback;
            if (current.id !== playback.item.id || !current.is_playing) {
                current.is_playing = true;
                current.id = playback.item.id;
                events.emit("data", {
                    return: "spotify/playback",
                    payload: playback
                });

                events.emit("data", {
                    return: "spotify/lyrics",
                    payload: await getLyrics(playback.item)
                })
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
    })
}
setInterval(refreshToken, 120000);
refreshToken()
if (spotifyConfig.refresh_token) {
    setInterval(trackPlayback, 500);
}
trackPlayback();

function getLyrics(track) {
    return new Promise((resolve) => {
        let artists = "";
        track.artists.forEach((item) => (artists += `${item.name}, `));
        artists = artists.substring(0, artists.length - 2);
        let lyricURL = `https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get?format=json&q_track=${track.name}&q_artist=${track.artists[0].name}&q_artists=${artists}&q_album=${track.album.name}&user_language=en&f_subtitle_length=${(track.duration_ms / 1000).toFixed(0)}&q_duration=${track.duration_ms / 1000}&tags=nowplaying&userblob_id=eW91J3ZlIGRvbmUgZW5vdWdoX2dvcmdvbiBjaXR5XzIxMy41NDY&namespace=lyrics_synched&track_spotify_id=spotify:track:${track.id}&f_subtitle_length_max_deviation=1&subtitle_format=mxm&app_id=web-desktop-app-v1.0&usertoken=18111573a5d5b7855fec189fa5fc591c6a61d4dab03f4e8592f3db&guid=e05094a3-30c0-47e9-b5ed-e3a657a4a72f&signature=fMi1gjVjkDMRQ7a0+tvTvFmCUGo=&signature_protocol=sha1`;
        axios.get(lyricURL, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Musixmatch/0.21.27 Chrome/66.0.3359.181 Electron/3.1.3 Safari/537.36",
                "Cookie": `mxm-encrypted-token=; x-mxm-user-id=g2%3A107362761377830766775; x-mxm-token-guid=e05094a3-30c0-47e9-b5ed-e3a657a4a72f`
            }
        })
        .then(({data}) => {
            let lyrics = data.message.body.macro_calls['track.subtitles.get'];
            if (lyrics.message.body && lyrics.message.body.subtitle_list.length) {
                let subtitle = lyrics.message.body.subtitle_list[0].subtitle;
                if (!subtitle.restricted) {
                    resolve(JSON.parse(subtitle.subtitle_body));
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

    ws.on("message", (msg) => {
        let data;
        try {
            data = JSON.parse(msg);
        } catch (e) {
            ws.close();
        }
        if (data.method == "karaoke/queue") {

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
    let ip = os.networkInterfaces()['Wi-Fi'].find((i) => {return (i.family == "IPv4")}).address;
    console.log(`
Started Karaoke: 
    
Chooser URL:        http://${ip}:${config.port}/
Screen URL:         http://${ip}:${config.port}/screen/
Spotify OAuth URL:  http://${ip}:${config.port}/login
`);
refreshToken();
})
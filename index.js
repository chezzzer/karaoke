const express = require("express");
const app = express();
require('express-ws')(app);
const axios = require("axios");
const os = require("os");
const fs = require("fs");
const Vibrant = require('node-vibrant')
const Events = require("events");
const agents = require('user-agent-array');
const events = new Events();
const SpotifyWebApi = require('spotify-web-api-node');

console.log("Welcome, starting...");

//read config
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
    "volume": {
        "queue": 100,
        "playlist": 50
    },
    "port": 3000,
    "admin_password": "pa33w0rd",
    "musixmatch_usertokens": [
        "tokens here"
    ]
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
    color: [],
    queue: new Map()
}

//start API
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
    //check if credentials exist
    if (fs.existsSync("./spotify.json")) {
        let spotifyData = JSON.parse(fs.readFileSync("./spotify.json"));
        //set old/new tokens
        spotify.setAccessToken(spotifyData['access_token']);
        spotify.setRefreshToken(spotifyData['refresh_token']);
        //check weather date has exceeded 55 minutes
        if (new Date().getTime() > spotifyData.refreshed+3300000) {
            //if so refresh and set back into file and into api SDK
            spotify.refreshAccessToken()
            .then((data) => {
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
    //get playback
    spotify.getMyCurrentPlaybackState()
    .then(async playback => {
        playback = playback.body;
        //check if there is a current song playing and is not paused
        if (playback.item && playback.is_playing) {
            //store progress for later
            let progress = current.playback.progress_ms;

            playback.item.color = current.color;

            //update current song
            current.playback = playback;

            //check weather it is a new song against the currently playing track in the code
            if (current.id !== playback.item.id || !current.is_playing) {
                //new song
                console.log(`   
                
New Song

${playback.item.artists[0].name} - ${playback.item.name}
                `)

                //resume because impossible to not be
                current.is_playing = true;
                //update id
                current.id = playback.item.id;
                //check if track is in queue
                if (current.queue.has(current.id)) {
                    //delete current track from queue
                    current.queue.delete(current.id);

                    //set volume to queue volume in config
                    spotify.setVolume(config.volume.queue)
                } else {
                    //set volume to playlist volume in config
                    spotify.setVolume(config.volume.playlist)
                }
                
                //get album art color
                let palette = await Vibrant.from(current.playback.item.album.images[2].url).getPalette()
                current.color = palette.Vibrant._rgb;
                current.playback.item.color = current.color;


                //reset lyrics
                current.lyrics = null;
                //tell all sockets its new song time
                events.emit("data", {
                    return: "spotify/playback",
                    payload: current.playback
                });
                //tell all sockets its new lyrics time
                events.emit("data", {
                    return: "spotify/lyrics",
                    payload: await getLyrics(playback.item)
                })
                //tell all sockets that the queue has changed
                events.emit("data", {
                    return: "karaoke/queue",
                    payload: Object.fromEntries(current.queue)
                })
                //tell all sockets that the recent tracks has changed
                spotify.getMyRecentlyPlayedTracks({
                    limit: 6
                })
                .then(({body}) => {
                    events.emit("data", {
                        return: "spotify/history",
                        payload: body.items
                    })
                })
                .catch((e) => {
                    console.log("Error with retriving recently played tracks", e);
                })
            } else if ((progress + 1500) < playback.progress_ms || (progress - 1500) > playback.progress_ms) {
                //if the current song has no indication of changing, check if there has been a time change by detecting if the player has been moved by 1 second
                events.emit("data", {
                    return: "spotify/time",
                    payload: playback.progress_ms
                });
            }
        } else if (current.is_playing == true) {
            //if the player is paused and the code thinks its still playing
            current.is_playing = false;

            //send out to all sockets to stop their clocks
            events.emit("data", {
                return: "spotify/pause"
            });
        }
    })
    .catch((e) => {
        console.log("Error with tracking playback", e);
        process.exit();
    })
}

//check the token every 2 minutes
setInterval(refreshToken, 120000);
//check if credentials exist
if (fs.existsSync("./spotify.json")) {
    //refresh it now since it might've been some time since we ran this code
    refreshToken()
    //track playback of the client by checking it every 500ms, why no WS spotify!
    setInterval(trackPlayback, 500);
}

var lyricsBusy = false;
//lyric function
function getLyrics(track) {
    //track = spotify track
    return new Promise((resolve) => {
        //resolve([]);
        //return;

        //check if lock is there so we don't get rate limited during caching
        if (lyricsBusy) return resolve(false);
        lyricsBusy = true;;

        //check if we already have lyrics stored so we don't annoy musixmatch
        if (current.lyrics) {
            resolve(current.lyrics);
            lyricsBusy = false;
            return;
        }

        //combine artists
        let artists = "";
        track.artists.forEach((item) => (artists += `${item.name}, `));
        artists = artists.substring(0, artists.length - 2);

        //get random usertoken to aviod rate limits
        let token = config.musixmatch_usertokens[Math.floor(Math.random() * config.musixmatch_usertokens.length)];

        //formulate URL to musixmatch API.
        let lyricURL = `https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get?format=json&q_track=${track.name}&q_artist=${track.artists[0].name}&q_artists=${artists}&q_album=${track.album.name}&user_language=en&f_subtitle_length=${(track.duration_ms / 1000).toFixed(0)}&q_duration=${track.duration_ms / 1000}&tags=nowplaying&namespace=lyrics_synched&track_spotify_id=spotify:track:${track.id}&f_subtitle_length_max_deviation=1&subtitle_format=mxm&app_id=web-desktop-app-v1.0&usertoken=${token}`;
        
        //get random user agent to aviod suspision
        let agent = agents[Math.floor(Math.random() * agents.length)];

        //make request
        axios.get(lyricURL, {
            headers: {
                "User-Agent": agent,
                "Cookie": `x-mxm-user-id=g2:107362761377830766775; x-mxm-token-guid=a720c3aa-45f3-4c8d-9de8-0419ed153ac3`
            }
        })
        .then(({data}) => {
            let lyrics = data.message.body.macro_calls['track.subtitles.get'];
            //check if lyrics are there
            if (lyrics.message.body && lyrics.message.body.subtitle_list.length) {
                let subtitle = lyrics.message.body.subtitle_list[0].subtitle;
                //check if it is restricted or not
                if (!subtitle.restricted) {
                    let lyrics = JSON.parse(subtitle.subtitle_body);

                    //set last lyric as "End"
                    lyrics[lyrics.length - 1].text = "End";

                    //return them back and update the code's cache
                    resolve(lyrics);
                    current.lyrics = lyrics;

                    //cancel lock
                    lyricsBusy = false;
                } else {
                    resolve(false)
                    lyricsBusy = false;
                }
            } else {
                console.log(`Unable to get lyrics for this song.`, data);
                resolve(false)
                lyricsBusy = false;
            }
        })
        .catch((e) => {
            console.log(`Unable to get lyrics for this song.`);
            resolve(false)
            lyricsBusy = false;
        })
    })
}

//static serve assets and webpages
app.use('/assets', express.static('public_assets'));
app.use('/screen', express.static('public_screen'));
app.use('/', express.static('public_chooser'));

app.ws("/", async (ws, req) => {
    //subscribe to data event for global messages
    let listen = (json) => {
        ws.send(JSON.stringify(json));
    }
    events.on("data", listen);

    //send connection success
    ws.send(JSON.stringify({return: "connection/success"}))

    //if there is something playing
    if (current.playback.item && current.is_playing) {
        ws.send(JSON.stringify({
            return: "spotify/playback",
            payload: current.playback
        }))
    
        ws.send(JSON.stringify({
            return: "spotify/lyrics",
            payload: await getLyrics(current.playback.item)
        }))
    }
    
    //send recent tracks, queue
    spotify.getMyRecentlyPlayedTracks({
        limit: 6
    })
    .then(({body}) => {
        events.emit("data", {
            return: "spotify/history",
            payload: body.items
        })
    })
    .catch((e) => {
        console.log("Error with retriving recently played tracks", e)
    })

    ws.send(JSON.stringify({
        return: "karaoke/queue",
        payload: Object.fromEntries(current.queue)
    }))

    ws.on("message", (msg) => {
        //decode JSON data
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
                //check if song has lyrics
                axios.get(`https://api.musixmatch.com/ws/1.1/track.get?track_isrc=${data.isrc}&apikey=86141b48c8ba2f0bce3feb4a5f728a59`)
                .then(async (musixmatch) => {
                    musixmatch = musixmatch.data.message.body.track;
                    //check if it is restricted or an instrumental
                    if (musixmatch.has_lyrics && musixmatch.has_subtitles && !musixmatch.instrumental && !musixmatch.restricted) {
                        //add it to the queue
                        spotify.addToQueue(data.uri, {device_id: current.playback.device.id})
                        .catch((e) => {
                            ws.send(JSON.stringify({
                                return: "karaoke/error",
                                payload: "Error contacting services.",
                                uri: data.uri
                            }))
                        })
                        
                        //tell client that this peticular song has been queued
                        ws.send(JSON.stringify({
                            return: "karaoke/queued",
                            uri: data.uri
                        }))

                        //put it into the full track into memory for future calls
                        let id = data.uri.replace("spotify:track:", "");
                        spotify.getTrack(id)
                        .then(({body}) => {
                            //insert into queue
                            current.queue.set(id, body);
                            //inform all sockets that there is a queue change
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
                min_danceability: 0.25,
                seed_genres: [
                    "rock",
                    "rock-n-roll",
                    "rockabilly",
                    "pop",
                    "new-release"
                ],
                min_popularity: 75,
                market: "NZ"
            })
            .then((data) => {
                ws.send(JSON.stringify({
                    return: "spotify/catalouge",
                    payload: data.body.tracks
                }));
            })
            .catch((e) => {
                console.log("Error with recommendations", e);
            })
        } else if (data.method == "admin") {
            if (data.password == config.admin_password) {
                ws.send(JSON.stringify({
                    return: "karaoke/admin"
                }))
            } else {
                ws.send(JSON.stringify({
                    return: "karaoke/error",
                    payload: "Incorrect Password"
                }))
            }
        } else if (data.method == "sync") {
            if (data.password == config.admin_password) {
                events.emit("data", {
                    return: "karaoke/sync",
                    payload: data.value
                })
            }
        } else if (data.method == "removeQueue") {
            if (data.password == config.admin_password) {
                current.queue.delete(data.id);
                events.emit("data", {
                    return: "karaoke/queue",
                    payload: Object.fromEntries(current.queue)
                })
            }
        } else if (data.method == "player") {
            if (data.password == config.admin_password) {
                if (data.action == "previous") {
                    spotify.skipToPrevious();
                } else if (data.action == "pause") {
                    spotify.pause();
                } else if (data.action == "play") {
                    spotify.play();
                } else if (data.action == "next") {
                    spotify.skipToNext();
                } else if (data.action == "replay") {
                    spotify.seek(0);
                }
            }
        } else if (data.method == "ping") {
            ws.send(JSON.stringify({
                return: "connection/pong"
            }))
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
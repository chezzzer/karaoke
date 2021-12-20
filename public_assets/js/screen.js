var current = {
    time: 0,
    item: {},
    lyrics: [],
    is_playing: false
}

$(document).on("ws/data", (event, data) => {
    if (data.return == "connection/success") {
        $(".loading").fadeOut();
    } else if (data.return == "spotify/playback") {
        let track = data.payload.item;
        let artists = "";
        track.artists.forEach((item) => {
            artists += `${item.name}, `;
        })
        artists = artists.slice(0, -2);

        current.time = data.payload.progress_ms;
        current.item = track;
        current.is_playing = true;

        $(".info-title").html(track.name);
        $(".info-artist").html(artists);
        $(".info-art").attr("src", track.album.images[0].url);
        $(".screen").css("background", `linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 50%, rgba(0,0,0,0.5) 100%), url(${track.album.images[0].url})`);
        $(".screen").css("background-size", "auto 100%");
    } else if (data.return == "spotify/lyrics") {
        if (data.payload) {
            current.lyrics = data.payload;
            $(".loading").fadeOut();
        } else {
            current.lyrics = false;
            $(".loading").fadeIn();
            $(".loading #loading-icon").attr("class", "fa-soild fa-times fa-3x");
            $(".loading #loading-text").html("Lyrics not found");
        }
        if (current.time < 5000) {
            $(".previous, .now").html("");
            $(".next").html(data.payload[0].text);
        }
    } else if (data.return == "spotify/pause") {
        current.is_playing = false;
    }
})

setInterval(() => {
    if (current.is_playing) {
        if (current.lyrics.length) {
            current.lyrics.forEach((lyric, i) => {
                if (lyric.time.total.toFixed(1) == (current.time / 1000).toFixed(1)) {
                    if (current.lyrics[i-1]) {
                        $(".lyrics .previous").html(current.lyrics[i-1].text || "🎶");
                    }
                    if (current.lyrics[i+1]) {
                        $(".lyrics .next").html(current.lyrics[i+1].text || "🎶");
                    }
                    $(".lyrics .now").html(lyric.text || "🎶");
                }
            })
        }
        current.time += 100
    }
}, 100)

setInterval(() => {
    $(".time-bar").css("width", `${(current.time/current.item.duration_ms) * 100}%`)
}, 1000)
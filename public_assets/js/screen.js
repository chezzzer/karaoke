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
        current.is_playing = data.payload.is_playing;
        
        $(".info-title").html(track.name);
        $(".info-artist").html(artists);
        $(".info-art").attr("src", track.album.images[0].url);

        $(".time-bar").css("background", `rgb(${current.item.color[0]}, ${current.item.color[1]}, ${current.item.color[2]})`)

        $(".screen").css("background", `linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 60%, rgba(0,0,0,0.75) 100%), url(${track.album.images[0].url})`);
        $(".screen").css("background-size", "auto 100%");
        $(".screen").css("background-position", "right");

        $(".meta").css("opacity", 1);
        $(".time-bar").css("opacity", 1);
        setTimeout(() => {
            $(".meta").css("opacity", .5);
            $(".time-bar").css("opacity", .5);
        }, 10000)
    } else if (data.return == "spotify/time") {
        current.time = data.payload;
        $(".previous, .now, .next").html("");
        if (data.payload < (current.lyrics[0].time.total * 100)) {
            $(".lyrics").append(`
                <div class="next">${current.lyrics[0].text}</div>
            `)
        } else {
            $(".lyrics").append(`
                <div class="now"><i class="fa-regular fa-ellipsis lyric-intermission"></i></div>
            `)
        }
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
        $(".previous, .now, .next").remove();
        if (current.time < data.payload[0].time.total * 100) {
            $(".lyrics").append(`
                <div class="next">${current.lyrics[0].text || `<i class="fa-regular fa-ellipsis lyric-intermission"></i>`}</div>
            `)
        } else {
            $(".lyrics").append(`
                <div class="next"><i class="fa-regular fa-ellipsis lyric-intermission"></i></div>
            `)
        }
    } else if (data.return == "spotify/pause") {
        current.is_playing = false;
    } else if (data.return == "karaoke/sync") {
        current.time = current.time + data.payload;
    }
})

setInterval(() => {
    if (current.is_playing) {
        current.time += 100
        if (current.lyrics.length) {
            current.lyrics.forEach((lyric, i) => {
                if (lyric.time.total.toFixed(1) == (current.time / 1000).toFixed(1)) {
                    $(".lyrics .last").remove();

                    $(".lyrics .previous").attr("class", "last");

                    $(".lyrics .now").attr("class", "previous")
                    if (current.lyrics[i-1]) {
                        $(".lyrics .previous").html(current.lyrics[i-1].text || `<i class="fa-regular fa-ellipsis lyric-intermission"></i>`);
                    } else {
                        $(".lyrics .previous").html(`<i class="fa-regular fa-ellipsis lyric-intermission"></i>`);
                    }

                    $(".lyrics .next").attr("class", "now")
                    $(".lyrics .now").html(lyric.text || `<i class="fa-regular fa-ellipsis lyric-intermission"></i>`);
                    if (current.lyrics[i+1]) {
                        $(".lyrics").append(`
                            <div class="next animate__animated animate__fadeInUp">${current.lyrics[i+1].text || `<i class="fa-regular fa-ellipsis lyric-intermission"></i>`}</div>
                        `)
                    } else {
                        $(".lyrics").append(`<div class="next animate__animated animate__fadeInUp"><i class="fa-regular fa-ellipsis lyric-intermission"></i></div>`)
                    }
                }
            })
        }
    }
}, 100)

setInterval(() => {
    $(".time-bar").css("width", `${(current.time/current.item.duration_ms) * 100}%`)
}, 1000)
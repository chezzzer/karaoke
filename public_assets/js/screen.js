var current = {
    time: 0,
    item: {},
    lyrics: [],
    is_playing: false,
};

function combineArtists(artistList) {
    let artists = "";
    artistList.forEach((item) => {
        artists += `${item.name}, `;
    });
    artists = artists.slice(0, -2);
    return artists;
}

$(document).on("ws/data", (event, data) => {
    if (data.return == "connection/success") {
        $(".loading").fadeOut();
    } else if (data.return == "spotify/playback") {
        $(".waiting-screen").fadeOut();
        let track = data.payload.item;

        current.time = data.payload.progress_ms;
        current.item = track;
        current.is_playing = data.payload.is_playing;

        $(".info-title").html(track.name);
        $(".info-artist").html(combineArtists(track.artists));
        $(".info-art").attr("src", track.album.images[0].url);

        $(".time-bar").css(
            "background",
            `rgb(${current.item.color[0]}, ${current.item.color[1]}, ${current.item.color[2]})`
        );

        $(".screen").css(
            "background",
            `linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 60%, rgba(0,0,0,0.5) 100%), url(${track.album.images[0].url})`
        );
        $(".screen").css("background-size", "auto 100%");
        $(".screen").css("background-position", "right");

        $(".meta").css("opacity", 1);
        $(".time-bar").css("opacity", 1);
        setTimeout(() => {
            $(".meta").css("opacity", 0.75);
            $(".time-bar").css("opacity", 0.75);
        }, 10000);
    } else if (data.return == "spotify/time") {
        current.time = data.payload;
        $(".previous, .now, .next").html("");
        if (data.payload < current.lyrics[0].time.total * 100) {
            $(".lyrics").append(`
                <div class="next">${current.lyrics[0].text}</div>
            `);
        } else {
            $(".lyrics").append(`
                <div class="now"><i class="fa-regular fa-ellipsis lyric-intermission"></i></div>
            `);
        }
    } else if (data.return == "spotify/await") {
        $(".time-bar").css("width", `0%`);
        $(".waiting-screen").fadeIn();
        let { track, time } = data.payload;

        $(".waiting-screen .next-title").html(track.name);
        $(".waiting-screen .next-artist").html(combineArtists(track.artists));
        $(".waiting-screen .next-img").attr("src", track.album.images[1].url);
        $(".waiting-screen .next-time").html(`${time / 1000} SECONDS.`);

        let interval = setInterval(() => {
            if (time == 0) {
                clearInterval(interval);
            }

            $(".waiting-screen .next-time").html(`${time / 1000} SECONDS.`);

            time -= 1000;
        }, 1000);
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
                <div class="next">${
                    current.lyrics[0].text ||
                    `<i class="fa-regular fa-ellipsis lyric-intermission"></i>`
                }</div>
            `);
        } else {
            $(".lyrics").append(`
                <div class="next"><i class="fa-regular fa-ellipsis lyric-intermission"></i></div>
            `);
        }
    } else if (data.return == "spotify/pause") {
        current.is_playing = false;
    } else if (data.return == "karaoke/sync") {
        current.time = current.time + data.payload;
    }
});

function syncLyrics() {
    if (current.is_playing) {
        //increse system playtime
        current.time += 100;
        //check if lyrics exist
        if (current.lyrics.length) {
            //loop over them
            current.lyrics.forEach((lyric, i) => {
                //if the time equals the exact time of the lyric
                if (
                    (current.time / 1000 > lyric.time.total &&
                        current.time / 1000 < current.lyrics[i + 1]) ||
                    lyric.time.total.toFixed(1) == (current.time / 1000).toFixed(1)
                ) {
                    //get rid of last lyric as its not shown anymore
                    $(".lyrics .last").remove();

                    //change previous lyric to get deleted next time
                    $(".lyrics .previous").attr("class", "last");

                    //move current lyric to previous
                    $(".lyrics .now").attr("class", "previous");

                    //check if lyrics exist
                    if (current.lyrics[i - 1]) {
                        //if it exists, set it or if its "", set to interm
                        $(".lyrics .previous").html(
                            current.lyrics[i - 1].text ||
                                `<i class="fa-regular fa-ellipsis lyric-intermission"></i>`
                        );
                    } else {
                        //not found so just set as interm
                        $(".lyrics .previous").html(
                            `<i class="fa-regular fa-ellipsis lyric-intermission"></i>`
                        );
                    }

                    //move up the next lyric
                    $(".lyrics .next").attr("class", "now");
                    //check if it exists
                    $(".lyrics .now").html(
                        lyric.text || `<i class="fa-regular fa-ellipsis lyric-intermission"></i>`
                    );

                    //check if lyrics exist
                    if (current.lyrics[i + 1]) {
                        //if it exists, set it or if its "", set to interm
                        $(".lyrics").append(`
                            <div class="next animate__animated animate__fadeInUp">${
                                current.lyrics[i + 1].text ||
                                `<i class="fa-regular fa-ellipsis lyric-intermission"></i>`
                            }</div>
                        `);
                    } else {
                        //not found so just set as interm
                        $(".lyrics").append(
                            `<div class="next animate__animated animate__fadeInUp"><i class="fa-regular fa-ellipsis lyric-intermission"></i></div>`
                        );
                    }
                }
            });
        }
    }
}

setInterval(syncLyrics, 100);

setInterval(() => {
    $(".time-bar").css("width", `${(current.time / current.item.duration_ms) * 100}%`);
}, 1000);

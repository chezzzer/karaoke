var leadingSearch = "";
var current = {
    time: 0,
    duration: 0,
    paused: false
}
$("#song-search").on("input", () => {
    let search = $("#song-search").val();
    if (search) {
        $(".seach-loader").fadeIn(0);
        leadingSearch = search;
        setTimeout(() => {
            if (leadingSearch == search) {
                socket.send(JSON.stringify({method: "search", value: search}));
            }
        }, 500)
    } else {
        $(".search-results").fadeOut(0);
    }
})

function queueItem(uri, isrc) {
    $(`[track-uri='${uri}'] .add-queue`).attr("class", "fa-duotone fa-spinner-third fa-2x fa-spin pointer add-queue");
    $(`[track-uri='${uri}']`).addClass("adding-queue")
    socket.send(JSON.stringify({method: "queue", uri, isrc}))
}

function combineArtists(artistList) {
    let artists = "";
    artistList.forEach(item => artists += `${item.name}, `);
    artists = artists.substring(0, artists.length - 2);
    return artists;
}

function makeSongItem(item, column = 3, ableToQueue = true) {
    return `
        <div class="col-sm-${column} mb-4">
            <div class="bg-darker shadow d-flex p-2 rounded" track-uri="${item.uri}">
                <a href="https://open.spotify.com/track/${item.id}" target="_blank">
                    <img src="${item.album.images[2].url}" width="48px" height="48px" style="object-fit:cover" class="shadow-sm rounded">
                </a>
                <div class="ms-3 my-auto text-nowrap overflow-hidden me-2">
                    <div class="fw-bold">${item.name}</div>
                    <div class="text-muted">${combineArtists(item.artists)} <span class="extra"></span>${ableToQueue ? "" : `<span class="admin-item admin-remove-queue text-decoration-underline pointer d-inline" onclick="removeQueue('${item.id}')">Remove</span>`}</div>
                </div>
                <div class="m-auto me-1 ${ableToQueue ? "" : "d-none"}">
                    <a onclick="queueItem('${item.uri}', '${item.external_ids.isrc}')">
                        <i class="fa-solid fa-plus fa-2x pointer add-queue"></i>
                    </a>
                </div>
            </div>
        </div>
    `
}

function refreshCatalouge() {
    socket.send(JSON.stringify({method: "catalouge"}))
}

$(document).on("ws/data", (event, data) => {
    if (data.return == "connection/success") {
        if (!$(".catalouge .col-sm-3").length) {
            refreshCatalouge()
        }
        if (getCookie("admin_password")) {
            requestAdmin()
        }
    } else if (data.return == "spotify/search") {
        $(".search-results").html("");
        $(".search-results").fadeIn(0);
        $(".seach-loader").fadeOut(0);
        data.payload.forEach((item) => {
            $(".search-results").append(makeSongItem(item));
        })
        $(".search-results").append("<hr>");
    } else if (data.return == "spotify/playback") {
        $("#song-progress .progress-bar").css("width", 0)
        $("#song-art").attr("src", data.payload.item.album.images[2].url);
        $("#song-title").html(data.payload.item.name);
        $("#song-artists").html(combineArtists(data.payload.item.artists));
        $("#song-link").attr("href", `https://open.spotify.com/track/${data.payload.item.id}`);
        current.time = data.payload.progress_ms;
        current.duration = data.payload.item.duration_ms;
        current.paused = false;
        $("#song-progress .progress-bar").css("width", (current.time/current.duration) * 100)
    } else if (data.return == "spotify/time") {
        current.time = data.payload;
    } else if (data.return == "spotify/pause") {
        current.paused = true;
    } else if (data.return == "karaoke/error") {
        alert(data.payload);
        if (data.uri) {
            $(`[track-uri='${data.uri}']`).addClass("added-queue");
            $(`[track-uri='${data.uri}'] .add-queue`).attr("class", "fa-solid fa-times fa-2x pointer add-queue");
        }
    } else if (data.return == "karaoke/queued") {
        $(`[track-uri='${data.uri}'] .add-queue`).attr("class", "fa-solid fa-check fa-2x pointer add-queue");
        $(`[track-uri='${data.uri}']`).removeClass("adding-queue")
        $(`[track-uri='${data.uri}']`).addClass("added-queue")
    } else if (data.return == "spotify/catalouge") {
        $(".catalouge").html("");
        data.payload.forEach((item) => {
            $(".catalouge").append(makeSongItem(item));
        })
    } else if (data.return == "karaoke/queue") {
        $(".queue").html("");
        let queue = Object.keys(data.payload);
        if (!queue.length) {
            $(".queue").html("<div class=\"col-sm-12\"><div class=\"text-muted p-2 mx-auto shadow bg-darker rounded\">No songs queued, search for a song to add to the list!</div></div>");
        }
        queue.forEach((item) => {
            item = data.payload[item];
            $(".queue").append(makeSongItem(item, 12, false));
        })
    } else if (data.return == "spotify/history") {
        $(".history").html("");
        data.payload.forEach((item) => {
            $(".history").append(makeSongItem(item.track, 12));
        })
    } else if (data.return == "karaoke/admin") {
        $("#adminModal").modal("hide");
        $("#admin").fadeIn();
        $("body").addClass("admin");
        $("#adminLogin").remove();
        $("#footer").append(`<a onclick="setCookie('admin_password', '');location.reload()" class="text-muted text-decoration-none ps-1 pointer">Log Out</a>`)
        let password = $("[name=admin-password]").val();
        if (!getCookie("admin_password") && password) {
            setCookie("admin_password", password)
        }
    }
})

function secondsToString(given_seconds) {
    dateObj = new Date(given_seconds * 1000);
    hours = dateObj.getUTCHours();
    minutes = dateObj.getUTCMinutes();
    seconds = dateObj.getSeconds();

    return minutes.toString().padStart(2, '0') + ':' + 
    seconds.toString().padStart(2, '0');
}

setInterval(() => {
    if (!current.paused) {
        current.time = current.time+1000;
        $("#song-progress .progress-bar").css("width", (current.time/current.duration) * 100 + "%")
    } 
    let time = new Date();
    $("#time").html(
        time.toLocaleDateString("en-US", {
            hour12 : true,
            hour:  "numeric",
            minute: "numeric"
        })
        .split(`, `)[1]
        .toLocaleLowerCase()
    )
    if ($(".queue .col-sm-12").length) {
        let time = (current.duration-current.time)/1000;
        if (time <= 11) {
            $(".queue .col-sm-12:first-child .extra").attr("class", "extra badge bg-danger me-2")
        } else if (time < 20) {
            $(".queue .col-sm-12:first-child .extra").attr("class", "extra badge bg-warning me-2")
        } else {
            $(".queue .col-sm-12:first-child .extra").attr("class", "extra badge bg-dark me-2")
        }
        $(".queue .col-sm-12:first-child .extra").html(`Playing in ${secondsToString(time)}`)
    }
}, 1000)

function requestAdmin() {
    socket.send(JSON.stringify({
        method: "admin",
        password: $("[name=admin-password]").val() || getCookie("admin_password")
    }))
}

$("#admin #lyric-sync").on("change", () => {
    socket.send(JSON.stringify({
        method: "sync",
        password: $("[name=admin-password]").val() || getCookie("admin_password"),
        value: Number($("#admin #lyric-sync").val())
    }))
    $("#admin #lyric-sync").val(0);
})

function removeQueue(id) {
    socket.send(JSON.stringify({
        method: "removeQueue",
        password: $("[name=admin-password]").val() || getCookie("admin_password"),
        id
    }))
}

function player(action) {
    socket.send(JSON.stringify({
        method: "player",
        password: $("[name=admin-password]").val() || getCookie("admin_password"),
        action
    }))
}

function setCookie(cname, cvalue, exdays) {
    const d = new Date();
    d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
    let expires = "expires="+d.toUTCString();
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}
  
function getCookie(cname) {
    let name = cname + "=";
    let ca = document.cookie.split(';');
    for(let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) == ' ') {
        c = c.substring(1);
      }
      if (c.indexOf(name) == 0) {
        return c.substring(name.length, c.length);
      }
    }
    return "";
}  
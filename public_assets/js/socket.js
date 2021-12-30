var socket;
function connect() {
    if (socket) {if (socket.CONNECTING) {return}};

    socket = new WebSocket(`ws${location.protocol == "https:" ? "s" : ""}://`+location.host);

    socket.onmessage = (msg) => {
        let data;
        try {
            data = JSON.parse(msg.data);
        } catch (e) {
            console.log(e);
        }
        $(document).trigger("ws/data", [data]);
    }

    socket.onclose = () => {
        console.log("Socket was closed, trying to connect in 5 seconds")
        setTimeout(connect, 5000)
    };
    socket.onerror = (e) => {
        console.log("Socket errored", e)
    };
    socket.onopen = () => {
        $(document).trigger("ws/connect");
        console.log("Socket reconnected");
    }
}
setInterval(() => {
    if (socket.OPEN) {
        socket.send(JSON.stringify({
            method: "ping"
        }))
    }
}, 5000)
connect();
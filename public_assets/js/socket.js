var socket;
function connect() {
    if (socket) {if (socket.CONNECTING) {return}};

    socket = new WebSocket("ws://"+location.host);

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
        console.log("Socket reconnected");
    }
}
connect();
var socket;
function connect() {
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

    socket.onclose = () => {setTimeout(connect, 2000)};
    socket.onerror = () => {setTimeout(connect, 30000)};
}
connect();
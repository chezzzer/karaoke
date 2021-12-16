const express = require("express");
const app = express();
require('express-ws')(app);
const axios = require("axios");
const os = require("os");
const fs = require("fs");
const Events = require("events");
const events = new Events();
console.log("Welcome, starting...");

if (!fs.existsSync("./config.json")) {
    console.log("Please fill the config.json file.");
    process.exit();
}

var config = JSON.parse(fs.readFileSync("./config.json"));

app.use('/assets', express.static('public_assets'));
app.use('/screen', express.static('public_screen'));
app.use('/', express.static('public_chooser'));

app.ws("/", (ws, req) => {
    let listen = events.on("data", (json) => {
        ws.send(JSON.stringify(json));
    })

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
        events.removeListener(listen);
    })
})

app.get("/login", (req, res) => {

})

app.get("/oauth", (req, res) => {
    if (!fs.existsSync("./spotify.json")) {
        fs.writeFileSync("./spotify.json")
    }
})

app.listen(config.port, () => {
    let ip = os.networkInterfaces()['Wi-Fi'].find((i) => {return (i.family == "IPv4")}).address;
    console.log(`
Started Karaoke: 
    
Chooser URL:        http://${ip}:${config.port}/
Screen URL:         http://${ip}:${config.port}/screen/
Spotify OAuth URL:  http://${ip}:${config.port}/login
`);
})
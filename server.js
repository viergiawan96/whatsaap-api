const express = require("express");
const cors = require("cors");
const http = require("http");
const qrcode = require("qrcode");
const { Client } = require("whatsapp-web.js");
const socketIO = require("socket.io");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;
const io = socketIO(server);

app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: __dirname });
});

const sessions = [];
const SESSIONS_FILE = "./src/static/whatsapp-sessions.json";

const createSessionsFileIfNotExists = function () {
  if (!fs.existsSync(SESSIONS_FILE)) {
    try {
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify([]));
      console.log("Sessions file created successfully.");
    } catch (err) {
      console.log("Failed to create sessions file: ", err);
    }
  }
};

createSessionsFileIfNotExists();

const setSessionsFile = function (sessions) {
  fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions), function (err) {
    if (err) {
      console.log(err);
    }
  });
};

const getSessionsFile = function () {
  return JSON.parse(fs.readFileSync(SESSIONS_FILE));
};

const createSession = (id) => {
  console.log("creating session" + id);

  const SESSIONS_FILE_PATH = `./src/static/whatsapp-session-${id}.json`;
  let sessionCfg;

  if (fs.existsSync(SESSIONS_FILE_PATH)) {
    sessionCfg = require(SESSIONS_FILE_PATH);
  }

  const client = new Client({
    restartOnAuthFail: true,
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--single-process", // <- this one doesn't works in Windows
        "--disable-gpu",
      ],
    },
    session: sessionCfg,
  });

  client.initialize();

  client.on("qr", (qr) => {
    log("QR RECEVIED", qr);

    qrcode.toDataURL(qr, (err, url) => {
      if (err) console.log(err);

      io.emit("qr", { id: id, src: url });
      io.emit("message", { id: id, text: "QR code recevied, Scan Please" });
    });
  });

  client.on("ready", () => {
    io.emit("ready", { id: id });
    io.emit("message", { id: id, text: "Whatsapp is ready!" });

    const savedSessions = getSessionsFile();
    const sessionIndex = savedSessions.findIndex((sess) => sess.id == id);
    savedSessions[sessionIndex].ready = true;
    setSessionsFile(savedSessions);
  });

  client.on("authenticated", (session) => {
    io.emit("authenticated", { id: id });
    io.emit("message", { id: id, text: "Whatsapp is authenticated!" });
    sessionCfg = session;
    fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
      if (err) {
        console.error(err);
      }
    });
  });

  client.on("auth_failure", function (session) {
    io.emit("message", { id: id, text: "Auth failure, restarting..." });
  });

  client.on("disconnected", (reason) => {
    io.emit("message", { id: id, text: "Whatsapp is disconnected!" });
    fs.unlinkSync(SESSION_FILE_PATH, function (err) {
      if (err) return console.log(err);
      console.log("Session file deleted!");
    });
    client.destroy();
    client.initialize();

    // Menghapus pada file sessions
    const savedSessions = getSessionsFile();
    const sessionIndex = savedSessions.findIndex((sess) => sess.id == id);
    savedSessions.splice(sessionIndex, 1);
    setSessionsFile(savedSessions);

    io.emit("remove-session", id);
  });

  // Tambahkan client ke sessions
  sessions.push({
    id: id,
    description: description,
    client: client,
  });

  // Menambahkan session ke file
  const savedSessions = getSessionsFile();
  const sessionIndex = savedSessions.findIndex((sess) => sess.id == id);

  if (sessionIndex == -1) {
    savedSessions.push({
      id: id,
      description: description,
      ready: false,
    });
    setSessionsFile(savedSessions);
  }
};

const init = function (socket) {
  const savedSessions = getSessionsFile();

  if (savedSessions.length > 0) {
    if (socket) {
      socket.emit("init", savedSessions);
    } else {
      savedSessions.forEach((sess) => {
        createSession(sess.id);
      });
    }
  }
};

init();

io.on("connection", (data) => {
  console.log("create sessions" + data + id);
  createSession(data.id);
});

server.listen(port, function () {
  console.log("App running on *: " + port);
});

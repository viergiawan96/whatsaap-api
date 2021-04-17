require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const qrcode = require("qrcode");
const { Client } = require("whatsapp-web.js");
const socketIO = require("socket.io");
const fs = require("fs");
const { phoneNumberFormatter } = require("./src/helpers/formatter");
const db = require("./src/model");

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;
const io = socketIO(server);

const trnKeyword = db.trn_keyword;

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

const createSession = async (id) => {
  console.log("Creating session: " + id);

  const SESSION_FILE_PATH = `./src/static/${id}.json`;
  let sessionCfg;
  if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionCfg = require(SESSION_FILE_PATH);
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

  client.on("message", async (msg) => {
    // console.log(msg);
    const chat = await msg.getChat();
    const info = await msg.getInfo();
    const constact = await msg.getContact();

    // chat.sendStateTyping();
    console.log("chat", chat);
    console.log("info", info);
    console.log("contact", constact);

    // trnKeyword
    //   .findAll({
    //     where: {
    //       id_phone: msg.to,
    //     },
    //   })
    //   .then((result) => {
    //     if (result.length > 0) {
    //       const key = result.find((sess) => sess.keyword == msg.body);

    //       if (key) return client.sendMessage(msg.from, key.res_keyword);

    //       return client.sendMessage(msg.from, "Tidak ada di keyword");
    //     } else {
    //       return client.sendMessage(
    //         msg.from,
    //         "nomor Telepon tidak ada di database"
    //       );
    //     }
    //   })
    //   .catch((err) => {
    //     console.log(err);
    //   });

    // if (msg.to == "6288233974325@c.us") {
    //   setTimeout(async () => {
    //     const chat = await msg.getChat();
    //     chat.sendStateTyping();
    //     setTimeout(() => {
    //       client.sendMessage(msg.from, "haiiiiii");
    //     }, 3000);
    //   }, 120000);
    // }
  });

  //untuk generate qrcode ke front end
  client.on("qr", (qr) => {
    console.log("QR RECEIVED", qr);
    qrcode.toDataURL(qr, (err, url) => {
      io.emit("qr", { id: id, src: url });
      io.emit("message", { id: id, text: "QR Code received, scan please!" });
    });
  });

  //cek sessions apakah sudah tersedia dan di lempar ke front end menggunakan io.emit
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

  //jika login gagal di web.whatsapp akan di infokan ke front end dengan io.emit message
  client.on("auth_failure", function (session) {
    io.emit("message", { id: session.id, text: "Auth failure, restarting..." });
  });

  //jika dc maka akan di kirim ke front end message dan sessions akan di hapus agar bisa login kembali
  client.on("disconnected", (reason) => {
    io.emit("message", { id: reason.id, text: "Whatsapp is disconnected!" });
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
    client: client,
  });

  // Menambahkan session ke file
  const savedSessions = getSessionsFile();
  const sessionIndex = savedSessions.findIndex((sess) => sess.id == id);

  if (sessionIndex == -1) {
    savedSessions.push({
      id: id,
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

io.on("connection", (socket) => {
  init(socket);

  socket.on("create-session", function (data) {
    const savedSessions = getSessionsFile();
    const sessionIndex = savedSessions.find((sess) => sess.id == data.id);

    if (!sessionIndex) {
      createSession(data.id);
    } else {
      io.emit("message", {
        id: sessionIndex.id,
        text: "authenticated",
      });
    }
  });
});

// Send message
app.post("/send-message", async (req, res) => {
  const sender = req.body.sender;
  const number = phoneNumberFormatter(req.body.number);
  const message = req.body.message;

  const client = sessions.find((sess) => sess.id == sender).client;

  client
    .sendMessage(number, message)
    .then((response) => {
      res.status(200).json({
        status: true,
        response: response,
      });
    })
    .catch((err) => {
      res.status(500).json({
        status: false,
        response: err,
      });
    });
});

app.post("/post-keyword", async (req, res) => {
  const phone = await phoneNumberFormatter(req.body.id_phone);
  const postKeyword = {
    id_phone: phone,
    keyword: req.body.keyword.toLowerCase(),
    res_keyword: req.body.res_keyword,
  };

  trnKeyword.create(postKeyword).then((result) => {
    res
      .status(201)
      .json({
        status: 201,
        data: result,
      })
      .catch((err) => {
        res.status(500).json({
          status: 500,
          data: err,
        });
      });
  });
});

db.sequelize.sync();

server.listen(port, function () {
  console.log("App running on *: " + port);
});

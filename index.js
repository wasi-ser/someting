import { Boom } from "@hapi/boom";
import Baileys, { DisconnectReason, delay, Browsers, useMultiFileAuthState } from "baileys";
import cors from "cors";
import express from "express";
import fs from "fs";
import path, { dirname } from "path";
import pino from "pino";
import { fileURLToPath } from "url";
import { upload } from "./upload.js";

const app = express();
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});
app.use(cors());

const PORT = process.env.PORT || 3000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const sessionFolder = path.join(__dirname, `./auth/${Array.from({ length: 10 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]).join("")}`);

const deleteSessionFolder = () => {
  if (fs.existsSync(sessionFolder)) fs.rmdirSync(sessionFolder, { recursive: true });
};

deleteSessionFolder();

app.use(express.static(path.join(__dirname, 'public')));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get("/pair", async (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.json({ error: "Please Provide Phone Number" });
  try {
    const code = await startnigg(phone);
    res.json({ code });
  } catch (error) {
    console.error("Error in WhatsApp authentication:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

async function startnigg(phone) {
  if (!fs.existsSync(path.join(__dirname, "auth"))) fs.mkdirSync(path.join(__dirname, "auth"));
  return new Promise(async (resolve, reject) => {
    if (!fs.existsSync(sessionFolder)) await fs.mkdirSync(sessionFolder);
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
    const conn = Baileys.makeWASocket({
      version: [2, 3000, 1015901307],
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      browser: Browsers.ubuntu("Chrome"),
      auth: state,
    });

    if (!conn.authState.creds.registered) {
      const phoneNumber = phone ? phone.replace(/[^0-9]/g, "") : "";
      if (phoneNumber.length < 11) return reject(new Error("Please Enter Your Number With Country Code !!"));
      setTimeout(async () => {
        try {
          const code = await conn.requestPairingCode(phoneNumber);
          console.log(`Your Pairing Code : ${code}`);
          resolve(code);
        } catch (error) {
          console.error("Error requesting pairing code from WhatsApp", error);
          reject(new Error("Error requesting pairing code from WhatsApp"));
        }
      }, 3000);
    }

    conn.ev.on("creds.update", saveCreds);

    conn.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
      if (connection === "open") {
        await delay(10000);
        const output = await upload(sessionFolder)
        const sessi = "Session~" + output;
        console.log(sessi);
        await delay(2000);
        let sessMsg = await conn.sendMessage(conn.user.id, { text: sessi });
        await delay(2000);
        await conn.sendMessage(conn.user.id, { text: "```Keep Your Session ID Safe``` \n > Powered by WASI-TECH" }, { quoted: sessMsg });
        console.log("Connected to WhatsApp Servers");
        await delay(8000)
        deleteSessionFolder();
        process.exit(1);
      } else if (connection === "close") {
        const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
        console.log("Connection Closed:", reason);
        if ([DisconnectReason.connectionClosed, DisconnectReason.connectionLost, DisconnectReason.timedOut, DisconnectReason.connectionReplaced].includes(reason)) {
          console.log("[Reconnecting....!]");
          process.exit();
        } else if (reason === DisconnectReason.loggedOut) {
           deleteSessionFolder();
          console.log("[Device Logged Out, Please Try to Login Again....!]");
          process.exit();
        } else if (reason === DisconnectReason.restartRequired) {
          console.log("[Server Restarting....!]");
          startnigg();
        } else if (reason === DisconnectReason.badSession) {
          console.log("[BadSession exists, Trying to Reconnect....!]");
           deleteSessionFolder();
          process.exit();
        } else {
          console.log("[Server Disconnected: Maybe Your WhatsApp Account got Fucked....!]");
          process.exit();
        }
      }
    });

    conn.ev.on("messages.upsert", () => { });
  });
}

app.listen(PORT, () => console.log(`API Running on PORT:${PORT}`));

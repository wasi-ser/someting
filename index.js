import { Boom } from "@hapi/boom";
import Baileys, { DisconnectReason, delay, Browsers, useMultiFileAuthState } from "baileys";
import cors from "cors";
import express from "express";
import fs from "fs";
import { readFile } from "fs/promises";
import { Pastebin, PrivacyLevel, ExpirationTime } from "pastedeno";
import path, { dirname } from "path";
import pino from "pino";
import { fileURLToPath } from "url";

const app = express();
app.use((req, res, next) => {
 res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
 res.setHeader("Pragma", "no-cache");
 res.setHeader("Expires", "0");
 next();
});
app.use(cors());

const pastebin = new Pastebin({ api_dev_key: "06S06TKqc-rMUHoHsrYxA_bwWp9Oo12y" });
const PORT = process.env.PORT || 8000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const sessionFolder = `./auth/${Array.from({ length: 10 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]).join("")}`;

const deleteSessionFolder = () => {
 if (fs.existsSync(sessionFolder)) fs.rmdirSync(sessionFolder, { recursive: true });
};

deleteSessionFolder();

app.get("/code", (req, res) => res.sendFile(path.join(__dirname, "pair.html")));

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
    const data1 = await readFile(`${sessionFolder}/creds.json`);
    const output = await pastebin.createPaste({
     text: data1.toString(),
     title: "Astro",
     format: "javascript",
     privacy: PrivacyLevel.UNLISTED,
     expiration: ExpirationTime.ONE_MONTH,
    });
    const sessi = "Session~" + output.split("https://pastebin.com/")[1];
    console.log(sessi);
    await delay(2000);
    let sessMsg = await conn.sendMessage(conn.user.id, { text: sessi });
    await delay(2000);
    await conn.sendMessage(conn.user.id, { text: "```Keep Your Session ID Safe```" }, { quoted: sessMsg });
    console.log("Connected to WhatsApp Servers");
    deleteSessionFolder();
    process.send("reset");
   } else if (connection === "close") {
    const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
    console.log("Connection Closed:", reason);
    if ([DisconnectReason.connectionClosed, DisconnectReason.connectionLost, DisconnectReason.timedOut, DisconnectReason.connectionReplaced].includes(reason)) {
     console.log("[Reconnecting....!]");
     process.send("reset");
    } else if (reason === DisconnectReason.loggedOut) {
     deleteSessionFolder();
     console.log("[Device Logged Out, Please Try to Login Again....!]");
     process.send("reset");
    } else if (reason === DisconnectReason.restartRequired) {
     console.log("[Server Restarting....!]");
     startnigg();
    } else if (reason === DisconnectReason.badSession) {
     console.log("[BadSession exists, Trying to Reconnect....!]");
     deleteSessionFolder();
     process.send("reset");
    } else {
     console.log("[Server Disconnected: Maybe Your WhatsApp Account got Fucked....!]");
     process.send("reset");
    }
   }
  });

  conn.ev.on("messages.upsert", () => {});
 });
}

app.listen(PORT, () => console.log(`API Running on PORT:${PORT}`));

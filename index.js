import express from "express";
import cors from "cors";
import { Boom } from "@hapi/boom";
import Baileys, { DisconnectReason, useMultiFileAuthState } from "baileys";
import { Pastebin, PrivacyLevel, ExpirationTime } from "pastedeno";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
const pastebin = new Pastebin({ api_dev_key: "06S06TKqc-rMUHoHsrYxA_bwWp9Oo12y" });
const PORT = process.env.PORT || 8000;
const sessionFolder = `./auth/${Array.from({ length: 10 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]).join("")}`;

app.use(express.static(path.join(__dirname, 'public')));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get("/pair", async (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.json({ error: "Please Provide Phone Number" });
  try {
    const code = await startWhatsApp(phone);
    res.json({ code });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

async function startWhatsApp(phone) {
  await fs.mkdir(sessionFolder, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
  const conn = Baileys.makeWASocket({
    version: [2, 3000, 1015901307],
    auth: state,
  });

  return new Promise((resolve, reject) => {
    if (!conn.authState.creds.registered) {
      const phoneNumber = phone.replace(/[^0-9]/g, "");
      if (phoneNumber.length < 11) return reject(new Error("Invalid phone number"));
      setTimeout(async () => {
        try {
          const code = await conn.requestPairingCode(phoneNumber);
          resolve(code);
        } catch (error) {
          reject(new Error("Error requesting pairing code"));
        }
      }, 3000);
    }

    conn.ev.on("creds.update", saveCreds);
    conn.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
      if (connection === "open") {
        const data = await fs.readFile(`${sessionFolder}/creds.json`);
        const output = await pastebin.createPaste({
          text: data.toString(),
          title: "Astro",
          format: "javascript",
          privacy: PrivacyLevel.UNLISTED,
          expiration: ExpirationTime.ONE_MONTH,
        });
        const sessionId = "Session~" + output.split("https://pastebin.com/")[1];
        await conn.sendMessage(conn.user.id, { text: sessionId });
        await conn.sendMessage(conn.user.id, { text: "```Keep Your Session ID Safe```" });
        await fs.rm(sessionFolder, { recursive: true, force: true });
        process.send("reset");
      } else if (connection === "close") {
        const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
        if ([DisconnectReason.loggedOut, DisconnectReason.badSession].includes(reason)) {
          await fs.rm(sessionFolder, { recursive: true, force: true });
        }
        process.send("reset");
      }
    });
  });
}

app.listen(PORT, () => console.log(`API PAIR\nhttp://localhost:${PORT}`));
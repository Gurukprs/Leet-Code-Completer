// backend/server.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const SOLUTIONS_PATH = path.join(__dirname, "../solutions_json");
const langMap = { cpp: "C++", python: "Python3", java: "Java", js: "JavaScript" };

function loadSolutionsMap() {
  const files = fs.readdirSync(SOLUTIONS_PATH).filter(file => file.endsWith(".json"));
  const map = new Map();
  for (const file of files) {
    const slug = file.replace(".json", "");
    const content = JSON.parse(fs.readFileSync(path.join(SOLUTIONS_PATH, file), "utf-8"));
    map.set(slug, {
      code: content.code,
      language: content.language.toLowerCase()
    });
  }
  return map;
}

async function getUnsolvedProblems(username, difficulties) {
  const res = await axios.get("https://leetcode.com/api/problems/algorithms/");
  return res.data.stat_status_pairs.filter(entry => {
    return (!entry.status || entry.status === "notac") &&
           difficulties.includes(entry.difficulty.level);
  }).map(entry => ({
    slug: entry.stat.question__title_slug,
    title: entry.stat.question__title,
    level: entry.difficulty.level
  }));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function login(page, username, password) {
  await page.goto("https://leetcode.com/accounts/login/", { waitUntil: "networkidle2" });
  await page.type("#id_login", username, { delay: 50 });
  await page.type("#id_password", password, { delay: 50 });
  await Promise.all([
    page.click("button[type='submit']"),
    page.waitForNavigation({ waitUntil: "networkidle2" })
  ]);
}

async function setLanguage(page, langKey) {
  const visibleLang = langMap[langKey];
  if (!visibleLang) return;
  await page.waitForSelector('[data-key="language-selector"]');
  await page.click('[data-key="language-selector"]');
  await page.waitForTimeout(500);
  await page.evaluate((lang) => {
    const items = [...document.querySelectorAll('[role="option"]')];
    const target = items.find(item => item.textContent.includes(lang));
    if (target) target.click();
  }, visibleLang);
  await page.waitForTimeout(2000);
}

async function submitProblem(page, slug, code, langKey) {
  const url = `https://leetcode.com/problems/${slug}`;
  await page.goto(url, { waitUntil: "networkidle2" });
  await setLanguage(page, langKey);
  await page.waitForSelector(".monaco-editor textarea");
  const editor = await page.$(".monaco-editor textarea");
  await editor.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.keyboard.type(code, { delay: 5 });
  await page.click("button:has-text('Submit')");
  await page.waitForTimeout(5000);
}

wss.on("connection", (ws) => {
  ws.on("message", async (data) => {
    const {
      username,
      password,
      count,
      difficulties, // [2, 3] for medium & hard
      delayMs
    } = JSON.parse(data);

    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await login(page, username, password);

    const solutionsMap = loadSolutionsMap();
    const problems = await getUnsolvedProblems(username, difficulties);
    const selectedProblems = problems.filter(p => solutionsMap.has(p.slug)).slice(0, count);

    for (let i = 0; i < selectedProblems.length; i++) {
      const { slug } = selectedProblems[i];
      const { code, language } = solutionsMap.get(slug);
      try {
        await submitProblem(page, slug, code, language);
        ws.send(JSON.stringify({ type: "progress", completed: i + 1, total: selectedProblems.length, slug }));
      } catch (err) {
        ws.send(JSON.stringify({ type: "error", slug, message: err.message }));
      }
      if (i < selectedProblems.length - 1) await delay(delayMs);
    }

    ws.send(JSON.stringify({ type: "done" }));
    await browser.close();
  });
});

server.listen(3001, () => console.log("WebSocket server running on port 3001"));

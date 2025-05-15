const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const PORT = 3001;
const LOGIN_URL = 'https://leetcode.com/accounts/login/';
const SUBMISSIONS_URL = 'https://leetcode.com/submissions/';

const wss = new WebSocket.Server({ port: PORT }, () => {
  console.log(`✅ WebSocket server started on ws://localhost:${PORT}`);
});

wss.on('connection', ws => {
  ws.on('message', async message => {
    const config = JSON.parse(message);
    try {
      await autoSubmit(config, ws);
    } catch (error) {
      console.error("❌ Error in autoSubmit:", error);
      ws.send(JSON.stringify({ type: 'error', error: error.message }));
    }
  });
});

async function autoSubmit(config, ws) {
  const { username, password, maxCount, selectedLevels } = config;

  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await login(page, username, password);

  const submittedProblems = await getSubmittedProblems(page);
  const localFiles = fs.readdirSync('./codes');
  let total = 0;
  let completed = 0;

  const problems = [];

  for (const file of localFiles) {
    const fullPath = path.join('./codes', file);
    if (fs.lstatSync(fullPath).isFile() && file.endsWith('.json')) {
      const content = fs.readFileSync(fullPath);
      const { problemName, language, code, level } = JSON.parse(content);
      if (
        !submittedProblems.includes(problemName.toLowerCase()) &&
        selectedLevels.includes(level.toLowerCase())
      ) {
        problems.push({ problemName, language, code });
      }
    }
  }

  total = Math.min(maxCount, problems.length);
  let count = 0;

  for (const problem of problems) {
    if (count >= maxCount) break;
    try {
      await submitSolution(page, problem);
      count++;
      completed++;
      ws.send(JSON.stringify({
        type: 'progress',
        completed,
        total,
        title: problem.problemName
      }));
    } catch (err) {
      console.error(`❌ Failed to submit ${problem.problemName}:`, err);
    }
  }

  ws.send(JSON.stringify({ type: 'done', completed }));
  await browser.close();
}

async function login(page, username, password) {
  await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });
  await page.type("#id_login", username);
  await page.type("#id_password", password);
  await Promise.all([
    page.click("button[type='submit']"),
    page.waitForNavigation({ waitUntil: "networkidle2" }),
  ]);
  console.log("✅ Logged in");
}

async function getSubmittedProblems(page) {
  await page.goto(SUBMISSIONS_URL, { waitUntil: 'networkidle2' });
  const submitted = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a'));
    return links
      .filter(link => link.href.includes('/problems/'))
      .map(link => link.href.split('/problems/')[1].split('/')[0].toLowerCase());
  });
  return Array.from(new Set(submitted));
}

async function submitSolution(page, { problemName, language, code }) {
  const problemUrl = `https://leetcode.com/problems/${problemName}/`;
  await page.goto(problemUrl, { waitUntil: "networkidle2" });

  // Click into the code editor tab
  await page.waitForSelector('div[data-cy="code-editor"]', { timeout: 10000 });

  // Select language (optional: adjust for your setup)
  await page.click('button[title="Select programming language"]');
  await page.waitForSelector(`div[role="menu"] div`, { timeout: 5000 });
  await page.evaluate((language) => {
    const langBtn = [...document.querySelectorAll('div[role="menu"] div')]
      .find(el => el.innerText.toLowerCase().includes(language.toLowerCase()));
    if (langBtn) langBtn.click();
  }, language);

  // Focus editor and paste code
  await page.click('.view-lines');
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');

  await page.keyboard.type(code, { delay: 1 });

  // Click submit
  await page.click('button[data-cy="submit-code-btn"]');
  await page.waitForSelector('.text-success', { timeout: 30000 });

  console.log(`✅ Submitted: ${problemName}`);
}

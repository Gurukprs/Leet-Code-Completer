const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const USERNAME = "your_leetcode_username";
const PASSWORD = "your_leetcode_password";

const LOGIN_URL = "https://leetcode.com/accounts/login/";
const PROBLEM_BASE_URL = "https://leetcode.com/problems/";
const SOLUTIONS_PATH = "./solutions_json";
const DELAY_BETWEEN_SUBMISSIONS_MS = 60_000; // 1 minute

// Map language keywords to LeetCode dropdown text
const langMap = {
    cpp: "C++",
    python: "Python3",
    java: "Java",
    js: "JavaScript"
};

// Read all JSON solutions
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

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function login(page) {
    await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });

    await page.type("#id_login", USERNAME, { delay: 50 });
    await page.type("#id_password", PASSWORD, { delay: 50 });

    await Promise.all([
        page.click("button[type='submit']"),
        page.waitForNavigation({ waitUntil: "networkidle2" })
    ]);

    console.log("🔐 Logged in successfully.");
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
    const url = PROBLEM_BASE_URL + slug;
    await page.goto(url, { waitUntil: "networkidle2" });
    console.log(`🌐 Opened: ${slug}`);

    await setLanguage(page, langKey);
    await page.waitForSelector(".monaco-editor textarea");

    // Focus and paste code
    const editor = await page.$(".monaco-editor textarea");
    await editor.click({ clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.keyboard.type(code, { delay: 5 });

    await page.click("button:has-text('Submit')");
    await page.waitForTimeout(5000);
}

async function getUnsolvedMediumHardProblems() {
    const res = await axios.get("https://leetcode.com/api/problems/algorithms/");
    return res.data.stat_status_pairs
        .filter(entry =>
            (!entry.status || entry.status === "notac") &&
            (entry.difficulty.level === 2 || entry.difficulty.level === 3)
        )
        .map(entry => ({
            slug: entry.stat.question__title_slug,
            title: entry.stat.question__title,
            level: entry.difficulty.level === 2 ? "Medium" : "Hard"
        }));
}

// Main Execution
(async () => {
    const solutionsMap = loadSolutionsMap();
    const unsolvedProblems = await getUnsolvedMediumHardProblems();
    const problemsToSubmit = unsolvedProblems.filter(p => solutionsMap.has(p.slug));

    console.log(`🧠 Found ${problemsToSubmit.length} matching unsolved problems to submit.\n`);

    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    page.setViewport({ width: 1366, height: 768 });

    await login(page);

    for (let i = 0; i < problemsToSubmit.length; i++) {
        const { slug, title, level } = problemsToSubmit[i];
        const { code, language } = solutionsMap.get(slug);

        console.log(`\n🚀 [${i + 1}/${problemsToSubmit.length}] Submitting: ${title} (${level})`);

        try {
            await submitProblem(page, slug, code, language);
            console.log("✅ Submitted:", slug);
        } catch (err) {
            console.error("❌ Error submitting", slug, "-", err.message);
        }

        if (i < problemsToSubmit.length - 1) {
            console.log(`⏳ Waiting ${DELAY_BETWEEN_SUBMISSIONS_MS / 1000} seconds...`);
            await delay(DELAY_BETWEEN_SUBMISSIONS_MS);
        }
    }

    await browser.close();
    console.log("\n🎉 All submissions complete.");
})();

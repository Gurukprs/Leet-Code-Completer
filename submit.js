const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const LEETCODE_LOGIN_URL = "https://leetcode.com/accounts/login/";
const BASE_PROBLEM_URL = "https://leetcode.com/problems/";
const USERNAME = "your_username";
const PASSWORD = "your_password";

const DELAY_BETWEEN_SUBMISSIONS_MS = 60_000; // 1 minute

// Get unsolved medium/hard problems
async function getUnsolvedProblems() {
    const res = await axios.get("https://leetcode.com/api/problems/algorithms/");
    const data = res.data.stat_status_pairs;

    return data
        .filter((entry) =>
            (entry.status === null || entry.status === "notac") && // unsolved
            (entry.difficulty.level === 2 || entry.difficulty.level === 3) // medium/hard
        )
        .map((entry) => ({
            slug: entry.stat.question__title_slug,
            title: entry.stat.question__title,
            level: entry.difficulty.level === 2 ? "Medium" : "Hard"
        }));
}

async function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function login(page) {
    await page.goto(LEETCODE_LOGIN_URL, { waitUntil: "networkidle2" });

    await page.type("#id_login", USERNAME, { delay: 50 });
    await page.type("#id_password", PASSWORD, { delay: 50 });
    await Promise.all([
        page.click("button[type='submit']"),
        page.waitForNavigation({ waitUntil: "networkidle2" })
    ]);
}

async function submitProblem(page, slug, code) {
    const url = BASE_PROBLEM_URL + slug;
    await page.goto(url, { waitUntil: "networkidle2" });

    // Open the code tab if necessary
    await page.waitForSelector(".monaco-editor");

    // Focus the Monaco editor
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");

    await page.type(".monaco-editor textarea", code, { delay: 5 });

    // Submit the solution
    await page.click("button:has-text('Submit')");
    await page.waitForTimeout(5000); // wait for result to appear
}

(async () => {
    const unsolved = await getUnsolvedProblems();
    const availableSolutions = fs.readdirSync("./solutions").map(f => f.replace(".js", ""));

    const problemsToSubmit = unsolved.filter((p) => availableSolutions.includes(p.slug));

    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    await login(page);

    for (let i = 0; i < problemsToSubmit.length; i++) {
        const { slug, title, level } = problemsToSubmit[i];
        const code = fs.readFileSync(path.join("solutions", `${slug}.js`), "utf-8");

        console.log(`\n[${i + 1}/${problemsToSubmit.length}] Submitting ${title} (${level})`);
        try {
            await submitProblem(page, slug, code);
            console.log("✅ Submitted:", slug);
        } catch (err) {
            console.error("❌ Failed:", slug, err.message);
        }

        if (i !== problemsToSubmit.length - 1) {
            console.log(`⏳ Waiting ${DELAY_BETWEEN_SUBMISSIONS_MS / 1000} sec...`);
            await delay(DELAY_BETWEEN_SUBMISSIONS_MS);
        }
    }

    await browser.close();
})();

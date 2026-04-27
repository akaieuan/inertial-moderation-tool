#!/usr/bin/env node
// Capture screenshots of the inertial-app dev server for README.
// Uses puppeteer (downloads its own Chromium on first run).
// Usage: node scripts/capture-screenshots.mjs

import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import puppeteer from "puppeteer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "docs", "screenshots");
const baseUrl = process.env.PREVIEW_URL ?? "http://localhost:5173";

const VIEWPORT = { width: 1600, height: 1000, deviceScaleFactor: 2 };

const ROUTES = [
  { id: "dashboard", label: "Dashboard" },
  { id: "queue", label: "Queue" },
  { id: "pipelines", label: "Pipelines" },
  { id: "skills", label: "Skills" },
  { id: "compliance", label: "Compliance" },
  { id: "insights", label: "Insights" },
];

async function clickSidebar(page, label) {
  await page.evaluate((label) => {
    const buttons = document.querySelectorAll("aside button, aside a");
    for (const b of buttons) {
      if (b.textContent && b.textContent.trim().includes(label)) {
        b.click();
        return true;
      }
    }
    // fallback
    for (const b of document.querySelectorAll("button, a")) {
      if (b.textContent && b.textContent.trim() === label) {
        b.click();
        return true;
      }
    }
    return false;
  }, label);
  await new Promise((r) => setTimeout(r, 600));
}

async function setRightPanel(page, value) {
  await page.evaluate((v) => {
    if (v === null) window.localStorage.removeItem("inertial-right-panel");
    else window.localStorage.setItem("inertial-right-panel", v);
  }, value);
  await page.reload({ waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 800));
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: VIEWPORT,
    executablePath:
      process.env.CHROME_PATH ??
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);

    await page.goto(baseUrl, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 1200));

    // Ensure no panel is open initially
    await setRightPanel(page, null);

    for (const r of ROUTES) {
      await clickSidebar(page, r.label);
      await new Promise((r) => setTimeout(r, 600));
      const path = join(outDir, `${r.id}.png`);
      await page.screenshot({ path, type: "png", fullPage: false });
      console.log(`captured ${r.id} → ${path}`);
    }

    // Dashboard with chat panel open
    await clickSidebar(page, "Dashboard");
    await setRightPanel(page, "chat");
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({
      path: join(outDir, "dashboard-chat-panel.png"),
      type: "png",
    });
    console.log("captured dashboard-chat-panel");

    // Queue with deck open (review session inline)
    await setRightPanel(page, null);
    await clickSidebar(page, "Queue");
    await new Promise((r) => setTimeout(r, 800));
    // Click first row inside the first deck
    await page.evaluate(() => {
      const decks = document.querySelectorAll("main button");
      for (const b of decks) {
        const txt = (b.textContent || "").trim();
        if (txt.includes("Marcus Lee") || txt.includes("@anon_throwaway")) {
          b.click();
          return;
        }
      }
    });
    await new Promise((r) => setTimeout(r, 700));
    await page.screenshot({
      path: join(outDir, "queue-review.png"),
      type: "png",
    });
    console.log("captured queue-review");

    // Skills with create sheet open
    await clickSidebar(page, "Skills");
    await new Promise((r) => setTimeout(r, 600));
    await page.evaluate(() => {
      for (const b of document.querySelectorAll("button")) {
        if ((b.textContent || "").trim() === "Add skill") {
          b.click();
          return;
        }
      }
    });
    await new Promise((r) => setTimeout(r, 700));
    await page.screenshot({
      path: join(outDir, "skills-create-sheet.png"),
      type: "png",
    });
    console.log("captured skills-create-sheet");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

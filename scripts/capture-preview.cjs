const { chromium } = require(
  "C:/Users/sachi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);

async function capture() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const results = {};

  for (const viewport of [
    { name: "desktop", width: 1440, height: 1100 },
    { name: "reported", width: 823, height: 653 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    const consoleErrors = [];
    let mobileNavigation;
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1900);
    await page.screenshot({
      path: `forgeweb-preview-${viewport.name}.png`,
      fullPage: false,
    });
    if (viewport.name === "desktop") {
      await page.screenshot({ path: "forgeweb-preview-full.png", fullPage: true });

      for (const section of ["system", "languages", "graph", "integrations", "start"]) {
        await page.locator(`#${section}`).scrollIntoViewIfNeeded();
        await page.waitForTimeout(650);
        await page.screenshot({ path: `forgeweb-preview-${section}.png`, fullPage: false });
      }
    }

    if (viewport.name === "reported") {
      await page.locator("#languages").scrollIntoViewIfNeeded();
      await page.waitForTimeout(650);
      await page.screenshot({ path: "forgeweb-preview-reported-languages.png", fullPage: false });
    }

    if (viewport.name !== "desktop") {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await page.waitForTimeout(250);
      mobileNavigation = await page.locator("#mobile-navigation").evaluate((element) => ({
        visible: element.getBoundingClientRect().height > 0,
        links: element.querySelectorAll("a").length,
      }));
    }

    results[viewport.name] = await page.evaluate(() => ({
      title: document.title,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      heading: document.querySelector("h1")?.textContent,
    }));
    results[viewport.name].consoleErrors = consoleErrors;
    if (mobileNavigation) results[viewport.name].mobileNavigation = mobileNavigation;
    await page.close();
  }

  const reducedPage = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
  });
  const reducedMotionErrors = [];
  reducedPage.on("console", (message) => {
    if (message.type() === "error") reducedMotionErrors.push(message.text());
  });
  await reducedPage.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await reducedPage.waitForTimeout(500);
  results.reducedMotion = {
    renders: (await reducedPage.locator("h1").textContent())?.includes("ForgeWeb secure full-stack") ?? false,
    consoleErrors: reducedMotionErrors,
  };
  await reducedPage.close();

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}

capture().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

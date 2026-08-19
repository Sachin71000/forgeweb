const { chromium } = require(
  "C:/Users/sachi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);

const viewports = [
  { name: "phone-320", width: 320, height: 568 },
  { name: "phone-360", width: 360, height: 800 },
  { name: "phone-390", width: 390, height: 844 },
  { name: "phone-430", width: 430, height: 932 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "reported-823", width: 823, height: 653 },
  { name: "tablet-1024", width: 1024, height: 768 },
  { name: "laptop-1280", width: 1280, height: 800 },
  { name: "desktop-1440", width: 1440, height: 1100 },
  { name: "wide-1920", width: 1920, height: 1080 },
];

let generatedProjectId = "";

function recordRuntimeFailures(page) {
  const failures = [];
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`page: ${error.message}`));
  page.on("requestfailed", (request) => failures.push(`request: ${request.url()} — ${request.failure()?.errorText}`));
  return failures;
}

async function auditViewport(browser, viewport) {
  const page = await browser.newPage({ viewport });
  const runtimeFailures = recordRuntimeFailures(page);
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const metrics = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height,
      };
    };
    const parseRgb = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const isDark = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const [r = 255, g = 255, b = 255] = parseRgb(getComputedStyle(element).backgroundColor);
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return luminance < 48;
    };

    const hero = rect("#top");
    const heroBadge = rect(".hero-badge");
    const kineticStatement = rect(".kinetic-statement");
    const nav = rect(".site-nav-shell");
    const navBrand = rect(".site-nav-brand");
    const desktopNav = rect(".site-nav-desktop");
    const navCta = rect(".site-nav-cta");
    const navMenu = rect(".site-nav-menu");
    const copy = rect(".hero-support-copy");
    const chat = rect(".hero-chat-shell");
    const chatElement = document.querySelector(".hero-chat-shell");
    const languageHeading = rect(".language-showcase-heading");
    const firstLanguagePanel = rect(".language-panel");
    const floatingCanvases = document.querySelectorAll(".floating-lines-backdrop canvas");
    const failures = [];
    const tolerance = 1.5;
    const horizontallyInside = (box) => box && box.left >= -tolerance && box.right <= innerWidth + tolerance;

    if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) failures.push("horizontal document overflow");
    if (!hero || hero.height < innerHeight - 1) failures.push("hero is shorter than the viewport");
    if (!horizontallyInside(heroBadge)) failures.push("hero badge is horizontally clipped");
    if (!horizontallyInside(chat)) failures.push("chat composer is horizontally clipped");
    if (Number.parseFloat(getComputedStyle(chatElement).getPropertyValue("--border-glow-opacity")) < 0.99) {
      failures.push("chat border glow is not visible by default");
    }
    if (!horizontallyInside(nav)) failures.push("navigation shell is horizontally clipped");
    if (chat && Math.abs(chat.left + chat.width / 2 - innerWidth / 2) > 2) failures.push("chat composer is not centered");
    if (innerWidth >= 900) {
      if (!desktopNav || desktopNav.width < 1) failures.push("desktop GooeyNav is not visible");
      if (!navCta || navCta.width < 1) failures.push("desktop start CTA is not visible");
      if (navBrand && desktopNav && navBrand.right > desktopNav.left - 12) failures.push("brand overlaps GooeyNav");
      if (desktopNav && navCta && desktopNav.right > navCta.left - 12) failures.push("GooeyNav overlaps start CTA");
      if (nav && Math.abs(nav.left + nav.width / 2 - innerWidth / 2) > 2) failures.push("navigation shell is not centered");
    } else {
      if (desktopNav && desktopNav.width > 0) failures.push("desktop GooeyNav is visible on mobile");
      if (!navMenu || navMenu.width < 1) failures.push("mobile navigation trigger is not visible");
    }
    if (heroBadge && nav && heroBadge.top < nav.bottom + 16) failures.push("hero badge collides with navigation");
    if (heroBadge && kineticStatement && heroBadge.bottom > kineticStatement.top - 12) failures.push("hero badge collides with the kinetic statement");
    if (kineticStatement && copy && kineticStatement.bottom > copy.top - 12) failures.push("kinetic statement collides with supporting copy");
    if (copy && chat && copy.bottom > chat.top - 20) failures.push("supporting copy collides with chat composer");
    if (languageHeading && firstLanguagePanel && languageHeading.bottom > firstLanguagePanel.top - 24) {
      failures.push("language heading collides with the first panel");
    }
    if (floatingCanvases.length !== 1) failures.push(`expected one global WebGL canvas, found ${floatingCanvases.length}`);
    const floatingCanvas = floatingCanvases[0];
    if (floatingCanvas && (floatingCanvas.clientWidth !== innerWidth || floatingCanvas.clientHeight !== innerHeight)) {
      failures.push("global WebGL canvas does not cover the viewport");
    }

    const darkSelectors = ["#top", "#system", "#languages", "#graph", "#integrations", "#start", "footer"];
    const nonDarkSections = darkSelectors.filter((selector) => !isDark(selector));
    if (nonDarkSections.length) failures.push(`light section backgrounds: ${nonDarkSections.join(", ")}`);

    const ids = Array.from(document.querySelectorAll("[id]"), (element) => element.id);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicateIds.length) failures.push(`duplicate ids: ${[...new Set(duplicateIds)].join(", ")}`);
    if (document.querySelectorAll("h1").length !== 1) failures.push("page must contain exactly one h1");

    const unnamedInteractive = Array.from(document.querySelectorAll("a, button, textarea, input"))
      .filter((element) => {
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const name = element.getAttribute("aria-label") || element.textContent?.trim() || element.getAttribute("placeholder");
        return !name;
      }).length;
    if (unnamedInteractive) failures.push(`${unnamedInteractive} visible interactive controls have no accessible name`);

    return {
      failures,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      heroHeight: Math.round(hero?.height || 0),
      heroBadge: heroBadge && { left: Math.round(heroBadge.left), right: Math.round(heroBadge.right), width: Math.round(heroBadge.width) },
      chat: chat && {
        left: Math.round(chat.left),
        right: Math.round(chat.right),
        width: Math.round(chat.width),
        centerDelta: Math.round((chat.left + chat.width / 2 - innerWidth / 2) * 10) / 10,
      },
      navigation: nav && {
        left: Math.round(nav.left),
        right: Math.round(nav.right),
        width: Math.round(nav.width),
        desktopWidth: Math.round(desktopNav?.width || 0),
      },
      languageGap: languageHeading && firstLanguagePanel ? Math.round(firstLanguagePanel.top - languageHeading.bottom) : null,
      floatingCanvasCount: floatingCanvases.length,
    };
  });

  if (viewport.width < 900) {
    const menu = page.getByRole("button", { name: "Open navigation" });
    await menu.click();
    const mobileNav = page.locator("#mobile-navigation");
    if (!(await mobileNav.isVisible())) metrics.failures.push("mobile navigation did not open");
    if ((await mobileNav.getByRole("link").count()) !== 5) metrics.failures.push("mobile navigation does not contain five links");
    await page.getByRole("button", { name: "Close navigation" }).click();
    await mobileNav.waitFor({ state: "hidden", timeout: 800 }).catch(() => {});
    if (await mobileNav.isVisible()) metrics.failures.push("mobile navigation did not close after its exit transition");
  }

  if (viewport.name === "desktop-1440") {
    const chatBounds = await page.locator(".hero-chat-shell").boundingBox();
    if (chatBounds) {
      await page.mouse.move(chatBounds.x + chatBounds.width / 2, chatBounds.y + chatBounds.height / 2);
      await page.mouse.move(4, 4);
      await page.waitForTimeout(80);
      const glowAfterLeave = await page.locator(".hero-chat-shell").evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).getPropertyValue("--border-glow-opacity")),
      );
      if (glowAfterLeave < 0.99) metrics.failures.push("chat border glow disappears after pointer leave");
    }
  }

  if (viewport.name === "phone-390") {
    await page.getByRole("button", { name: "Inventory OS" }).click();
    const prompt = await page.locator("#product-prompt").inputValue();
    if (!prompt.includes("inventory os")) metrics.failures.push("quick prompt did not update the composer");
    const createdResponse = page.waitForResponse((response) => response.url().endsWith("/api/builds") && response.request().method() === "POST");
    await page.getByRole("button", { name: /Forge this idea/i }).click();
    const projectId = (await (await createdResponse).json()).build.projectId;
    generatedProjectId = projectId;
    await page.waitForTimeout(200);
    if (!(await page.locator(".hero-build-status").textContent()).includes("Master spec")) metrics.failures.push("build status did not start");
    await page.locator(".build-proposal").waitFor({ state: "visible", timeout: 5000 });
    if ((await page.locator(".build-requirements-grid article").count()) < 6) metrics.failures.push("architecture proposal is missing requirements");
    if ((await page.locator(".build-capabilities a").count()) !== 5) metrics.failures.push("customer-app capability registry is incomplete");
    if (!(await page.locator(".architecture-file").textContent()).includes("ARCHITECTURE.md")) metrics.failures.push("architecture file is not visible");
    if ((await page.locator(".generated-artifacts").count()) !== 0) metrics.failures.push("source artifacts appeared before confirmation");
    await page.getByRole("button", { name: /Confirm requirements & generate/i }).click();
    await page.locator(".generated-artifacts").waitFor({ state: "visible", timeout: 5000 });
    await page.waitForFunction(() => document.querySelector(".hero-build-status")?.textContent?.includes("Validated"), null, { timeout: 5000 });
    const generatedPaths = await page.locator(".generated-artifacts code").allTextContents();
    if (!generatedPaths.some((path) => path.startsWith("frontend/"))) metrics.failures.push("generated frontend artifacts are missing");
    if (!generatedPaths.some((path) => path.startsWith("backend/"))) metrics.failures.push("generated backend artifacts are missing");

    await page.getByRole("tab", { name: "Preview" }).click();
    const previewFrame = page.locator(".preview-stage iframe");
    await previewFrame.waitFor({ state: "visible", timeout: 5000 });
    await page.waitForFunction(() => {
      const frame = document.querySelector(".preview-stage iframe");
      return frame?.getAttribute("src")?.startsWith("/api/projects/");
    });
    await previewFrame.contentFrame().locator("h1").waitFor({ state: "visible", timeout: 5000 });
    const generatedHeading = await previewFrame.contentFrame().locator("h1").textContent();
    if (!generatedHeading?.toLowerCase().includes("inventory")) metrics.failures.push("preview is not rendering the generated frontend");
    const desktopWidthSetting = await previewFrame.evaluate((element) => element.style.width);
    await page.getByRole("button", { name: "Mobile", exact: true }).click();
    const mobileWidthSetting = await previewFrame.evaluate((element) => element.style.width);
    if (desktopWidthSetting !== "100%" || mobileWidthSetting !== "390px") metrics.failures.push("preview device controls did not change viewport width");
    const oldPreviewSrc = await previewFrame.getAttribute("src");
    await page.getByRole("button", { name: /Refresh preview/i }).click();
    await page.waitForFunction((oldSrc) => document.querySelector(".preview-stage iframe")?.getAttribute("src") !== oldSrc, oldPreviewSrc);

    await page.getByRole("button", { name: "Edit with AI" }).click();
    await page.getByLabel("What would you like to change?").fill("Make the dashboard cards smaller and modern. Keep everything else unchanged.");
    await page.getByRole("button", { name: "Apply changes" }).click();
    await page.locator(".changed-files").waitFor({ state: "visible", timeout: 5000 });
    const scopedFiles = await page.locator(".changed-files code").allTextContents();
    if (scopedFiles.length !== 2 || !scopedFiles.every((path) => path.startsWith("frontend/"))) metrics.failures.push(`frontend edit changed unexpected files: ${scopedFiles.join(", ")}`);
    if (!(await page.locator(".workspace-tabs").textContent()).includes("Version 2")) metrics.failures.push("successful AI edit did not create Version 2");
    await page.getByRole("button", { name: "Close edit panel" }).click();

    await page.getByRole("tab", { name: "Versions" }).click();
    const versionOne = page.locator(".workspace-versions article").filter({ hasText: "Version 1" });
    await versionOne.getByRole("button", { name: /Restore/ }).click();
    await page.waitForFunction(() => document.querySelector(".workspace-tabs")?.textContent?.includes("Version 1"));
    if (!(await versionOne.locator("strong").textContent()).includes("Current")) metrics.failures.push("restored version is not marked current");

    await page.getByRole("tab", { name: "Preview" }).click();
    await page.getByRole("button", { name: "Edit with AI" }).click();
    await page.getByLabel("What would you like to change?").fill("Remove the closing brace and make invalid broken code.");
    await page.getByRole("button", { name: "Apply changes" }).click();
    const safetyError = page.locator(".workspace-edit-panel .workspace-error");
    await safetyError.waitFor({ state: "visible", timeout: 5000 });
    if (!(await safetyError.textContent()).includes("previous working version remains safe")) metrics.failures.push("failed edit does not explain version safety");
    if (!(await page.locator(".workspace-tabs").textContent()).includes("Version 1")) metrics.failures.push("failed edit replaced the working version");
    await page.getByRole("button", { name: "Close edit panel" }).click();

    await page.getByRole("button", { name: "Make ZIP" }).click();
    await page.getByText("Ready to export", { exact: true }).waitFor({ state: "visible", timeout: 5000 });
    if (!(await page.locator(".export-summary").textContent()).includes("12")) metrics.failures.push("export summary does not report generated files");
    await page.getByRole("button", { name: "Close export summary" }).click();

    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: /My Projects/ }).click();
    const persistedProject = page.locator(".project-library-list article").filter({ hasText: projectId });
    await persistedProject.waitFor({ state: "visible", timeout: 5000 });
    await persistedProject.getByRole("button", { name: "Open" }).click();
    await page.locator(".project-workspace").waitFor({ state: "visible", timeout: 5000 });
    await page.waitForFunction(() => document.querySelector(".workspace-tabs")?.textContent?.includes("Version 1"), null, { timeout: 5000 });
    if (!(await page.locator(".workspace-tabs").textContent()).includes("Version 1")) metrics.failures.push("reopened project did not retain the restored version");

    for (const expectedFailure of [/\/preview\?.*net::ERR_ABORTED/, /status of 422 \(Unprocessable Entity\)/]) {
      const index = runtimeFailures.findIndex((failure) => expectedFailure.test(failure));
      if (index >= 0) runtimeFailures.splice(index, 1);
    }
  }

  if (["phone-390", "reported-823", "desktop-1440"].includes(viewport.name)) {
    await page.screenshot({ path: `ui-audit-${viewport.name}.png`, fullPage: false });
  }

  metrics.failures.push(...runtimeFailures);
  await page.close();
  return metrics;
}

async function auditGooeyNav(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const runtimeFailures = recordRuntimeFailures(page);
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  const links = page.locator(".gooey-nav-container a");
  for (const index of [1, 2, 3, 4, 2]) {
    await links.nth(index).click();
    await page.waitForTimeout(70);
    await page.evaluate(() => scrollTo(0, 0));
  }
  const duringAnimation = await page.locator(".gooey-nav-container .particle").count();
  await page.waitForTimeout(1900);
  const state = await page.evaluate(() => ({
    particleCount: document.querySelectorAll(".gooey-nav-container .particle").length,
    activeItems: document.querySelectorAll(".gooey-nav-container li.active").length,
    currentLinks: document.querySelectorAll('.gooey-nav-container a[aria-current="page"]').length,
    activeLabel: document.querySelector(".gooey-nav-container li.active")?.textContent?.trim(),
  }));
  await page.close();
  return {
    failures: [
      ...(duringAnimation === 0 ? ["GooeyNav did not create particles"] : []),
      ...(state.particleCount !== 0 ? [`${state.particleCount} GooeyNav particles remained after animation`] : []),
      ...(state.activeItems !== 1 ? [`expected one active GooeyNav item, found ${state.activeItems}`] : []),
      ...(state.currentLinks !== 1 ? [`expected one aria-current GooeyNav link, found ${state.currentLinks}`] : []),
      ...(state.activeLabel !== "Languages" ? [`GooeyNav active state ended on ${state.activeLabel || "no item"}`] : []),
      ...runtimeFailures,
    ],
    duringAnimation,
    ...state,
  };
}

async function auditGeneratedPreview(browser, projectId) {
  if (!projectId) return { failures: ["generated project id was not captured"] };
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const runtimeFailures = recordRuntimeFailures(page);
  await page.goto(`http://127.0.0.1:5173/api/projects/${projectId}/preview`, { waitUntil: "networkidle" });
  const desktop = await page.evaluate(() => {
    const nav = document.querySelector(".app-nav")?.getBoundingClientRect();
    const navLinks = document.querySelector(".nav-links")?.getBoundingClientRect();
    const brand = document.querySelector(".brand")?.getBoundingClientRect();
    const hero = document.querySelector(".app-hero")?.getBoundingClientRect();
    const metrics = Array.from(document.querySelectorAll(".metric-card"), (element) => element.getBoundingClientRect());
    const workspace = document.querySelector(".workspace-layout")?.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      navVisible: Boolean(nav && nav.height >= 60),
      navLinkCount: document.querySelectorAll(".nav-links a").length,
      navCenterDelta: navLinks ? Math.abs(navLinks.left + navLinks.width / 2 - innerWidth / 2) : 999,
      brandInside: Boolean(brand && brand.left >= 0 && brand.right <= innerWidth),
      heroInside: Boolean(hero && hero.left >= 0 && hero.right <= innerWidth),
      metricCount: metrics.length,
      metricSameRow: metrics.length === 4 && Math.max(...metrics.map((rect) => rect.top)) - Math.min(...metrics.map((rect) => rect.top)) < 2,
      workspaceVisible: Boolean(workspace && workspace.width > 800),
      template: document.documentElement.dataset.forgewebTemplate,
    };
  });
  await page.screenshot({ path: "generated-project-preview.png", fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    navHidden: getComputedStyle(document.querySelector(".nav-links")).display === "none",
    brandVisible: document.querySelector(".brand")?.getBoundingClientRect().width > 90,
    heroColumns: getComputedStyle(document.querySelector(".app-hero")).gridTemplateColumns.split(" ").length,
  }));
  await page.close();
  return {
    failures: [
      ...(desktop.overflow ? ["professional preview overflows on desktop"] : []),
      ...(!desktop.navVisible ? ["professional navigation is not visible"] : []),
      ...(desktop.navLinkCount !== 4 ? [`expected four generated navigation links, found ${desktop.navLinkCount}`] : []),
      ...(desktop.navCenterDelta > 3 ? [`generated navigation is off-center by ${desktop.navCenterDelta}px`] : []),
      ...(!desktop.brandInside || !desktop.heroInside ? ["generated brand or hero is clipped"] : []),
      ...(desktop.metricCount !== 4 || !desktop.metricSameRow ? ["desktop metric cards are not aligned in one row"] : []),
      ...(!desktop.workspaceVisible ? ["generated workspace layout is missing"] : []),
      ...(desktop.template !== "forgeweb-professional-v2" ? ["professional template marker is missing"] : []),
      ...(mobile.overflow ? ["professional preview overflows on mobile"] : []),
      ...(!mobile.navHidden || !mobile.brandVisible ? ["generated mobile navigation does not adapt correctly"] : []),
      ...(mobile.heroColumns !== 1 ? ["generated hero does not collapse to one mobile column"] : []),
      ...runtimeFailures,
    ],
    desktop,
    mobile,
  };
}

async function auditKeyboard(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const runtimeFailures = recordRuntimeFailures(page);
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  const stops = [];
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("Tab");
    stops.push(await page.evaluate(() => {
      const element = document.activeElement;
      if (!element) return { name: "", focusVisible: false };
      const style = getComputedStyle(element);
      return {
        name: element.getAttribute("aria-label") || element.textContent?.trim().replace(/\s+/g, " ").slice(0, 40) || element.tagName,
        focusVisible: style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0,
      };
    }));
  }
  await page.close();
  return {
    failures: [
      ...(stops.some((stop) => !stop.name) ? ["keyboard reached an unnamed control"] : []),
      ...(stops.some((stop) => !stop.focusVisible) ? ["one or more initial keyboard stops lack a visible focus indicator"] : []),
      ...runtimeFailures,
    ],
    stops,
  };
}

async function auditReducedMotion(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const runtimeFailures = recordRuntimeFailures(page);
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const matches = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const heading = await page.locator("h1").textContent();
  await page.close();
  return {
    failures: [
      ...(!matches ? ["reduced-motion media query did not match"] : []),
      ...(!heading?.includes("ForgeWeb secure full-stack") ? ["semantic heading did not render in reduced-motion mode"] : []),
      ...runtimeFailures,
    ],
  };
}

async function auditWebGLPerformance(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const runtimeFailures = recordRuntimeFailures(page);
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  for (const point of [0.1, 0.35, 0.6, 0.85, 1]) {
    await page.mouse.move(1440 * point, 900 * (1 - point));
    await page.evaluate((ratio) => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * ratio), point);
    await page.waitForTimeout(120);
  }
  const frameRate = await page.evaluate(() => new Promise((resolve) => {
    const samples = [];
    const sample = (time) => {
      samples.push(time);
      if (samples.length < 46) requestAnimationFrame(sample);
      else {
        const elapsed = samples.at(-1) - samples[0];
        resolve(Math.round(((samples.length - 1) * 1000 / elapsed) * 10) / 10);
      }
    };
    requestAnimationFrame(sample);
  }));
  const canvasCount = await page.locator(".floating-lines-backdrop canvas").count();
  await page.close();
  return {
    failures: [
      ...(frameRate < 30 ? [`WebGL animation measured ${frameRate}fps`] : []),
      ...(canvasCount !== 1 ? [`WebGL canvas count changed during scroll: ${canvasCount}`] : []),
      ...runtimeFailures,
    ],
    frameRate,
    canvasCount,
  };
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const results = { viewports: {}, generatedPreview: null, gooeyNav: null, keyboard: null, reducedMotion: null, performance: null };
  for (const viewport of viewports) results.viewports[viewport.name] = await auditViewport(browser, viewport);
  results.generatedPreview = await auditGeneratedPreview(browser, generatedProjectId);
  results.gooeyNav = await auditGooeyNav(browser);
  results.keyboard = await auditKeyboard(browser);
  results.reducedMotion = await auditReducedMotion(browser);
  results.performance = await auditWebGLPerformance(browser);
  await browser.close();

  const failures = [
    ...Object.entries(results.viewports).flatMap(([name, result]) => result.failures.map((failure) => `${name}: ${failure}`)),
    ...results.generatedPreview.failures.map((failure) => `generated-preview: ${failure}`),
    ...results.gooeyNav.failures.map((failure) => `gooey-nav: ${failure}`),
    ...results.keyboard.failures.map((failure) => `keyboard: ${failure}`),
    ...results.reducedMotion.failures.map((failure) => `reduced-motion: ${failure}`),
    ...results.performance.failures.map((failure) => `performance: ${failure}`),
  ];
  console.log(JSON.stringify({ ...results, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

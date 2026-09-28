const { chromium } = require(
  "C:/Users/sachi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const { execFileSync } = require("node:child_process");

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
    if (!chatElement) failures.push("chat composer is missing");
    else if (Number.parseFloat(getComputedStyle(chatElement).getPropertyValue("--border-glow-opacity")) < 0.99) {
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
    const menuTop = await page.locator(".project-library-trigger").evaluate((element) => element.getBoundingClientRect().top);
    await page.evaluate(() => scrollTo(0, Math.min(innerHeight, document.documentElement.scrollHeight - innerHeight)));
    await page.waitForTimeout(80);
    const menuTopAfterScroll = await page.locator(".project-library-trigger").evaluate((element) => element.getBoundingClientRect().top);
    if (menuTopAfterScroll >= menuTop - 20) metrics.failures.push("project history launcher follows the page instead of staying on the first screen");
    await page.evaluate(() => scrollTo(0, 0));
  }

  if (viewport.name === "phone-390") {
    await page.getByRole("button", { name: /My Projects/ }).click();
    const historyDrawer = page.locator("#project-history-drawer");
    await historyDrawer.waitFor({ state: "visible", timeout: 3000 });
    if (!(await historyDrawer.getByRole("button", { name: "New chat" }).isVisible())) metrics.failures.push("project history drawer is missing New chat");
    if (!(await historyDrawer.getByText("History", { exact: true }).isVisible())) metrics.failures.push("project history drawer is missing history navigation");
    await historyDrawer.getByRole("button", { name: "Close projects" }).click();
    await historyDrawer.waitFor({ state: "hidden", timeout: 1000 });

    await page.getByRole("button", { name: "Inventory OS" }).click();
    const prompt = await page.locator("#product-prompt").inputValue();
    if (!prompt.includes("inventory os")) metrics.failures.push("quick prompt did not update the composer");
    const createdResponse = page.waitForResponse((response) => response.url().endsWith("/api/builds") && response.request().method() === "POST");
    await page.getByRole("button", { name: /Forge this idea/i }).click();
    const projectId = (await (await createdResponse).json()).build.projectId;
    generatedProjectId = projectId;
    await page.waitForTimeout(200);
    if (!(await page.locator(".hero-build-status").textContent()).includes("Master spec")) metrics.failures.push("build status did not start");
    await page.locator(".build-proposal").waitFor({ state: "visible", timeout: 180000 });
    const approvedProductName = (await page.locator(".build-proposal-heading h2").textContent())?.trim();
    if (!approvedProductName) metrics.failures.push("architecture proposal is missing the approved product name");
    if ((await page.locator(".build-requirements-grid article").count()) < 6) metrics.failures.push("architecture proposal is missing requirements");
    if ((await page.locator(".build-capabilities a").count()) !== 5) metrics.failures.push("customer-app capability registry is incomplete");
    if (!(await page.locator(".architecture-file").textContent()).includes("ARCHITECTURE.md")) metrics.failures.push("architecture file is not visible");
    if ((await page.locator(".generated-artifacts").count()) !== 0) metrics.failures.push("source artifacts appeared before confirmation");
    await page.getByRole("button", { name: "Edit prompt" }).click();
    await page.waitForTimeout(450);
    const activePromptId = await page.evaluate(() => document.activeElement?.id);
    if (activePromptId !== "product-prompt") metrics.failures.push("Edit prompt did not return focus to the prompt composer");
    await page.getByRole("button", { name: /Confirm requirements & generate/i }).click();
    await page.locator(".generated-artifacts").waitFor({ state: "visible", timeout: 240000 });
    const generatedPaths = await page.locator(".workspace-file-list button span").allTextContents();
    if (!generatedPaths.some((path) => path.startsWith("frontend/"))) metrics.failures.push("generated frontend artifacts are missing");
    if (!generatedPaths.some((path) => path.startsWith("backend/"))) metrics.failures.push("generated backend artifacts are missing");
    await page.locator(".workspace-file-list button").filter({ hasText: "ARCHITECTURE.md" }).click();
    const architectureSource = await page.locator(".workspace-code-viewer pre").textContent();
    if (!architectureSource?.includes("Architecture")) metrics.failures.push("selecting ARCHITECTURE.md did not open its stored source");
    await page.locator(".workspace-file-list button").filter({ hasText: "frontend/src/App.tsx" }).click();
    const appSource = await page.locator(".workspace-code-viewer pre").textContent();
    if (!appSource?.includes("export default function App")) metrics.failures.push("selecting App.tsx did not open its complete source");

    await page.getByRole("tab", { name: "Preview" }).click();
    const previewFrame = page.locator(".preview-stage iframe");
    await previewFrame.waitFor({ state: "visible", timeout: 5000 });
    await previewFrame.contentFrame().locator("h1").waitFor({ state: "visible", timeout: 15000 });
    const generatedHeading = await previewFrame.contentFrame().locator("h1").textContent();
    const generatedBody = await previewFrame.contentFrame().locator("body").textContent();
    if (!generatedHeading?.trim() || !approvedProductName || !generatedBody?.toLowerCase().includes(approvedProductName.toLowerCase())) metrics.failures.push("preview is not rendering the architecture-approved product identity");
    await previewFrame.contentFrame().getByRole("button", { name: /Search/i }).click();
    await previewFrame.contentFrame().locator("[role=status]").waitFor({ state: "visible", timeout: 1000 });
    if (!(await previewFrame.contentFrame().locator("[role=status]").textContent()).includes("Search is ready")) metrics.failures.push("generated preview search button is not functional");
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
    if (!(await page.locator(".export-summary").textContent()).includes(String(generatedPaths.length))) metrics.failures.push("export summary does not report generated files");
    await page.getByRole("button", { name: "Close export summary" }).click();

    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: /My Projects/ }).click();
    const persistedProject = page.locator(".project-library-list article").first();
    await persistedProject.waitFor({ state: "visible", timeout: 5000 });
    await persistedProject.locator(".project-history-open").click();
    await page.locator(".project-workspace").waitFor({ state: "visible", timeout: 5000 });
    await page.waitForFunction(() => document.querySelector(".workspace-tabs")?.textContent?.includes("Version 1"), null, { timeout: 5000 });
    if (!(await page.locator(".workspace-tabs").textContent()).includes("Version 1")) metrics.failures.push("reopened project did not retain the restored version");

    const expectedFailures = [/\/preview\?.*net::ERR_ABORTED/, /status of 422 \(Unprocessable Entity\)/];
    for (let index = runtimeFailures.length - 1; index >= 0; index -= 1) {
      if (expectedFailures.some((expectedFailure) => expectedFailure.test(runtimeFailures[index]))) runtimeFailures.splice(index, 1);
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
    const nav = document.querySelector(".adaptive-nav")?.getBoundingClientRect();
    const navLinks = document.querySelector(".adaptive-nav nav")?.getBoundingClientRect();
    const brand = document.querySelector(".wordmark")?.getBoundingClientRect();
    const hero = document.querySelector(".adaptive-hero")?.getBoundingClientRect();
    const metrics = Array.from(document.querySelectorAll(".metric-row article"), (element) => element.getBoundingClientRect());
    const workspace = document.querySelector(".workspace")?.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      navVisible: Boolean(nav && nav.height >= 60),
      navLinkCount: document.querySelectorAll(".adaptive-nav nav a").length,
      navCenterDelta: navLinks ? Math.max(0, navLinks.right - innerWidth) : 999,
      brandInside: Boolean(brand && brand.left >= 0 && brand.right <= innerWidth),
      heroInside: Boolean(hero && hero.left >= 0 && hero.right <= innerWidth),
      metricCount: metrics.length,
      metricSameRow: metrics.length === 3 && Math.max(...metrics.map((rect) => rect.top)) - Math.min(...metrics.map((rect) => rect.top)) < 2,
      workspaceVisible: Boolean(workspace && workspace.width > 600),
      template: document.documentElement.dataset.forgewebTemplate,
    };
  });
  await page.screenshot({ path: "generated-project-preview.png", fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    navHidden: getComputedStyle(document.querySelector(".adaptive-nav nav")).display === "none",
    brandVisible: Boolean(document.querySelector(".wordmark")?.getClientRects().length),
    heroColumns: getComputedStyle(document.querySelector(".adaptive-hero")).gridTemplateColumns.split(" ").length,
  }));
  await page.close();
  return {
    failures: [
      ...(desktop.overflow ? ["professional preview overflows on desktop"] : []),
      ...(!desktop.navVisible ? ["professional navigation is not visible"] : []),
      ...(desktop.navLinkCount !== 4 ? [`expected four generated navigation links, found ${desktop.navLinkCount}`] : []),
      ...(desktop.navCenterDelta > 3 ? [`generated navigation is off-center by ${desktop.navCenterDelta}px`] : []),
      ...(!desktop.brandInside || !desktop.heroInside ? ["generated brand or hero is clipped"] : []),
      ...(desktop.metricCount !== 3 || !desktop.metricSameRow ? ["desktop metric cards are not aligned in one row"] : []),
      ...(!desktop.workspaceVisible ? ["generated workspace layout is missing"] : []),
      ...(desktop.template !== "forgeweb-adaptive-product-v1" ? ["adaptive product template marker is missing"] : []),
      ...(mobile.overflow ? ["professional preview overflows on mobile"] : []),
      ...(!mobile.navHidden || !mobile.brandVisible ? ["generated mobile navigation does not adapt correctly"] : []),
      ...(mobile.heroColumns !== 1 ? ["generated hero does not collapse to one mobile column"] : []),
      ...runtimeFailures,
    ],
    desktop,
    mobile,
  };
}

async function auditProjectDeletion(browser, projectId) {
  if (!projectId) return { failures: ["generated project id was not captured for deletion"] };
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const runtimeFailures = recordRuntimeFailures(page);
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /My Projects/ }).click();
  const project = page.locator(`[data-project-id="${projectId}"]`);
  await project.waitFor({ state: "visible", timeout: 5000 });
  page.once("dialog", (dialog) => dialog.accept());
  await project.locator(".project-history-delete").click();
  await project.waitFor({ state: "detached", timeout: 5000 });
  const deletedResponse = await page.request.get(`http://127.0.0.1:5173/api/projects/${projectId}`);
  await page.close();
  return { failures: [...(deletedResponse.status() !== 404 ? ["deleted project is still available from the API"] : []), ...runtimeFailures], status: deletedResponse.status() };
}

async function auditCommercePreview(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const runtimeFailures = recordRuntimeFailures(page);
  const fixture = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "scripts/commerce-preview-fixture.ts"], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  }));
  const proposal = fixture.proposal;
  const failures = [];
  if (proposal.status !== "awaiting_confirmation") failures.push(`commerce proposal ended in ${proposal.status}`);
  if (proposal.specification?.productKind !== "commerce") failures.push("commerce prompt was not classified as commerce");
  if (!proposal.specification?.productName || /^(Modern|ForgeWeb Application|Dashboard)$/i.test(proposal.specification.productName)) failures.push(`commerce project received a generic name: ${proposal.specification?.productName || "nothing"}`);
  if (proposal.specification?.requirements?.length !== 11) failures.push("commerce architecture does not contain eleven product requirements");
  if (!proposal.specification?.architecture?.frontend?.pages?.some((pageName) => /checkout/i.test(pageName))) failures.push("commerce architecture is missing checkout");
  if ((proposal.filePaths || []).length !== 0) failures.push("commerce source appeared before architecture confirmation");

  await page.setContent(fixture.preview, { waitUntil: "load" });
  await page.locator('.product-card .add-cart').first().click();
  await page.locator('.product-card [data-action="wishlist"]').first().click();
  await page.locator('.deal-tabs [data-action="deal-tab"]').nth(1).click();
  await page.waitForTimeout(240);
  const interactions = await page.evaluate(() => ({
    cartCount: document.querySelector('[aria-label="Shopping cart"] b')?.textContent,
    wishlistSaved: document.querySelector('.product-card [data-action="wishlist"]')?.classList.contains('is-saved'),
    activeDealTab: document.querySelector('.deal-tabs .is-active')?.textContent,
    toastVisible: document.querySelector('.commerce-toast')?.classList.contains('is-visible'),
  }));
  const desktop = await page.evaluate(() => {
    const categories = Array.from(document.querySelectorAll(".category-card"), (element) => element.getBoundingClientRect());
    const products = Array.from(document.querySelectorAll(".product-card"), (element) => element.getBoundingClientRect());
    const hero = document.querySelector(".commerce-hero")?.getBoundingClientRect();
    return {
      template: document.documentElement.dataset.forgewebTemplate,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      headerVisible: Boolean(document.querySelector(".store-header")?.getBoundingClientRect().height),
      searchVisible: Boolean(document.querySelector(".global-search")?.getBoundingClientRect().width),
      customerLinks: document.querySelectorAll(".account-nav a").length,
      categoryCount: categories.length,
      categoriesSameRow: categories.length === 6 && Math.max(...categories.map((rect) => rect.top)) - Math.min(...categories.map((rect) => rect.top)) < 2,
      productCount: products.length,
      productsSameRow: products.length === 5 && Math.max(...products.map((rect) => rect.top)) - Math.min(...products.map((rect) => rect.top)) < 2,
      heroInside: Boolean(hero && hero.left >= 0 && hero.right <= innerWidth),
      hasAdmin: Boolean(document.querySelector(".admin-link")),
      hasCart: Boolean(document.querySelector('[aria-label="Shopping cart"]')),
      hasWishlist: Boolean(document.querySelector('[aria-label="Wishlist"]')),
    };
  });
  await page.screenshot({ path: "generated-ecommerce-preview.png", fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(180);
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    searchVisible: document.querySelector(".global-search")?.getBoundingClientRect().width > 160,
    categoryColumns: document.querySelector(".category-grid") ? getComputedStyle(document.querySelector(".category-grid")).gridTemplateColumns.split(" ").length : 0,
    productScrollable: document.querySelector(".product-grid") ? document.querySelector(".product-grid").scrollWidth > document.querySelector(".product-grid").clientWidth : false,
    cartVisible: document.querySelector('[aria-label="Shopping cart"]') ? getComputedStyle(document.querySelector('[aria-label="Shopping cart"]')).display !== "none" : false,
  }));
  await page.close();
  failures.push(
    ...(desktop.template !== "forgeweb-commerce-v1" ? ["commerce template marker is missing"] : []),
    ...(desktop.overflow ? ["commerce preview overflows on desktop"] : []),
    ...(!desktop.headerVisible || !desktop.searchVisible ? ["commerce header or global search is missing"] : []),
    ...(desktop.customerLinks !== 4 || !desktop.hasCart || !desktop.hasWishlist ? ["commerce customer navigation is incomplete"] : []),
    ...(desktop.categoryCount !== 6 || !desktop.categoriesSameRow ? ["commerce category grid is not aligned"] : []),
    ...(desktop.productCount !== 5 || !desktop.productsSameRow ? ["commerce product grid is not aligned"] : []),
    ...(!desktop.heroInside || !desktop.hasAdmin ? ["commerce hero or admin entry is missing"] : []),
    ...(mobile.overflow ? ["commerce preview overflows on mobile"] : []),
    ...(!mobile.searchVisible || mobile.categoryColumns !== 2 ? ["commerce mobile search or category grid does not adapt"] : []),
    ...(!mobile.productScrollable || !mobile.cartVisible ? ["commerce mobile products or cart are not usable"] : []),
    ...(interactions.cartCount !== "3" || !interactions.wishlistSaved || interactions.activeDealTab !== "Best sellers" || !interactions.toastVisible ? ["commerce cart, wishlist, or filter-tab interactions are not functional"] : []),
    ...runtimeFailures,
  );
  return { failures, projectId: fixture.projectId, desktop, mobile, interactions };
}

async function auditRestaurantPreview(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const runtimeFailures = recordRuntimeFailures(page);
  const fixture = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "scripts/restaurant-preview-fixture.ts"], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  }));
  const failures = [];
  const proposal = fixture.proposal;
  if (proposal.status !== "awaiting_confirmation") failures.push(`restaurant proposal ended in ${proposal.status}`);
  if (proposal.specification?.productKind !== "restaurant") failures.push("restaurant prompt was not classified as restaurant");
  if ((proposal.specification?.requirements?.length || 0) < 6 || proposal.specification.requirements.length > 12) failures.push("restaurant architecture requirement count is outside 6–12");

  const byPath = new Map(fixture.files.map((file) => [file.path, file.content]));
  let contract;
  try {
    contract = JSON.parse(byPath.get("shared/api-contract.json"));
  } catch {
    failures.push("shared API contract is missing or invalid JSON");
  }
  const expectedRoutes = [
    "GET /api/menu",
    "GET /api/availability",
    "POST /api/reservations",
    "GET /api/reservations/{reservation_id}",
    "DELETE /api/reservations/{reservation_id}",
  ];
  const contractRoutes = new Set((contract?.routes || []).map((route) => `${route.method} ${route.path}`));
  for (const route of expectedRoutes) if (!contractRoutes.has(route)) failures.push(`shared API contract is missing ${route}`);
  const backendRoutes = byPath.get("backend/app/api/routes.py") || "";
  const frontendApp = byPath.get("frontend/src/App.tsx") || "";
  if (!backendRoutes.includes('@router.get("/availability")') || !backendRoutes.includes('@router.post("/reservations"')) failures.push("FastAPI reservation routes are missing");
  if (!frontendApp.includes('/api/availability?date=') || !frontendApp.includes('"/api/reservations"')) failures.push("React reservation form is not connected to the FastAPI contract");

  await page.setContent(fixture.preview, { waitUntil: "load" });
  const modal = page.locator("#booking");
  if (await modal.isVisible()) failures.push("reservation modal is visible before a reserve action");

  await page.getByRole("button", { name: "Reserve a table" }).click();
  if (!(await modal.isVisible())) failures.push("Reserve a table did not open the reservation dialog");
  await page.getByRole("button", { name: "Check availability" }).click();
  if ((await page.getByRole("button", { name: "Check availability" }).count()) !== 1) failures.push("empty required date incorrectly advanced reservation");
  await page.locator('input[name="date"]').fill("2030-08-29");
  await page.locator('select[name="time"]').selectOption("7:30 PM");
  await page.locator('select[name="guests"]').selectOption("4 guests");
  await page.getByRole("button", { name: "Check availability" }).click();
  const availabilityMessage = await page.getByRole("status").textContent();
  if (!availabilityMessage?.includes("available at 7:30 PM for 4 guests")) failures.push("availability action did not show date/time/guest feedback");
  if (!(await page.getByRole("button", { name: "Confirm reservation" }).isVisible())) failures.push("availability action did not advance to confirmation");
  await page.getByRole("button", { name: "Confirm reservation" }).click();
  const confirmationMessage = await page.getByRole("status").textContent();
  const reservedButton = page.getByRole("button", { name: "Reserved" });
  if (!confirmationMessage?.includes("Reservation confirmed") || !/Reference: FW-[A-Z0-9]{6}/.test(confirmationMessage)) failures.push("reservation confirmation or reference is missing");
  if (!(await reservedButton.isDisabled())) failures.push("confirmed reservation button remains actionable");
  await page.getByRole("button", { name: "Close reservation" }).click();
  if (await modal.isVisible()) failures.push("close reservation did not hide the dialog");

  await page.getByRole("button", { name: "Find a table" }).click();
  await page.keyboard.press("Escape");
  if (await modal.isVisible()) failures.push("Escape did not close the reservation dialog");
  await page.getByRole("button", { name: "Small plates" }).click();
  const visibleDishes = await page.locator(".dish-grid article:visible").count();
  if (visibleDishes !== 1) failures.push(`menu filter left ${visibleDishes} visible dishes instead of one`);
  await page.locator('nav a[href="#story"]').click();
  if ((await page.evaluate(() => location.hash)) !== "#story") failures.push("restaurant navigation link did not update the target");

  const desktop = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    navLinks: document.querySelectorAll(".site-header nav a").length,
    h1Count: document.querySelectorAll("h1").length,
    initialModalHiddenRule: Array.from(document.styleSheets).some((sheet) => {
      try { return Array.from(sheet.cssRules).some((rule) => rule.cssText.includes(".modal-backdrop[hidden]") && rule.cssText.includes("display: none")); } catch { return false; }
    }),
  }));
  desktop.template = fixture.preview.includes("forgeweb-restaurant-v2") ? "forgeweb-restaurant-v2" : "missing";
  await page.screenshot({ path: "generated-restaurant-preview.png", fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    navHidden: getComputedStyle(document.querySelector(".site-header nav")).display === "none",
    dishColumns: getComputedStyle(document.querySelector(".dish-grid")).gridTemplateColumns.split(" ").length,
    reserveVisible: document.querySelector(".site-header > button")?.getBoundingClientRect().width > 0,
  }));
  await page.close();
  failures.push(
    ...(desktop.template !== "forgeweb-restaurant-v2" ? ["restaurant v2 template marker is missing"] : []),
    ...(desktop.overflow || mobile.overflow ? ["restaurant preview has horizontal overflow"] : []),
    ...(desktop.navLinks !== 3 || desktop.h1Count !== 1 ? ["restaurant semantic navigation or heading structure is incomplete"] : []),
    ...(!desktop.initialModalHiddenRule ? ["reservation modal lacks an explicit hidden-state CSS rule"] : []),
    ...(!mobile.navHidden || mobile.dishColumns !== 1 || !mobile.reserveVisible ? ["restaurant mobile layout is not usable"] : []),
    ...runtimeFailures,
  );
  return { failures, projectId: fixture.projectId, desktop, mobile, contractRouteCount: contractRoutes.size };
}

async function auditGenericPreview(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const runtimeFailures = recordRuntimeFailures(page);
  const fixture = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "scripts/generic-preview-fixture.ts"], {
    cwd: process.cwd(), encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
  }));
  const failures = [];
  if (fixture.proposal.specification?.productKind !== "generic") failures.push("basic client website was not classified as generic");
  await page.setContent(fixture.preview, { waitUntil: "load" });
  const desktop = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    template: document.documentElement.dataset.forgewebTemplate,
    nav: Array.from(document.querySelectorAll(".site-nav nav a"), (link) => link.textContent?.trim()),
    missingTargets: Array.from(document.querySelectorAll('.site-nav nav a[href^="#"]')).filter((link) => !document.querySelector(link.getAttribute("href"))).length,
    repeatedDashboard: /Keep every|84\.6%|Live workspace · Preview data/.test(document.body.textContent || ""),
  }));
  await page.screenshot({ path: "generated-generic-preview.png", fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  const mobileNav = page.locator(".site-nav nav");
  if (!(await mobileNav.isVisible())) failures.push("generic website mobile navigation did not open");
  await mobileNav.getByRole("link", { name: "Contact" }).click();
  if (await mobileNav.isVisible()) failures.push("generic website mobile navigation did not close after selection");
  await page.locator('input[name="name"]').fill("Asha Client");
  await page.locator('input[name="email"]').fill("asha@example.com");
  await page.locator('textarea[name="message"]').fill("Please tell me more about your services.");
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await page.getByRole("status").filter({ hasText: "received" }).waitFor({ state: "visible", timeout: 2000 });
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    hash: location.hash,
    status: document.querySelector('[role="status"]')?.textContent,
  }));
  await page.close();
  failures.push(
    ...(desktop.template !== "forgeweb-client-site-v2" ? ["generic client-site template marker is missing"] : []),
    ...(desktop.overflow || mobile.overflow ? ["generic client website overflows"] : []),
    ...(desktop.nav.join(",") !== "Home,About,Services,Contact" || desktop.missingTargets ? ["generic client navigation does not match the prompt or has missing targets"] : []),
    ...(desktop.repeatedDashboard ? ["generic client website reused dashboard content"] : []),
    ...(mobile.hash !== "#contact" || !mobile.status?.includes("received") ? ["generic client navigation or enquiry interaction failed"] : []),
    ...runtimeFailures,
  );
  return { failures, desktop, mobile, projectId: fixture.projectId };
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
  const results = { viewports: {}, generatedPreview: null, projectDeletion: null, commercePreview: null, restaurantPreview: null, genericPreview: null, gooeyNav: null, keyboard: null, reducedMotion: null, performance: null };
  for (const viewport of viewports) results.viewports[viewport.name] = await auditViewport(browser, viewport);
  results.generatedPreview = await auditGeneratedPreview(browser, generatedProjectId);
  results.projectDeletion = await auditProjectDeletion(browser, generatedProjectId);
  results.commercePreview = await auditCommercePreview(browser);
  results.restaurantPreview = await auditRestaurantPreview(browser);
  results.genericPreview = await auditGenericPreview(browser);
  results.gooeyNav = await auditGooeyNav(browser);
  results.keyboard = await auditKeyboard(browser);
  results.reducedMotion = await auditReducedMotion(browser);
  results.performance = await auditWebGLPerformance(browser);
  await browser.close();

  const failures = [
    ...Object.entries(results.viewports).flatMap(([name, result]) => result.failures.map((failure) => `${name}: ${failure}`)),
    ...results.generatedPreview.failures.map((failure) => `generated-preview: ${failure}`),
    ...results.projectDeletion.failures.map((failure) => `project-deletion: ${failure}`),
    ...results.commercePreview.failures.map((failure) => `commerce-preview: ${failure}`),
    ...results.restaurantPreview.failures.map((failure) => `restaurant-preview: ${failure}`),
    ...results.genericPreview.failures.map((failure) => `generic-preview: ${failure}`),
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

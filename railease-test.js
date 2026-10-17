const { Builder, By, until } = require("selenium-webdriver");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const URL = "https://railease-india-eyq2.vercel.app/";
const OUT = path.join(__dirname, "screenshots");

fs.mkdirSync(OUT, { recursive: true });

async function firstVisible(driver, locators, timeout = 12000) {
  return driver.wait(async () => {
    for (const locator of locators) {
      const elements = await driver.findElements(locator);
      for (const element of elements) {
        if (await element.isDisplayed()) return element;
      }
    }
    return false;
  }, timeout, "Could not find a visible matching element");
}

async function fillField(driver, field, value) {
  const element = await firstVisible(driver, [
    By.css(`input[name="${field}"]`),
    By.css(`input[id="${field}"]`),
    By.css(`input[placeholder*="${field}" i]`),
    By.css(`input[aria-label*="${field}" i]`)
  ]);

  await element.clear();
  await element.sendKeys(value);
  return element;
}

async function screenshot(driver, browser, name) {
  const data = await driver.takeScreenshot();
  fs.writeFileSync(
    path.join(OUT, `${browser}-${name}.png`),
    data,
    "base64"
  );
}

async function runBrowser(browser) {
  let driver;
  const result = {
    browser,
    title: "NOT RUN",
    sourceDestination: "NOT RUN",
    date: "NOT RUN",
    search: "NOT RUN",
    validation: "NOT RUN",
    screenshot: "NOT SAVED",
    error: ""
  };

  try {
    driver = await new Builder()
      .forBrowser(browser)
      .build();

    await driver.manage().window().setRect({
      width: 1365,
      height: 900
    });

    await driver.manage().setTimeouts({
      pageLoad: 30000,
      implicit: 0
    });

    // 1. Open RailEase.
    await driver.get(URL);

    await driver.wait(
      until.elementLocated(By.css("body")),
      15000
    );

    await driver.wait(async () => {
      const text = await driver.findElement(By.css("body"))
        .getText();
      return text.includes("Search Trains");
    }, 15000);

    const title = await driver.getTitle();
    assert.ok(title.trim().length > 0, "Page title must not be empty");
    result.title = `PASS: ${title}`;

    await screenshot(driver, browser, "home");

    // 2. Inspect the actual booking form controls.
    // These diagnostics help identify selectors if the UI changes.
    const controls = await driver.executeScript(() =>
      Array.from(document.querySelectorAll("input, select, button"))
        .filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })
        .map(el => ({
          tag: el.tagName,
          type: el.type || "",
          name: el.name || "",
          id: el.id || "",
          placeholder: el.placeholder || "",
          ariaLabel: el.getAttribute("aria-label") || "",
          text: (el.innerText || el.value || "").trim()
        }))
    );

    console.log(`\n${browser} visible controls:`);
    console.log(JSON.stringify(controls, null, 2));

    // 3. Find source and destination using common attributes.
    // If these fail, use the printed diagnostics to adapt selectors.
    const source = await firstVisible(driver, [
      By.css('input[placeholder*="from" i]'),
      By.css('input[aria-label*="from" i]'),
      By.css('input[name*="from" i]'),
      By.css('input[id*="from" i]')
    ]);

    await source.click();
    await source.sendKeys("Nashik");

    // Allow station autocomplete to render, if present.
    await driver.sleep(700);

    const sourceOptions = await driver.findElements(
      By.css('[role="option"]')
    );

    if (sourceOptions.length > 0) {
      await sourceOptions[0].click();
    }

    const destination = await firstVisible(driver, [
      By.css('input[placeholder*="to" i]'),
      By.css('input[aria-label*="to" i]'),
      By.css('input[name*="to" i]'),
      By.css('input[id*="to" i]')
    ]);

    await destination.click();
    await destination.sendKeys("Mumbai");

    await driver.sleep(700);

    const destinationOptions = await driver.findElements(
      By.css('[role="option"]')
    );

    if (destinationOptions.length > 0) {
      await destinationOptions[0].click();
    }

    result.sourceDestination = "PASS: fields populated";

    // 4. Set journey date if the page exposes an input[type=date].
    const dateInputs = await driver.findElements(
      By.css('input[type="date"]')
    );

    if (dateInputs.length > 0) {
      const dateInput = dateInputs.find
        ? dateInputs[0]
        : dateInputs[0];

      await dateInput.clear();
      await dateInput.sendKeys("2026-11-15");
      result.date = "PASS: date entered";
    } else {
      result.date =
        "REVIEW: inspect visible controls for the date-picker selector";
    }

    await screenshot(driver, browser, "form");

    // 5. Search for trains.
    const searchButton = await firstVisible(driver, [
      By.xpath(
        "//button[contains(translate(normalize-space(.)," +
        "'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')," +
        "'search trains')]"
      ),
      By.xpath(
        "//input[@type='submit' and contains(" +
        "translate(@value,'ABCDEFGHIJKLMNOPQRSTUVWXYZ'," +
        "'abcdefghijklmnopqrstuvwxyz'),'search')]"
      )
    ]);

    await searchButton.click();

    // Wait for a meaningful change instead of assuming a fixed delay.
    await driver.wait(async () => {
      const body = await driver.findElement(By.css("body")).getText();
      const url = await driver.getCurrentUrl();

      return url !== URL ||
        /train|result|available|no trains|error|journey/i.test(body);
    }, 15000).catch(() => null);

    await screenshot(driver, browser, "search");

    const finalBody = await driver.findElement(By.css("body")).getText();

    result.search =
      /train|result|available|no trains|journey/i.test(finalBody)
        ? "REVIEW: inspect search output and verify result cards"
        : "FAIL: no recognizable search output";

    // 6. Empty-destination validation.
    // Reload to reset the form.
    await driver.get(URL);

    const emptyDestination = await firstVisible(driver, [
      By.css('input[placeholder*="to" i]'),
      By.css('input[aria-label*="to" i]'),
      By.css('input[name*="to" i]'),
      By.css('input[id*="to" i]')
    ]);

    const emptySearch = await firstVisible(driver, [
      By.xpath("//button[contains(., 'Search Trains')]")
    ]);

    await emptySearch.click();

    await driver.sleep(500);

    const validationBody = await driver.findElement(
      By.css("body")
    ).getText();

    const validity = await emptyDestination.getAttribute("required");

    const validationMessage = await emptyDestination
      .getAttribute("validationMessage")
      .catch(() => "");

    const nativeValidity = await driver.executeScript(
      el => ({
        valid: el.checkValidity(),
        message: el.validationMessage
      }),
      emptyDestination
    );

    if (validity !== null || !nativeValidity.valid ||
        /required|destination|select.*station|enter.*station/i
          .test(validationBody)) {
      result.validation =
        "PASS: destination validation detected";
    } else {
      result.validation =
        "FAIL/REVIEW: no destination validation detected";
    }

    console.log("Validation details:", {
      requiredAttribute: validity,
      validationMessage,
      nativeValidity
    });

    await screenshot(driver, browser, "validation");
    result.screenshot = "Saved";

  } catch (error) {
    result.error = error.message;
    console.error(`${browser} failed: ${error.message}`);

    if (driver) {
      await screenshot(driver, browser, "error").catch(() => {});
    }
  } finally {
    if (driver) await driver.quit().catch(() => {});

    fs.appendFileSync(
      path.join(__dirname, "results.jsonl"),
      JSON.stringify(result) + "\n"
    );

    console.log("RESULT:", result);
  }

  return result;
}

(async () => {
  const allResults = [];

  for (const browser of ["chrome", "firefox", "MicrosoftEdge"]) {
    allResults.push(await runBrowser(browser));
  }

  console.log("\nFINAL CROSS-BROWSER SUMMARY");
  console.table(allResults);
})();
const { Builder, By, until } = require("selenium-webdriver");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const BASE_URL = "https://blazedemo.com/";
const OUTPUT_DIR = path.join(__dirname, "screenshots");

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function runTest(browserName) {
  let driver;
  const report = {
    browser: browserName,
    title: "NOT RUN",
    searchResults: "NOT RUN",
    validation: "NOT RUN",
    dateSelection: "NOT SUPPORTED BY DEMO",
    error: null
  };

  try {
    driver = await new Builder()
      .forBrowser(browserName)
      .build();

    await driver.manage().window().maximize();
    await driver.manage().setTimeouts({
      implicit: 0,
      pageLoad: 30000
    });


    await driver.get(BASE_URL);
    await driver.wait(
      until.elementLocated(By.name("fromPort")),
      15000
    );

    const title = await driver.getTitle();
    assert.match(title, /BlazeDemo/i);
    report.title = "PASS";

//changes add comment
    const from = await driver.findElement(By.name("fromPort"));
    const to = await driver.findElement(By.name("toPort"));

    await from.sendKeys("Boston");
    await to.sendKeys("London");


    report.dateSelection = "N/A - no date field on BlazeDemo";


    await driver.findElement(
      By.css("input[type='submit']")
    ).click();

    await driver.wait(
      until.urlContains("reserve.php"),
      15000
    );

    const results = await driver.wait(async () => {
      const rows = await driver.findElements(
        By.css("table tbody tr")
      );
      return rows.length > 0 ? rows : false;
    }, 15000);

    assert.ok(results.length > 0, "Flight results should appear");
    report.searchResults = `PASS (${results.length} rows)`;

    await driver.takeScreenshot().then(data => {
      fs.writeFileSync(
        path.join(OUTPUT_DIR, `${browserName}-search.png`),
        data,
        "base64"
      );
    });

    await driver.get(BASE_URL);

    await driver.wait(
      until.elementLocated(By.name("toPort")),
      10000
    );

    await driver.findElement(By.name("fromPort"))
      .sendKeys("Boston");

    await driver.findElement(
      By.css("input[type='submit']")
    ).click();

    const currentUrl = await driver.getCurrentUrl();
    const destination = await driver.findElement(
      By.name("toPort")
    ).catch(() => null);

    if (destination) {
      const required = await destination.getAttribute("required");
      report.validation = required
        ? "PASS - destination is required"
        : "FAIL - no required attribute";
    } else {
      report.validation =
        currentUrl.includes("reserve.php")
          ? "FAIL - empty destination was submitted"
          : "REVIEW - destination validation not confirmed";
    }

    await driver.takeScreenshot().then(data => {
      fs.writeFileSync(
        path.join(OUTPUT_DIR, `${browserName}-validation.png`),
        data,
        "base64"
      );
    });

  } catch (error) {
    report.error = error.message;
    console.error(`[${browserName}]`, error.message);

    if (driver) {
      try {
        await driver.takeScreenshot().then(data => {
          fs.writeFileSync(
            path.join(OUTPUT_DIR, `${browserName}-error.png`),
            data,
            "base64"
          );
        });
      } catch (_) {
        // Screenshot might be unavailable if the browser failed to start.
      }
    }
  } finally {
    if (driver) {
      await driver.quit().catch(() => {});
    }

    console.log(JSON.stringify(report, null, 2));

    fs.appendFileSync(
      path.join(__dirname, "test-results.jsonl"),
      JSON.stringify(report) + "\n"
    );
  }

  return report;
}

(async () => {
  const browsers = ["chrome", "firefox", "MicrosoftEdge"];
  const reports = [];

  for (const browser of browsers) {
    console.log(`\nRunning tests on ${browser}...`);
    reports.push(await runTest(browser));
  }

  console.log("\nCROSS-BROWSER SUMMARY");
  console.table(reports);
})();
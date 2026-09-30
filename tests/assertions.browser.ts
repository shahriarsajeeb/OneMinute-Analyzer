import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { runAssertions } from "../lib/server/browser/assertions";
import type { RegionalRule } from "../lib/regional-rules";

test("browser assertions detect wrong price, hidden elements, ambiguous selectors, and language", async()=>{
 const browser=await chromium.launch();
 try {
 const page=await browser.newPage();
 await page.setContent('<html lang="pt-BR"><body><p id="price">$29.00</p><div id="consent" hidden>Consent</div><i class="duplicate"></i><i class="duplicate"></i></body></html>');
 const base:RegionalRule={id:"price",country:"br",name:"Brazil price",kind:"text",selector:"#price",expected:"R$ 149,00"};
 const checks=await runAssertions(page,[base,{...base,id:"lang",kind:"language",expected:"pt-BR"},{...base,id:"consent",kind:"visible",selector:"#consent"},{...base,id:"ambiguous",selector:".duplicate"}],100);
 assert.deepEqual(checks.map(check=>check.outcome),["fail","pass","fail","inconclusive"]);
 assert.equal(checks[0].observed,"$29.00");
 await page.locator('#price').evaluate(element=>element.textContent='R$   149,00');
 assert.equal((await runAssertions(page,[base],100))[0].outcome,"pass");
 assert.equal((await runAssertions(page,[{...base,selector:'['}],100))[0].outcome,"inconclusive");
 await page.evaluate(()=>setTimeout(()=>{document.querySelector<HTMLElement>('#consent')!.hidden=false},100));
 assert.equal((await runAssertions(page,[{...base,kind:'hidden',selector:'#consent'}],400))[0].outcome,'fail');
 } finally {await browser.close()}
});

test("page-text checks find visible text anywhere, report shown prices on a miss, and ignore hidden text", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<html><body><aside>
      <span>🇹🇭 Regional pricing for Thailand</span>
      <strong>$29.99</strong> <s>$39.99</s>
      <p>฿1,000&nbsp;THB (approximate) · charged in USD</p>
      <p hidden>Regional pricing for Brazil</p></aside></body></html>`);
    const base: RegionalRule = { id: "a", country: "th", name: "Badge", kind: "contains", selector: "", expected: "regional pricing   for thailand" };
    const [badge, thb, missing, absent, hidden, scoped] = await runAssertions(page, [
      base,
      { ...base, id: "b", expected: "฿1,000 THB" },
      { ...base, id: "c", expected: "R$ 149,00" },
      { ...base, id: "d", kind: "not-contains", expected: "Regional pricing for Brazil" },
      { ...base, id: "e", expected: "Regional pricing for Brazil" },
      { ...base, id: "f", selector: "strong", expected: "$39.99" },
    ], 100);
    assert.equal(badge.outcome, "pass");
    assert.match(badge.observed, /Regional pricing for Thailand/);
    assert.equal(thb.outcome, "pass");
    assert.equal(missing.outcome, "fail");
    assert.equal(missing.observed, "Not shown. Prices on the page: $29.99, $39.99, THB 1000");
    assert.equal(absent.outcome, "pass");
    assert.equal(hidden.outcome, "fail");
    assert.equal(scoped.outcome, "fail");
  } finally {
    await browser.close();
  }
});

test("price checks read prices on the page instead of matching digits in other text", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<html><body>
      <h1>Get the Complete Source Code</h1><div class="card">$39.99</div>
      <p>2 free 30-minute sessions are included with your purchase.</p></body></html>`);
    const base: RegionalRule = { id: "p", country: "sg", name: "Price", kind: "price", selector: "", expected: "30" };
    const [thirty, exact, wrongCurrency, scopedMiss] = await runAssertions(page, [
      base,
      { ...base, id: "q", expected: "$39.99" },
      { ...base, id: "r", expected: "S$39.99" },
      { ...base, id: "s", selector: "p", expected: "39.99" },
    ], 100);
    assert.equal(thirty.outcome, "fail");
    assert.equal(thirty.observed, "Prices on the page: $39.99");
    assert.equal(exact.outcome, "pass");
    assert.equal(exact.observed, "$39.99");
    // "$" can mean SGD or USD: the amount matches but the currency is unconfirmed.
    assert.equal(wrongCurrency.outcome, "inconclusive");
    assert.match(wrongCurrency.reason, /currency could not be confirmed/);
    assert.equal(scopedMiss.outcome, "fail");
    assert.equal(scopedMiss.observed, "No prices found on the selected element");
  } finally {
    await browser.close();
  }
});

test("detects bot walls on short pages but not a long page that mentions access denied", async () => {
  const { detectAccessIssue } = await import("../lib/server/browser/assertions");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent("<title>Just a moment...</title><p>Checking</p>");
    assert.match((await detectAccessIssue(page)) ?? "", /title: “Just a moment/);
    await page.setContent('<title>Shop</title><div class="g-recaptcha"></div>');
    assert.ok(await detectAccessIssue(page));
    await page.setContent(`<title>Docs</title><p>${"Real content. ".repeat(200)} Access denied errors explained.</p>`);
    assert.equal(await detectAccessIssue(page), undefined);
  } finally {
    await browser.close();
  }
});

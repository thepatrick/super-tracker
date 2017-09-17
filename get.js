const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const util = require('util');

const readFile = util.promisify(fs.readFile);

const addRow = require('./put');


const { TOKEN_DIR } = process.env;
const AS_PATH = path.join(TOKEN_DIR, 'australiansuper.json');

let browser;

// --no-sandbox

(async () => {
  const { username, password } = JSON.parse(await readFile(AS_PATH));

  browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('https://www.australiansuper.com/portal.aspx', { waitUntil: 'networkidle' });

  await page.click('input[name=user]');
  await page.type(username);
  await page.click('input[name=password]');
  await page.type(password);
  await page.click('#btnSubmit');

  await page.waitForNavigation();

  const results = await page.evaluate(() => Array.from(document.querySelectorAll('.module.accountDetails.wrapper a')).map((el) => {
    const h4 = el.querySelector('h4');
    const p = el.querySelector('p');
    if (!(h4 && p)) { return undefined; }
    return { name: h4.innerText, value: p.innerText };
  }).filter(Boolean));

  console.log(results);

  const [transactionTotal, sharesTotal, highGrowthTotal] = results.map(({ value }) => value);

  const addResults = await addRow(transactionTotal, sharesTotal, highGrowthTotal);

  console.log(addResults);
})()
  .catch(err => console.error(err))
  .then(() => browser.close());

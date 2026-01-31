const puppeteer = require('puppeteer');
const path = require('path');

const EXTENSION_PATH = path.resolve(__dirname, '../..');

async function launchBrowserWithExtension() {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox'
    ]
  });
  return browser;
}

async function getExtensionId(browser) {
  const targets = await browser.targets();
  const extensionTarget = targets.find(
    target => target.type() === 'service_worker' && target.url().includes('chrome-extension://')
  );
  if (!extensionTarget) {
    throw new Error('Extension not found');
  }
  const extensionUrl = extensionTarget.url();
  const [, , extensionId] = extensionUrl.split('/');
  return extensionId;
}

module.exports = { launchBrowserWithExtension, getExtensionId, EXTENSION_PATH };

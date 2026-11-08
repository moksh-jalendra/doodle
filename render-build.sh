#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "Installing NPM dependencies..."
npm install

echo "Downloading Chromium binary for Puppeteer..."
# This ensures the browser is installed in the local cache where Render can find it
npx puppeteer browsers install chrome
# Promo Credit Tracker

A robust, mobile-responsive web application designed to track and consolidate vendor promo credits across multiple retail locations.

## Features
* **12-Month Filtering:** Global dashboard filters to track pending float values by specific months or the entire year.
* **Dual Location Management:** Instantly toggle between Red Bluff and Redding trackers securely using Manager PINs.
* **Native Trees POS CSV Integration:** Upload raw CSV export files from the Trees POS system. The internal aggregator automatically extracts, sorts by location, groups by brand/month, and pushes clean entries to the tracker in one click.
* **Excel Copy-Paste Engine:** A custom horizontal-chunk parser that converts massive Excel spreadsheet pastes into mapped database rows instantly.
* **Mobile Responsive:** Built using Tailwind CSS, the application seamlessly scales down for mobile phone viewing without sacrificing table navigation.

## Architecture
This is a lightweight application built using:
* **Vue 3 (Composition API):** For reactive state management and rendering.
* **Tailwind CSS:** For fast, utility-first styling.
* **Lucide Icons:** For clean vector iconography.
* **SheetJS:** For reliable client-side parsing of Excel and CSV files.

## Setup & Deployment
Because the architecture relies purely on client-side JS and CDN imports, there is no build step required.

1. Clone the repository.
2. Open `index.html` in your browser to run the app instantly.
3. This app can be deployed for free immediately via **GitHub Pages**.

## Access
* Default Manager PINs: `4095`, `7444`, `2437`, `0500`

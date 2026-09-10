# Promo Credit Tracker

A robust, mobile-responsive web application designed to track, aggregate, and reconcile vendor promo credits across multiple retail locations. 

The application streamlines accounting workflows by automatically parsing raw point-of-sale data, syncing vendor contacts in real-time, and generating itemized financial reports with 1-click email drafts.

## 🚀 Key Features

*   **Financial Dashboard:** A real-time `Chart.js` dashboard featuring a custom Obsidian, Emerald, and Gold theme. Instantly visualize monthly credit volume, top 10 distributors, top 10 brands, and liability breakdowns by store location.
*   **Cloud-Synced Brand Directory:** A centralized, real-time database of vendor reps, emails, and distributors. Includes a visual Excel mapping importer, mass-deletion tools, and instant inline editing.
*   **Automated Email Drafter & Itemized CSVs:** Generate detailed vendor reconciliation reports in one click. The system automatically cross-references raw POS data to download an itemized CSV breakdown, then opens your default mail client with a prepopulated message, subject line, and CCs.
*   **Trees POS CSV Aggregator:** Upload raw CSV export files directly from the Trees POS system. The internal aggregator automatically extracts the data, routes it by store location, groups it by brand and month, and pushes clean, summarized entries to the cloud.
*   **Archive & Export Engine:** Keep your active tracker lightning fast. One click grabs all resolved/uncollectable credits, downloads them to a Master Annual CSV for your permanent records, and safely archives them out of the active UI.
*   **Excel Copy-Paste Engine:** A custom visual parser that converts massive spreadsheet copies into a dynamic grid, allowing you to map columns before bulk-importing rows instantly to Firebase.

## 🏗️ Architecture & Tech Stack

This is a lightweight, serverless Single Page Application (SPA) built using modern web standards:

**Frontend:**
*   **Vue 3 (Composition API):** For reactive state management and UI rendering via CDN.
*   **Tailwind CSS:** For fast, utility-first styling and strict mobile-responsiveness.
*   **Chart.js:** For high-performance HTML5 canvas data visualization.
*   **Lucide Icons:** Clean, modern vector iconography.

**Backend & Security:**
*   **Firebase Firestore:** Real-time NoSQL cloud database syncing credits and brands instantly across all authorized users.
*   **Firebase Authentication:** Secure email/password login restricted to authorized internal system users.
*   **Firebase App Check:** Secured with Google reCAPTCHA Enterprise to protect the database from unauthorized API abuse.

## 🛠️ Setup & Deployment

Because the architecture relies on client-side JS and CDN imports backed by Firebase, there is no Node.js build step or compiling required.

1. Clone the repository.
2. Update the `firebaseConfig` object in `app.js` with your specific project credentials.
3. Open `index.html` in your browser to run the app instantly.

This application is designed to be deployed instantly for free via **GitHub Pages**.

## 🔐 Access & Security

Access to the application is restricted via Firebase Authentication. The system actively checks the logged-in user against a hardcoded `systemUsers` directory to assign site access (Red Bluff vs. Redding) and define manager permissions.

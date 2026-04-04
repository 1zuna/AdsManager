
# Project Brief: FB Ads Spending Limit Desktop Controller

## 1. Project Overview
A lightweight desktop application designed to give media buyers and account managers manual control over daily Facebook Ad account spending limits. The app reads budget distribution data from a centralized Google Sheet, calculates per-account splits, and updates the Facebook Ads API directly, providing a clean UI for human oversight and execution.

## 2. Target Audience & Users
* **Users:** Media Buyers, Ad Operations Specialists, and Account Managers.
* **Pain Point:** Manually calculating and updating spending limits across dozens of fragmented ad accounts is time-consuming and prone to human error.

## 3. Core Features & Specifications

### User Interface (UI)
* **Platform:** Desktop Application (built with Electron for a rich, modern UI).
* **Group Selection:** Multi-select dropdown loaded with Facebook Account groups derived from Google Sheet tab names.
* **Refresh Action:** A dedicated button to reload data/groups from the Google Sheet.
* **Settings Panel (Collapsible):**
    * Field for Google Sheet Service Account JSON file path.
    * Field for Facebook API Token.
    * Field for Excluded Tabs (comma-separated list, prepopulated with defaults).
* **Execution Button:** A prominent "Set Limit" button to fire the process.
* **Progress & Log Panel:** A real-time scrolling log showing current actions, successes, and failures.

### Data Extraction Logic (Google Sheets)
* **Tab Filtering:** The app scans all tabs in the sheet *except* for those specified in the exclusion list. Defaults to ignore: `"Configuration", "RAW Data Aggregated", "Dashboard Summary", "Dashboard Summary (VNĐ)", "Ads Rules Status", "Update Money", "Update Money 1", "CustomMessage", "Bảng Tổng Hợp", "USD mẫu"`.
* **Group Name:** Located specifically in cell `B2` of each valid tab.
* **Account IDs:** Located on row 3, starting from column `H` and moving horizontally (`H3`, `I3`, `J3`, etc.) until an empty cell is reached.
* **Remaining Budget:** Located in column `G`. The app must search Column G for the row corresponding to today's date formatted as `dd/MM/yyyy` (e.g., `03/04/2026`).

### Execution & Business Logic
1.  **Budget Split:** The app reads the "Remaining" amount for today and divides it equally among the total count of valid Account IDs found in row 3.
    * *Formula:* `Budget per Account = Remaining Amount / Total Number of Accounts in Group`.
2.  **API Execution:** The app loops through each Account ID and calls the Facebook Ads API to update its spending limit.
3.  **Fault Tolerance:** If a Facebook API call fails for an account (e.g., expired token, restricted account, or API timeout), the application will **skip that account**, print the error in the UI progress panel, and continue processing the rest of the group.

---

## 4. Technical Constraints & Preferences
* **Frontend/Wrapper:** Electron.
* **Backend Operations:** Node.js (leveraging `googleapis` for Sheets and `axios` or FB SDK for the Marketing API).
* **Configuration Storage:** Service account path, API token, and excluded tabs list should be saved locally on the user's machine so they don't have to re-enter them every time the app opens.

---

## 5. PM Agent Handoff Prompt

> **Instructions for the PM / Developer Agent:**
> 
> You are receiving the foundation for a desktop utility app. Please use this context to generate a comprehensive Product Requirement Document (PRD) or begin active development.
> 
> **Key Insights Summary:**
> * This is a pivot from an automated cron-like service to a manual desktop app. The user prioritizes a clean, beautiful UI (hence the request for Electron) and explicit control over when the API fires.
> 
> **Areas Requiring Special Attention:**
> * **Sheet Parsing:** The date lookup in Column G must strictly match `dd/MM/yyyy`. Ensure the app safely handles instances where today's date is not found in that column.
> * **Rate Limiting:** Facebook's Ads API has strict rate limits. The execution loop should have a slight, configurable delay between calls to avoid hitting limits if a group has many accounts.
> 
> **Development Context:**
> * The target language should be JavaScript/TypeScript to align perfectly with the Electron framework.
> 
> **Guidance on PRD Detail Level:**
> * High. Specifically map out state management for the UI (e.g., what states the "Set Limit" button goes through while processing) and the local storage of credentials.

---

Would you like me to make any adjustments to this brief, or should we consider this ready to hand off to a developer/PM agent?
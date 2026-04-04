# Release & Auto-Update Setup Guide

## One-time Setup

### 1. Create a GitHub Repository
1. Go to https://github.com/new
2. Create a **public** repository (or private — private requires GitHub Pro for Releases API)
3. Note your `owner` (GitHub username) and `repo` name

### 2. Update `package.json` → `build.publish`
```json
"publish": [
  {
    "provider": "github",
    "owner": "YOUR_GITHUB_USERNAME",
    "repo": "YOUR_REPO_NAME"
  }
]
```

### 3. Generate a GitHub Personal Access Token (PAT)
1. Go to https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Select scope: `repo` (full control)
4. Copy the token — you only see it once

### 4. Push your code
```powershell
cd AdsManager
git init
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git add .
git commit -m "initial commit"
git push -u origin main
```

---

## Publishing a New Release

### Step 1 — Bump the version in `package.json`
```json
"version": "1.0.1"
```
Versions must follow **semver** (`MAJOR.MINOR.PATCH`). The auto-updater only notifies users when the published version is **greater than** the installed version.

### Step 2 — Build & publish (Windows)
```powershell
$env:GH_TOKEN = "ghp_your_token_here"
npm run electron:release:win
```

This will:
1. Compile the Electron layer
2. Build the Vite renderer
3. Package into an NSIS installer (`release/*.exe`)
4. Create a **GitHub Draft Release** tagged `v1.0.1`
5. Upload the installer + `latest.yml` (the manifest the auto-updater reads)

### Step 3 — Publish the Draft Release
1. Go to your repo → **Releases**
2. Find the draft release (e.g. `v1.0.1`)
3. Click **Edit** → review the title and notes → click **Publish release**

Once published, any running instance of the app will detect the update on the next check.

---

## How the Auto-Updater Works

| Event | UI Behaviour |
|---|---|
| App starts | Nothing — user must click "Check update" |
| User clicks "Check update" in header | Shows "Checking..." spinner |
| Newer version found on GitHub | Shows amber "v1.x.x available — downloading..." |
| Download in progress | Shows "Downloading X%" |
| Download complete | Shows green **"Restart to update v1.x.x"** button |
| User clicks restart button | App quits and installer runs silently |
| Already on latest | Shows green "Up to date" (auto-hides after 4s) |

> **Note:** Auto-update only works in **production builds** (`npm run electron:release:win`).  
> In dev mode (`npm run electron:dev`) clicking "Check update" will show "Updates not available in dev mode."

---

## Changelog Tips
- Tag your commits clearly: `git tag v1.0.1 && git push origin v1.0.1`
- Write release notes in the GitHub Releases page so users know what changed
- Always test the installer before clicking **Publish release**

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `GH_TOKEN not set` error | Set `$env:GH_TOKEN` before running the release command |
| `latest.yml` not found | Make sure the release is **published** (not a draft) |
| Update not detected | Version in `package.json` must be higher than installed version |
| Code signing warning on Windows | Optional: add a code-signing certificate to `build.win.certificateFile` in `package.json` |

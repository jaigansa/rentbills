# ☁️ Cloudflare Pages Deployment Guide for RentBill Pro

Deploy **RentBill Pro** to Cloudflare Pages for **100% Free**, lightning-fast global edge hosting with automatic SSL and continuous deployment.

---

## 🚀 Method 1: Git Integration (Recommended for Continuous Updates)

### Step 1: Push your Code to GitHub / GitLab
If you haven't initialized Git yet:
```bash
git init
git add .
git commit -m "Initial RentBill Pro commit"
# Push to your GitHub repo
git remote add origin https://github.com/YOUR_USERNAME/rentbill.git
git push -u origin main
```

---

### Step 2: Connect to Cloudflare Pages
1. Log into your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the left sidebar, go to **Compute (Workers & Pages)** ➔ **Workers & Pages**.
3. Click **Create Application** ➔ select the **Pages** tab.
4. Click **Connect to Git** and select your `rentbill` repository.

---

### Step 3: Configure Build Settings
Fill in the build configuration:
* **Project Name:** `rentbill` (or whatever you prefer)
* **Production Branch:** `main`
* **Framework Preset:** `None`
* **Build Command:** *(leave blank)*
* **Build Output Directory:** `.` (root directory)

Click **Save and Deploy**!

Your site will be live in ~10 seconds at: `https://rentbill.pages.dev` (or your chosen project name).

---

## ⚡ Method 2: Direct CLI Deployment (Instant 1-Command Deploy)

If you don't want to use Git, you can deploy directly from your computer using Cloudflare Wrangler:

```bash
# Run from the project root:
npx wrangler pages deploy . --project-name=rentbill
```
* Wrangler will ask you to log in to Cloudflare in your browser once.
* It will upload and deploy your files immediately!

---

## 🔒 Post-Deployment Checklist (Important!)

Once your Cloudflare URL is live (e.g. `https://rentbill.pages.dev`):

1. **Update Allowed URLs in Supabase:**
   - Go to [Supabase Dashboard](https://supabase.com/dashboard) ➔ **Authentication** ➔ **URL Configuration**.
   - Set **Site URL** to: `https://rentbill.pages.dev` (replace with your actual URL).
   - In **Redirect URLs**, add: `https://rentbill.pages.dev/**`.
   - Click **Save**.

2. **Custom Domain (Optional):**
   - In Cloudflare Pages ➔ **Custom Domains** ➔ **Set up a domain**.
   - Enter your domain (e.g., `rent.yourdomain.com`).
   - Cloudflare will automatically provision a free SSL certificate.

---

## 🛠️ Included Cloudflare Configuration Files

| File | Purpose |
| :--- | :--- |
| **[`_redirects`](_redirects)** | Single Page Application (SPA) routing fallback to `index.html` |
| **[`_headers`](_headers)** | Security headers (`X-Frame-Options`, `XSS protection`) & 24hr static caching |
| **[`wrangler.toml`](wrangler.toml)** | Direct CLI deployment configuration |

# Nester Agent Platform — Setup Guide

> **For anyone with zero coding experience.**
> First-time setup takes about 5 minutes. Upgrading takes 1 command.

---

## What is Nester?

Nester is your AI-powered sales research assistant. Give it a LinkedIn profile and a company website, and it will:

- Research the prospect's background, role, and recent activity
- Analyze the company — products, tech stack, funding, and news
- Build a detailed persona of your prospect
- Match your services to their pain points
- Write personalized outreach emails with unique Calendly links
- Let you chat with all your research data like ChatGPT

---

## What You'll Need Before Starting

Only **2 API keys** are required to get started. Everything else can be added later inside the app.

| Key | Where to Get It | Required? |
|-----|----------------|-----------|
| **DeepSeek API Key** | [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) | **Yes** |
| **OpenAI API Key** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | **Yes** (for knowledge base search only) |

> **Cost estimate:** DeepSeek is ~20x cheaper than OpenAI. Typical cost is $0.01–0.05 per prospect researched. OpenAI is only used for embeddings (knowledge base), not for chat.

All other keys (Firecrawl, Tavily, Calendly, Gmail, Google Drive) are added inside the app after it's running — no terminal needed.

---

## First-Time Installation

### Step 1: Open Terminal

- **Mac:** Press `Cmd + Space`, type **Terminal**, press Enter
- **Windows:** Press `Win + R`, type **cmd**, press Enter

### Step 2: Clone the Project

```bash
git clone https://github.com/Terrorizer-AI/Nester-AI_Agents-Store.git nester-platform
cd nester-platform
```

### Step 3: Run the Setup Wizard

```bash
chmod +x setup.sh && ./setup.sh
```

The wizard will:

1. Install Python & Node.js if missing
2. Install all dependencies automatically
3. Open a browser for LinkedIn login (one-time, session is saved)
4. Ask for your **DeepSeek** and **OpenAI** keys
5. Install the `nester` command so you can run it from anywhere
6. Start the platform and open your browser

> **Progress indicators:**
> - ✓ Green = done
> - ⚠ Yellow = warning (non-critical, can fix later)
> - ✗ Red = needs attention

### Step 4: Add Remaining Keys in the App

Once the app opens at **http://localhost:3000**:

1. Click **API Keys** in the top nav
2. Add your keys for the features you want:
   - **Firecrawl** — company website scraping
   - **Tavily** — web search for news and funding
   - **Calendly** — booking links in outreach emails
   - **SMTP (Gmail)** — for sending emails
   - **Google Drive** — company knowledge base
3. Keys save instantly — no restart needed

---

## Daily Usage

After setup, use the `nester` command from **any folder** in your terminal:

```bash
nester start    # Start the platform
nester stop     # Stop all servers
nester update   # Get latest updates & restart
nester logs     # View backend logs
```

### Starting Nester

```bash
nester start
```

Opens **http://localhost:3000** in your browser automatically.

### Stopping Nester

```bash
nester stop
```

---

## Upgrading (Getting Latest Changes)

Whenever there are new features or fixes, run one command from anywhere:

```bash
nester update
```

This will automatically:
1. Pull the latest code from GitHub
2. Install any new dependencies
3. Add any new config keys to your `.env` (never overwrites your existing keys)
4. Restart all servers

Your API keys and data are always preserved.

---

## Using the Platform

### Outreach — Run the Sales Pipeline

1. Click **Outreach** in the top nav
2. Enter the prospect's **LinkedIn URL** (e.g. `https://linkedin.com/in/johndoe`)
3. Enter the **company website** (e.g. `https://acme.com`)
4. Optionally enter the **company LinkedIn URL**
5. Click **Run Pipeline**
6. Watch 8 AI agents work in real-time

When complete, you'll see:
- Full prospect profile and persona
- Company intelligence report
- Personalized outreach emails (multiple angles)
- Matched pain points and services

### Knowledge — Company Documents

Upload your company docs (pitch deck, case studies, pricing, etc.) so agents reference your **real services** in emails:

1. Click **Knowledge** in the top nav
2. Click **Add Files** to upload from your computer
3. Or click **Google Drive** to pick files from Drive
4. Files are indexed automatically — takes a few seconds

### History

View all past pipeline runs, click any to see the full output.

### Chat

Talk to your research data:

- *"Tell me about John Doe"*
- *"What pain points does Acme Corp have?"*
- *"Draft a follow-up email for Sarah"*
- *"Compare the two prospects I researched today"*

### API Keys

Manage all your API keys from the browser — no `.env` editing needed. Keys take effect instantly without a restart.

---

## Troubleshooting

### `nester: command not found`

The `nester` command is installed during `setup.sh`. If you skipped setup or it didn't install:

```bash
cd nester-platform
./setup.sh
```

After setup completes, open a new terminal tab and `nester` will work.

### Nester won't start

```bash
nester stop     # Kill any stuck processes
nester start    # Try again
```

Check logs if it still fails:
```bash
nester logs             # Backend logs
nester logs frontend    # Frontend logs
```

### Pipeline failed or agent error

- Check your **DeepSeek key** has credits: [platform.deepseek.com](https://platform.deepseek.com)
- Check the **LinkedIn URL** is a valid profile URL
- Check the **company website** is accessible

### Emails aren't sending

Go to **API Keys** page in the app and set:
- `SMTP Email Address` — your Gmail address
- `SMTP App Password` — a Gmail App Password (not your regular password)

Get one at: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)

### Need to change an API key?

Go to **API Keys** in the app — update it there. No terminal, no restart needed.

---

## Quick Reference

| Command | What It Does |
|---------|-------------|
| `nester start` | Start the platform |
| `nester stop` | Stop all servers |
| `nester update` | Pull latest changes & restart |
| `nester logs` | View backend logs |

| URL | What It Is |
|-----|-----------|
| http://localhost:3000 | Nester Dashboard |
| http://localhost:8000/docs | API docs (advanced users) |

---

## Support

Having issues? Open a ticket at:
**https://github.com/Terrorizer-AI/Nester-AI_Agents-Store/issues**

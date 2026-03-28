# Nester Agent Platform — Setup Guide

> **For sales professionals with zero coding experience.**
> This guide will have you running in under 5 minutes.

---

## What is Nester?

Nester is your AI-powered sales research assistant. Give it a LinkedIn profile and a company website, and it will:

- Research the prospect's background, role, and recent activity
- Analyze the company — what they do, their tech stack, funding, and news
- Build a detailed persona of your prospect
- Match your services to their pain points
- Write personalized outreach emails with unique Calendly links
- Let you chat with all your research data like ChatGPT

---

## What You'll Need

Before starting, have these ready:

| Item | Where to Get It | Required? |
|------|----------------|-----------|
| **OpenAI API Key** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | Yes |
| **Firecrawl API Key** | [firecrawl.dev](https://firecrawl.dev) | Yes |
| **Tavily API Key** | [tavily.com](https://tavily.com) | Recommended |
| **Calendly API Key** | [calendly.com/integrations/api_webhooks](https://calendly.com/integrations/api_webhooks) | Optional |
| **Gmail App Password** | [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) | Optional (for sending emails) |

> **Cost estimate:** OpenAI usage is typically $0.10–$0.50 per prospect researched. Firecrawl and Tavily have free tiers.

---

## Installation (One-Time Setup)

### Step 1: Open Terminal

- On **Mac**: Press `Cmd + Space`, type **Terminal**, press Enter
- On **Windows**: Press `Win + R`, type **cmd**, press Enter

### Step 2: Clone the Project

Copy and paste this into your terminal, then press Enter:

```bash
git clone https://github.com/Terrorizer-AI/nester-platform.git
cd nester-platform
```

### Step 3: Run the Setup Wizard

```bash
chmod +x setup.sh && ./setup.sh
```

The wizard will:

1. **Check your system** — installs Python & Node.js if missing
2. **Install dependencies** — sets up everything automatically
3. **Ask for your API keys** — just paste them when prompted
4. **Configure your email** — for sending outreach (optional)
5. **Start the platform** — opens it in your browser

> The wizard uses colored indicators so you can see progress:
> - ✓ Green = done
> - ⚠ Yellow = warning (non-critical)
> - ✗ Red = needs attention

### Step 4: You're Done!

Your browser will open to **http://localhost:3000** — that's your Nester dashboard.

---

## Daily Usage

### Starting Nester

Open Terminal, go to the project folder, and run:

```bash
cd nester-platform
./start.sh
```

This starts everything and opens your browser automatically.

### Stopping Nester

```bash
./stop.sh
```

---

## Using the Platform

### 1. Dashboard (Home Page)

Your command center. Shows active flows, recent runs, and quick stats.

### 2. Outreach (Run a Pipeline)

This is where the magic happens:

1. Click **Outreach** in the top nav
2. Enter the prospect's **LinkedIn URL** (e.g., `https://linkedin.com/in/johndoe`)
3. Enter the **company website** (e.g., `https://acme.com`)
4. Click **Run Pipeline**
5. Watch the agents work in real-time — each step shows progress

The pipeline runs these AI agents in sequence:

```
LinkedIn Research → Company Research → Company LinkedIn → Activity Analysis
     → Persona Builder → Service Matcher → Email Composer → Output Formatter
```

When complete, you'll see:
- Full prospect profile
- Company intelligence report
- Personalized outreach emails (multiple angles)
- Pain points and service matches

### 3. History

View all past pipeline runs:
- See every prospect you've researched
- Click any run to view the full detail — profile, emails, analysis
- Filter by status (completed, failed, running)

### 4. Chat

Talk to your research data like ChatGPT:

- **"Tell me about John Doe"** — get a summary of everything Nester found
- **"Compare the two prospects I researched today"** — cross-reference data
- **"What pain points does Acme Corp have?"** — pull insights
- **"Draft a follow-up email for Sarah"** — generate new content based on research

Your conversations are saved in the sidebar — pick up where you left off.

### 5. Integrations

Connect external services:
- GitHub, Slack, Google (via OAuth)
- Status indicators show what's connected

---

## Troubleshooting

### "Nester won't start"

```bash
./stop.sh        # Kill any stuck processes
./start.sh       # Try again
```

If it still doesn't work, check the logs:
```bash
cat /tmp/nester-backend.log
cat /tmp/nester-frontend.log
```

### "Pipeline failed" or "Agent error"

- **Check your OpenAI key** — make sure it has credits: [platform.openai.com/usage](https://platform.openai.com/usage)
- **Check the LinkedIn URL** — must be a valid profile URL
- **Check the company website** — must be accessible

### "Chat says it has no data"

The chat uses data from completed pipeline runs. Make sure you've run at least one successful pipeline first.

### "Emails aren't sending"

1. Make sure `SMTP_USER` and `SMTP_PASSWORD` are set in your `.env` file
2. The password must be a **Gmail App Password** (not your regular Gmail password)
3. Get one at: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)

### Need to update API keys?

Open the `.env` file in any text editor:

```bash
open .env        # Mac
notepad .env     # Windows
```

Change the value, save, then restart:
```bash
./stop.sh && ./start.sh
```

---

## Quick Reference

| Command | What It Does |
|---------|-------------|
| `./setup.sh` | First-time installation wizard |
| `./start.sh` | Start Nester (daily use) |
| `./stop.sh` | Stop all servers |
| `open .env` | Edit your API keys |

| URL | What It Is |
|-----|-----------|
| http://localhost:3000 | Nester Dashboard (your main interface) |
| http://localhost:8000/docs | API Documentation (for advanced users) |

---

## Support

Having issues? Create a ticket at:
**https://github.com/Terrorizer-AI/nester-platform/issues**

#!/usr/bin/env python3
"""
finance_analysis.py — Ledger finance analysis via the live Ledger API.

Usage:
    python3 finance_analysis.py [--month YYYY-MM]

Connects to the self-hosted Ledger app over Tailscale, authenticates via
a forged NextAuth v5 JWT (uses the NEXTAUTH_SECRET from .env.local), and
pulls budget summary + net worth data from the API.

If --month is omitted, uses the most recent COMPLETE month (prior to today).
Outputs a formatted markdown report to stdout.

Environment overrides:
  LEDGER_URL     Base URL of the ledger app (default: http://100.81.99.81:3000)
  LEDGER_SECRET  NextAuth secret (default: read from ~/workspace/ledger/.env.local)
  LEDGER_MONTH   Month to analyze (YYYY-MM) — also settable via --month flag
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, date
from pathlib import Path


# ── Config ────────────────────────────────────────────────────────────────────

# Prefer localhost when running directly on the server; fall back to Tailscale IP
# for Cowork/remote contexts. Override with LEDGER_URL env var if needed.
def _default_url() -> str:
    import urllib.request
    for url in ["http://localhost:3000", "http://100.81.99.81:3000"]:
        try:
            urllib.request.urlopen(f"{url}/api/health", timeout=3)
            return url
        except Exception:
            continue
    return "http://100.81.99.81:3000"  # will fail with a clear error below

LEDGER_URL = os.environ.get("LEDGER_URL") or _default_url()
APP_DIR = Path(__file__).parent.parent  # ~/workspace/ledger/


def get_secret() -> str:
    """Read NEXTAUTH_SECRET from env or .env.local."""
    if s := os.environ.get("LEDGER_SECRET"):
        return s
    env_file = APP_DIR / ".env.local"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            m = re.match(r'^NEXTAUTH_SECRET="?([^"]+)"?', line.strip())
            if m:
                return m.group(1)
    raise RuntimeError(
        "NEXTAUTH_SECRET not found. Set LEDGER_SECRET env var or check "
        f"{env_file}"
    )


def make_token(secret: str) -> str:
    """Forge a valid NextAuth v5 JWE session token using the app's node_modules."""
    script = f"""
import {{ encode }} from "{APP_DIR}/node_modules/next-auth/jwt.js";
const token = await encode({{
  token: {{ id: "1", email: "admin@ledger.local", name: "Admin", sub: "1" }},
  secret: "{secret}",
  salt: "authjs.session-token",
}});
console.log(token);
"""
    with tempfile.NamedTemporaryFile(suffix=".mjs", mode="w", delete=False) as f:
        f.write(script)
        tmp = f.name
    try:
        result = subprocess.run(
            ["node", tmp], capture_output=True, text=True, timeout=15
        )
        if result.returncode != 0:
            raise RuntimeError(f"Token generation failed: {result.stderr}")
        return result.stdout.strip()
    finally:
        os.unlink(tmp)


def api_get(path: str, token: str) -> dict:
    """GET a JSON endpoint with the session cookie."""
    import urllib.request
    req = urllib.request.Request(
        f"{LEDGER_URL}{path}",
        headers={"Cookie": f"authjs.session-token={token}"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


# ── Data fetchers ─────────────────────────────────────────────────────────────

def get_latest_complete_month() -> str:
    """Return YYYY-MM for the most recent complete calendar month."""
    today = date.today()
    if today.month == 1:
        return f"{today.year - 1}-12"
    return f"{today.year}-{today.month - 1:02d}"


def fetch_budget_summary(month: str, token: str) -> dict:
    return api_get(f"/api/budget/summary?month={month}", token)


def fetch_net_worth_latest(token: str) -> dict:
    return api_get("/api/net-worth/latest", token)


def fetch_mortgage(token: str) -> dict | None:
    try:
        mortgages = api_get("/api/mortgage", token)
        if isinstance(mortgages, list):
            active = [m for m in mortgages if m.get("isActive")]
            return active[0] if active else (mortgages[0] if mortgages else None)
        return mortgages if mortgages else None
    except Exception:
        return None


# ── Formatting ────────────────────────────────────────────────────────────────

def fmt_delta(amount: float) -> str:
    sign = "+" if amount >= 0 else ""
    return f"{sign}${amount:,.2f}"


# ── Report builder ────────────────────────────────────────────────────────────

def build_report(month: str, token: str) -> str:
    run_date = datetime.now().strftime("%Y-%m-%d %H:%M")
    month_label = datetime.strptime(month, "%Y-%m").strftime("%B %Y")

    summary = fetch_budget_summary(month, token)
    nw_data = fetch_net_worth_latest(token)
    mortgage = fetch_mortgage(token)

    predicted_income = summary.get("predictedIncome", 0) or 0
    actual_income = summary.get("totalIncome", 0) or 0
    total_expenses = summary.get("totalExpenses", 0) or 0
    savings = actual_income - total_expenses
    savings_rate = (savings / actual_income * 100) if actual_income > 0 else 0

    parent_groups = summary.get("parentGroups", [])

    # Net worth
    current_nw = nw_data.get("current", {})
    previous_nw = nw_data.get("previous", {})
    nw_delta = (
        current_nw.get("netWorth", 0) - previous_nw.get("netWorth", 0)
        if current_nw and previous_nw else None
    )

    lines = []
    lines.append(f"# 💵 Finance Review — {month_label}")
    lines.append(f"*Run: {run_date} | Source: ledger API ({LEDGER_URL})*")
    lines.append("")

    # ── Income ────────────────────────────────────────────────────────────────
    income_delta = actual_income - predicted_income
    lines.append("## 📥 Income")
    lines.append("| | Amount |")
    lines.append("|---|---|")
    lines.append(f"| Predicted | ${predicted_income:,.2f} |")
    lines.append(f"| Actual | ${actual_income:,.2f} |")
    lines.append(f"| Delta | {fmt_delta(income_delta)} |")
    lines.append("")

    # ── Spending by parent group ───────────────────────────────────────────────
    lines.append("## 💸 Spending vs. Budget")
    lines.append("")

    overages = []
    for group in parent_groups:
        name = group.get("parentCategory", "")
        if name == "Income":
            continue
        target = group.get("target", 0) or 0
        actual = group.get("actual", 0) or 0
        if target == 0 and actual == 0:
            continue

        delta = actual - target
        pct = (actual / target * 100) if target > 0 else 0
        if delta > 0 and target > 0:
            flag = " 🔴"
            overages.append((name, delta))
        elif target > 0:
            flag = " ✅"
        else:
            flag = ""

        lines.append(f"### {name}{flag}")
        lines.append(f"Spent **${actual:,.2f}** of ${target:,.2f} budget ({pct:.0f}%)")
        lines.append("")

        active_cats = [
            c for c in group.get("categories", [])
            if (c.get("actual") or 0) != 0
        ]
        if active_cats:
            lines.append("| Category | Budget | Spent (net) | Delta |")
            lines.append("|---|---|---|---|")
            for cat in active_cats:
                cat_target = cat.get("target", 0) or 0
                cat_actual = cat.get("actual", 0) or 0
                cat_delta = cat_actual - cat_target
                lines.append(
                    f"| {cat['name']} | ${cat_target:,.2f} | ${cat_actual:,.2f} | {fmt_delta(cat_delta)} |"
                )
            lines.append("")

    # ── Summary ───────────────────────────────────────────────────────────────
    lines.append("---")
    lines.append("")
    lines.append("## 📊 Monthly Summary")
    lines.append("")
    lines.append("| Metric | Value |")
    lines.append("|---|---|")
    lines.append(f"| Income | ${actual_income:,.2f} |")
    lines.append(f"| Total spending | ${total_expenses:,.2f} |")
    total_budget = sum(
        g.get("target", 0) or 0
        for g in parent_groups if g.get("parentCategory") != "Income"
    )
    lines.append(f"| Budget | ${total_budget:,.2f} |")
    lines.append(f"| Budget delta | {fmt_delta(total_expenses - total_budget)} |")
    lines.append(f"| Savings | ${savings:,.2f} |")
    lines.append(f"| Savings rate | {savings_rate:.1f}% |")
    lines.append("")

    if overages:
        lines.append("**⚠️ Over budget this month:**")
        for name, delta in sorted(overages, key=lambda x: -x[1]):
            lines.append(f"- {name}: over by ${delta:,.2f}")
        lines.append("")

    # ── Net worth ─────────────────────────────────────────────────────────────
    if current_nw:
        nw_date = current_nw.get("snapshotDate", "")
        net_worth = current_nw.get("netWorth", 0)
        total_assets = current_nw.get("totalAssets", 0)
        total_liabilities = current_nw.get("totalLiabilities", 0)

        lines.append("## 📈 Net Worth")
        lines.append(f"*As of {nw_date}*")
        lines.append("")
        lines.append("| | Amount |")
        lines.append("|---|---|")
        lines.append(f"| Total assets | ${total_assets:,.2f} |")
        lines.append(f"| Total liabilities | ${total_liabilities:,.2f} |")
        lines.append(f"| **Net worth** | **${net_worth:,.2f}** |")
        if nw_delta is not None:
            lines.append(f"| ~1-week change | {fmt_delta(nw_delta)} |")
        lines.append("")

        asset_fields = [
            ("Checking", "checking"), ("Savings", "savings"),
            ("Home equity", "homeEquity"), ("401(k)", "retirement401k"),
            ("HSA/HRA", "hsaHra"), ("Investments", "investments"),
            ("529 plan", "plan529"), ("Teamworks equity", "teamworksEquity"),
        ]
        lines.append("**Assets:**")
        lines.append("| Account | Value |")
        lines.append("|---|---|")
        for label, key in asset_fields:
            val = current_nw.get(key, 0) or 0
            if val:
                lines.append(f"| {label} | ${val:,.2f} |")
        lines.append("")

        lines.append("**Liabilities:**")
        lines.append("| | Balance |")
        lines.append("|---|---|")
        if current_nw.get("mortgageBalance"):
            lines.append(f"| Mortgage | ${current_nw['mortgageBalance']:,.2f} |")
        if current_nw.get("studentLoans"):
            lines.append(f"| Student loans | ${current_nw['studentLoans']:,.2f} |")
        if current_nw.get("personalLoans"):
            lines.append(f"| Personal loans | ${current_nw['personalLoans']:,.2f} |")
        lines.append("")

    # ── Mortgage ──────────────────────────────────────────────────────────────
    if mortgage:
        lines.append("## 🏠 Mortgage")
        lines.append("")
        lines.append("| | |")
        lines.append("|---|---|")
        lines.append(f"| Label | {mortgage.get('label', '')} |")
        rate = mortgage.get("annualRate", 0)
        lines.append(f"| Rate | {rate * 100:.2f}% |")
        if mortgage.get("monthlyEscrow"):
            lines.append(f"| Monthly escrow | ${mortgage['monthlyEscrow']:,.2f} |")
        if mortgage.get("notes"):
            lines.append(f"| Notes | {mortgage['notes']} |")
        lines.append("")

    lines.append("---")
    lines.append(f"*Generated by finance-review | {run_date}*")

    return "\n".join(lines)


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ledger finance analysis via live API")
    parser.add_argument("--month", help="Month to analyze (YYYY-MM). Defaults to last complete month.")
    args = parser.parse_args()

    month = args.month or os.environ.get("LEDGER_MONTH") or get_latest_complete_month()

    try:
        secret = get_secret()
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        token = make_token(secret)
    except Exception as e:
        print(f"ERROR: Could not generate auth token: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        print(build_report(month, token), flush=True)
    except Exception as e:
        print(f"ERROR: API call failed: {e}", file=sys.stderr)
        sys.exit(1)

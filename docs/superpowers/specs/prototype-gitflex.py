#!/usr/bin/env python3
"""
gitflex — your whole GitHub in one screenshot.

usage:  gitflex [BANNER TEXT] [--fast] [--no-clear]
        gitflex              -> banner uses your GitHub display name
        gitflex "sezos"      -> custom banner (letters A-Z and spaces)
        --fast               -> no line-by-line reveal animation
        --no-clear           -> don't clear the screen first
"""
import json
import random
import re
import subprocess
import sys
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from itertools import cycle

W = 56  # content width — narrow + tall so it fits a 9:16 story
TTY = sys.stdout.isatty()
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
FAST = "--fast" in sys.argv or not TTY
CLEAR = "--no-clear" not in sys.argv and TTY


def fg(n):
    return "\033[38;5;%dm" % n


B, D, R, BLINK = "\033[1m", "\033[2m", "\033[0m", "\033[5m"
GRAD = [51, 45, 39, 33, 69, 105, 141, 177, 213, 219]  # cyan -> pink
ANSI = re.compile(r"\033\[[0-9;]*m")

LANG_COLORS = {
    "Dart": 38, "TypeScript": 33, "JavaScript": 220, "HTML": 208, "CSS": 99,
    "C++": 205, "C": 247, "Python": 71, "Swift": 209, "Kotlin": 135, "Go": 44,
    "Rust": 173, "Java": 130, "Shell": 113, "Vue": 42, "Other": 244,
}

TAGLINES = [
    "it works on my machine",
    "sleep is a deprecated dependency",
    'git commit -m "final_final_v3"',
    "rm -rf node_modules && pray",
    "shipping > perfect",
    "coffee in, commits out",
    "99 little bugs in the code...",
    "deploying on a friday, no fear",
]

FONT_SRC = """
A
 █████╗
██╔══██╗
███████║
██╔══██║
██║  ██║
╚═╝  ╚═╝
B
██████╗
██╔══██╗
██████╔╝
██╔══██╗
██████╔╝
╚═════╝
C
 ██████╗
██╔════╝
██║
██║
╚██████╗
 ╚═════╝
D
██████╗
██╔══██╗
██║  ██║
██║  ██║
██████╔╝
╚═════╝
E
███████╗
██╔════╝
█████╗
██╔══╝
███████╗
╚══════╝
F
███████╗
██╔════╝
█████╗
██╔══╝
██║
╚═╝
G
 ██████╗
██╔════╝
██║  ███╗
██║   ██║
╚██████╔╝
 ╚═════╝
H
██╗  ██╗
██║  ██║
███████║
██╔══██║
██║  ██║
╚═╝  ╚═╝
I
██╗
██║
██║
██║
██║
╚═╝
J
     ██╗
     ██║
     ██║
██   ██║
╚█████╔╝
 ╚════╝
K
██╗  ██╗
██║ ██╔╝
█████╔╝
██╔═██╗
██║  ██╗
╚═╝  ╚═╝
L
██╗
██║
██║
██║
███████╗
╚══════╝
M
███╗   ███╗
████╗ ████║
██╔████╔██║
██║╚██╔╝██║
██║ ╚═╝ ██║
╚═╝     ╚═╝
N
███╗   ██╗
████╗  ██║
██╔██╗ ██║
██║╚██╗██║
██║ ╚████║
╚═╝  ╚═══╝
O
 ██████╗
██╔═══██╗
██║   ██║
██║   ██║
╚██████╔╝
 ╚═════╝
P
██████╗
██╔══██╗
██████╔╝
██╔═══╝
██║
╚═╝
Q
 ██████╗
██╔═══██╗
██║   ██║
██║▄▄ ██║
╚██████╔╝
 ╚══▀▀═╝
R
██████╗
██╔══██╗
██████╔╝
██╔══██╗
██║  ██║
╚═╝  ╚═╝
S
███████╗
██╔════╝
███████╗
╚════██║
███████║
╚══════╝
T
████████╗
╚══██╔══╝
   ██║
   ██║
   ██║
   ╚═╝
U
██╗   ██╗
██║   ██║
██║   ██║
██║   ██║
╚██████╔╝
 ╚═════╝
V
██╗   ██╗
██║   ██║
██║   ██║
╚██╗ ██╔╝
 ╚████╔╝
  ╚═══╝
W
██╗    ██╗
██║    ██║
██║ █╗ ██║
██║███╗██║
╚███╔███╔╝
 ╚══╝╚══╝
X
██╗  ██╗
╚██╗██╔╝
 ╚███╔╝
 ██╔██╗
██╔╝ ██╗
╚═╝  ╚═╝
Y
██╗   ██╗
╚██╗ ██╔╝
 ╚████╔╝
  ╚██╔╝
   ██║
   ╚═╝
Z
███████╗
╚══███╔╝
  ███╔╝
 ███╔╝
███████╗
╚══════╝
"""


def load_font():
    lines = FONT_SRC.strip("\n").split("\n")
    font = {}
    for i in range(0, len(lines), 7):
        rows = lines[i + 1:i + 7]
        w = max(len(r) for r in rows)
        font[lines[i]] = [r.ljust(w) for r in rows]
    font[" "] = ["   "] * 6
    return font


FONT = load_font()


# ---------- helpers ----------

def vlen(s):
    return len(ANSI.sub("", s))


def grad_at(i, n):
    return GRAD[min(len(GRAD) - 1, int(i * len(GRAD) / max(1, n)))]


def center(s):
    return " " * max(0, (W - vlen(s)) // 2) + s


def section(title):
    t = " %s " % title
    return fg(213) + "──" + R + B + t + R + fg(238) + "─" * (W - 2 - len(t)) + R


def banner(text):
    text = text.upper()
    if not text.strip() or any(ch not in FONT for ch in text):
        return None
    rows = ["".join(FONT[ch][i] for ch in text) for i in range(6)]
    width = len(rows[0])
    if width > W:
        return None
    out = []
    for i, row in enumerate(rows):
        s = ""
        for j, ch in enumerate(row):
            if ch == " ":
                s += " "
            elif ch in "█▄▀":
                s += fg(grad_at(j + i * 2, width + 10)) + ch
            else:
                s += fg(60) + ch  # the box-drawing "shadow"
        out.append(center(s + R))
    return out


def ago(iso):
    t = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    s = (datetime.now(timezone.utc) - t).total_seconds()
    if s < 3600:
        return "%dm ago" % max(1, s // 60)
    if s < 86400:
        return "%dh ago" % (s // 3600)
    if s < 86400 * 30:
        return "%dd ago" % (s // 86400)
    if s < 86400 * 365:
        return "%dmo ago" % (s // (86400 * 30))
    return "%dy ago" % (s // (86400 * 365))


def gh_json(args):
    p = subprocess.run(["gh"] + args, capture_output=True, text=True)
    if p.returncode:
        raise SystemExit("gitflex: %s\n(make sure `gh auth login` is done)" % (p.stderr.strip() or "gh failed"))
    return json.loads(p.stdout)


def gql(q):
    return gh_json(["api", "graphql", "-f", "query=" + q])["data"]["viewer"]


class Spinner:
    def __init__(self, msg):
        self.msg, self.stop = msg, threading.Event()

    def _run(self):
        for f in cycle("⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"):
            if self.stop.is_set():
                break
            sys.stdout.write("\r  " + fg(213) + f + R + " " + D + self.msg + R)
            sys.stdout.flush()
            time.sleep(0.08)
        sys.stdout.write("\r\033[K")
        sys.stdout.flush()

    def __enter__(self):
        if TTY:
            self.t = threading.Thread(target=self._run, daemon=True)
            self.t.start()
        return self

    def __exit__(self, *exc):
        self.stop.set()
        if TTY:
            self.t.join()


# ---------- fetch ----------

Q_PROFILE = """query{viewer{login name createdAt
  contributionsCollection{contributionCalendar{totalContributions
  weeks{contributionDays{date contributionCount}}}}}}"""


def fetch():
    with Spinner("fetching your greatness..."), ThreadPoolExecutor(3) as ex:
        f_repos = ex.submit(gh_json, ["repo", "list", "--limit", "1000", "--json",
                                      "name,isPrivate,isFork,pushedAt,primaryLanguage"])
        v = gql(Q_PROFILE)
        y0, y1 = int(v["createdAt"][:4]), datetime.now().year
        parts = " ".join(
            'y%d: contributionsCollection(from:"%d-01-01T00:00:00Z", to:"%d-12-31T23:59:59Z")'
            "{contributionCalendar{totalContributions}}" % (y, y, y)
            for y in range(y0, y1 + 1)
        )
        years = gql("query{viewer{%s}}" % parts)
        return v, f_repos.result(), years


# ---------- render ----------

def render(v, repos, years):
    L = []
    login = v["login"]
    cal = v["contributionsCollection"]["contributionCalendar"]
    days = [d for w in cal["weeks"] for d in w["contributionDays"]]
    created = datetime.fromisoformat(v["createdAt"].replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)

    # banner
    text = ARGS[0] if ARGS else (v.get("name") or login)
    art = banner(text) or banner(login)
    L.append("")
    if art:
        L += art
    else:
        L.append(center(B + fg(213) + text.upper() + R))

    # subtitle: top languages
    own = [r for r in repos if not r["isFork"]]
    langs = Counter(r["primaryLanguage"]["name"] for r in own if r.get("primaryLanguage"))
    top_names = [n for n, _ in langs.most_common(3)]
    sub = fg(250) + "github.com/" + login + R
    for k in (3, 2, 1, 0):
        cand = sub + (D + "  ·  " + R + fg(250) + " / ".join(top_names[:k]) + R if k else "")
        if vlen(cand) <= W:
            sub = cand
            break
    L += ["", center(sub), ""]

    # stats
    priv = sum(1 for r in repos if r["isPrivate"])
    active30 = sum(1 for r in repos
                   if (now - datetime.fromisoformat(r["pushedAt"].replace("Z", "+00:00"))).days < 30)
    all_time = sum(y["contributionCalendar"]["totalContributions"] for y in years.values())

    counts = [d["contributionCount"] for d in days]
    cur, i = 0, len(counts) - 1
    if i >= 0 and counts[i] == 0:
        i -= 1  # today isn't over yet
    while i >= 0 and counts[i] > 0:
        cur, i = cur + 1, i - 1
    best = run = 0
    for n in counts:
        run = run + 1 if n else 0
        best = max(best, run)
    peak = max(days, key=lambda d: d["contributionCount"])
    peak_date = date.fromisoformat(peak["date"]).strftime("%b %d").replace(" 0", " ")
    yrs = now.year - created.year

    def stat(label, color, value, extra=""):
        return D + label.ljust(14) + R + B + fg(color) + value + R + (D + "  " + extra + R if extra else "")

    L.append(section("STATS"))
    L.append(stat("repos", 51, str(len(repos)), "%d private · %d public" % (priv, len(repos) - priv)))
    L.append(stat("contributions", 45, "{:,}".format(cal["totalContributions"]),
                  "past year · {:,} all-time".format(all_time)))
    L.append(stat("streak", 141, "%d days" % cur, "best this year: %d" % best))
    L.append(stat("busiest day", 177, "%d contributions" % peak["contributionCount"], "on " + peak_date))
    L.append(stat("active", 213, "%d repos" % active30, "pushed in the last 30 days"))
    L.append(stat("coding since", 219, str(created.year), "%d years of shipping" % yrs))
    L.append("")

    # stack
    L.append(section("STACK"))
    total = sum(langs.values()) or 1
    top = langs.most_common(6)
    other = total - sum(n for _, n in top)
    if other:
        top.append(("Other", other))
    biggest = max(n for _, n in top) if top else 1
    BW = 28
    for name, n in top:
        fill = max(1, round(n / biggest * BW))
        col = LANG_COLORS.get(name, 250)
        L.append(fg(255) + name[:11].ljust(12) + R
                 + fg(col) + "█" * fill + fg(236) + "░" * (BW - fill) + R
                 + B + " %3d%%" % round(n * 100 / total) + R
                 + D + "  %d repo%s" % (n, "" if n == 1 else "s") + R)
    L.append("")

    # heatmap
    N = (W - 4) // 2
    weeks = cal["weeks"][-N:]
    shown = [d["contributionCount"] for w in weeks for d in w["contributionDays"]]
    nz = sorted(n for n in shown if n)

    def q(p):
        return nz[min(len(nz) - 1, int(p * len(nz)))] if nz else 0

    t1, t2, t3 = q(.25), q(.5), q(.75)
    LV = [237, 22, 28, 34, 46]

    def lvl(n):
        return 0 if n == 0 else 1 if n <= t1 else 2 if n <= t2 else 3 if n <= t3 else 4

    grid = [[None] * N for _ in range(7)]
    mrow = [" "] * W
    for k, w in enumerate(weeks):
        first = date.fromisoformat(w["contributionDays"][0]["date"])
        if first.day <= 7 and 4 + 2 * k + 3 <= W:
            mrow[4 + 2 * k:4 + 2 * k + 3] = first.strftime("%b")
        for d in w["contributionDays"]:
            dt = date.fromisoformat(d["date"])
            grid[(dt.weekday() + 1) % 7][k] = d["contributionCount"]

    L.append(section("LAST 6 MONTHS"))
    L.append(D + "".join(mrow).rstrip() + R)
    day_labels = {1: "Mon", 3: "Wed", 5: "Fri"}
    for r in range(7):
        s = D + day_labels.get(r, "").ljust(4) + R
        for k in range(N):
            n = grid[r][k]
            s += "  " if n is None else fg(LV[lvl(n)]) + "■" + R + " "
        L.append(s)
    left = D + "{:,} in 6 months".format(sum(shown)) + R
    legend = D + "less " + R + "".join(fg(x) + "■ " + R for x in LV) + D + "more" + R
    L.append(left + " " * (W - vlen(left) - vlen(legend)) + legend)
    L.append("")

    # currently building
    L.append(section("CURRENTLY BUILDING"))
    for r in sorted(repos, key=lambda r: r["pushedAt"], reverse=True)[:6]:
        hrs = (now - datetime.fromisoformat(r["pushedAt"].replace("Z", "+00:00"))).total_seconds() / 3600
        dot = fg(46) if hrs < 24 else fg(220) if hrs < 24 * 7 else fg(240)
        lang = (r.get("primaryLanguage") or {}).get("name", "")
        name = r["name"] if len(r["name"]) <= 24 else r["name"][:23] + "…"
        left = dot + "● " + R + fg(255) + name.ljust(26) + R + fg(LANG_COLORS.get(lang, 244)) + lang[:12] + R
        right = D + ago(r["pushedAt"]) + R
        L.append(left + " " * max(1, W - vlen(left) - vlen(right)) + right)
    L.append("")

    # footer
    L.append(fg(46) + B + "➜ " + R + fg(51) + "~ " + R + fg(255) + random.choice(TAGLINES) + " " + R
             + BLINK + fg(213) + "█" + R)
    L.append("")
    return L


def main():
    v, repos, years = fetch()
    lines = render(v, repos, years)
    out = sys.stdout
    try:
        if TTY:
            out.write("\033[?25l")  # hide cursor while revealing
        if CLEAR:
            out.write("\033[2J\033[H")
        for line in lines:
            out.write("  " + line + "\n")
            out.flush()
            if not FAST:
                time.sleep(0.025)
    finally:
        if TTY:
            out.write("\033[?25h")
            out.flush()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.stdout.write("\033[?25h\n")

# ghflex: design

**Status:** approved by owner 2026-11-11
**Date:** 2026-11-11
**Owner:** Badral (GitHub: `Sezos`)

## 1. What this is and why

Badral has a personal terminal command, `gitflex`, that pulls their GitHub stats and prints a tall, colorful "card" sized for an Instagram story: a block-letter name banner, stats, a language bar chart, a 6-month contribution grid, and the repos they're working on now. They liked it enough to screenshot it for Instagram and want to turn it into a **public open-source side project**, so anyone can run it on their own GitHub account and post theirs. They also want a polished public project on their GitHub profile.

The new hook is an **AI meter**: how much of your recent work had AI on it, based on AI signatures in commits (for example `Co-Authored-By: Claude`). A scan of Badral's own repos found roughly 75% of last year's commits carried an AI co-author, mostly Claude models, so for heavy AI users the number is striking and easy to share.

**The working prototype is the reference implementation for layout and feel.** A copy sits next to this doc as `prototype-gitflex.py` (Python, about 450 lines). Port its look; don't redesign it.

**Approved mockups** are in `mockups/`. They are HTML fragments from the brainstorming tool, so they render without the frame's CSS, but the content and layout are what matter.
- `card.html`: the full card as a story screenshot
- `readme.html`: the repo page
- `ai-meter-options.html`: the three AI-meter options. Option **C** was chosen.

### What success looks like

A stranger lands on the repo, sees the demo images, runs one command, and has their own card on screen in under a minute, then wants to post it.

## 2. Goals

1. **One command, no install:** `npx ghflex` prints the card for the logged-in user.
2. **Card parity with the prototype,** plus the AI meter (section 5).
3. **AI meter** covering the **last 90 days**, shown per repo inside "Currently building", plus one overall line.
4. **Peek mode:** `npx ghflex <username>` shows anyone's card from public data only.
5. **`--hide-private`** masks private repo names so people can post safely.
6. **`--story`** exports a 1080×1920 PNG of the card, ready for an Instagram story.
7. **A repo page that sells it:** demo images, a one-line install, and a "let your AI set it up" section backed by `AGENTS.md`.

## 3. Non-goals

- No website, hosted service, backend, or database. It's a CLI that talks to GitHub's API from the user's machine.
- No GitLab or Bitbucket support.
- No sending data anywhere except GitHub's API. No telemetry.
- No historical AI-meter windows (all-time or yearly) in v1. 90 days only.
- No detecting AI from code style or content. Only explicit signatures count.

## 4. Anti-goals (failure even if it "works")

- **An AI number that overclaims or can be called fake.** It must be a floor, defined by explicit signatures, with an honest footnote on the card.
- **Slow enough that people give up.** Target: card on screen in **10 seconds or less** for a typical account. A spinner is always shown while loading.
- **Leaking private information by accident:**
  - Peek mode must never show another user's private repos, even if the viewer's token can see them.
  - The README demo must not expose Badral's private client repo names.
- **Leaking or mishandling the token.** It is never printed or logged. If stored, the file is readable only by the user.
- **A heavy or fragile `npx` install,** for example native builds that fail on some machines.

## 5. The card

Same layout, sizing and colors as the prototype: content width **56 columns**, 256-color ANSI, narrow and tall so a screenshot fits a 9:16 story. A mockup of the final card was approved during brainstorming.

Top to bottom:

1. **Banner:** the GitHub display name in ANSI-Shadow block letters with a cyan→pink gradient.
   - Fallbacks: if the name doesn't fit in 56 columns or contains characters outside A–Z (for example a Cyrillic name), use the login. If that fails too, print plain bold text.
   - `--banner "text"` overrides the banner text. A positional argument is always a username (section 8).
2. **Subtitle:** `github.com/<login>` · the top three languages.
3. **STATS:**
   - repos: total, then private · public
   - contributions: past year, then all-time
   - streak: current, then best in the past year
   - busiest day: count and date
   - active: repos pushed in the last 30 days
   - coding since: account creation year, then years
4. **STACK:** the top 6 primary languages by repo count (forks excluded), with "Other" for the rest. Bars are scaled to the largest language, and each row shows a percentage and a repo count.
5. **LAST 6 MONTHS:** a contribution grid of the last 26 weeks with Mon/Wed/Fri labels, month labels, and a less→more legend. The left of the legend row reads "N in 6 months".
6. **CURRENTLY BUILDING (with the AI meter):** the 6 repos where **the user most recently authored a commit**. The candidates are any repo they committed to: owned, collaborator or organization. Rank by the user's own latest commit date, not `pushedAt`, which on shared repos includes teammates' pushes. *(Claude's call: "currently building" should mean where you actually commit, and many people's real work lives in org repos.)*
   - Fallback: if fewer than 6 repos have commits by the user in the 90-day window, fill the rest with the user's most recently pushed owned repos. Those rows show a dim `no commits in 90d` in place of the bar and percentage.
   - **Exact row layout** (56 columns), matching `mockups/card.html`:

     | Columns | Field | Notes |
     |---|---|---|
     | 1–2 | recency dot + space | green under 24h, yellow under 7d, gray older; measured from the user's latest commit |
     | 3–22 | repo name | 20 columns, left-aligned; longer names cut to 19 characters + `…` |
     | 23–28 | language | 6 columns. Short labels: TypeScript→`TS`, JavaScript→`JS`, Python→`Py`, Kotlin→`Kt`, Dart, Go, Rust, Swift, Java, Ruby, C, C++, C#, HTML, CSS, Vue, Shell→`Sh`. Anything else is cut to 5 characters. |
     | 29–38 | AI bar | 10 cells; `▰` filled (pink), `▱` empty (dark gray) |
     | 39 | space | |
     | 40–43 | percentage | right-aligned, `0%`–`100%`, bold |
     | 44–46 | ` AI` | dim |
     | 47–56 | age | right-aligned: `17m`, `13h`, `2d`, `3mo`, `1y` |
   - Below the list: `overall NN% AI-assisted · sidekick <top AI model>`.
   - Then a dim footnote: `AI = commits signed by an AI co-author/agent, last 90d`.
7. **Footer:** a prompt line with a random dev-joke tagline and a blinking cursor block. A dim `npx ghflex` sits right-aligned on the same line, ending at column 56.
   - If the tagline and the `npx ghflex` label don't both fit with at least 2 spaces between them, `npx ghflex` moves to its own right-aligned line below.
   - **This line is always on the card.** Most people will screenshot their terminal instead of using `--story`, so this is the main way a story tells viewers how to get their own. There's no flag to turn it off in v1. *(Owner's decision.)*

Behavior carried over from the prototype:
- It clears the screen first.
- It reveals the card line by line with a short delay when stdout is a TTY. `--fast` or a non-TTY skips the animation.
- It hides the cursor during the reveal and always restores it, including on Ctrl-C.

## 6. The AI meter: exact definition

- **Window:** commits in the last 90 days, on each repo's default branch.
- **Which commits count:**
  - Commits **authored by the user**, matched by their GitHub account. GitHub only links a commit to an account when the commit email is verified on that account, so commits under unlinked emails are missed. The README says so.
  - Plus commits made by **AI agent accounts** in repos the user owns.
- **Buckets:**
  - **mixed:** a user-authored commit whose message has an AI `Co-authored-by:` trailer, or a known generated-by marker (for example "Generated with Claude Code", or Aider's `aider:` prefix).
  - **agent:** a commit whose author is a known AI bot account (for example `copilot-swe-agent`, `devin-ai-integration[bot]`, `google-labs-jules[bot]`, `claude[bot]`, `chatgpt-codex-connector[bot]`).
  - **you:** every other user-authored commit.
- **AI %** = (mixed + agent) / (mixed + agent + you). Count commits, not lines. The API can't cheaply exclude lockfiles and generated code, which distorts line counts.
- **Sidekick:** the most frequent AI co-author name across the window, shown as it appears in the trailer (for example "Claude Opus 5.5").
- **The overall % covers every repo the user committed to in the window,** not just the 6 shown: owned, collaborator and organization repos.
- **Which repos feed which part of the card** *(Claude's call)*:
  - **Owned repos** (forks excluded where noted), as in the prototype, feed:
    - the repos stat
    - the active stat
    - the STACK chart
    - the subtitle languages
  - **Every repo the user committed to** feeds:
    - "Currently building"
    - the AI meter
- **Finding those repos:** `contributionsCollection.commitContributionsByRepository` is **not** usable here. In testing it hid private-repo contributions even from the account's own token: it returned 2 repos and 29 commits, while about 780 were "restricted". Instead:
  1. List `viewer.repositories(ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER])` with `pushedAt` inside the window.
  2. Read each repo's default-branch history filtered by the user's author id.
  3. Members of huge orgs may have hundreds of candidate repos. Cap the scan, for example at the 60 most recently pushed, and note on the card when it was capped.
- **Signature patterns live in one data file** (trailer patterns, message markers, bot logins), so contributors can add new AI tools with a one-line PR.

**What's known about performance:** reading a full year (54 repos, about 800 commits) through GraphQL took about 42 seconds. Large batched queries returned HTTP 502, and 5 repos × 50 commits per query worked. A 90-day window cuts the volume to roughly a quarter. The builder should fetch only the fields the meter needs (the commit message and author, not additions) and run a few queries concurrently to hit the 10-second target.

**Peek mode:** the meter and "Currently building" use **public repos the person committed to**, owned or not.
- Find them through `user(login).contributionsCollection.commitContributionsByRepository`, which lists public contributions, plus their public owned repos.
- Then filter every repo to `isPrivate == false` before reading history, even if the viewer's token can see more.
- Any positional argument means peek mode, even if it's the viewer's own login. *(Claude's call: this gives an easy "what do others see?" check.)*

## 7. Auth

The tool tries these in order:
1. `GITHUB_TOKEN` or `GH_TOKEN` environment variable
2. `gh auth token`, if the GitHub CLI is installed and logged in
3. a token saved by ghflex earlier
4. an interactive prompt

The prompt explains the choice: run `gh auth login`, or open a pre-filled "new token" link with the needed scopes, paste the token once, and ghflex saves it to `~/.config/ghflex/token` with mode 0600. `ghflex --logout` deletes the saved token.

Everything uses GitHub's GraphQL API, which needs a token even for public data. So peek mode also needs the viewer to be logged in.

## 8. Commands and flags

| Usage | What it does |
|---|---|
| `npx ghflex` | your card (includes private repos your token can see) |
| `npx ghflex <username>` | someone else's card, public data only |
| `--banner "text"` | custom banner text (A–Z and spaces) |
| `--hide-private` | replaces private repo names with a masked label, while keeping counts and stats |
| `--story` | also saves `ghflex-story.png` (1080×1920) in the current folder and prints its path |
| `--theme <name>` | color gradient: `neon` (default, cyan→pink), `sunset` (yellow→pink), `matrix` (greens) |
| `--fast` | no reveal animation |
| `--no-clear` | don't clear the screen first |
| `--logout` | delete the saved token |

The prototype's "custom banner as positional argument" moves to `--banner`, so the positional argument can mean a username.

## 9. `--story` PNG

- Rendered from the same card data, not a screenshot: the card on a dark background with a subtle purple radial glow, as in `mockups/card.html`.
  - The thin bar at the top of that mockup is Instagram's own story UI. It is **not** part of the PNG.
- The card's footer already carries the `npx ghflex` label (section 5). The PNG keeps it where the card puts it and adds nothing else.
- Exactly 1080×1920.
- Uses a bundled open-licensed monospace font that has box-drawing, block (█ ▰ ▱) and ■ glyphs, so the output looks identical on every machine.
- The renderer must work under `npx` with no native compilation. Prebuilt binaries such as `@resvg/resvg-js` are fine.

## 10. Repo, README, AGENTS.md

- **Repo:** public `Sezos/ghflex` on GitHub, MIT license. Published to npm as `ghflex` with a `ghflex` binary.
- **README,** following the approved mockup, in this order:
  1. title and one-line pitch ("Your whole GitHub in one screenshot. Stats, stack, streak, and how much of it AI wrote.") and badges
  2. two demo images side by side: an animated GIF of the reveal, and a `--story` PNG showing `--hide-private` and a second theme
  3. "Try it in 5 seconds": `npx ghflex`, then `npx ghflex torvalds`
  4. "Or let your AI do it": a copyable prompt, `Set up ghflex for me: https://github.com/Sezos/ghflex/blob/main/AGENTS.md`
  5. "Post it": `--story`, plus screenshot tips (a narrow, tall window)
  6. the options table
  7. "How the AI meter works": the definition from section 6 in plain words, including the unlinked-email caveat and that autocomplete is never counted
  8. a privacy note: what is read, and that nothing leaves your machine except GitHub API calls
- **Demo assets must be reproducible and safe:**
  - The GIF is recorded from a checked-in terminal-recording script, for example a VHS `.tape` file.
  - All published demo images use `--hide-private`.
- **`AGENTS.md`** is written for AI coding agents setting ghflex up for a user. It covers:
  - check Node ≥ 22
  - check `gh auth status` or a token, and guide the user through `gh auth login` if needed
  - never ask the user to paste a token into the chat
  - run `npx ghflex`, and optionally add a shell alias
  - common errors and their fixes

## 11. Tech decisions (made by Claude, not the owner)

- TypeScript, **Node ≥ 22** (Node 18 and 20 are past end of life as of late 2026), ESM, published to npm. Small dependency footprint; hand-rolled ANSI output like the prototype.
- Unit tests at minimum for:
  - the signature classifier
  - streak and busiest-day math
  - layout: every rendered line is ≤ 56 visible columns, for long repo names, long language names, zero-data accounts, and accounts with no contributions
- GitHub Actions for lint and tests. npm publishing happens from a manually triggered workflow with provenance.

## 12. Left to the builder

- Code structure, GraphQL query shapes, batching, retry and backoff on 502s, concurrency.
- An optional short-lived local cache (about an hour) so re-running for `--story` is instant. Recommended, not required.
- Which font, and which PNG rasterizer, within the constraints in section 9.
- The exact masked label for `--hide-private`. It must keep column alignment, so avoid emoji whose width varies by terminal.
- The tagline list.

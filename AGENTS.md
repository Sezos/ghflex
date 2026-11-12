# Setting up ghflex (for AI coding agents)

You're helping a user run **ghflex**, a CLI that prints a story-sized card of their GitHub stats, including how much of their recent work was AI-assisted. Follow these steps in order. Run the commands yourself where you can, and say what each one does in a line.

**Never ask the user to paste a token into this chat.** Tokens belong in the GitHub CLI or the user's own terminal, never in a conversation.

## 1. Check Node

```bash
node --version
```

ghflex needs Node 22 or newer.

- If Node is missing or older, tell the user.
- Suggest the current LTS from https://nodejs.org, or `nvm install --lts` if they use nvm.
- Ask before installing anything.

## 2. Check the GitHub login

```bash
gh auth status
```

- **"Logged in to github.com":** go on to step 3.
- **`gh` is installed but not logged in:** ask the user to run `gh auth login` in their own terminal. It opens a browser. Wait until they say it's done.
- **`gh` isn't installed:** offer two options and let the user choose:
  - Install the GitHub CLI (https://cli.github.com, or `brew install gh` on macOS). Ask before installing it.
  - Create a token at https://github.com/settings/tokens/new?scopes=repo,read:user&description=ghflex and add `export GITHUB_TOKEN=...` to their own shell profile themselves. Don't ask them to paste it to you.

## 3. Run it

```bash
npx ghflex
```

- It takes about 5–10 seconds the first time.
- Tell the user about `npx ghflex --story --hide-private`. It saves an Instagram-ready `ghflex-story.png` with private repo names masked.
- They can also try `npx ghflex <any-username>` to see someone else's public card.

## 4. Optional: a shortcut

Offer one of these, and ask first since both change their setup:

- install it globally: `npm install -g ghflex`, then just run `ghflex`
- add an alias to their shell profile: `alias flexcard='npx ghflex@latest'` in `~/.zshrc` or `~/.bashrc`

## Common errors

| Message                                | Fix                                                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `No GitHub login found`                | Do step 2.                                                                                                                    |
| `GitHub rejected your token (401)`     | The login expired. Run `gh auth login` again, or `npx ghflex --logout` to drop a saved token.                                 |
| `GitHub refused the request (403)`     | The token is missing the `repo` and `read:user` scopes.                                                                       |
| `GitHub rate limit hit`                | Wait a few minutes and run it again.                                                                                          |
| `No GitHub user named '…'`             | Check the spelling. Organization accounts don't have cards.                                                                   |
| `The --story fonts are missing`        | Run the latest version: `npx ghflex@latest --story`.                                                                          |
| Garbled boxes instead of block letters | The terminal font lacks box-drawing characters. Use a modern monospace font such as SF Mono, JetBrains Mono or Cascadia Code. |

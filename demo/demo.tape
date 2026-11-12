# Records demo/demo.gif with https://github.com/charmbracelet/vhs (run via scripts/demo.sh).
# Uses the local build but shows the real command. Private repo names are always masked.

Output demo/demo.gif

Set Shell "bash"
Set FontSize 16
Set Width 740
Set Height 1100
Set Padding 28
Set TypingSpeed 55ms
Set Theme { "name": "ghflex", "background": "#0b0d12", "foreground": "#d0d0d0", "cursor": "#ff87ff", "selection": "#2a2140", "black": "#0b0d12", "red": "#ff5f87", "green": "#00ff00", "yellow": "#ffd700", "blue": "#0087ff", "magenta": "#ff87ff", "cyan": "#00d7ff", "white": "#eeeeee", "brightBlack": "#6c6c6c", "brightRed": "#ff87af", "brightGreen": "#5fff87", "brightYellow": "#ffff87", "brightBlue": "#5fafff", "brightMagenta": "#ffafff", "brightCyan": "#87ffff", "brightWhite": "#ffffff" }

Hide
Type `npx() { shift; node "$PWD/dist/cli.js" "$@"; }; export PS1='$ '; clear`
Enter
Show

Sleep 400ms
Type "npx ghflex --hide-private"
Sleep 400ms
Enter
Sleep 20s

# arrows-puzzle-web

A browser port of *Arrows Puzzle Escape*, the game about clearing a crowded board of winding arrows. One clears an arrow by clicking or tapping on it, but an arrow can only leave when the path in front of its head is open; each level becomes a small untangling problem, which has a surprisingly soothing effect on... some people, including me.

Play it here: https://dinghaoluo.github.io/arrows-puzzle-web/

The game runs on an HTML5 canvas with mouse and touch support (pan, pinch zoom). There are 54 levels that grow denser across the set, easy and hard modes, lives, star scoring, and a fun mode with particles.

## running locally

Browsers block local file requests for security reasons, so double-clicking `index.html` won't load the puzzle data. You need a one-line local server:

```bash
# python (already installed on mac and most linux)
python3 -m http.server

# or, if you have node
npx serve
```

Then open `http://localhost:8000` (python) or `http://localhost:3000` (node).

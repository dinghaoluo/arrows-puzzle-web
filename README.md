# arrows_puzzle_web

This is a static web-bsaed implementation of an arrows puzzle game inspired by *Arrows Puzzle Escape*, a game about clearing a crowded board of winding arrows. 

One clears an arrow by clicking/tapping on it, and an arrow can leave only when the path in front of its head is open. Hence each level becomes a small untangling problem, which has a surprisingly soothing effect on... some people, including me.

The game runs on an HTML5 canvas and is built for both mouse and touch. Pan and zoom help with larger levels, and the board grows denser across the level set. There are also easy and hard modes, scoring, lives, stars, and a small option for a fun mode.

The site is served directly from the repository root. The level files are in `puzzles/`.
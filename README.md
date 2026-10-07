# InkDuel

Timed writing duels for your class. **https://inkduel.stipe.app**

A prompt goes up on the board and the clock starts. Every student writes on their own device,
and texts submit themselves when time runs out. Then each student judges two texts from their
own team, and the best text from each team goes to a class vote. It's free, and students only
need a PIN and a first name.

## For teachers

- **42 built-in challenges**, mostly for grades 9-10, tagged by level (6-8, 9-10, 11-12) and type:
  stories, description and picture prompts, arguments, poetry, literature, reflection, word games.
- **Write your own** challenges with your own picture, winning criterion, duel question and tip
  card. Share one with a colleague as a link, or move them all as a file.
- **Controls during the game**: pause, add or take away time, end a phase early, swap the
  challenge, remove a player, lock joining, replace a finalist with the team's runner-up.
- **Spot the technique**: while you read the finalists aloud, tap a technique (comparisons, sound
  words, alliteration, dialogue, senses, repetition, linking words, evidence) to highlight it.
- **Settings**: spell check on or off, paste blocking, tip cards, teammates' first words, one or
  two duels per student, duel and vote timers, extra blocked words.
- **Report**: every text from every round, by round or by student, as CSV, as a Google Docs paste,
  or printed. It stays in your browser.
- Texts that name a classmate or use a blocked word sit out the duels; you still see them.

## For students

Go to inkduel.stipe.app, type the PIN, type your name. You get a team, write, judge, vote, and
can download everything you wrote at the end.

## Privacy

There are no accounts and no email addresses. A game's texts are deleted from the server a day
after its last activity. Teachers' challenges and reports live in their own browser.

## Running it

See `CLAUDE.md`. React + Vite on Cloudflare Pages; each game room is a Cloudflare Durable Object
reached over WebSockets.

// The built-in challenge library. Written for high schoolers first (grades 9-10, ages 14-16),
// with some for 6-8 and 11-12; every challenge is tagged so a teacher can filter by level.
// Picture prompts use public-domain paintings and NASA photos, shipped in public/img.

import type { Challenge, Kind, Level } from '../../shared/protocol';

export const LEVELS: { id: Level; label: string }[] = [
  { id: '6-8', label: 'Grades 6–8' },
  { id: '9-10', label: 'Grades 9–10' },
  { id: '11-12', label: 'Grades 11–12' },
];

export const KINDS: Record<Kind, { label: string; emoji: string }> = {
  story: { label: 'Story', emoji: '📖' },
  description: { label: 'Description', emoji: '🎨' },
  argument: { label: 'Argument', emoji: '⚖️' },
  poetry: { label: 'Poetry', emoji: '🪶' },
  literature: { label: 'Literature', emoji: '📚' },
  reflection: { label: 'Reflection', emoji: '🪞' },
  wordplay: { label: 'Word games', emoji: '🧩' },
};

type Def = Omit<Challenge, 'id' | 'levels'> & { id: string; levels: Level[] };
const L = (...l: Level[]) => l;

const DEFS: Def[] = [
  // ---- stories ----
  {
    id: 'last-message', kind: 'story', emoji: '📱', levels: L('9-10', '11-12'), seconds: 240,
    title: 'The Last Message',
    prompt: 'Your phone buzzes at 2:13 a.m. One new message, from a number that was disconnected years ago. Write what it says and what happens next.',
    criterion: 'Suspense', question: 'Which text builds more suspense?',
    tips: ['Start with the exact words of the message.', 'Slow down: describe one small detail before you reveal anything.', 'What does your character do first, and why?', 'End on a line that makes the reader lean in.'],
  },
  {
    id: 'between-floors', kind: 'story', emoji: '🛗', levels: L('9-10'), seconds: 240,
    title: 'Between Floors',
    prompt: 'The elevator stops between floors. Inside: you and a stranger who is far too calm about it. Write the scene.',
    criterion: 'Tension', question: 'Which scene has more tension?',
    tips: ['Use the setting: the hum, the buttons, the light.', 'Let dialogue hint at what the stranger knows.', 'Short sentences speed the reader up.', 'What does the stranger say that changes everything?'],
  },
  {
    id: 'first-paragraph', kind: 'story', emoji: '🪝', levels: L('6-8', '9-10', '11-12'), seconds: 180,
    title: 'Hook Me',
    prompt: 'Write the first paragraph of a novel that nobody could put down. Any genre.',
    criterion: 'Hook', question: 'Which opening makes you most want to keep reading?',
    tips: ['Begin in the middle of something happening.', 'Give one specific, surprising detail.', 'Plant a question the reader needs answered.', 'Try opening with a line of dialogue.'],
  },
  {
    id: 'wrong-suitcase', kind: 'story', emoji: '🧳', levels: L('6-8', '9-10'), seconds: 240,
    title: 'The Wrong Suitcase',
    prompt: 'At the airport you grab the wrong suitcase, and only notice when you open it at home. What is inside, and what do you do about it?',
    criterion: 'Originality', question: 'Which story is more original?',
    tips: ['The first thing you see inside is…', 'Whose bag is it? Let one object tell us.', 'Raise the stakes: why does this matter now?', 'Give it an ending we did not see coming.'],
  },
  {
    id: 'two-sides-door', kind: 'story', emoji: '🚪', levels: L('9-10', '11-12'), seconds: 300,
    title: 'Two Sides of a Door',
    prompt: 'Write the same moment twice: first from the person knocking, then from the person who will not open the door.',
    criterion: 'Point of view', question: 'Which text shows two points of view more convincingly?',
    tips: ['Give each person a different reason to be there.', 'Let each one notice different details.', 'What does each one get wrong about the other?', 'Use the same line of dialogue in both halves.'],
  },
  {
    id: 'unsent-letter', kind: 'story', emoji: '✉️', levels: L('9-10', '11-12'), seconds: 240,
    title: 'The Unsent Letter',
    prompt: 'Write a letter that someone wrote but never sent. Who is it to, and why did it stay in the drawer?',
    criterion: 'Emotion', question: 'Which letter makes you feel more?',
    tips: ['Dear…', 'Start with something small and everyday.', 'Hint at the reason it was never sent.', 'End with the sentence that was hardest to write.'],
  },
  {
    id: 'villain-side', kind: 'story', emoji: '🐺', levels: L('6-8', '9-10'), seconds: 240,
    title: "The Villain's Side",
    prompt: 'Retell a fairy tale or a story everyone knows from the villain\'s point of view. Make us understand them.',
    criterion: 'Sympathy', question: 'Which villain do you understand better?',
    tips: ['Nobody ever asks me why I…', 'What did the hero do that no one talks about?', 'Give the villain a reason, not an excuse.', 'Use first person: I, me, my.'],
  },
  {
    id: 'dialogue-only', kind: 'wordplay', emoji: '💬', levels: L('9-10', '11-12'), seconds: 240,
    title: 'Nobody Says It',
    prompt: 'Two people each have bad news for the other, and neither wants to go first. Write the scene in dialogue only: no narration at all.',
    criterion: 'Subtext', question: 'Which conversation says more without saying it?',
    tips: ['Start with small talk that is not really small talk.', 'Let them interrupt and dodge each other.', 'What is the one word they both avoid?', 'Who finally breaks, and how?'],
  },
  {
    id: 'time-capsule', kind: 'story', emoji: '⏳', levels: L('6-8', '9-10'), seconds: 240,
    title: 'Time Capsule',
    prompt: 'In 2076, a student opens a time capsule your class buried today. Write what they find, and what they decide about us.',
    criterion: 'Insight', question: 'Which text says more about how we live now?',
    tips: ['List three objects in the capsule.', 'What would confuse someone from the future?', 'Write the future student\'s reaction in their own voice.', 'End with what they keep, and why.'],
  },
  {
    id: 'fifty-words', kind: 'wordplay', emoji: '🔢', levels: L('9-10', '11-12'), seconds: 240,
    title: 'Fifty Words',
    prompt: 'Tell a complete story in exactly 50 words, with a beginning, a middle and an end.',
    criterion: 'Impact', question: 'Which tiny story hits harder?',
    tips: ['Pick one moment, not a whole life.', 'Cut every word that is not working.', 'Let the last line turn or land.', 'Count: exactly 50.'],
  },
  {
    id: 'six-words', kind: 'wordplay', emoji: '6️⃣', levels: L('6-8', '9-10', '11-12'), seconds: 150,
    title: 'Six-Word Memoir',
    prompt: 'Tell a life story (yours or a character\'s) in exactly six words. Then add two sentences explaining it.',
    criterion: 'Impact', question: 'Which six words stay with you?',
    tips: ['A famous one: "For sale: baby shoes, never worn."', 'Concrete nouns beat big ideas.', 'Punctuation can do a lot of work.', 'Read it aloud: does it have rhythm?'],
  },
  {
    id: 'social-feed', kind: 'literature', emoji: '📲', levels: L('9-10'), seconds: 240,
    title: 'The Worst Day, Posted',
    prompt: 'Write three social media posts a character from a book or play you have read would make on the worst day of their story.',
    criterion: 'Voice', question: 'Which posts sound most like the character?',
    tips: ['Who is posting, and to whom?', 'Post 1: before it goes wrong.', 'Post 3: what they would never say in person.', 'Hashtags and comments can reveal a lot.'],
  },

  // ---- description and picture prompts ----
  {
    id: 'wanderer', kind: 'description', levels: L('9-10', '11-12'), seconds: 240,
    image: '/img/wanderer.jpg', credit: 'Caspar David Friedrich, Wanderer above the Sea of Fog (c. 1818). Public domain.',
    title: 'Above the Fog',
    prompt: 'The man in this painting climbed all night to reach this spot. Who is he, and what has he come here to find?',
    criterion: 'Atmosphere', question: 'Which text has the stronger atmosphere?',
    tips: ['Describe what he hears, not just what he sees.', 'What did he leave behind at the bottom?', 'Let the fog stand for something.', 'Write his first words when he reaches the top.'],
  },
  {
    id: 'great-wave', kind: 'description', levels: L('6-8', '9-10'), seconds: 180,
    image: '/img/great-wave.jpg', credit: 'Katsushika Hokusai, The Great Wave off Kanagawa (c. 1831). Public domain.',
    title: 'The Great Wave',
    prompt: 'You are in one of the boats. Describe the three seconds before the wave breaks.',
    criterion: 'Intensity', question: 'Which text feels more intense?',
    tips: ['Stretch three seconds across the whole text.', 'Use the senses: spray, salt, the roar.', 'What do you grab onto?', 'Try very short sentences at the end.'],
  },
  {
    id: 'cafe-terrace', kind: 'description', levels: L('9-10'), seconds: 240,
    image: '/img/cafe-terrace.jpg', credit: 'Vincent van Gogh, Café Terrace at Night (1888). Public domain.',
    title: 'Café Terrace at Night',
    prompt: 'Choose one person at this café. Write what they are thinking right now.',
    criterion: 'Character', question: 'Which character feels most real?',
    tips: ['Who are they waiting for, or avoiding?', 'Mention one thing on their table.', 'Let their thoughts wander, the way thoughts do.', 'End with a decision.'],
  },
  {
    id: 'rainy-paris', kind: 'story', levels: L('9-10', '11-12'), seconds: 240,
    image: '/img/rainy-paris.jpg', credit: 'Gustave Caillebotte, Paris Street; Rainy Day (1877). Public domain.',
    title: 'Paris Street, Rainy Day',
    prompt: 'Two people in this painting are about to walk straight into each other. Write the moment, and what it changes for both of them.',
    criterion: 'Story', question: 'Which text tells the better story?',
    tips: ['Give each umbrella-holder a secret.', 'Use the rain.', 'What is said, and what is not?', 'Jump forward a year in the last line.'],
  },
  {
    id: 'gulf-stream', kind: 'description', levels: L('9-10', '11-12'), seconds: 240,
    image: '/img/gulf-stream.jpg', credit: 'Winslow Homer, The Gulf Stream (1899). Public domain.',
    title: 'Adrift',
    prompt: 'Write the thoughts of the man on the boat, in his own voice.',
    criterion: 'Voice', question: 'Which text has the strongest voice?',
    tips: ['How long has he been out here?', 'What does he notice that we might miss?', 'Does he see the ship on the horizon?', 'Let his thoughts jump around.'],
  },
  {
    id: 'earthrise', kind: 'description', levels: L('6-8', '9-10'), seconds: 180,
    image: '/img/earthrise.jpg', credit: 'NASA, Earthrise, Apollo 8 (1968). Public domain.',
    title: 'Earthrise',
    prompt: 'You are the first person ever to see this view. Write the message you radio back to Earth.',
    criterion: 'Wonder', question: 'Which message captures the moment better?',
    tips: ['Houston, you need to see…', 'Compare Earth to something small and familiar.', 'Who are you thinking of down there?', 'What should everyone on Earth hear right now?'],
  },
  {
    id: 'hunters-snow', kind: 'story', levels: L('9-10', '11-12'), seconds: 240,
    image: '/img/hunters-snow.jpg', credit: 'Pieter Bruegel the Elder, The Hunters in the Snow (1565). Public domain.',
    title: 'Coming Home Empty',
    prompt: 'The hunters are walking home with almost nothing. Write the conversation when they reach the village.',
    criterion: 'Mood', question: 'Which text has the stronger mood?',
    tips: ['Who speaks first, and who stays quiet?', 'Use the cold.', 'What do the people waiting already know?', 'Find one small moment of hope.'],
  },
  {
    id: 'cafeteria-slowmo', kind: 'description', emoji: '🍕', levels: L('6-8', '9-10'), seconds: 180,
    title: 'Cafeteria in Slow Motion',
    prompt: 'Describe the first thirty seconds of lunch in the school cafeteria, in slow motion, using all five senses.',
    criterion: 'Detail', question: 'Which description puts you right there?',
    tips: ['Start with a sound.', 'Zoom in on one tiny thing: a tray, a fork, a spill.', 'Smell and taste are the senses most writers forget.', 'Slow motion means long sentences that hold time still.'],
  },
  {
    id: 'abandoned-place', kind: 'description', emoji: '🏚️', levels: L('9-10', '11-12'), seconds: 240,
    title: 'Something Happened Here',
    prompt: 'Describe a place where something important happened a long time ago. Never say what happened: let the details hint.',
    criterion: 'Show, don\'t tell', question: 'Which text hints best without telling?',
    tips: ['Pick three objects that were left behind.', 'What has nature taken back?', 'One detail should feel wrong.', 'Never name the event.'],
  },
  {
    id: 'weather-mood', kind: 'description', emoji: '⛈️', levels: L('9-10'), seconds: 180,
    title: 'Weather Report',
    prompt: 'Describe a storm so that the weather shows how a character feels, without ever naming the feeling.',
    criterion: 'Mood', question: 'Which storm says more about the character?',
    tips: ['Is the storm coming, here, or passing?', 'Put the character somewhere specific.', 'Strong verbs: the wind ___ the windows.', 'Let the last line be calm, or not.'],
  },

  // ---- arguments ----
  {
    id: 'phones-class', kind: 'argument', emoji: '📵', levels: L('9-10', '11-12'), seconds: 240,
    title: 'Phones in Class',
    prompt: 'Should phones be allowed in high school classrooms? Take a side, give your two best reasons, and answer one objection.',
    criterion: 'Convincing', question: 'Which text convinces you more?',
    tips: ['State your claim in the first sentence.', 'Use a specific example or a number.', '"Some people say… but…" answers the other side.', 'End with what should happen now.'],
  },
  {
    id: 'four-day-week', kind: 'argument', emoji: '🗓️', levels: L('9-10', '11-12'), seconds: 240,
    title: 'The Four-Day Week',
    prompt: 'Your district wants a four-day school week with longer days. Write a short speech for or against it at the school board meeting.',
    criterion: 'Persuasion', question: 'Which speech would win over the board?',
    tips: ['Members of the board…', 'Who gains and who loses?', 'One story beats three statistics.', 'Finish with a line people will remember.'],
  },
  {
    id: 'steelman-homework', kind: 'argument', emoji: '📝', levels: L('9-10', '11-12'), seconds: 240,
    title: 'Argue the Other Side',
    prompt: 'Should homework be banned? Make the strongest case you can for the side you DISAGREE with.',
    criterion: 'Strongest argument', question: 'Which argument is stronger?',
    tips: ['First, decide what you actually believe. Then argue the opposite.', 'What would the best person on that side say?', 'Use a real example.', 'Concede one point, then win the next.'],
  },
  {
    id: 'one-or-many', kind: 'argument', emoji: '🎯', levels: L('9-10'), seconds: 240,
    title: 'One Thing or Many?',
    prompt: 'Is it better to be excellent at one thing or good at many things? Argue your answer with an example from your life, a book or a film.',
    criterion: 'Reasoning', question: 'Which text reasons more clearly?',
    tips: ['Define "excellent" and "good" first.', 'Use one example and go deep.', 'Because… which means…', 'Admit what your side costs.'],
  },
  {
    id: 'ai-essays', kind: 'argument', emoji: '🤖', levels: L('9-10', '11-12'), seconds: 240,
    title: 'Who Wrote This?',
    prompt: 'Should students be allowed to use AI to help write their essays? Write a short opinion piece for the school paper.',
    criterion: 'Convincing', question: 'Which opinion piece convinces you more?',
    tips: ['Give a headline.', 'Draw a line: what is help, and what is cheating?', 'Use an example from a real class.', 'Answer the strongest objection.'],
  },
  {
    id: 'pitch', kind: 'argument', emoji: '💡', levels: L('6-8', '9-10'), seconds: 180,
    title: 'The Pitch',
    prompt: 'Invent a product that solves an everyday problem at school. Pitch it to a skeptical investor in under 100 words.',
    criterion: 'Persuasion', question: 'Which pitch would you invest in?',
    tips: ['Start with the problem, not the product.', 'Give it a name people remember.', 'One number makes it real.', 'What does the investor get?'],
  },

  // ---- poetry ----
  {
    id: 'ode-ordinary', kind: 'poetry', emoji: '🖊️', levels: L('6-8', '9-10'), seconds: 240,
    title: 'Ode to Something Ordinary',
    prompt: 'Write an ode, a poem of praise, to an ordinary object you used today: a pencil, a backpack, a charger, a sock.',
    criterion: 'Imagery', question: 'Which poem makes the ordinary amazing?',
    tips: ['O humble…', 'Speak to the object directly.', 'Exaggerate its heroic deeds.', 'Compare it to something grand.'],
  },
  {
    id: 'i-am-from', kind: 'poetry', emoji: '🏠', levels: L('9-10'), seconds: 240,
    title: 'I Am From',
    prompt: 'Write an "I am from" poem: every line starts with "I am from" and names a specific smell, food, saying or place from your life.',
    criterion: 'Detail', question: 'Which poem paints a clearer picture of a life?',
    tips: ['I am from the smell of…', 'I am from "Don\'t forget your…"', 'Name foods, brands and places exactly.', 'End with the line that matters most.'],
  },
  {
    id: 'haiku-day', kind: 'poetry', emoji: '🍂', levels: L('6-8', '9-10', '11-12'), seconds: 240,
    title: 'One Day in Three Haiku',
    prompt: 'Write three haiku (5-7-5 syllables) that together tell what happens in one day of one season: morning, noon and night.',
    criterion: 'Imagery', question: 'Which haiku paint the clearest pictures?',
    tips: ['Each haiku is one image, not an explanation.', 'Name the season with a detail, not the word.', 'Count syllables on your fingers.', 'Let the third haiku surprise.'],
  },
  {
    id: 'metaphor-machine', kind: 'poetry', emoji: '⚙️', levels: L('6-8', '9-10'), seconds: 180,
    title: 'Monday Is…',
    prompt: 'Finish the line "Monday morning is…" with a metaphor, then keep that same metaphor going for at least five more lines.',
    criterion: 'Creativity', question: 'Which extended metaphor is cleverer?',
    tips: ['Monday morning is a…', 'Stay inside the metaphor: what are its parts?', 'Who else is in it? Teachers, alarm clocks, buses?', 'End by twisting the metaphor.'],
  },
  {
    id: 'blackout-lines', kind: 'poetry', emoji: '🌙', levels: L('11-12', '9-10'), seconds: 240,
    title: 'What the Night Knows',
    prompt: 'Write a poem in which the night speaks to someone who cannot sleep. Give the night a personality.',
    criterion: 'Voice', question: 'Which night has the stronger personality?',
    tips: ['I am the night, and I…', 'What does the night see that nobody else sees?', 'Is the night kind, cruel or bored?', 'Use line breaks to control pace.'],
  },

  // ---- literature ----
  {
    id: 'fault-stars', kind: 'literature', emoji: '✨', levels: L('9-10', '11-12'), seconds: 240,
    title: 'Not in Our Stars',
    prompt: '"The fault, dear Brutus, is not in our stars, but in ourselves." (Shakespeare, Julius Caesar). Agree or disagree, using an example from a book, a film or life.',
    criterion: 'Insight', question: 'Which text says something more thoughtful?',
    tips: ['Put the quote in your own words first.', 'Fate or choice: pick a side.', 'One example, explained well.', 'What would Brutus say to you?'],
  },
  {
    id: 'character-trial', kind: 'literature', emoji: '⚖️', levels: L('9-10', '11-12'), seconds: 300,
    title: 'Character on Trial',
    prompt: 'Choose a character from a book you have read. Write the closing argument proving they are guilty, or innocent, of the worst thing they did.',
    criterion: 'Evidence', question: 'Which argument uses the story best?',
    tips: ['Members of the jury…', 'Name the act and the moment it happened.', 'Use a quote or a specific scene as evidence.', 'Deal with the other side\'s best point.'],
  },
  {
    id: 'missing-scene', kind: 'literature', emoji: '🎭', levels: L('9-10', '11-12'), seconds: 300,
    title: 'The Missing Scene',
    prompt: 'Write a scene that happens offstage in a story your class has read: something the author never shows.',
    criterion: 'True to the story', question: 'Which scene feels most like the original?',
    tips: ['Choose a gap: before, between or after the chapters.', 'Keep the characters\' voices.', 'It should add something the reader didn\'t know.', 'Keep it consistent with the book.'],
  },
  {
    id: 'dear-author', kind: 'literature', emoji: '📮', levels: L('9-10', '11-12'), seconds: 240,
    title: 'Dear Author',
    prompt: 'Choose a book or story you read this year. Write to the author: one thing that worked, one thing you would change, and why.',
    criterion: 'Insight', question: 'Which letter would the author learn more from?',
    tips: ['Be specific: name a chapter, a line or a character.', 'Say why it worked, not just that it did.', 'Suggest a change and what it would fix.', 'Ask the author one real question.'],
  },

  // ---- reflection ----
  {
    id: 'small-moment', kind: 'reflection', emoji: '🌤️', levels: L('6-8', '9-10'), seconds: 240,
    title: 'A Small Moment',
    prompt: 'Write about a small moment that changed how a whole day went. Make the reader see it.',
    criterion: 'Detail', question: 'Which moment can you see most clearly?',
    tips: ['Zoom in on ten seconds.', 'Where were you, exactly?', 'What did you notice that nobody else did?', 'How was the day different after?'],
  },
  {
    id: 'note-to-12', kind: 'reflection', emoji: '🗒️', levels: L('9-10', '11-12'), seconds: 240,
    title: 'Note to Your Younger Self',
    prompt: 'Write a short note to yourself at twelve. What do you know now that you wish you had known then?',
    criterion: 'Honesty', question: 'Which note feels most honest?',
    tips: ['Hey, it\'s me. Listen…', 'One specific memory beats general advice.', 'What will twelve-year-old you not believe?', 'End with something kind.'],
  },

  // ---- word games ----
  {
    id: 'no-e', kind: 'wordplay', emoji: '🚫', levels: L('6-8', '9-10', '11-12'), seconds: 180,
    title: 'The Missing Letter',
    prompt: 'Describe your morning routine without using the letter E even once.',
    criterion: 'Cleverness', question: 'Which text pulls it off best?',
    tips: ['Watch out for "the", "he", "she" and "me".', 'Swap words: "morning" works, "breakfast" does not.', 'Short words are your friends.', 'Re-read for sneaky Es before time runs out.'],
  },
  {
    id: 'all-questions', kind: 'wordplay', emoji: '❓', levels: L('6-8', '9-10'), seconds: 180,
    title: 'Only Questions',
    prompt: 'Tell a story in which every sentence is a question.',
    criterion: 'Creativity', question: 'Which question-story works better?',
    tips: ['Who knocked on the door at midnight?', 'Questions can still move the plot forward.', 'Mix short and long questions.', 'Is the last question answered?'],
  },
  {
    id: 'alphabet-story', kind: 'wordplay', emoji: '🔤', levels: L('9-10'), seconds: 360,
    title: 'A to Z',
    prompt: 'Write a story of 26 sentences: the first begins with A, the second with B, all the way to Z.',
    criterion: 'Cleverness', question: 'Which A-to-Z story flows best?',
    tips: ['Plan the hard letters: Q, X, Z.', 'X: "Xylophones…" or "X marked the spot."', 'Keep one plot from A to Z.', 'Make the Z sentence a punchline.'],
  },
];

export const LIBRARY: Challenge[] = DEFS;

export function findBuiltIn(id: string): Challenge | undefined {
  return LIBRARY.find((c) => c.id === id);
}

export function blankChallenge(): Challenge {
  return {
    id: `my-${Date.now().toString(36)}`,
    title: '',
    prompt: '',
    criterion: '',
    question: '',
    seconds: 240,
    levels: ['9-10'],
    kind: 'story',
    tips: [],
    emoji: '✍️',
    custom: true,
  };
}

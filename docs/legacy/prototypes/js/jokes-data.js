// Load jokes data
let jokesData = null;

async function loadJokes() {
    try {
        const response = await fetch('../data/jokes.json');
        jokesData = await response.json();
        return jokesData;
    } catch (error) {
        console.error('Error loading jokes:', error);
        // Fallback jokes if JSON fails to load
        jokesData = {
            categories: {
                dad_jokes: {
                    title: "Dad Jokes",
                    icon: "👨",
                    jokes: [
                        {
                            setup: "Why don't scientists trust atoms?",
                            punchline: "Because they make up everything!"
                        },
                        {
                            setup: "I told my wife she was drawing her eyebrows too high.",
                            punchline: "She looked surprised!"
                        }
                    ]
                },
                knock_knock: {
                    title: "Knock Knock Jokes",
                    icon: "🚪",
                    jokes: [
                        {
                            setup: "Knock knock. Who's there? Interrupting cow.",
                            punchline: "Interrupting cow w- MOO!"
                        }
                    ]
                }
            }
        };
        return jokesData;
    }
}

// Export for use in other scripts
window.jokesData = jokesData;
window.loadJokes = loadJokes;
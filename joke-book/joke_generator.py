#!/usr/bin/env python3
"""
Interactive Joke Generator
A fun command-line tool to get random jokes from our collection!
"""

import random
import json
import os
from datetime import datetime
from typing import List, Dict, Optional

class JokeGenerator:
    def __init__(self):
        self.jokes = {
            "dad_jokes": [
                {"setup": "Why don't scientists trust atoms?", "punchline": "Because they make up everything!"},
                {"setup": "Why did the scarecrow win an award?", "punchline": "He was outstanding in his field!"},
                {"setup": "Why did the math book look so sad?", "punchline": "Because of all of its problems!"},
                {"setup": "What do you call cheese that isn't yours?", "punchline": "Nacho cheese!"},
                {"setup": "Why couldn't the bicycle stand up by itself?", "punchline": "It was two tired!"},
                {"setup": "What do you call a bear with no teeth?", "punchline": "A gummy bear!"},
                {"setup": "Why did the coffee file a police report?", "punchline": "It got mugged!"},
                {"setup": "How do you organize a space party?", "punchline": "You planet!"},
                {"setup": "Why don't eggs tell jokes?", "punchline": "They'd crack each other up!"},
                {"setup": "What do you call a fake noodle?", "punchline": "An impasta!"},
            ],
            "one_liners": [
                "I haven't spoken to my wife in years. I didn't want to interrupt her.",
                "My therapist says I have a preoccupation with vengeance. We'll see about that.",
                "I told my wife she was drawing her eyebrows too high. She looked surprised.",
                "My wife told me to stop acting like a flamingo, so I had to put my foot down.",
                "I went to buy some camouflage trousers yesterday, but couldn't find any.",
                "I'm great at multitasking. I can waste time, be unproductive, and procrastinate all at once.",
                "Light travels faster than sound, which is why some people appear bright until they speak.",
                "Change is inevitable, except from a vending machine.",
                "I used to think I was indecisive, but now I'm not too sure.",
                "The problem with kleptomaniacs is that they always take things literally.",
            ],
            "puns": [
                "Time flies like an arrow. Fruit flies like a banana.",
                "I'm reading a book about anti-gravity. It's impossible to put down!",
                "The past, present, and future walked into a bar. It was tense.",
                "A backward poet writes inverse.",
                "Seven days without a pun makes one weak.",
                "I renamed my iPod The Titanic, so when I plug it in, it says 'The Titanic is syncing.'",
                "Parallel lines have so much in common. It's a shame they'll never meet.",
                "My girlfriend is the square root of -100. She's a perfect 10, but also imaginary.",
                "I got a job at a bakery because I kneaded dough.",
                "The rotation of earth really makes my day.",
            ],
            "animal_jokes": [
                {"setup": "What do you call a sleeping bull?", "punchline": "A bulldozer!"},
                {"setup": "Why don't oysters share?", "punchline": "Because they're shellfish!"},
                {"setup": "What do you call an alligator in a vest?", "punchline": "An investigator!"},
                {"setup": "What do you call a fish wearing a crown?", "punchline": "Sofish-ticated!"},
                {"setup": "Why do hummingbirds hum?", "punchline": "Because they don't know the words!"},
                {"setup": "What do you call a dog magician?", "punchline": "A labracadabrador!"},
                {"setup": "What do you call a pile of cats?", "punchline": "A meowtain!"},
                {"setup": "Why don't ants get sick?", "punchline": "Because they have little anty-bodies!"},
                {"setup": "What's the strongest insect?", "punchline": "A beetle - they can lift cars!"},
                {"setup": "What do you call a bee that can't make up its mind?", "punchline": "A maybe!"},
            ],
            "tech_jokes": [
                {"setup": "Why do programmers prefer dark mode?", "punchline": "Because light attracts bugs!"},
                {"setup": "How many programmers does it take to change a light bulb?", "punchline": "None. That's a hardware problem."},
                {"setup": "Why do Java developers wear glasses?", "punchline": "Because they don't C#!"},
                {"setup": "Why did the developer go broke?", "punchline": "Because he used up all his cache!"},
                {"setup": "Why did the programmer quit his job?", "punchline": "Because he didn't get arrays!"},
                {"setup": "What's the object-oriented way to become wealthy?", "punchline": "Inheritance."},
                {"setup": "Why do programmers confuse Halloween and Christmas?", "punchline": "Because Oct 31 == Dec 25!"},
                {"setup": "How do you comfort a JavaScript bug?", "punchline": "You console it!"},
                {"setup": "Why was the JavaScript developer sad?", "punchline": "Because he didn't Node how to Express himself!"},
                {"setup": "What's the best thing about a Boolean?", "punchline": "Even if you're wrong, you're only off by a bit."},
            ]
        }
        
        self.joke_history = []
        self.favorites = []
        
    def get_random_joke(self, category: Optional[str] = None) -> str:
        """Get a random joke from the collection"""
        if category and category in self.jokes:
            jokes = self.jokes[category]
        else:
            # Get jokes from all categories
            all_jokes = []
            for cat_jokes in self.jokes.values():
                all_jokes.extend(cat_jokes)
            jokes = all_jokes
        
        if not jokes:
            return "No jokes available!"
        
        joke = random.choice(jokes)
        
        # Format the joke
        if isinstance(joke, dict):
            formatted_joke = f"\n🎭 {joke['setup']}\n\n{'.' * 3}\n\n😄 {joke['punchline']}"
        else:
            formatted_joke = f"\n💬 {joke}"
        
        self.joke_history.append(formatted_joke)
        return formatted_joke
    
    def get_daily_joke(self) -> str:
        """Get the joke of the day (same for everyone on the same day)"""
        # Use today's date as seed for consistency
        today = datetime.now().strftime("%Y%m%d")
        random.seed(int(today))
        
        joke = self.get_random_joke()
        
        # Reset random seed
        random.seed()
        
        return f"\n📅 JOKE OF THE DAY ({datetime.now().strftime('%B %d, %Y')})\n{joke}"
    
    def save_favorite(self, joke: str) -> None:
        """Save a joke to favorites"""
        if joke not in self.favorites:
            self.favorites.append(joke)
            print("⭐ Joke saved to favorites!")
    
    def show_favorites(self) -> str:
        """Display all favorite jokes"""
        if not self.favorites:
            return "No favorites yet! Press 'f' after a joke to save it."
        
        result = "\n⭐ YOUR FAVORITE JOKES ⭐\n" + "=" * 40
        for i, joke in enumerate(self.favorites, 1):
            result += f"\n\n#{i}{joke}\n" + "-" * 40
        return result
    
    def show_categories(self) -> str:
        """Show available joke categories"""
        categories = "\n📚 JOKE CATEGORIES:\n" + "=" * 40 + "\n"
        for i, (key, value) in enumerate(self.jokes.items(), 1):
            formatted_name = key.replace("_", " ").title()
            categories += f"{i}. {formatted_name} ({len(value)} jokes)\n"
        return categories

def main():
    generator = JokeGenerator()
    last_joke = None
    
    print("""
    ╔══════════════════════════════════════════╗
    ║     🎭 INTERACTIVE JOKE GENERATOR 🎭      ║
    ║          Laughter Guaranteed!™            ║
    ╚══════════════════════════════════════════╝
    """)
    
    print("""
    Commands:
    --------
    [ENTER] - Get a random joke
    [d]     - Daily joke
    [c]     - Show categories
    [1-6]   - Joke from specific category
    [f]     - Save last joke to favorites
    [v]     - View favorites
    [h]     - Show history
    [q]     - Quit
    """)
    
    while True:
        choice = input("\n🎪 What would you like? ").strip().lower()
        
        if choice == "" or choice == "\n":
            last_joke = generator.get_random_joke()
            print(last_joke)
        
        elif choice == "d":
            print(generator.get_daily_joke())
        
        elif choice == "c":
            print(generator.show_categories())
        
        elif choice in ["1", "2", "3", "4", "5", "6"]:
            categories = list(generator.jokes.keys())
            if int(choice) <= len(categories):
                category = categories[int(choice) - 1]
                last_joke = generator.get_random_joke(category)
                print(f"\n📂 Category: {category.replace('_', ' ').title()}")
                print(last_joke)
        
        elif choice == "f":
            if last_joke:
                generator.save_favorite(last_joke)
            else:
                print("❌ No joke to save! Get a joke first.")
        
        elif choice == "v":
            print(generator.show_favorites())
        
        elif choice == "h":
            if generator.joke_history:
                print("\n📜 JOKE HISTORY\n" + "=" * 40)
                for joke in generator.joke_history[-5:]:  # Show last 5 jokes
                    print(joke)
                    print("-" * 40)
            else:
                print("No jokes in history yet!")
        
        elif choice == "q":
            print("\n👋 Thanks for laughing with us! Have a great day!")
            break
        
        else:
            print("❓ Invalid choice. Press ENTER for a joke or 'h' for help.")

if __name__ == "__main__":
    main()
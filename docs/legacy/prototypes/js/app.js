// Main application logic
class JokeBook {
    constructor() {
        this.currentCategory = null;
        this.currentJoke = null;
        this.currentJokeIndex = 0;
        this.favorites = JSON.parse(localStorage.getItem('favoriteJokes')) || [];
        this.laughCount = parseInt(localStorage.getItem('laughCount')) || 0;
        this.isDarkMode = localStorage.getItem('darkMode') === 'true';
        
        this.init();
    }

    async init() {
        await loadJokes();
        this.setupEventListeners();
        this.renderCategories();
        this.updateStats();
        this.loadFavorites();
        
        if (this.isDarkMode) {
            document.body.classList.add('dark-mode');
        }
    }

    setupEventListeners() {
        // Category buttons will be added dynamically
        
        // Control buttons
        document.getElementById('reveal-btn').addEventListener('click', () => this.revealPunchline());
        document.getElementById('next-btn').addEventListener('click', () => this.nextJoke());
        document.getElementById('random-btn').addEventListener('click', () => this.randomJoke());
        document.getElementById('favorite-btn').addEventListener('click', () => this.toggleFavorite());
        
        // Share buttons
        document.getElementById('copy-btn').addEventListener('click', () => this.copyJoke());
        document.getElementById('share-twitter').addEventListener('click', () => this.shareTwitter());
        document.getElementById('share-facebook').addEventListener('click', () => this.shareFacebook());
        
        // Features
        document.getElementById('toggle-favorites').addEventListener('click', () => this.toggleFavoritesList());
        document.getElementById('joke-battle').addEventListener('click', () => this.jokeBattle());
        document.getElementById('timer-mode').addEventListener('click', () => this.timerMode());
        document.getElementById('voice-mode').addEventListener('click', () => this.toggleVoiceMode());
        document.getElementById('dark-mode').addEventListener('click', () => this.toggleDarkMode());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.revealPunchline();
            } else if (e.code === 'ArrowRight') {
                this.nextJoke();
            } else if (e.code === 'ArrowLeft') {
                this.previousJoke();
            }
        });
        
        // Star rating
        document.querySelectorAll('.star').forEach(star => {
            star.addEventListener('click', (e) => this.setRating(e.target.dataset.rating));
        });
    }

    renderCategories() {
        const grid = document.getElementById('category-grid');
        grid.innerHTML = '';
        
        Object.entries(jokesData.categories).forEach(([key, category]) => {
            const btn = document.createElement('button');
            btn.className = 'category-btn';
            btn.innerHTML = `
                <span class="category-icon">${category.icon}</span>
                <span>${category.title}</span>
            `;
            btn.addEventListener('click', () => this.selectCategory(key));
            grid.appendChild(btn);
        });
    }

    selectCategory(categoryKey) {
        // Update active category button
        document.querySelectorAll('.category-btn').forEach((btn, index) => {
            btn.classList.remove('active');
        });
        event.target.closest('.category-btn').classList.add('active');
        
        this.currentCategory = categoryKey;
        this.currentJokeIndex = 0;
        this.loadJoke();
        
        // Enable control buttons
        document.getElementById('reveal-btn').disabled = false;
        document.getElementById('next-btn').disabled = false;
        document.getElementById('favorite-btn').disabled = false;
    }

    loadJoke() {
        if (!this.currentCategory) return;
        
        const jokes = jokesData.categories[this.currentCategory].jokes;
        this.currentJoke = jokes[this.currentJokeIndex];
        
        // Display the joke
        document.getElementById('joke-setup').innerHTML = `<p>${this.currentJoke.setup}</p>`;
        document.getElementById('joke-punchline').innerHTML = `<p>${this.currentJoke.punchline}</p>`;
        document.getElementById('joke-punchline').classList.add('hidden');
        
        // Reset reveal button
        document.getElementById('reveal-btn').disabled = false;
        document.getElementById('reveal-btn').innerHTML = '<span>🎭</span> Reveal Punchline';
        
        // Update favorite button
        this.updateFavoriteButton();
    }

    revealPunchline() {
        const punchline = document.getElementById('joke-punchline');
        if (punchline.classList.contains('hidden')) {
            punchline.classList.remove('hidden');
            document.getElementById('reveal-btn').disabled = true;
            this.incrementLaughCount();
            
            // Trigger confetti for really good jokes
            if (Math.random() > 0.7) {
                this.triggerConfetti();
            }
        }
    }

    nextJoke() {
        if (!this.currentCategory) return;
        
        const jokes = jokesData.categories[this.currentCategory].jokes;
        this.currentJokeIndex = (this.currentJokeIndex + 1) % jokes.length;
        this.loadJoke();
    }

    previousJoke() {
        if (!this.currentCategory) return;
        
        const jokes = jokesData.categories[this.currentCategory].jokes;
        this.currentJokeIndex = (this.currentJokeIndex - 1 + jokes.length) % jokes.length;
        this.loadJoke();
    }

    randomJoke() {
        // Select random category
        const categoryKeys = Object.keys(jokesData.categories);
        const randomCategoryKey = categoryKeys[Math.floor(Math.random() * categoryKeys.length)];
        
        // Select random joke from that category
        const jokes = jokesData.categories[randomCategoryKey].jokes;
        const randomIndex = Math.floor(Math.random() * jokes.length);
        
        this.currentCategory = randomCategoryKey;
        this.currentJokeIndex = randomIndex;
        
        // Update active category button
        document.querySelectorAll('.category-btn').forEach((btn, index) => {
            btn.classList.remove('active');
            if (Object.keys(jokesData.categories)[index] === randomCategoryKey) {
                btn.classList.add('active');
            }
        });
        
        this.loadJoke();
        
        // Enable buttons
        document.getElementById('reveal-btn').disabled = false;
        document.getElementById('next-btn').disabled = false;
        document.getElementById('favorite-btn').disabled = false;
    }

    toggleFavorite() {
        if (!this.currentJoke) return;
        
        const jokeId = `${this.currentCategory}-${this.currentJokeIndex}`;
        const favoriteIndex = this.favorites.findIndex(f => f.id === jokeId);
        
        if (favoriteIndex === -1) {
            // Add to favorites
            this.favorites.push({
                id: jokeId,
                category: this.currentCategory,
                joke: this.currentJoke
            });
            this.showNotification('Added to favorites! ❤️');
        } else {
            // Remove from favorites
            this.favorites.splice(favoriteIndex, 1);
            this.showNotification('Removed from favorites');
        }
        
        localStorage.setItem('favoriteJokes', JSON.stringify(this.favorites));
        this.updateFavoriteButton();
        this.loadFavorites();
    }

    updateFavoriteButton() {
        const btn = document.getElementById('favorite-btn');
        const jokeId = `${this.currentCategory}-${this.currentJokeIndex}`;
        const isFavorite = this.favorites.some(f => f.id === jokeId);
        
        if (isFavorite) {
            btn.innerHTML = '<span>💔</span> Remove Favorite';
        } else {
            btn.innerHTML = '<span>❤️</span> Add to Favorites';
        }
    }

    loadFavorites() {
        const list = document.getElementById('favorites-list');
        
        if (this.favorites.length === 0) {
            list.innerHTML = '<p style="text-align: center; opacity: 0.7;">No favorites yet! Start adding your favorite jokes!</p>';
            return;
        }
        
        list.innerHTML = '';
        this.favorites.forEach(fav => {
            const item = document.createElement('div');
            item.className = 'favorite-item';
            item.innerHTML = `
                <strong>${jokesData.categories[fav.category].title}</strong>
                <p>${fav.joke.setup}</p>
                <p style="color: var(--primary-color); margin-top: 10px;">${fav.joke.punchline}</p>
                <button class="remove-favorite" data-id="${fav.id}">Remove</button>
            `;
            
            item.querySelector('.remove-favorite').addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                this.favorites = this.favorites.filter(f => f.id !== id);
                localStorage.setItem('favoriteJokes', JSON.stringify(this.favorites));
                this.loadFavorites();
                this.updateFavoriteButton();
            });
            
            list.appendChild(item);
        });
    }

    toggleFavoritesList() {
        const list = document.getElementById('favorites-list');
        list.classList.toggle('hidden');
    }

    copyJoke() {
        if (!this.currentJoke) {
            this.showNotification('No joke to copy!');
            return;
        }
        
        const text = `${this.currentJoke.setup}\n${this.currentJoke.punchline}`;
        navigator.clipboard.writeText(text).then(() => {
            this.showNotification('Joke copied to clipboard! 📋');
        });
    }

    shareTwitter() {
        if (!this.currentJoke) return;
        
        const text = `${this.currentJoke.setup} ${this.currentJoke.punchline}`;
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text + ' 😂')}`;
        window.open(url, '_blank');
    }

    shareFacebook() {
        if (!this.currentJoke) return;
        
        const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`;
        window.open(url, '_blank');
    }

    jokeBattle() {
        this.showNotification('Joke Battle Mode Coming Soon! ⚔️');
        // TODO: Implement joke battle mode
    }

    timerMode() {
        this.showNotification('Timed Challenge Coming Soon! ⏰');
        // TODO: Implement timer mode
    }

    toggleVoiceMode() {
        const btn = document.getElementById('voice-mode');
        btn.classList.toggle('active');
        
        if (btn.classList.contains('active')) {
            this.showNotification('Voice Mode Activated! 🎤');
            // Use Web Speech API to read jokes
            if ('speechSynthesis' in window && this.currentJoke) {
                const utterance = new SpeechSynthesisUtterance(`${this.currentJoke.setup}... ${this.currentJoke.punchline}`);
                speechSynthesis.speak(utterance);
            }
        } else {
            this.showNotification('Voice Mode Deactivated');
            speechSynthesis.cancel();
        }
    }

    toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        this.isDarkMode = !this.isDarkMode;
        localStorage.setItem('darkMode', this.isDarkMode);
        
        const btn = document.getElementById('dark-mode');
        btn.innerHTML = this.isDarkMode ? '<span>☀️</span> Light Mode' : '<span>🌙</span> Dark Mode';
    }

    incrementLaughCount() {
        this.laughCount++;
        localStorage.setItem('laughCount', this.laughCount);
        document.getElementById('laugh-counter').textContent = this.laughCount;
    }

    updateStats() {
        // Count total jokes
        let totalJokes = 0;
        Object.values(jokesData.categories).forEach(category => {
            totalJokes += category.jokes.length;
        });
        
        document.getElementById('total-jokes').textContent = totalJokes;
        document.getElementById('laugh-counter').textContent = this.laughCount;
    }

    setRating(rating) {
        document.querySelectorAll('.star').forEach((star, index) => {
            if (index < rating) {
                star.textContent = '★';
                star.classList.add('active');
            } else {
                star.textContent = '☆';
                star.classList.remove('active');
            }
        });
        
        localStorage.setItem('userRating', rating);
        this.showNotification(`You rated this ${rating} star${rating > 1 ? 's' : ''}! ⭐`);
    }

    showNotification(message) {
        // Create notification element
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--primary-color);
            color: white;
            padding: 15px 25px;
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            animation: slideInRight 0.3s ease;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    triggerConfetti() {
        if (window.confettiEffect) {
            window.confettiEffect();
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new JokeBook();
});

// Add notification animations to CSS dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
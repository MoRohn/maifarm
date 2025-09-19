// Visual effects and animations
class ConfettiEffect {
    constructor() {
        this.canvas = document.getElementById('confetti-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.colors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#ff6b9d', '#c44569', '#667eea', '#764ba2'];
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    createParticle() {
        return {
            x: Math.random() * this.canvas.width,
            y: -10,
            vx: (Math.random() - 0.5) * 2,
            vy: Math.random() * 3 + 2,
            size: Math.random() * 3 + 2,
            color: this.colors[Math.floor(Math.random() * this.colors.length)],
            angle: Math.random() * 360,
            angleVelocity: (Math.random() - 0.5) * 10
        };
    }

    trigger() {
        // Create burst of confetti
        for (let i = 0; i < 100; i++) {
            this.particles.push(this.createParticle());
        }
        
        this.animate();
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.particles = this.particles.filter(particle => {
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.vy += 0.1; // gravity
            particle.angle += particle.angleVelocity;
            
            // Draw particle
            this.ctx.save();
            this.ctx.translate(particle.x, particle.y);
            this.ctx.rotate(particle.angle * Math.PI / 180);
            this.ctx.fillStyle = particle.color;
            this.ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 1.5);
            this.ctx.restore();
            
            // Remove if off screen
            return particle.y < this.canvas.height;
        });
        
        if (this.particles.length > 0) {
            requestAnimationFrame(() => this.animate());
        }
    }
}

// Emoji rain effect
class EmojiRain {
    constructor() {
        this.emojis = ['😂', '🤣', '😆', '😄', '😁', '🎉', '🎊', '✨', '⭐', '💫'];
        this.active = false;
    }

    start() {
        if (this.active) return;
        this.active = true;
        
        const container = document.createElement('div');
        container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 9998;
            overflow: hidden;
        `;
        document.body.appendChild(container);

        const createEmoji = () => {
            if (!this.active) {
                container.remove();
                return;
            }

            const emoji = document.createElement('div');
            emoji.textContent = this.emojis[Math.floor(Math.random() * this.emojis.length)];
            emoji.style.cssText = `
                position: absolute;
                left: ${Math.random() * 100}%;
                top: -50px;
                font-size: ${20 + Math.random() * 30}px;
                animation: fall ${3 + Math.random() * 2}s linear;
            `;
            
            container.appendChild(emoji);
            
            emoji.addEventListener('animationend', () => emoji.remove());
            
            if (this.active) {
                setTimeout(createEmoji, 200);
            }
        };

        // Add fall animation
        if (!document.getElementById('emoji-rain-style')) {
            const style = document.createElement('style');
            style.id = 'emoji-rain-style';
            style.textContent = `
                @keyframes fall {
                    to {
                        transform: translateY(calc(100vh + 50px)) rotate(360deg);
                    }
                }
            `;
            document.head.appendChild(style);
        }

        createEmoji();
        
        // Stop after 5 seconds
        setTimeout(() => this.stop(), 5000);
    }

    stop() {
        this.active = false;
    }
}

// Floating bubbles background effect
class FloatingBubbles {
    constructor() {
        this.createBubbles();
    }

    createBubbles() {
        const container = document.createElement('div');
        container.className = 'bubbles-container';
        container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 0;
            overflow: hidden;
        `;
        
        for (let i = 0; i < 20; i++) {
            const bubble = document.createElement('div');
            bubble.className = 'bubble';
            bubble.style.cssText = `
                position: absolute;
                bottom: -100px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 50%;
                animation: float ${15 + Math.random() * 10}s infinite linear;
                left: ${Math.random() * 100}%;
                width: ${20 + Math.random() * 60}px;
                height: ${20 + Math.random() * 60}px;
                animation-delay: ${Math.random() * 10}s;
            `;
            container.appendChild(bubble);
        }
        
        document.body.appendChild(container);
        
        // Add float animation
        if (!document.getElementById('bubble-style')) {
            const style = document.createElement('style');
            style.id = 'bubble-style';
            style.textContent = `
                @keyframes float {
                    0% {
                        transform: translateY(0) translateX(0) scale(1);
                        opacity: 0.3;
                    }
                    50% {
                        transform: translateY(-50vh) translateX(30px) scale(1.1);
                        opacity: 0.2;
                    }
                    100% {
                        transform: translateY(-100vh) translateX(-30px) scale(0.8);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }
}

// Laugh track player
class LaughTrack {
    constructor() {
        this.sounds = {
            laugh: new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBCl+zPfSiTEGHGS48OihUBELTKXh8bllHgg2k9zxyHkpBSh+zPDTiTQGHGS58OihUBELTKXh8bllHgg2k9z0yHkpBSh+zPDTiTQGHGS58OihUBELTKXh8bllHgg2k9z0yHkpBSh+zPDTiTQGHGS58OihUBELTKXh8bllHgg2k9z0yHkpBSh+zPDTiTQGHGS58OihUBELTKXh8bllHQk2k9z0yHkpBSh+zPDTiTQGHGS58OihUBELTKXh8bllHQk2k9z0yHkpBSh+zPDTiTQGHGS58OihUBELTKXh8bllHQk2k9z0yHkpBSh+zPDTiTQGHGS58OihUBELTKXh8bllHQk2k9z0yHkpBSh+zPDTiTQGHGS58OihUBELTKXh8bllHQk2k9z0yHkpBSh+zPDTiTQGHGS58OihUBELTKXh8bllHQk2k9z0yHkpBSh+zPDTiTQGHGS58OihUBELTKXh8bllHQk2k9z0yHkpBSh+zPDTiTQGHGS58OihUBELTKXh8bllHQk2k9z0yHkpBSh+zPDTiTQGHGS58OihUBELTKXh8bllHQk2k9z0yHkpBSh+zPDTiTQGHGS58OihUBELTKXh8bllHQk2k9z0yHkpBSl+zPDTiTQGHGS58OihUBELTKXh8bllHQk2k9z0yHkpBSl+zPDTiTQGHGS58OihUBELTKXh8bllHQk2k9z0yHkpBSl+zPDTiTQGHGS58OihUBELTKbl8bllHQk2k9z0yHkpBSl+zPDTiTQGHGS58OihUBELTKbl8bllHQk2k9z0yHkpBSl+zPDTiTQGHGS58OihUBELTKbl8bllHQk2k9z0yHkpBSl+zPDTiTQGHGS58OihUBELTKbl8bllHQk2k9z0yHkpBSl+zPDTiTQGHGS58OihUBELTKbl8bllHQk2k9z0yHkpBSl+zPDTiTQGHGS58OihUBELTKbl8bllHQk2k9z0yHkpBSl+zPDTiTQGHGS58OihUBELTKbl8bllHQk2k9z0yHkpBSl+zPDTiTQGHGS58OihUBELTKbl8bllHQk2k9z0yHkpBSl+zPDTiTQGHGS58OihUBELTKbl8bllHQk2k9z0yHkpBSl+zPDTiTQGHGS58OihUBELTKbl8bllHQk2k9z0yHkpBSl+zPDTiTQGHGS58OihUBELTKbl8bllHQk2k9z0yHkpBSl+zPDTiTQGHGS58OihUBELTKbl8bllHQk2k9z0yHkpBSl+zPDTiTQGHGS58OihUBELTKbl8bllHQk2k9z0yHkpBSl+zPDTiTQGHGS58OihUBELTKbl8bllHQk2k9z0yHkpBSl+zPDTiTQGHGS58OihUBELTKbl8bllHQk2k9z0yHkpBSl+zPDTiTQGHGS58OihUBELTKbl8bllHQk2k9z0yHkpBSl+zPDTiTQGHGS58OihUBELTKbl8bllHQk2k9z0yHkpBQ=='),
            rimshot: new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=')
        };
    }

    playLaugh() {
        // Play a simple laugh sound effect
        try {
            this.sounds.laugh.play();
        } catch (e) {
            console.log('Could not play laugh sound');
        }
    }

    playRimshot() {
        try {
            this.sounds.rimshot.play();
        } catch (e) {
            console.log('Could not play rimshot sound');
        }
    }
}

// Initialize effects
window.confettiEffect = () => {
    const confetti = new ConfettiEffect();
    confetti.trigger();
};

window.emojiRain = new EmojiRain();
window.floatingBubbles = new FloatingBubbles();
window.laughTrack = new LaughTrack();

// Special effect triggers
document.addEventListener('DOMContentLoaded', () => {
    // Trigger emoji rain on special occasions
    let jokeCount = 0;
    const originalReveal = window.revealPunchline;
    
    if (originalReveal) {
        window.revealPunchline = function() {
            originalReveal.call(this);
            jokeCount++;
            
            // Every 10th joke triggers emoji rain
            if (jokeCount % 10 === 0) {
                window.emojiRain.start();
            }
        };
    }
});
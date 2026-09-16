/**
 * Animal Sounds for Terminal Text Feedback
 *
 * "Because every farm needs personality!" 🎵
 */

import chalk from 'chalk';

export class AnimalSounds {
  private static sounds: Record<string, string> = {
    rooster: 'Cock-a-doodle-doo! 🐓',
    cow: 'Moooooo! 🐄',
    pig: 'Oink oink! 🐷',
    sheep: 'Baaaaa! 🐑',
    chicken: 'Cluck cluck! 🐔',
    horse: 'Neigh! 🐴',
    goat: 'Meh-eh-eh! 🐐',
    duck: 'Quack quack! 🦆',
    dog: 'Woof woof! 🐕',
    cat: 'Meow! 🐈',
    eagle: 'Screeeee! 🦅',
    bee: 'Buzzzzz! 🐝'
  };

  /**
   * Display an animal sound in the terminal (text only, no audio)
   */
  static async play(animal: string): Promise<void> {
    const soundText = this.sounds[animal.toLowerCase()];

    if (!soundText) {
      return;
    }

    // Display text representation only
    console.log(chalk.yellow(soundText));
  }

  /**
   * Play a random animal sound
   */
  static playRandom(): void {
    const animals = Object.keys(this.sounds);
    const randomAnimal = animals[Math.floor(Math.random() * animals.length)];
    this.play(randomAnimal);
  }

  /**
   * Play sound based on event type
   */
  static playForEvent(event: string): void {
    const eventSounds: Record<string, string> = {
      'farm:created': 'rooster',
      'farm:started': 'cow',
      'farm:completed': 'sheep',
      'farm:failed': 'duck',
      'harvest:ready': 'chicken',
      'agent:started': 'pig',
      'agent:completed': 'horse',
      'wild:activated': 'eagle',
      'error': 'goat'
    };

    const animal = eventSounds[event];
    if (animal) {
      this.play(animal);
    }
  }

  /**
   * Get text representation of sound
   */
  static getText(animal: string): string {
    return this.sounds[animal.toLowerCase()] || '...';
  }

  /**
   * Create a farm symphony (multiple sounds)
   */
  static async symphony(): Promise<void> {
    const sequence = ['rooster', 'cow', 'pig', 'chicken', 'sheep'];

    console.log(chalk.yellow('\n🎵 Farm Symphony Starting! 🎵\n'));

    for (const animal of sequence) {
      await this.play(animal);
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(chalk.yellow('\n🎵 Farm Symphony Complete! 🎵\n'));
  }

  /**
   * Morning wake-up call
   */
  static morningCall(): void {
    console.log(chalk.yellow('\n☀️ Morning on the farm! ☀️\n'));
    this.play('rooster');
    setTimeout(() => this.play('cow'), 1000);
    setTimeout(() => this.play('chicken'), 2000);
  }

  /**
   * Victory fanfare
   */
  static victoryFanfare(): void {
    console.log(chalk.green('\n🎉 Victory! 🎉\n'));
    this.play('rooster');
    setTimeout(() => {
      console.log(chalk.green('All animals celebrate! 🎊'));
      this.playRandom();
    }, 500);
  }

  /**
   * Error sound
   */
  static errorSound(): void {
    console.log(chalk.red('\n⚠️ Uh oh! ⚠️\n'));
    this.play('goat');
  }
}

export default AnimalSounds;
// TextScramble class - handles the scrambling animation effect
class TextScramble {
    constructor(el) {
      this.el = el;
      this.chars = '!<>-_\\/[]{}—=+*^?#_~';
      this.update = this.update.bind(this);
    }
    
    setText(newText) {
      const oldText = this.el.innerText;
      const length = Math.max(oldText.length, newText.length);
      const promise = new Promise(resolve => this.resolve = resolve);
      this.queue = [];
      
      for (let i = 0; i < length; i++) {
        const from = oldText[i] || '';
        const to = newText[i] || '';
        const start = Math.floor(Math.random() * 40);
        const end = start + Math.floor(Math.random() * 40);
        this.queue.push({ from, to, start, end });
      }
      
      cancelAnimationFrame(this.frameRequest);
      this.frame = 0;
      this.update();
      return promise;
    }
    
    update() {
      let output = '';
      let complete = 0;
      
      for (let i = 0, n = this.queue.length; i < n; i++) {
        let { from, to, start, end, char } = this.queue[i];
        
        if (this.frame >= end) {
          complete++;
          output += to;
        } else if (this.frame >= start) {
          if (!char || Math.random() < 0.28) {
            char = this.randomChar();
            this.queue[i].char = char;
          }
          output += `<span class="dud">${char}</span>`;
        } else {
          output += from;
        }
      }
      
      this.el.innerHTML = output;
      
      if (complete === this.queue.length) {
        this.resolve();
      } else {
        this.frameRequest = requestAnimationFrame(this.update);
        this.frame++;
      }
    }
    
    randomChar() {
      return this.chars[Math.floor(Math.random() * this.chars.length)];
    }
  }
  
  // Get the current day of the week (0-6, where 0 is Sunday)
  function getCurrentDayName() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayNum = new Date().getDay();
    return days[dayNum];
  }
  
  // List of weekday translations in the requested languages
  function getWeekdayTranslations() {
    const currentDay = getCurrentDayName();
    
    const translations = {
      'Sunday': [
        'Sunday',         // English
        'Sunnuntai',      // Finnish
        'Sonntag',        // German
        '日曜日',          // Japanese
        'Воскресенье',    // Russian
        'Söndag',         // Swedish
        'اتوار'           // Urdu
      ],
      'Monday': [
        'Monday',         // English
        'Maanantai',      // Finnish
        'Montag',         // German
        '月曜日',          // Japanese
        'Понедельник',    // Russian
        'Måndag',         // Swedish
        'پیر'             // Urdu
      ],
      'Tuesday': [
        'Tuesday',        // English
        'Tiistai',        // Finnish
        'Dienstag',       // German
        '火曜日',          // Japanese
        'Вторник',        // Russian
        'Tisdag',         // Swedish
        'منگل'            // Urdu
      ],
      'Wednesday': [
        'Wednesday',      // English
        'Keskiviikko',    // Finnish
        'Mittwoch',       // German
        '水曜日',          // Japanese
        'Среда',          // Russian
        'Onsdag',         // Swedish
        'بدھ'             // Urdu
      ],
      'Thursday': [
        'Thursday',       // English
        'Torstai',        // Finnish
        'Donnerstag',     // German
        '木曜日',          // Japanese
        'Четверг',        // Russian
        'Torsdag',        // Swedish
        'جمعرات'          // Urdu
      ],
      'Friday': [
        'Friday',         // English
        'Perjantai',      // Finnish
        'Freitag',        // German
        '金曜日',          // Japanese
        'Пятница',        // Russian
        'Fredag',         // Swedish
        'جمعہ'            // Urdu
      ],
      'Saturday': [
        'Saturday',       // English
        'Lauantai',       // Finnish
        'Samstag',        // German
        '土曜日',          // Japanese
        'Суббота',        // Russian
        'Lördag',         // Swedish
        'ہفتہ'            // Urdu
      ]
    };
    
    return translations[currentDay];
  }
  
  // Initialize text scramble effect when the DOM is loaded
  document.addEventListener('DOMContentLoaded', function() {
    const textElement = document.querySelector('.text-scramble');
    if (textElement) {
      const phrases = getWeekdayTranslations();
      const fx = new TextScramble(textElement);
      
      let counter = 0;
      
      const next = () => {
        fx.setText(phrases[counter]).then(() => {
          setTimeout(next, 2000);
        });
        counter = (counter + 1) % phrases.length;
      };
      
      next();
      
      // Add CSS for the scramble effect
      const style = document.createElement('style');
      style.textContent = `
        .text-scramble .dud {
          opacity: 0.7;
          color:rgb(255, 255, 255);
        }
      `;
      document.head.appendChild(style);
    }
  });
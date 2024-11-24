class AudioPlayer extends HTMLElement {
  constructor() {
    super();

    this.shadow = this.attachShadow({ mode: 'open' });

    this.shadow.innerHTML = `
      <style>
        ${this.getStyles()}
      </style>
      <div class="audioPlayer">
        <audio id="audioPlayer" hidden></audio>
        <div class="playerContainer"></div>
      </div>
    `;

    this.audioElement = this.shadow.querySelector('#audioPlayer');
    this.playerContainer = this.shadow.querySelector('.playerContainer');
    this.handlePlayPause = this.debounce(this.handlePlayPause.bind(this), 300);
    this.currentPlay = null;
    this.audioStarted = false;
    this.isPlaying = false;
    this.error = null;
  }

  debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  connectedCallback() {
    this.fetchCurrentPlay();
    this.fetchInterval = setInterval(this.fetchCurrentPlay.bind(this), 15000);
    window.addEventListener('resize', this.handleResize);

    this.updateUI();
  }

  handleResize = () => {
    const marqueeWrapper = this.shadow.querySelector('.marqueeWrapper');
    const marquee = this.shadow.querySelector('.marquee');

    window.addEventListener('resize', () => {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = setTimeout(() => this.handleResize(), 100);
    });

    if (marquee && marqueeWrapper) {
      this.applyMarqueeEffect(marquee, marqueeWrapper);
    }
  };

  disconnectedCallback() {
    clearInterval(this.fetchInterval);
    window.removeEventListener('resize', this.handleResize);
  }

  async fetchCurrentPlay() {
    try {
      const response = await fetch(
        `https://api.kexp.org/v2/plays?ordering=-airdate&limit=1&cachebuster=${Date.now()}`
      );
      const data = await response.json();

      if (data.results.length > 0 && data.results[0].airdate !== this.currentPlay?.airdate) {
        this.currentPlay = data.results[0];
        this.updateUI();
      }
    } catch (err) {
      this.error = err.message;
      this.updateUI();
    }
  }

  initializeAudio() {
    if (!this.audioStarted) {
      this.audioElement.src = 'https://kexp.streamguys1.com/kexp160.aac';
      this.audioElement.volume = 0.03;
      this.audioElement.load();

      this.audioElement.addEventListener('play', () => {
        this.isPlaying = true;
        this.updateUI();
      });
      this.audioElement.addEventListener('pause', () => {
        this.isPlaying = false;
        this.updateUI();
      });

      this.audioStarted = true;
    }
  }

  handlePlayPause() {
    if (!this.audioStarted) {
      this.initializeAudio();
    }

    if (this.isTransitioning) {
      return;
    }

    this.isTransitioning = true;

    if (this.audioElement.paused) {
      this.audioElement
        .play()
        .then(() => {
          this.isPlaying = true;
          this.isTransitioning = false;
          this.updateUI();
        })
        .catch((err) => {
          console.error('Playback failed:', err.message);
          this.error = 'Unable to play audio.';
          this.isTransitioning = false;
          this.updateUI();
        });
    } else {
      this.audioElement.pause();
      this.isPlaying = false;
      this.isTransitioning = false;
      this.updateUI();
    }
  }

  applyMarqueeEffect(marquee, marqueeWrapper) {
    const marqueeWidth = marquee.scrollWidth;
    const containerWidth = marqueeWrapper.offsetWidth;

    if (marqueeWidth === containerWidth || marqueeWidth >= containerWidth - 50) {
      const animationDuration = (marqueeWidth / 50).toFixed(2);

      marquee.classList.remove('scrolling');
      void marquee.offsetWidth;
      marquee.classList.add('scrolling');

      marquee.style.animationDuration = `${animationDuration}s`;
    } else {
      marquee.classList.remove('scrolling');
      marquee.style.animationDuration = '';
    }
  }

  createPlayPauseButton() {
    const playPauseButton = document.createElement('button');
    playPauseButton.className = 'playPauseButton';
    playPauseButton.addEventListener('click', this.handlePlayPause);

    const kexpLogo = document.createElement('div');
    kexpLogo.className = 'kexpLogo';

    const iconBars = document.createElement('div');
    iconBars.className = `iconBars ${this.isPlaying ? 'animating' : ''}`;
    for (let i = 0; i < 4; i++) {
      const bar = document.createElement('div');
      bar.className = 'bar';
      iconBars.appendChild(bar);
    }

    const svg = document.createElement('div');
    svg.innerHTML = `
      <svg width="90" height="40px" viewBox="0 0 90 40" version="1.1">
        <title>KEXP Logo</title>
        <g id="KEXPLogo" stroke="none" strokeWidth="0" fill="white" fillRule="evenodd">
          <path d="M9.56,38 L9.56,24.96 L10.32,23.68 L15,38 L22.28,38 L16,20.24 L22,5.6 L15,5.6 L9.56,18.84 L9.56,5.6 L2.4,5.6 L2.4,38 L9.56,38 Z M41.22,38 L41.22,33.16 L33.74,33.16 L33.74,23.48 L39.38,23.48 L39.38,18.52 L33.74,18.52 L33.74,10.48 L41.14,10.48 L41.14,5.6 L26.58,5.6 L26.58,38 L41.22,38 Z M50.88,5.6 L54.44,14.36 L57.32,5.6 L63.28,5.6 L57.6,22.44 L63.92,38 L57.2,38 L53.24,28.32 L49.76,38 L43.84,38 L50.12,20.56 L44.12,5.6 L50.88,5.6 Z M78.94,5.6 C80.8866667,5.6 82.4866667,5.96666667 83.74,6.7 C84.9933333,7.43333333 85.9266667,8.5 86.54,9.9 C87.1533333,11.3 87.46,13 87.46,15 C87.46,17.5066667 87.0466667,19.42 86.22,20.74 C85.3933333,22.06 84.2733333,22.9733333 82.86,23.48 C81.4466667,23.9866667 79.86,24.24 78.1,24.24 L75.22,24.24 L75.22,38 L68.06,38 L68.06,5.6 L78.94,5.6 Z M77.58,10.64 L75.22,10.64 L75.22,19.24 L77.62,19.24 C78.5,19.24 79.1666667,19.08 79.62,18.76 C80.0733333,18.44 80.3733333,17.96 80.52,17.32 C80.6666667,16.68 80.74,15.8666667 80.74,14.88 C80.74,14.0533333 80.68,13.3266667 80.56,12.7 C80.44,12.0733333 80.1533333,11.5733333 79.7,11.2 C79.2466667,10.8266667 78.54,10.64 77.58,10.64 Z"></path>
        </g>
      </svg>
    `;

    kexpLogo.appendChild(iconBars);
    kexpLogo.appendChild(svg);

    const buttonText = document.createElement('span');
    buttonText.textContent = this.isPlaying ? 'PAUSE' : 'PLAY';

    playPauseButton.appendChild(kexpLogo);
    playPauseButton.appendChild(buttonText);

    return playPauseButton;
  }

  updateUI() {
    const container = this.playerContainer;
    container.innerHTML = '';

    if (this.error) {
      container.innerHTML = `<span class="errorMessage">${this.error}</span>`;
      return;
    }

    const playPauseButton = this.createPlayPauseButton();
    const marqueeWrapper = document.createElement('div');
    marqueeWrapper.className = 'marqueeWrapper';

    const marquee = document.createElement('div');
    marquee.className = 'marquee';
    const artist = this.currentPlay?.artist || 'Unknown Artist';
    const song = this.currentPlay?.song || 'Unknown Song';
    marquee.textContent = `Listening to: ${artist} - ${song} on 90.3 FM Seattle`;

    marqueeWrapper.appendChild(marquee);
    container.appendChild(playPauseButton);
    container.appendChild(marqueeWrapper);

    setTimeout(() => this.applyMarqueeEffect(marquee, marqueeWrapper), 0);
  }

  getStyles() {
    return `
      :host {
        --bar-size: 50px;
        --bar-speed: 1.4s;
        --bar-width: calc(var(--bar-size) / 2);
        --bar-gutter-width: calc((var(--bar-size) - var(--bar-width) * 2) / 2.5);
        --bar-color: #fff;
      }

      .audioPlayer {
        color: #999;
        font-family: sans-serif;
        font-size: 12px;
        text-align: center;
        background: #000;
        height: 100%;
        place-content: center;
      }

      .playerContainer {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
      }

      .playPauseButton {
        cursor: pointer;
        padding: 30px 10px 20px 10px;
        background: #444;
        color: white;
        border: none;
        border-radius: 5px;
        margin-bottom: 10px;
      }

      .playPauseButton:hover {
        background: #666;
      }

      .errorMessage {
        color: pink;
      }

      .kexpLogo {
        transform: scale(0.6);
        display: flex;
        align-items: center;
        position: relative;
      }

      .iconBars {
        clip-path: inset(0px -50px 20px 0px);
        display: flex;
        position: absolute;
        top: -32px;
        width: var(--bar-size, 10px);
        height: var(--bar-size, 10px);
        visibility: hidden;
      }

      .animating {
        visibility: visible;
      }

      .iconBars .bar {
        position: relative;
        bottom: 0;
        left: 4px;
        width: var(--bar-width, 2px);
        background-color: var(--bar-color, white);
        animation: up-down var(--bar-speed, 1s) infinite;
      }

      .iconBars .bar:nth-child(2) {
        left: 14px;
        animation-delay: calc(-1 * var(--bar-speed, 1s) / 3 * 2.1);
      }

      .iconBars .bar:nth-child(3) {
        left: 24px;
        animation-delay: calc(-1 * var(--bar-speed, 1s) / 3);
      }

      .iconBars .bar:nth-child(4) {
        left: 34px;
        animation-delay: calc(-1 * var(--bar-speed, 1s) / 2);
      }

      .marqueeWrapper {
        overflow: hidden;
        position: relative;
        width: 100%;
        white-space: nowrap;
        display: flex;
        place-content: center;
      }

      .marquee {
        display: inline-block;
      }
      .marquee.scrolling {
        animation: scrollText 8s linear infinite;
      }

      @keyframes scrollText {
        0% {
          transform: translateX(100%);
        }
        100% {
          transform: translateX(-100%);
        }
      }

      @media (max-width: 600px) {
        .marquee {
          white-space: nowrap;
        }
      }

      @keyframes up-down {
        0%,
        100% {
          transform: scaleY(1);
        }

        50% {
          transform: scaleY(0.5);
        }
      }
    `;
  }
}

customElements.define('audio-player', AudioPlayer);

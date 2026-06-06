# KEXP-WebComponent 🎵

A **Web Component** for live streaming KEXP, complete with a responsive audio player, song details, and stylish animations! This project was born out of love for KEXP and inspired by Reddit threads where folks shared challenges in live streaming the station. After reaching out to the awesome KEXP team, they gave me permission to use their API and even provided a better stream source. 💙

This component makes it easy to share KEXP wherever you are and even embed it into your own projects. I’d love to see how you use it—drop me a message with your site link, and I’ll be sure to check it out. Happy listening!

---

## 🎉 Features
- **Live Streaming**: Enjoy KEXP’s live audio stream with a sleek, custom audio player.
- **Real-time Song Updates**: Displays the current artist and song title using KEXP’s API.
- **Responsive Design**: Works on all devices, with animations and styles that adapt to your screen size.
- **Customizable**: Easily tweak the styles or functionality to fit your project.
- **Lightweight Web Component**: Self-contained and simple to use—just drop it into your HTML!

---

## 🚀 Installation

### Using NPM
1. Clone the repository or download the files.
2. Install dependencies:
3. Start the development server:
   ```bash
   npm install
   npm run dev
   ```
4. Open your browser at http://localhost:5173 to see the component in action.

---

## 🛠️ Usage

### Embedding the Web Component
1. Include the `audioPlayer.js` file in your project.
2. Add the custom `audio-player` tag to your HTML:
   ```html
   <audio-player></audio-player>
   ```
3. Customize as needed! The styles and animations are scoped, so they won’t interfere with your project.

## Example HTML
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KEXP Live Player</title>
</head>
<body>
  <audio-player></audio-player>
  <script type="module" src="./audioPlayer.js"></script>
</body>
</html>
```

## ⚙️ Attributes

| Attribute       | Default                                      | Description                                  |
| --------------- | -------------------------------------------- | -------------------------------------------- |
| `stream-url`    | `https://kexp.streamguys1.com/kexp160.aac`   | Audio stream source                          |
| `volume`        | `0.5`                                        | Playback volume, clamped to `0`–`1`          |
| `poll-interval` | `15000`                                      | Now-playing refresh interval in milliseconds |

```html
<audio-player volume="0.8" poll-interval="30000"></audio-player>
```

## 🧩 Properties & Methods

- `player.play()` / `player.pause()` / `player.toggle()` — control playback programmatically
- `player.toggleLike()` — like/unlike the current song (same as clicking the ♥)
- `player.isPlaying` — current playback state (read-only)
- `player.currentPlay` — the latest play object from the KEXP API (read-only)
- `player.isLiked` — whether the current song is liked (read-only)
- `player.playlist` — every liked track `{ artist, song, airdate, likedAt }` (read-only)
- `player.deviceId` — stable anonymous ID for this browser (read-only)

## ❤️ Likes

Hit the heart in the corner of the play button to like the current song — complete
with a Twitter-style burst animation (respecting `prefers-reduced-motion`). Likes
persist in `localStorage` and build up a playlist you can read via `player.playlist`.

## 📡 Events

| Event             | `detail`                     | Fired when…                       |
| ----------------- | ---------------------------- | --------------------------------- |
| `playing-changed` | `{ isPlaying }`              | Playback starts or stops          |
| `track-changed`   | `{ artist, song, airdate }`  | A new song hits the airwaves      |
| `like-changed`    | `{ liked, artist, song, airdate, deviceId, playlistSize }` | A song is liked or unliked |
| `player-error`    | `{ message }`                | The now-playing fetch fails       |

```js
document.querySelector('audio-player')
  .addEventListener('track-changed', ({ detail }) => {
    console.log(`Now playing: ${detail.artist} – ${detail.song}`);
  });
```

## 🎨 Customization

Theme it from the outside with CSS custom properties — no need to touch the component:

```css
audio-player {
  --player-bg: #11001c;
  --player-accent: #ffb703;
  --player-radius: 20px;
}
```

Available tokens: `--player-bg`, `--player-surface`, `--player-surface-hover`, `--player-accent`, `--player-text`, `--player-muted`, `--player-error`, `--player-radius`.

For deeper restyling, the shadow DOM exposes parts: `player`, `button`, `button-text`, `logo`, `like`, `display`, `marquee`, `error`. The heart color is `--player-like`.

```css
audio-player::part(button):hover {
  box-shadow: 0 4px 24px rgb(255 90 30 / 35%);
}
```

The component also respects `prefers-reduced-motion` — animations are disabled for users who ask for less movement.

---

## 📂 Project Structure

```plaintext
src/
├── index.html            # Example usage
├── audioPlayer.js        # Web Component (logic + scoped styles)
├── global.css            # Global styles for the demo page
└── assets/               # Public assets (e.g., favicon)
tests/
└── audioPlayer.spec.js   # Playwright tests (chromium, firefox, webkit)
```

## 🧪 Testing

```bash
npm test          # Playwright auto-starts the dev server
npm run test:ui   # Interactive UI mode
```

## 🙌 Contributing

If you’d like to contribute:
1. Fork this repository.
2. Create a feature branch.
3. Commit your changes.
4. Push to the branch.
5. Open a Pull Request.

## 📧 Feedback

I’d love to hear your feedback or see how you’re using this! Feel free to reach out or open an issue. KEXP is a gem, and sharing it is a pleasure. 🎵

## 📜 License
This project is licensed under the MIT License.
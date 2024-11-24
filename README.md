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

## 🎨 Customization
- Styles: The component’s styles are scoped but easy to modify in audioPlayer.js under the getStyles() method.
- Functionality: Update the applyMarqueeEffect, handlePlayPause, or other methods for enhanced interactions.

---

## 📂 Project Structure

```plaintext
Copy code
src/
├── audioPlayer/
│   ├── index.html        # Example usage
│   ├── audioPlayer.js    # Web Component logic
│   ├── audioPlayer.css   # Scoped styles
├── global.css            # Global styles
├── assets/               # Public assets (e.g., favicon, images)
└── main.js               # Main entry point
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
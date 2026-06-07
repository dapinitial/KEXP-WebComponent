use tauri::{
  image::Image,
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
  Listener, Manager, WindowEvent,
};
use tauri_plugin_positioner::{Position, WindowExt};

// Monochrome template icons: macOS uses only the alpha channel, auto-adapting
// to light/dark menu bars. Regenerate with `node src-tauri/gen-tray-icons.mjs`.
const TRAY_IDLE: &[u8] = include_bytes!("../icons/tray-idle.png");
const TRAY_PLAYING: &[u8] = include_bytes!("../icons/tray-playing.png");

fn set_tray_icon(tray: &TrayIcon, bytes: &[u8]) {
  if let Ok(icon) = Image::from_bytes(bytes) {
    let _ = tray.set_icon(Some(icon));
    let _ = tray.set_icon_as_template(true);
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_positioner::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Menu-bar app: no Dock icon, no app switcher entry.
      #[cfg(target_os = "macos")]
      app.set_activation_policy(tauri::ActivationPolicy::Accessory);

      let quit = MenuItem::with_id(app, "quit", "Quit KEXP", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&quit])?;

      let tray = TrayIconBuilder::with_id("kexp-tray")
        .icon(Image::from_bytes(TRAY_IDLE)?)
        .icon_as_template(true)
        .tooltip("KEXP 90.3 FM")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
          if event.id.as_ref() == "quit" {
            app.exit(0);
          }
        })
        .on_tray_icon_event(|tray, event| {
          // Lets the positioner plugin track the tray location.
          tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);

          if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
          } = event
          {
            let app = tray.app_handle();
            if let Some(window) = app.get_webview_window("main") {
              if window.is_visible().unwrap_or(false) {
                let _ = window.hide();
              } else {
                let _ = window.move_window(Position::TrayBottomCenter);
                let _ = window.show();
                let _ = window.set_focus();
              }
            }
          }
        })
        .build(app)?;

      // The webview reports play state ({"isPlaying":true/false}); show the
      // EQ-bars variant while on air. Static — animating the tray flickers.
      app.listen_any("playing-changed", move |event| {
        let playing = event.payload().contains("true");
        set_tray_icon(&tray, if playing { TRAY_PLAYING } else { TRAY_IDLE });
      });

      // ⌘Q in the dropdown quits the app (no menu bar to provide it).
      let handle = app.handle().clone();
      app.listen_any("kexp:quit", move |_| {
        handle.exit(0);
      });

      Ok(())
    })
    .on_window_event(|window, event| {
      // Behave like a real menu-bar dropdown: clicking away dismisses it.
      // Audio keeps playing — hiding the window doesn't tear down the webview.
      if let WindowEvent::Focused(false) = event {
        let _ = window.hide();
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

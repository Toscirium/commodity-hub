// Tauri main process. Mirrors the Electron shell it replaces (see git
// history for electron/main.cjs) so the desktop app's behavior — OAuth deep
// link, native menu/tray, auto-update — stays the same across the port.
use tauri::{
    menu::{Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    tray::TrayIconBuilder,
    Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

// Same custom scheme already used for the Capacitor mobile app's OAuth deep
// link (see src/hooks/useCapacitorAuthDeepLink.ts) — already whitelisted as
// a Supabase Auth redirect URL, so no extra dashboard config is needed here.
const AUTH_DEEP_LINK_SCHEME: &str = "commodityhub";

/// Finds a `commodityhub://...` URL among argv-style arguments (cold-start
/// CLI args or a second instance's argv forwarded to us).
fn extract_deep_link(args: &[String]) -> Option<String> {
    args.iter()
        .find(|a| a.to_lowercase().starts_with(&format!("{AUTH_DEEP_LINK_SCHEME}://")))
        .cloned()
}

/// Callers of this (the single-instance plugin callback, the deep-link
/// plugin's `on_open_url`) run off the main thread on Linux — GTK panics if
/// touched from anywhere else, so window operations are marshaled onto the
/// main thread via `run_on_main_thread` rather than called directly.
fn send_deep_link_to_frontend(app: &tauri::AppHandle, url: &str) {
    let app = app.clone();
    let url = url.to_string();
    let _ = app.clone().run_on_main_thread(move || {
        let _ = app.emit("auth-deep-link", &url);
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    });
}

fn build_app_menu(app: &tauri::AppHandle, is_dev: bool) -> tauri::Result<Menu<tauri::Wry>> {
    let file_menu = SubmenuBuilder::new(app, "File").quit().build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let mut view_builder = SubmenuBuilder::new(app, "View")
        .item(&MenuItemBuilder::with_id("reload", "Reload").build(app)?)
        .item(&MenuItemBuilder::with_id("force_reload", "Force Reload").build(app)?);
    if is_dev {
        view_builder = view_builder
            .item(&MenuItemBuilder::with_id("toggle_devtools", "Toggle Developer Tools").build(app)?);
    }
    let view_menu = view_builder
        .separator()
        .item(&MenuItemBuilder::with_id("zoom_reset", "Actual Size").build(app)?)
        .item(&MenuItemBuilder::with_id("zoom_in", "Zoom In").build(app)?)
        .item(&MenuItemBuilder::with_id("zoom_out", "Zoom Out").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("toggle_fullscreen", "Toggle Full Screen").build(app)?)
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .close_window()
        .build()?;

    let mut help_builder = SubmenuBuilder::new(app, "Help");
    if !is_dev {
        help_builder = help_builder
            .item(&MenuItemBuilder::with_id("check_for_updates", "Check for Updates…").build(app)?)
            .separator();
    }
    let help_menu = help_builder
        .item(&MenuItemBuilder::with_id("report_issue", "Report an Issue").build(app)?)
        .build()?;

    Menu::with_items(app, &[&file_menu, &edit_menu, &view_menu, &window_menu, &help_menu])
}

/// Tracks the window's current zoom factor since `WebviewWindow` only
/// exposes a setter, not a getter, so "Zoom In"/"Zoom Out" (unlike "Actual
/// Size") need somewhere to accumulate from.
struct ZoomLevel(std::sync::Mutex<f64>);

const ZOOM_STEP: f64 = 0.1;
const ZOOM_MIN: f64 = 0.5;
const ZOOM_MAX: f64 = 2.0;

fn handle_menu_event(app: &tauri::AppHandle, id: &str) {
    let Some(window) = app.get_webview_window("main") else { return };
    match id {
        "reload" | "force_reload" => {
            let _ = window.eval("location.reload()");
        }
        "toggle_devtools" => {
            #[cfg(debug_assertions)]
            if window.is_devtools_open() {
                window.close_devtools();
            } else {
                window.open_devtools();
            }
        }
        "zoom_reset" | "zoom_in" | "zoom_out" => {
            let zoom_state = app.state::<ZoomLevel>();
            let mut level = zoom_state.0.lock().unwrap();
            *level = match id {
                "zoom_reset" => 1.0,
                "zoom_in" => (*level + ZOOM_STEP).min(ZOOM_MAX),
                _ => (*level - ZOOM_STEP).max(ZOOM_MIN),
            };
            let _ = window.set_zoom(*level);
        }
        "toggle_fullscreen" => {
            let is_fullscreen = window.is_fullscreen().unwrap_or(false);
            let _ = window.set_fullscreen(!is_fullscreen);
        }
        "report_issue" => {
            let _ = tauri_plugin_opener::open_url(
                "https://github.com/Toscirium/commodity-hub/issues",
                None::<&str>,
            );
        }
        "check_for_updates" => {
            let handle = app.clone();
            tauri::async_runtime::spawn(async move { check_for_updates(&handle, true).await });
        }
        _ => {}
    }
}

fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let show_item = MenuItemBuilder::with_id("tray_show", "Show Commodity Hub").build(app)?;
    let quit_item = MenuItemBuilder::with_id("tray_quit", "Quit").build(app)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let tray_menu = Menu::with_items(app, &[&show_item, &separator, &quit_item])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().cloned().expect("app icon must be set"))
        .tooltip("Commodity Hub")
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray_show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "tray_quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    match window.is_visible() {
                        Ok(true) => {
                            let _ = window.set_focus();
                        }
                        _ => {
                            let _ = window.show();
                        }
                    }
                }
            }
        })
        .build(app)?;
    Ok(())
}

/// Silent on startup, but shows native "no update"/error dialogs when
/// `manual` (triggered from the Help menu) — mirrors the Electron
/// autoUpdater listeners in electron/main.cjs.
async fn check_for_updates(app: &tauri::AppHandle, manual: bool) {
    use tauri_plugin_updater::UpdaterExt;

    let updater = match app.updater() {
        Ok(u) => u,
        Err(err) => {
            log::error!("[updater] init failed: {err}");
            return;
        }
    };

    match updater.check().await {
        Ok(Some(update)) => {
            let bytes = match update.download(|_, _| {}, || {}).await {
                Ok(bytes) => bytes,
                Err(err) => {
                    log::error!("[updater] download failed: {err}");
                    if manual {
                        show_error_dialog(app, &err.to_string());
                    }
                    return;
                }
            };

            let version = update.version.clone();
            let app_for_dialog = app.clone();
            app.dialog()
                .message(format!(
                    "Commodity Hub {version} has been downloaded. Restart the app to apply the update."
                ))
                .title("Update Ready")
                .kind(MessageDialogKind::Info)
                .buttons(MessageDialogButtons::OkCancelCustom(
                    "Restart Now".into(),
                    "Later".into(),
                ))
                .show(move |restart_now| {
                    if restart_now {
                        if let Err(err) = update.install(&bytes) {
                            log::error!("[updater] install failed: {err}");
                        }
                        app_for_dialog.restart();
                    }
                });
        }
        Ok(None) => {
            if manual {
                app.dialog()
                    .message("You're running the latest version of Commodity Hub.")
                    .title("No Updates")
                    .kind(MessageDialogKind::Info)
                    .buttons(MessageDialogButtons::Ok)
                    .show(|_| {});
            }
        }
        Err(err) => {
            log::error!("[updater] check failed: {err}");
            if manual {
                show_error_dialog(app, &err.to_string());
            }
        }
    }
}

fn show_error_dialog(app: &tauri::AppHandle, message: &str) {
    app.dialog()
        .message(message)
        .title("Update Check Failed")
        .kind(MessageDialogKind::Error)
        .buttons(MessageDialogButtons::Ok)
        .show(|_| {});
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("open_external only allows https:// URLs".into());
    }
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let is_dev = cfg!(debug_assertions);

    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(url) = extract_deep_link(&argv) {
                send_deep_link_to_frontend(app, &url);
            } else {
                // Off the main thread here too — see send_deep_link_to_frontend.
                let app = app.clone();
                let _ = app.clone().run_on_main_thread(move || {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                });
            }
        }));
    }

    builder = builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![open_external]);

    if is_dev {
        builder = builder.plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        );
    } else {
        builder = builder.register_uri_scheme_protocol("app", |ctx, request| {
            crate::protocol::handle_app_protocol(ctx.app_handle(), &request)
        });
    }

    builder
        .setup(move |app| {
            use tauri_plugin_deep_link::DeepLinkExt;

            app.manage(ZoomLevel(std::sync::Mutex::new(1.0)));

            let menu = build_app_menu(app.handle(), is_dev)?;
            app.set_menu(menu)?;
            app.on_menu_event(move |app, event| handle_menu_event(app, event.id().as_ref()));

            build_tray(app.handle())?;

            let dev_server_url = std::env::var("TAURI_DEV_SERVER_URL").ok();
            let window_url = if is_dev {
                WebviewUrl::External(
                    dev_server_url
                        .unwrap_or_else(|| "http://localhost:8080".into())
                        .parse()
                        .expect("invalid dev server URL"),
                )
            } else {
                WebviewUrl::External("app://app/".parse().expect("invalid app:// URL"))
            };

            // Cold start on Windows/Linux: the deep link arrives as a CLI arg.
            // Sent only once — on_page_load's Finished event can fire again
            // later (e.g. the "Reload" menu item), and re-delivering a stale
            // deep link on every reload would be wrong.
            let cold_start_deep_link = extract_deep_link(&std::env::args().collect::<Vec<_>>());
            let cold_start_deep_link_sent = std::sync::atomic::AtomicBool::new(false);

            let window = WebviewWindowBuilder::new(app, "main", window_url)
                .title("Commodity Hub")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1024.0, 700.0)
                .background_color(tauri::webview::Color(30, 58, 95, 255))
                .visible(false)
                // Mirrors Electron's ready-to-show/did-finish-load: wait for
                // the page to actually render before showing the window (no
                // white flash), and only forward a cold-start deep link once
                // the frontend has had a chance to mount its listener.
                .on_page_load(move |window, payload| {
                    if !matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                        return;
                    }
                    let _ = window.show();
                    if let Some(url) = &cold_start_deep_link {
                        if cold_start_deep_link_sent
                            .compare_exchange(
                                false,
                                true,
                                std::sync::atomic::Ordering::SeqCst,
                                std::sync::atomic::Ordering::SeqCst,
                            )
                            .is_ok()
                        {
                            send_deep_link_to_frontend(&window.app_handle().clone(), url);
                        }
                    }
                })
                .build()?;

            #[cfg(debug_assertions)]
            window.open_devtools();

            // macOS-style deep link event; also fires on some Linux DEs.
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                if let Some(url) = event.urls().first() {
                    send_deep_link_to_frontend(&handle, url.as_str());
                }
            });

            if !is_dev {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    check_for_updates(&handle, false).await;
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // macOS: keep the app (and tray) alive when the last window closes,
            // matching Electron's window-all-closed handler.
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if cfg!(not(target_os = "macos")) {
                    let app = window.app_handle();
                    let other_windows_open = app.webview_windows().len() > 1;
                    if !other_windows_open {
                        app.exit(0);
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

mod protocol {
    use std::path::{Component, Path, PathBuf};
    use tauri::http::{Request, Response};
    use tauri::Manager;

    /// Serves the built SPA out of the `dist` resource directory over a
    /// custom `app://` scheme (instead of Tauri's default embedded-asset
    /// origin), with an index.html fallback for extension-less paths so
    /// React Router's BrowserRouter survives a hard reload on a nested
    /// route (e.g. `/watchlist`) — mirrors electron/main.cjs's `app://`
    /// protocol handler and the reasoning in its comments.
    pub fn handle_app_protocol(app: &tauri::AppHandle, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
        match try_handle(app, request) {
            Ok(response) => response,
            Err(err) => Response::builder()
                .status(500)
                .body(err.into_bytes())
                .expect("static 500 response is well-formed"),
        }
    }

    fn try_handle(app: &tauri::AppHandle, request: &Request<Vec<u8>>) -> Result<Response<Vec<u8>>, String> {
        let dist_dir = app.path().resource_dir().map_err(|e| e.to_string())?.join("dist");

        let url = request.uri();
        let mut pathname = url.path().trim_start_matches('/').to_string();
        if Path::new(&pathname).extension().is_none() {
            pathname = "index.html".to_string();
        }

        let mut resolved: PathBuf = dist_dir.clone();
        for comp in Path::new(&pathname).components() {
            match comp {
                Component::Normal(part) => resolved.push(part),
                Component::CurDir => {}
                // Reject any path-traversal component outright.
                _ => return Ok(forbidden()),
            }
        }
        if !resolved.starts_with(&dist_dir) {
            return Ok(forbidden());
        }

        let bytes = std::fs::read(&resolved).map_err(|e| e.to_string())?;
        let mime = mime_guess::from_path(&resolved).first_or_octet_stream().to_string();

        Response::builder()
            .header("Content-Type", mime)
            .body(bytes)
            .map_err(|e| e.to_string())
    }

    fn forbidden() -> Response<Vec<u8>> {
        Response::builder()
            .status(403)
            .body(b"Forbidden".to_vec())
            .expect("static 403 response is well-formed")
    }
}

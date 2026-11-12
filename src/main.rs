mod auth;
mod handlers;
mod models;
mod state;

use axum::{
    http::header,
    response::{Html, IntoResponse},
    routing::{delete, get, post, put},
    Router,
};
use state::AppState;
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};

// Embed HTML & PWA assets into the binary so the app runs standalone in a single executable!
const EMBEDDED_INDEX_HTML: &str = include_str!("../static/index.html");
const EMBEDDED_MANIFEST_JSON: &str = include_str!("../static/manifest.json");
const EMBEDDED_SW_JS: &str = include_str!("../static/sw.js");

async fn serve_index() -> Html<&'static str> {
    Html(EMBEDDED_INDEX_HTML)
}

async fn serve_manifest() -> impl IntoResponse {
    ([(header::CONTENT_TYPE, "application/manifest+json; charset=utf-8")], EMBEDDED_MANIFEST_JSON)
}

async fn serve_sw() -> impl IntoResponse {
    ([(header::CONTENT_TYPE, "application/javascript; charset=utf-8")], EMBEDDED_SW_JS)
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let state = AppState::new();

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let api_routes = Router::new()
        // Authentication & profile
        .route("/register", post(handlers::register))
        .route("/login", post(handlers::login))
        .route("/logout", post(handlers::logout))
        .route("/me", get(handlers::get_me))
        .route("/user/theme", put(handlers::update_theme))
        // Children & Family
        .route("/children", post(handlers::create_child))
        .route("/children/:id", delete(handlers::delete_child))
        .route("/children/:id/meta", put(handlers::update_child_meta))
        .route("/family/join", post(handlers::join_family))
        // Diary entries
        .route("/children/:id/entries", post(handlers::add_diary_entry))
        .route(
            "/children/:id/entries/:entry_id",
            delete(handlers::delete_diary_entry),
        )
        // Medication reminders
        .route("/children/:id/reminders", post(handlers::add_reminder))
        .route(
            "/children/:id/reminders/:reminder_id/toggle",
            put(handlers::toggle_reminder),
        )
        .route(
            "/children/:id/reminders/:reminder_id",
            delete(handlers::delete_reminder),
        );

    let app = Router::new()
        .nest("/api", api_routes)
        .route("/", get(serve_index))
        .route("/manifest.json", get(serve_manifest))
        .route("/sw.js", get(serve_sw))
        .fallback(serve_index)
        .layer(cors)
        .with_state(state);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("==========================================================");
    println!("🏥  Chrono — Clinical Child Symptom Diary (Rust & Axum)");
    println!("==========================================================");
    println!("⚡ Server started successfully!");
    println!("👉 Open in browser:     http://localhost:{}", port);
    println!("📱 On local network:    http://127.0.0.1:{}", port);
    println!("==========================================================");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to start server on the specified port");

    axum::serve(listener, app).await.unwrap();
}

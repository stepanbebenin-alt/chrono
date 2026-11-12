use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use uuid::Uuid;

use crate::auth::{generate_token, hash_password, verify_password};
use crate::models::{
    AddEntryRequest, AddReminderRequest, ApiResponse, AuthResponse, Child, CreateChildRequest,
    DiaryEntry, JoinFamilyRequest, LoginRequest, RegisterRequest, Reminder, UpdateChildMetaRequest,
    UpdateThemeRequest, User,
};
use crate::state::{AppState, SharedState};

pub async fn get_auth_user_id(headers: &HeaderMap, state: &SharedState) -> Option<String> {
    let auth_header = headers.get("Authorization")?.to_str().ok()?;
    let token = auth_header.strip_prefix("Bearer ")?.trim();

    let data = state.data.read().await;
    data.sessions.get(token).cloned()
}

// POST /api/register
pub async fn register(
    State(state): State<SharedState>,
    Json(payload): Json<RegisterRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<String>>)> {
    let username = payload.username.trim().to_lowercase();
    let name = payload.name.trim();

    if username.is_empty() || payload.password.is_empty() || name.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::err("Please fill in all fields")),
        ));
    }

    let mut data = state.data.write().await;

    if data.users_by_username.contains_key(&username) {
        return Err((
            StatusCode::CONFLICT,
            Json(ApiResponse::err("A user with this username already exists")),
        ));
    }

    let user_id = Uuid::new_v4().to_string();
    let user = User {
        id: user_id.clone(),
        username: username.clone(),
        name: name.to_string(),
        password_hash: hash_password(&payload.password),
        theme: "dark".to_string(),
        created_at: Utc::now().to_rfc3339(),
    };

    // Create an initial child profile for a quick start
    let default_child_id = Uuid::new_v4().to_string();
    let default_child = Child {
        id: default_child_id.clone(),
        user_id: user_id.clone(),
        family_code: Some("FAM-7942".to_string()),
        name: "My Child".to_string(),
        age: 5,
        weight: 19.0,
        height: Some(110.0),
        allergies: Some("None".to_string()),
        doctor_phone: None,
        episode: "Observation started".to_string(),
        points48h: vec![DiaryEntry {
            id: Uuid::new_v4().to_string(),
            temp: 36.8,
            drink: Some("150 ml".to_string()),
            med: None,
            note: "Profile created successfully. Log your first measurement.".to_string(),
            author: Some(name.to_string()),
            hours_ago: 0.0,
            created_at_ms: Some(Utc::now().timestamp_millis() as u64),
            timestamp: "Just now".to_string(),
        }],
        reminders: vec![Reminder {
            id: Uuid::new_v4().to_string(),
            title: "Monitor temperature and keep child hydrated".to_string(),
            time: "Every 3 hours".to_string(),
            done: false,
        }],
        created_at: Utc::now().to_rfc3339(),
        ..Default::default()
    };

    let token = generate_token();
    data.sessions.insert(token.clone(), user_id.clone());
    data.users.insert(user_id.clone(), user.clone());
    data.users_by_username.insert(username, user_id.clone());
    data.children.insert(default_child_id.clone(), default_child.clone());
    data.children_by_user.insert(user_id, vec![default_child_id]);

    AppState::save_to_disk(&data);

    Ok(Json(ApiResponse::ok(AuthResponse {
        token,
        user,
        children: vec![default_child],
    })))
}

// POST /api/login
pub async fn login(
    State(state): State<SharedState>,
    Json(payload): Json<LoginRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<String>>)> {
    let username = payload.username.trim().to_lowercase();
    let mut data = state.data.write().await;

    let user_id = match data.users_by_username.get(&username) {
        Some(id) => id.clone(),
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::err("Invalid username or password")),
            ));
        }
    };

    let user = match data.users.get(&user_id) {
        Some(u) => u.clone(),
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::err("User not found")),
            ));
        }
    };

    if !verify_password(&payload.password, &user.password_hash) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(ApiResponse::err("Invalid username or password")),
        ));
    }

    let token = generate_token();
    data.sessions.insert(token.clone(), user_id.clone());

    let child_ids = data.children_by_user.get(&user_id).cloned().unwrap_or_default();
    let children: Vec<Child> = child_ids
        .iter()
        .filter_map(|cid| data.children.get(cid).cloned())
        .collect();

    AppState::save_to_disk(&data);

    Ok(Json(ApiResponse::ok(AuthResponse {
        token,
        user,
        children,
    })))
}

// POST /api/logout
pub async fn logout(
    headers: HeaderMap,
    State(state): State<SharedState>,
) -> impl IntoResponse {
    if let Some(auth_header) = headers.get("Authorization") {
        if let Ok(token_str) = auth_header.to_str() {
            if let Some(token) = token_str.strip_prefix("Bearer ") {
                let mut data = state.data.write().await;
                data.sessions.remove(token.trim());
                AppState::save_to_disk(&data);
            }
        }
    }
    Json(ApiResponse::ok("Signed out successfully"))
}

// GET /api/me
pub async fn get_me(
    headers: HeaderMap,
    State(state): State<SharedState>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<String>>)> {
    let user_id = match get_auth_user_id(&headers, &state).await {
        Some(id) => id,
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::err("Authentication required")),
            ));
        }
    };

    let data = state.data.read().await;
    let user = match data.users.get(&user_id) {
        Some(u) => u.clone(),
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::err("User not found")),
            ));
        }
    };

    let child_ids = data.children_by_user.get(&user_id).cloned().unwrap_or_default();
    let children: Vec<Child> = child_ids
        .iter()
        .filter_map(|cid| data.children.get(cid).cloned())
        .collect();

    #[derive(serde::Serialize)]
    struct MeResponse {
        user: User,
        children: Vec<Child>,
    }

    Ok(Json(ApiResponse::ok(MeResponse { user, children })))
}

// PUT /api/user/theme
pub async fn update_theme(
    headers: HeaderMap,
    State(state): State<SharedState>,
    Json(payload): Json<UpdateThemeRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<String>>)> {
    let user_id = match get_auth_user_id(&headers, &state).await {
        Some(id) => id,
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::err("Authentication required")),
            ));
        }
    };

    let mut data = state.data.write().await;
    if let Some(user) = data.users.get_mut(&user_id) {
        user.theme = payload.theme.clone();
        AppState::save_to_disk(&data);
        Ok(Json(ApiResponse::ok(payload.theme)))
    } else {
        Err((
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("User not found")),
        ))
    }
}

// POST /api/children
pub async fn create_child(
    headers: HeaderMap,
    State(state): State<SharedState>,
    Json(payload): Json<CreateChildRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<String>>)> {
    let user_id = match get_auth_user_id(&headers, &state).await {
        Some(id) => id,
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::err("Authentication required")),
            ));
        }
    };

    let name = payload.name.trim();
    if name.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::err("Child's name is required")),
        ));
    }

    let mut data = state.data.write().await;
    let child_id = Uuid::new_v4().to_string();
    let episode = if payload.episode.trim().is_empty() {
        "Under observation".to_string()
    } else {
        payload.episode.trim().to_string()
    };

    let new_child = Child {
        id: child_id.clone(),
        user_id: user_id.clone(),
        family_code: Some(format!("FAM-{}", &Uuid::new_v4().to_string()[..4].to_uppercase())),
        name: name.to_string(),
        age: payload.age,
        weight: payload.weight,
        height: payload.height.or(Some(110.0)),
        allergies: payload.allergies.or_else(|| Some("None".to_string())),
        doctor_phone: payload.doctor_phone,
        episode,
        points48h: vec![DiaryEntry {
            id: Uuid::new_v4().to_string(),
            temp: 36.6,
            drink: Some("150 ml".to_string()),
            med: None,
            note: "Profile created. Start tracking measurements.".to_string(),
            author: None,
            hours_ago: 0.0,
            created_at_ms: Some(Utc::now().timestamp_millis() as u64),
            timestamp: "Just now".to_string(),
        }],
        reminders: vec![Reminder {
            id: Uuid::new_v4().to_string(),
            title: "Measure temperature".to_string(),
            time: "Every 3–4 hours".to_string(),
            done: false,
        }],
        created_at: Utc::now().to_rfc3339(),
        ..Default::default()
    };

    data.children.insert(child_id.clone(), new_child.clone());
    data.children_by_user
        .entry(user_id)
        .or_default()
        .push(child_id);

    AppState::save_to_disk(&data);

    Ok(Json(ApiResponse::ok(new_child)))
}

// PUT /api/children/:id/meta
pub async fn update_child_meta(
    Path(child_id): Path<String>,
    headers: HeaderMap,
    State(state): State<SharedState>,
    Json(payload): Json<UpdateChildMetaRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<String>>)> {
    let _user_id = match get_auth_user_id(&headers, &state).await {
        Some(id) => id,
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::err("Authentication required")),
            ));
        }
    };

    let mut data = state.data.write().await;
    let child = match data.children.get_mut(&child_id) {
        Some(c) => c,
        None => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(ApiResponse::err("Child profile not found")),
            ));
        }
    };

    if let Some(w) = payload.weight { child.weight = w; }
    if let Some(h) = payload.height { child.height = Some(h); }
    if let Some(a) = payload.age { child.age = a; }
    if let Some(ep) = payload.episode { child.episode = ep; }
    if let Some(u) = payload.last_urine_ms { child.last_urine_ms = Some(u); }
    if let Some(logs) = payload.urine_logs { child.urine_logs = logs; }
    if let Some(vacs) = payload.vaccines { child.vaccines = vacs; }
    if let Some(arch) = payload.archived_episodes { child.archived_episodes = arch; }

    let updated = child.clone();
    AppState::save_to_disk(&data);
    Ok(Json(ApiResponse::ok(updated)))
}

// POST /api/family/join
pub async fn join_family(
    headers: HeaderMap,
    State(state): State<SharedState>,
    Json(payload): Json<JoinFamilyRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<String>>)> {
    let user_id = match get_auth_user_id(&headers, &state).await {
        Some(id) => id,
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::err("Authentication required")),
            ));
        }
    };

    let code = payload.code.trim().to_uppercase();
    let mut data = state.data.write().await;

    let matched = data
        .children
        .values()
        .find(|c| c.family_code.as_deref().unwrap_or("").to_uppercase() == code)
        .cloned();

    let Some(child) = matched else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("Family code not found")),
        ));
    };

    let list = data.children_by_user.entry(user_id).or_default();
    if !list.contains(&child.id) {
        list.push(child.id.clone());
    }
    AppState::save_to_disk(&data);

    Ok(Json(ApiResponse::ok(child)))
}

// DELETE /api/children/:id
pub async fn delete_child(
    Path(child_id): Path<String>,
    headers: HeaderMap,
    State(state): State<SharedState>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<String>>)> {
    let user_id = match get_auth_user_id(&headers, &state).await {
        Some(id) => id,
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::err("Authentication required")),
            ));
        }
    };

    let mut data = state.data.write().await;

    // Check if child belongs to the current user
    if let Some(child) = data.children.get(&child_id) {
        if child.user_id != user_id {
            return Err((
                StatusCode::FORBIDDEN,
                Json(ApiResponse::err("Access to profile denied")),
            ));
        }
    } else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("Child profile not found")),
        ));
    }

    data.children.remove(&child_id);
    if let Some(list) = data.children_by_user.get_mut(&user_id) {
        list.retain(|id| id != &child_id);
    }

    AppState::save_to_disk(&data);

    Ok(Json(ApiResponse::ok("Profile deleted successfully")))
}

// POST /api/children/:id/entries
pub async fn add_diary_entry(
    Path(child_id): Path<String>,
    headers: HeaderMap,
    State(state): State<SharedState>,
    Json(payload): Json<AddEntryRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<String>>)> {
    let user_id = match get_auth_user_id(&headers, &state).await {
        Some(id) => id,
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::err("Authentication required")),
            ));
        }
    };

    let mut data = state.data.write().await;
    let child = match data.children.get_mut(&child_id) {
        Some(c) if c.user_id == user_id => c,
        _ => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(ApiResponse::err("Child not found or access denied")),
            ));
        }
    };

    // Shift older points slightly back in time
    for p in child.points48h.iter_mut() {
        p.hours_ago = (p.hours_ago + 2.0).min(48.0);
    }

    let note_str = payload
        .note
        .unwrap_or_else(|| "Temperature reading".to_string());

    let entry = DiaryEntry {
        id: Uuid::new_v4().to_string(),
        temp: payload.temp,
        drink: payload.drink.filter(|s| !s.trim().is_empty()),
        med: payload.med.filter(|s| !s.trim().is_empty()),
        note: note_str,
        author: None,
        hours_ago: 0.0,
        created_at_ms: Some(payload.created_at_ms.unwrap_or_else(|| Utc::now().timestamp_millis() as u64)),
        timestamp: "Just now".to_string(),
    };

    child.points48h.push(entry.clone());
    AppState::save_to_disk(&data);

    Ok(Json(ApiResponse::ok(entry)))
}

// DELETE /api/children/:id/entries/:entry_id
pub async fn delete_diary_entry(
    Path((child_id, entry_id)): Path<(String, String)>,
    headers: HeaderMap,
    State(state): State<SharedState>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<String>>)> {
    let user_id = match get_auth_user_id(&headers, &state).await {
        Some(id) => id,
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::err("Authentication required")),
            ));
        }
    };

    let mut data = state.data.write().await;
    let child = match data.children.get_mut(&child_id) {
        Some(c) if c.user_id == user_id => c,
        _ => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(ApiResponse::err("Child not found or access denied")),
            ));
        }
    };

    child.points48h.retain(|p| p.id != entry_id);
    AppState::save_to_disk(&data);

    Ok(Json(ApiResponse::ok("Entry deleted")))
}

// POST /api/children/:id/reminders
pub async fn add_reminder(
    Path(child_id): Path<String>,
    headers: HeaderMap,
    State(state): State<SharedState>,
    Json(payload): Json<AddReminderRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<String>>)> {
    let user_id = match get_auth_user_id(&headers, &state).await {
        Some(id) => id,
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::err("Authentication required")),
            ));
        }
    };

    let mut data = state.data.write().await;
    let child = match data.children.get_mut(&child_id) {
        Some(c) if c.user_id == user_id => c,
        _ => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(ApiResponse::err("Child not found or access denied")),
            ));
        }
    };

    let reminder = Reminder {
        id: Uuid::new_v4().to_string(),
        title: payload.title,
        time: payload.time,
        done: false,
    };

    child.reminders.insert(0, reminder.clone());
    AppState::save_to_disk(&data);

    Ok(Json(ApiResponse::ok(reminder)))
}

// PUT /api/children/:id/reminders/:reminder_id/toggle
pub async fn toggle_reminder(
    Path((child_id, reminder_id)): Path<(String, String)>,
    headers: HeaderMap,
    State(state): State<SharedState>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<String>>)> {
    let user_id = match get_auth_user_id(&headers, &state).await {
        Some(id) => id,
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::err("Authentication required")),
            ));
        }
    };

    let mut data = state.data.write().await;
    let child = match data.children.get_mut(&child_id) {
        Some(c) if c.user_id == user_id => c,
        _ => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(ApiResponse::err("Child not found or access denied")),
            ));
        }
    };

    if let Some(rem) = child.reminders.iter_mut().find(|r| r.id == reminder_id) {
        rem.done = !rem.done;
        let is_done = rem.done;
        AppState::save_to_disk(&data);
        Ok(Json(ApiResponse::ok(is_done)))
    } else {
        Err((
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("Reminder not found")),
        ))
    }
}

// DELETE /api/children/:id/reminders/:reminder_id
pub async fn delete_reminder(
    Path((child_id, reminder_id)): Path<(String, String)>,
    headers: HeaderMap,
    State(state): State<SharedState>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<String>>)> {
    let user_id = match get_auth_user_id(&headers, &state).await {
        Some(id) => id,
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::err("Authentication required")),
            ));
        }
    };

    let mut data = state.data.write().await;
    let child = match data.children.get_mut(&child_id) {
        Some(c) if c.user_id == user_id => c,
        _ => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(ApiResponse::err("Child not found or access denied")),
            ));
        }
    };

    child.reminders.retain(|r| r.id != reminder_id);
    AppState::save_to_disk(&data);

    Ok(Json(ApiResponse::ok("Reminder deleted")))
}

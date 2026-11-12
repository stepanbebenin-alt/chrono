use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub name: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub theme: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Child {
    pub id: String,
    #[serde(alias = "userId", default)]
    pub user_id: String,
    #[serde(rename = "familyCode", default)]
    pub family_code: Option<String>,
    pub name: String,
    pub age: u32,
    pub weight: f32,
    #[serde(default)]
    pub height: Option<f32>,
    #[serde(default)]
    pub allergies: Option<String>,
    #[serde(rename = "doctorPhone", default)]
    pub doctor_phone: Option<String>,
    pub episode: String,
    #[serde(default)]
    pub points48h: Vec<DiaryEntry>,
    #[serde(default)]
    pub reminders: Vec<Reminder>,
    #[serde(rename = "lastUrineMs", default)]
    pub last_urine_ms: Option<u64>,
    #[serde(rename = "urineLogs", default)]
    pub urine_logs: Vec<u64>,
    #[serde(default)]
    pub vaccines: Vec<serde_json::Value>,
    #[serde(rename = "archivedEpisodes", default)]
    pub archived_episodes: Vec<serde_json::Value>,
    #[serde(alias = "createdAt", default)]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DiaryEntry {
    pub id: String,
    pub temp: f32,
    pub drink: Option<String>,
    pub med: Option<String>,
    pub note: String,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub hours_ago: f32,
    #[serde(rename = "createdAtMs", default)]
    pub created_at_ms: Option<u64>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reminder {
    pub id: String,
    pub title: String,
    pub time: String,
    pub done: bool,
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: User,
    pub children: Vec<Child>,
}

#[derive(Debug, Deserialize)]
pub struct CreateChildRequest {
    pub name: String,
    pub age: u32,
    pub weight: f32,
    #[serde(default)]
    pub height: Option<f32>,
    #[serde(default)]
    pub allergies: Option<String>,
    #[serde(rename = "doctorPhone", default)]
    pub doctor_phone: Option<String>,
    pub episode: String,
}

#[derive(Debug, Deserialize)]
pub struct AddEntryRequest {
    pub temp: f32,
    pub drink: Option<String>,
    pub med: Option<String>,
    pub note: Option<String>,
    #[serde(rename = "createdAtMs", default)]
    pub created_at_ms: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct JoinFamilyRequest {
    pub code: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateChildMetaRequest {
    pub weight: Option<f32>,
    pub height: Option<f32>,
    pub age: Option<u32>,
    pub episode: Option<String>,
    #[serde(rename = "lastUrineMs")]
    pub last_urine_ms: Option<u64>,
    #[serde(rename = "urineLogs")]
    pub urine_logs: Option<Vec<u64>>,
    pub vaccines: Option<Vec<serde_json::Value>>,
    #[serde(rename = "archivedEpisodes")]
    pub archived_episodes: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
pub struct AddReminderRequest {
    pub title: String,
    pub time: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateThemeRequest {
    pub theme: String,
}

#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<T>,
}

impl<T> ApiResponse<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            message: None,
            data: Some(data),
        }
    }

    pub fn err(message: impl Into<String>) -> Self {
        Self {
            success: false,
            message: Some(message.into()),
            data: None,
        }
    }
}

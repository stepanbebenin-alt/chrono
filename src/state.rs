use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::RwLock;
use chrono::Utc;
use uuid::Uuid;

use crate::auth::hash_password;
use crate::models::{Child, DiaryEntry, Reminder, User};

const DB_FILE_PATH: &str = "chrono_data.json";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
pub struct PersistentData {
    pub users: HashMap<String, User>,
    pub users_by_username: HashMap<String, String>,
    pub sessions: HashMap<String, String>, // token -> user_id
    pub children: HashMap<String, Child>,
    pub children_by_user: HashMap<String, Vec<String>>,
}

pub struct AppState {
    pub data: RwLock<PersistentData>,
}

pub type SharedState = Arc<AppState>;

impl AppState {
    pub fn new() -> SharedState {
        let loaded = Self::load_from_disk();
        let state = Self {
            data: RwLock::new(loaded),
        };
        Arc::new(state)
    }

    fn load_from_disk() -> PersistentData {
        if Path::new(DB_FILE_PATH).exists() {
            if let Ok(content) = fs::read_to_string(DB_FILE_PATH) {
                if let Ok(data) = serde_json::from_str::<PersistentData>(&content) {
                    println!("📂 Database loaded successfully from {}", DB_FILE_PATH);
                    return data;
                }
            }
        }

        println!("✨ Created a new database with demo data");
        Self::create_seed_data()
    }

    pub fn save_to_disk(data: &PersistentData) {
        if let Ok(json) = serde_json::to_string_pretty(data) {
            let _ = fs::write(DB_FILE_PATH, json);
        }
    }

    fn create_seed_data() -> PersistentData {
        let mut data = PersistentData::default();

        let demo_user_id = Uuid::new_v4().to_string();
        let demo_user = User {
            id: demo_user_id.clone(),
            username: "demo".to_string(),
            name: "Parent (Demo)".to_string(),
            password_hash: hash_password("demo123"),
            theme: "dark".to_string(),
            created_at: Utc::now().to_rfc3339(),
        };

        let child1_id = Uuid::new_v4().to_string();
        let child1 = Child {
            id: child1_id.clone(),
            user_id: demo_user_id.clone(),
            family_code: Some("FAM-1024".to_string()),
            name: "Leo".to_string(),
            age: 8,
            weight: 26.0,
            height: Some(128.0),
            allergies: Some("None".to_string()),
            doctor_phone: None,
            episode: "Cough, Day 4".to_string(),
            points48h: vec![
                DiaryEntry {
                    id: Uuid::new_v4().to_string(),
                    temp: 38.4,
                    drink: Some("150 ml".to_string()),
                    med: Some("Ibuprofen 10 ml".to_string()),
                    note: "Evening fever spike, dry cough".to_string(),
                    hours_ago: 40.0,
                    timestamp: "40h ago".to_string(),
                    ..Default::default()
                },
                DiaryEntry {
                    id: Uuid::new_v4().to_string(),
                    temp: 37.8,
                    drink: Some("200 ml".to_string()),
                    med: None,
                    note: "Slept calmly after antipyretic".to_string(),
                    hours_ago: 30.0,
                    timestamp: "30h ago".to_string(),
                    ..Default::default()
                },
                DiaryEntry {
                    id: Uuid::new_v4().to_string(),
                    temp: 38.6,
                    drink: Some("100 ml".to_string()),
                    med: None,
                    note: "Daytime coughing fits, fatigue".to_string(),
                    hours_ago: 21.0,
                    timestamp: "21h ago".to_string(),
                    ..Default::default()
                },
                DiaryEntry {
                    id: Uuid::new_v4().to_string(),
                    temp: 39.1,
                    drink: Some("120 ml".to_string()),
                    med: Some("Ibuprofen 10 ml".to_string()),
                    note: "Nighttime peak 39.1 °C, gave Ibuprofen 10 ml".to_string(),
                    hours_ago: 12.0,
                    timestamp: "12h ago".to_string(),
                    ..Default::default()
                },
                DiaryEntry {
                    id: Uuid::new_v4().to_string(),
                    temp: 38.2,
                    drink: Some("150 ml".to_string()),
                    med: None,
                    note: "Fever came down, resting".to_string(),
                    hours_ago: 8.0,
                    timestamp: "8h ago".to_string(),
                    ..Default::default()
                },
                DiaryEntry {
                    id: Uuid::new_v4().to_string(),
                    temp: 38.2,
                    drink: Some("180 ml".to_string()),
                    med: None,
                    note: "Morning check, cough persists".to_string(),
                    hours_ago: 3.0,
                    timestamp: "3h ago".to_string(),
                    ..Default::default()
                },
            ],
            reminders: vec![
                Reminder {
                    id: Uuid::new_v4().to_string(),
                    title: "Ibuprofen 10 ml (if temp > 38.5 °C)".to_string(),
                    time: "Every 6–8 hours".to_string(),
                    done: true,
                },
                Reminder {
                    id: Uuid::new_v4().to_string(),
                    title: "Warm fluids / ORS (150 ml)".to_string(),
                    time: "Every 2 hours".to_string(),
                    done: false,
                },
                Reminder {
                    id: Uuid::new_v4().to_string(),
                    title: "Pediatrician visit with QR report".to_string(),
                    time: "Today at 4:30 PM".to_string(),
                    done: false,
                },
            ],
            created_at: Utc::now().to_rfc3339(),
            ..Default::default()
        };

        let child2_id = Uuid::new_v4().to_string();
        let child2 = Child {
            id: child2_id.clone(),
            user_id: demo_user_id.clone(),
            family_code: Some("FAM-2048".to_string()),
            name: "Sophia".to_string(),
            age: 4,
            weight: 16.0,
            height: Some(104.0),
            allergies: Some("None".to_string()),
            doctor_phone: None,
            episode: "Fever, Day 2".to_string(),
            points48h: vec![
                DiaryEntry {
                    id: Uuid::new_v4().to_string(),
                    temp: 37.5,
                    drink: Some("120 ml".to_string()),
                    med: None,
                    note: "Tired after preschool".to_string(),
                    hours_ago: 36.0,
                    timestamp: "36h ago".to_string(),
                    ..Default::default()
                },
                DiaryEntry {
                    id: Uuid::new_v4().to_string(),
                    temp: 38.4,
                    drink: Some("100 ml".to_string()),
                    med: Some("Paracetamol 5 ml".to_string()),
                    note: "Night fever, gave Paracetamol".to_string(),
                    hours_ago: 24.0,
                    timestamp: "24h ago".to_string(),
                    ..Default::default()
                },
                DiaryEntry {
                    id: Uuid::new_v4().to_string(),
                    temp: 37.7,
                    drink: Some("150 ml".to_string()),
                    med: None,
                    note: "Playing calmly".to_string(),
                    hours_ago: 1.0,
                    timestamp: "1h ago".to_string(),
                    ..Default::default()
                },
            ],
            reminders: vec![
                Reminder {
                    id: Uuid::new_v4().to_string(),
                    title: "Paracetamol 5 ml (as needed)".to_string(),
                    time: "No more than every 6 hours".to_string(),
                    done: true,
                },
            ],
            created_at: Utc::now().to_rfc3339(),
            ..Default::default()
        };

        data.users.insert(demo_user_id.clone(), demo_user);
        data.users_by_username.insert("demo".to_string(), demo_user_id.clone());
        data.children.insert(child1_id.clone(), child1);
        data.children.insert(child2_id.clone(), child2);
        data.children_by_user.insert(demo_user_id.clone(), vec![child1_id, child2_id]);

        Self::save_to_disk(&data);
        data
    }
}

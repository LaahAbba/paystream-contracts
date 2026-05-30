// SPDX-License-Identifier: Apache-2.0

//! Employer notification preferences — CRUD endpoints for email/webhook channels.
//!
//! Employers can configure per-event-type notification settings.
//! Each preference record supports email and webhook delivery channels
//! with individual toggles per stream event type.

use std::collections::HashMap;

/// Supported notification channels.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Channel {
    Email,
    Webhook,
}

/// Stream event types that can trigger notifications.
#[derive(Debug, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StreamEvent {
    StreamCreated,
    Withdrawn,
    Paused,
    Resumed,
    Cancelled,
    ToppedUp,
    StreamTransferred,
}

/// Per-event-type toggle map. Defaults to all enabled.
pub type EventToggles = HashMap<StreamEvent, bool>;

/// A single notification preference record for an employer.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct NotificationPreference {
    pub id: String,
    pub employer_address: String,
    pub channel: Channel,
    /// Destination: email address or webhook URL depending on channel.
    pub destination: String,
    /// Per-event toggles. Events absent from the map are treated as enabled.
    pub events: EventToggles,
    /// Unsubscribe token — included in email footers for one-click opt-out.
    pub unsubscribe_token: String,
}

/// Request body for creating or updating a preference.
#[derive(Debug, serde::Deserialize)]
pub struct UpsertPreferenceRequest {
    pub channel: Channel,
    pub destination: String,
    pub events: Option<EventToggles>,
}

/// In-memory store (replace with a real DB in production).
pub struct NotificationStore {
    records: HashMap<String, NotificationPreference>,
}

impl NotificationStore {
    pub fn new() -> Self {
        Self { records: HashMap::new() }
    }

    /// Create a new preference. Returns the created record.
    pub fn create(
        &mut self,
        employer_address: &str,
        req: UpsertPreferenceRequest,
    ) -> NotificationPreference {
        let id = uuid();
        let pref = NotificationPreference {
            id: id.clone(),
            employer_address: employer_address.to_string(),
            channel: req.channel,
            destination: req.destination,
            events: req.events.unwrap_or_else(default_toggles),
            unsubscribe_token: uuid(),
        };
        self.records.insert(id, pref.clone());
        pref
    }

    /// List all preferences for an employer.
    pub fn list(&self, employer_address: &str) -> Vec<&NotificationPreference> {
        self.records
            .values()
            .filter(|p| p.employer_address == employer_address)
            .collect()
    }

    /// Get a single preference by ID.
    pub fn get(&self, id: &str) -> Option<&NotificationPreference> {
        self.records.get(id)
    }

    /// Update an existing preference. Returns None if not found.
    pub fn update(
        &mut self,
        id: &str,
        employer_address: &str,
        req: UpsertPreferenceRequest,
    ) -> Option<NotificationPreference> {
        let pref = self.records.get_mut(id)?;
        if pref.employer_address != employer_address {
            return None; // not owned by this employer
        }
        pref.channel = req.channel;
        pref.destination = req.destination;
        if let Some(events) = req.events {
            pref.events = events;
        }
        Some(pref.clone())
    }

    /// Delete a preference. Returns true if it existed and was owned by the employer.
    pub fn delete(&mut self, id: &str, employer_address: &str) -> bool {
        match self.records.get(id) {
            Some(p) if p.employer_address == employer_address => {
                self.records.remove(id);
                true
            }
            _ => false,
        }
    }

    /// Unsubscribe via token — disables all events on the matching preference.
    pub fn unsubscribe(&mut self, token: &str) -> bool {
        if let Some(pref) = self.records.values_mut().find(|p| p.unsubscribe_token == token) {
            for v in pref.events.values_mut() {
                *v = false;
            }
            true
        } else {
            false
        }
    }
}

/// All event types enabled by default.
fn default_toggles() -> EventToggles {
    [
        StreamEvent::StreamCreated,
        StreamEvent::Withdrawn,
        StreamEvent::Paused,
        StreamEvent::Resumed,
        StreamEvent::Cancelled,
        StreamEvent::ToppedUp,
        StreamEvent::StreamTransferred,
    ]
    .into_iter()
    .map(|e| (e, true))
    .collect()
}

/// Minimal UUID-like ID generator (replace with uuid crate in production).
fn uuid() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    format!("pref-{:x}", nanos)
}

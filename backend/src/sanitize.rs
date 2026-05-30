// SPDX-License-Identifier: Apache-2.0

//! Input sanitization middleware.
//!
//! Enforces on every incoming API request:
//! 1. Payload size <= 1 MB — rejects oversized bodies with 400.
//! 2. Stellar address format — validates fields named `employer`, `employee`,
//!    `admin`, `token`, or any field ending with `_address`.
//! 3. Unknown field stripping — removes keys not in the caller-supplied allow-list.

use std::collections::{HashMap, HashSet};

/// Maximum accepted request body size in bytes (1 MB).
pub const MAX_BODY_BYTES: usize = 1_024 * 1_024;

/// A field-level validation error returned in 400 responses.
#[derive(Debug, PartialEq, serde::Serialize)]
pub struct FieldError {
    pub field: String,
    pub message: String,
}

/// Sanitized body + any validation errors.
#[derive(Debug)]
pub struct SanitizeResult {
    /// Cleaned body with unknown fields removed.
    pub body: serde_json::Map<String, serde_json::Value>,
    /// Non-empty means the request should be rejected with 400.
    pub errors: Vec<FieldError>,
}

/// Sanitize a raw JSON request body.
///
/// Returns `Err` only for oversized payloads (caller should respond 400 immediately).
/// Otherwise returns `Ok(SanitizeResult)`; check `result.errors` for field issues.
pub fn sanitize(raw: &[u8], allowed_fields: &HashSet<&str>) -> Result<SanitizeResult, Vec<FieldError>> {
    if raw.len() > MAX_BODY_BYTES {
        return Err(vec![FieldError {
            field: "_body".to_string(),
            message: format!("payload exceeds maximum size of {} bytes", MAX_BODY_BYTES),
        }]);
    }

    let obj = match serde_json::from_slice::<serde_json::Value>(raw) {
        Ok(serde_json::Value::Object(m)) => m,
        _ => serde_json::Map::new(),
    };

    let mut errors = Vec::new();
    let mut clean = serde_json::Map::new();

    for (key, value) in &obj {
        // Strip unknown fields.
        if !allowed_fields.contains(key.as_str()) {
            continue;
        }
        // Validate Stellar address fields.
        if is_address_field(key) {
            if let Some(addr) = value.as_str() {
                if let Err(msg) = validate_stellar_address(addr) {
                    errors.push(FieldError { field: key.clone(), message: msg });
                    continue;
                }
            }
        }
        clean.insert(key.clone(), value.clone());
    }

    Ok(SanitizeResult { body: clean, errors })
}

fn is_address_field(name: &str) -> bool {
    matches!(name, "employer" | "employee" | "admin" | "token") || name.ends_with("_address")
}

/// Validates a Stellar public key: 56 chars, starts with 'G', base32 alphabet.
fn validate_stellar_address(addr: &str) -> Result<(), String> {
    if addr.len() != 56 {
        return Err(format!("invalid Stellar address: expected 56 characters, got {}", addr.len()));
    }
    if !addr.starts_with('G') {
        return Err("invalid Stellar address: must start with 'G'".to_string());
    }
    if addr.chars().any(|c| !matches!(c, 'A'..='Z' | '2'..='7')) {
        return Err("invalid Stellar address: illegal character".to_string());
    }
    Ok(())
}

/// Build a 400 error response body from field errors.
pub fn error_response(errors: &[FieldError]) -> HashMap<String, serde_json::Value> {
    let mut map = HashMap::new();
    map.insert("error".to_string(), serde_json::json!("validation_failed"));
    map.insert("fields".to_string(), serde_json::to_value(errors).unwrap_or_default());
    map
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fields(names: &[&str]) -> HashSet<&str> {
        names.iter().copied().collect()
    }

    #[test]
    fn rejects_oversized_payload() {
        let big = vec![b'x'; MAX_BODY_BYTES + 1];
        assert!(sanitize(&big, &fields(&[])).is_err());
    }

    #[test]
    fn strips_unknown_fields() {
        let body = br#"{"employer":"GABC","unknown":"drop"}"#;
        let result = sanitize(body, &fields(&["employer"])).unwrap();
        assert!(!result.body.contains_key("unknown"));
    }

    #[test]
    fn rejects_invalid_stellar_address() {
        let body = br#"{"employer":"bad"}"#;
        let result = sanitize(body, &fields(&["employer"])).unwrap();
        assert_eq!(result.errors[0].field, "employer");
    }

    #[test]
    fn accepts_valid_stellar_address() {
        let addr = "GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV3WFBDBC6T";
        let body = format!(r#"{{"employer":"{}"}}"#, addr);
        let result = sanitize(body.as_bytes(), &fields(&["employer"])).unwrap();
        assert!(result.errors.is_empty());
        assert!(result.body.contains_key("employer"));
    }
}

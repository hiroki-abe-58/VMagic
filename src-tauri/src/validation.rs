/// Duration tolerance in seconds (±0.1 seconds)
const DURATION_TOLERANCE: f64 = 0.1;

/// Validate that output duration is within tolerance of input duration
/// Returns (is_valid, difference)
pub fn validate_duration(input_duration: f64, output_duration: f64) -> (bool, f64) {
    let diff = output_duration - input_duration;
    let is_valid = diff.abs() <= DURATION_TOLERANCE;
    (is_valid, diff)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_duration_validation_within_tolerance() {
        // Exact match
        assert!(validate_duration(10.0, 10.0).0);
        
        // Within positive tolerance
        assert!(validate_duration(10.0, 10.05).0);
        assert!(validate_duration(10.0, 10.1).0);
        
        // Within negative tolerance
        assert!(validate_duration(10.0, 9.95).0);
        assert!(validate_duration(10.0, 9.9).0);
    }

    #[test]
    fn test_duration_validation_outside_tolerance() {
        // Outside positive tolerance
        assert!(!validate_duration(10.0, 10.15).0);
        assert!(!validate_duration(10.0, 10.2).0);
        
        // Outside negative tolerance
        assert!(!validate_duration(10.0, 9.85).0);
        assert!(!validate_duration(10.0, 9.8).0);
    }

    #[test]
    fn test_duration_difference_calculation() {
        let (_, diff) = validate_duration(10.0, 10.05);
        assert!((diff - 0.05).abs() < 0.0001);
        
        let (_, diff) = validate_duration(10.0, 9.95);
        assert!((diff - (-0.05)).abs() < 0.0001);
    }
}


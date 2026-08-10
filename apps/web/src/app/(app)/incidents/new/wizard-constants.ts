export const INCIDENT_TYPE_OPTIONS = [
  ["injury", "Injury"],
  ["occupational_illness", "Occupational illness"],
  ["guest_illness", "Guest illness"],
  ["near_miss", "Near miss"],
  ["high_potential_near_miss", "High-potential near miss"],
  ["unsafe_condition", "Unsafe condition"],
  ["dangerous_occurrence", "Dangerous occurrence"],
  ["fire_smoke", "Fire/smoke"],
  ["chemical_fuel_spill", "Chemical/fuel spill"],
  ["food_safety", "Food safety"],
  ["security_violence", "Security/violence"],
  ["marine_swimming", "Marine/swimming"],
  ["vehicle", "Vehicle"],
  ["property_equipment_damage", "Property/equipment damage"],
  ["environmental", "Environmental"],
  ["climate_extreme_weather", "Climate/extreme weather"],
  ["other", "Other"],
] as const;

export const PERSON_TYPE_OPTIONS = [
  ["employee", "Employee"],
  ["contractor", "Contractor"],
  ["guest", "Guest"],
  ["visitor", "Visitor"],
  ["supplier", "Supplier"],
  ["public", "Member of the public"],
  ["other", "Other / third party"],
  ["none", "No person affected"],
] as const;

export const AGE_BAND_OPTIONS = [
  ["under_18", "Under 18"],
  ["18_24", "18–24"],
  ["25_34", "25–34"],
  ["35_44", "35–44"],
  ["45_54", "45–54"],
  ["55_64", "55–64"],
  ["65_plus", "65+"],
  ["not_disclosed", "Not disclosed"],
] as const;

export const SEX_OPTIONS = [
  ["female", "Female"],
  ["male", "Male"],
  ["other", "Other"],
  ["not_disclosed", "Not disclosed"],
] as const;

/** Outcomes that can only be recorded when at least one person is affected — see chat. */
export const INJURY_ONLY_OUTCOMES = [
  "first_aid",
  "medical_treatment",
  "restricted_work",
  "lost_time_injury",
  "hospitalisation",
  "permanent_impairment",
  "fatality",
] as const;

export const INJURY_MECHANISM_OPTIONS = [
  ["slip_trip_fall_same_level", "Slip, trip or fall on the same level"],
  ["fall_from_height", "Fall from height"],
  ["cut_laceration", "Cut or laceration"],
  ["burn_scald", "Burn or scald"],
  ["manual_handling", "Manual handling"],
  ["struck_by_object", "Struck by an object"],
  ["struck_against_object", "Struck against an object"],
  ["falling_object", "Falling object"],
  ["chemical_exposure", "Chemical exposure"],
  ["electrical_contact", "Electrical contact"],
  ["vehicle_related", "Vehicle-related"],
  ["ergonomic_repetitive_strain", "Ergonomic or repetitive strain"],
  ["food_allergen_exposure", "Food allergen exposure"],
  ["marine_swimming", "Marine or swimming"],
  ["other", "Other"],
] as const;

export const OUTCOME_OPTIONS = [
  ["no_injury", "No injury"],
  ["first_aid", "First aid only"],
  ["medical_treatment", "Medical treatment"],
  ["restricted_work", "Restricted work"],
  ["lost_time_injury", "Lost-time injury"],
  ["hospitalisation", "Hospitalisation"],
  ["permanent_impairment", "Permanent impairment"],
  ["fatality", "Fatality"],
  ["not_yet_known", "Outcome not yet known"],
] as const;

export const REFERRAL_OPTIONS = [
  ["none", "None"],
  ["hotel_doctor", "Hotel doctor"],
  ["clinic", "Clinic"],
  ["hospital", "Hospital"],
  ["declined", "Doctor offered — declined"],
] as const;

export const IMMEDIATE_CONTROL_OPTIONS = [
  ["first_aid_provided", "First aid provided"],
  ["hazard_removed", "Hazard removed"],
  ["area_isolated", "Area isolated"],
  ["equipment_removed_from_service", "Equipment removed from service"],
  ["security_contacted", "Security contacted"],
  ["emergency_services_contacted", "Emergency services contacted"],
  ["duty_manager_notified", "Duty Manager notified"],
  ["guest_relations_notified", "Guest Relations notified"],
  ["hr_notified", "HR notified"],
] as const;

/** S1-S5 / P1-P5 — same 5-point scale for both axes, shown side by side (brief Step 5). */
export const SEVERITY_LEVELS = [
  { level: 1, label: "Negligible", description: "No injury or damage; no follow-up needed." },
  { level: 2, label: "Minor", description: "First aid or minor damage; routine handling." },
  { level: 3, label: "Moderate", description: "Medical treatment or reportable damage." },
  { level: 4, label: "Major", description: "Lost time, hospitalisation, or major damage." },
  {
    level: 5,
    label: "Critical",
    description: "Fatality, permanent impairment, or catastrophic loss.",
  },
] as const;

export const HAZARD_PRESENT_OPTIONS = [
  ["yes", "Yes"],
  ["no", "No"],
  ["unsure", "Unsure"],
] as const;

export const AREA_ISOLATED_OPTIONS = [
  ["yes", "Yes"],
  ["no", "No"],
  ["not_required", "Not required"],
] as const;
